/* ══════════════════════════════════════════════════════
   orçamento. — camada de dados

   Local-first: o localStorage é a verdade imediata (o app abre e
   funciona offline), e o Supabase é a cópia compartilhada entre
   aparelhos. O app continua entregando o array inteiro de entradas;
   é aqui que ele vira INSERT/UPDATE/DELETE por linha.

   Sem credenciais em config.js — ou com a biblioteca indisponível —
   tudo continua funcionando em modo local, sem login.
   ══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const PREFIX     = 'orcamento:v2:';
  const LEGACY_V1  = 'orcamento:state:v1';
  const LEGACY_SIM = 'sim-state';

  const TYPES_OK = ['fs','os','ci','ui','em','co'];

  let client   = null;     // cliente supabase-js (null = modo local)
  let user     = null;     // usuário logado
  let scope    = 'local';  // sufixo das chaves do localStorage
  let synced   = null;     // último estado confirmado no servidor
  let dirty    = false;    // há mudanças locais ainda não enviadas
  let pushing  = false;
  let channel  = null;
  let onRemote = null;     // callback quando outro aparelho grava
  let onStatus = null;     // callback de status ('sincronizando'/'ok'/'offline'…)

  const REMEMBER_KEY = 'orcamento:remember';

  /**
   * Guarda a sessão no localStorage quando "Lembrar" está marcado
   * (sobrevive a fechar o app) e no sessionStorage quando não está
   * (some ao fechar a aba). A leitura procura nos dois.
   */
  const sessionStore = {
    _remember() {
      try { return localStorage.getItem(REMEMBER_KEY) !== '0'; } catch (e) { return true; }
    },
    _target() {
      try { return this._remember() ? localStorage : sessionStorage; }
      catch (e) { return localStorage; }
    },
    getItem(key) {
      try { const v = sessionStorage.getItem(key); if (v !== null) return v; } catch (e) {}
      try { return localStorage.getItem(key); } catch (e) { return null; }
    },
    setItem(key, value) {
      try { this._target().setItem(key, value); } catch (e) {}
      // evita a sessão ficar duplicada nos dois lugares
      try {
        const other = this._remember() ? sessionStorage : localStorage;
        other.removeItem(key);
      } catch (e) {}
    },
    removeItem(key) {
      try { localStorage.removeItem(key); } catch (e) {}
      try { sessionStorage.removeItem(key); } catch (e) {}
    },
  };

  /* ── util ───────────────────────────────────────────── */
  const kState  = () => PREFIX + scope + ':state';
  const kSynced = () => PREFIX + scope + ':synced';

  function lsGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, val); return true; } catch (e) { return false; }
  }
  function lsDel(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function isUuid(v) {
    return typeof v === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
  }
  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    // fallback para navegadores sem randomUUID
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : ((r & 0x3) | 0x8)).toString(16);
    });
  }

  function validEntry(e) {
    return !!e && typeof e === 'object'
      && typeof e.name === 'string'
      && TYPES_OK.indexOf(e.type) >= 0;
  }

  /** Normaliza uma entrada vinda da nuvem ou do formulário. */
  function normalize(e) {
    const out = {
      id:     isUuid(e.id) ? e.id : newId(),
      name:   String(e.name).slice(0, 120),
      type:   e.type,
      hidden: !!e.hidden,
    };
    if (e.type === 'ui') {
      out.min_amount    = Number(e.min_amount) || 0;
      out.max_amount    = Number(e.max_amount) || 0;
      out.may_not_occur = !!e.may_not_occur;
    } else {
      out.amount = Number(e.amount) || 0;
    }
    if (e.type !== 'fs') {
      out.months = Array.isArray(e.months)
        ? e.months.map(Number).filter(function (m) { return m >= 1 && m <= 12; })
        : [];
    }
    return out;
  }

  const METHODS_OK = ['avista', 'parcelado', 'mensal'];

  function validLoan(l) {
    return !!l && typeof l === 'object'
      && typeof l.person === 'string' && l.person.trim() !== ''
      && isFinite(Number(l.principal)) && isFinite(Number(l.total_due));
  }

  function hoje() {
    const d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  /** Aceita "2026-09-09" ou vazio; devolve null quando inválida. */
  function dataOuNulo(v) {
    if (!v) return null;
    const s = String(v).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  }

  function normalizeLoan(l) {
    const principal = Math.max(0, Number(l.principal) || 0);
    // o total a receber nunca fica abaixo do emprestado (juros >= 0)
    const total = Math.max(principal, Number(l.total_due) || 0);
    const method = METHODS_OK.indexOf(l.method) >= 0 ? l.method : 'avista';
    const out = {
      id:        isUuid(l.id) ? l.id : newId(),
      person:    String(l.person).trim().slice(0, 120),
      principal: principal,
      total_due: total,
      // só principal devolvido; é ele que fecha o empréstimo
      received:  Math.max(0, Number(l.received) || 0),
      // mensalidades já recebidas: juro, acumula sem limite e não quita
      received_interest: Math.max(0, Number(l.received_interest) || 0),
      lent_on:   dataOuNulo(l.lent_on) || hoje(),
      due_on:    dataOuNulo(l.due_on),
      method:    method,
      installments: null,
      installment_amount: null,
      notes:     l.notes ? String(l.notes).slice(0, 500) : null,
    };
    if (method === 'parcelado') {
      out.installments = Math.min(360, Math.max(1, parseInt(l.installments, 10) || 1));
    } else if (method === 'mensal') {
      out.installment_amount = Math.max(0, Number(l.installment_amount) || 0);
      /* A mensalidade é juro que corre por tempo indeterminado: entra
         todo mês e não diminui nada. A dívida é, e continua sendo, o
         principal — some quando o principal voltar.

         Somar a mensalidade ao total a receber (como era antes) fazia
         nove meses de 300 parecerem 2.700 de 2.800 "quitados", com a
         pessoa ainda devendo os 2.500 inteiros. */
      out.total_due = principal;
    }
    // fora da mensalidade o juro está embutido no total, e não há o que acumular
    if (method !== 'mensal') out.received_interest = 0;
    return out;
  }

  const KINDS_OK = ['renda', 'fixa', 'variavel', 'assinatura', 'economia'];
  const FREQ_OK  = ['mensal', 'quinzenal', 'semanal', 'anual', 'pontual'];

  /** Quanto uma renda representa por mês, seja qual for a frequência. */
  const FREQ_MES = { mensal: 1, quinzenal: 2, semanal: 4.345, anual: 1 / 12, pontual: 0 };

  function validAccount(a) {
    return !!a && typeof a === 'object'
      && typeof a.name === 'string' && a.name.trim() !== ''
      && KINDS_OK.indexOf(a.kind) >= 0;
  }

  function normalizeAccount(a) {
    const kind = KINDS_OK.indexOf(a.kind) >= 0 ? a.kind : 'fixa';
    const out = {
      id:     isUuid(a.id) ? a.id : newId(),
      kind:   kind,
      name:   String(a.name).trim().slice(0, 120),
      amount: Math.max(0, Number(a.amount) || 0),
      frequency:  null,
      due_day:    null,
      paid_on:    null,        // data em que foi paga; o mês dela é que vale
      avg_amount: null,
      notes:  a.notes ? String(a.notes).slice(0, 500) : null,
    };
    if (kind === 'renda') {
      out.frequency = FREQ_OK.indexOf(a.frequency) >= 0 ? a.frequency : 'mensal';
    } else if (kind === 'fixa') {
      const d = parseInt(a.due_day, 10);
      out.due_day = (d >= 1 && d <= 31) ? d : 1;
      out.paid_on = dataOuNulo(a.paid_on);
    } else if (kind === 'variavel') {
      // sem média informada, a própria conta vira a referência
      const m = Number(a.avg_amount);
      out.avg_amount = isFinite(m) && m >= 0 ? m : out.amount;
    }
    return out;
  }

  function validFavor(f) {
    return !!f && typeof f === 'object'
      && typeof f.person === 'string' && f.person.trim() !== ''
      && isFinite(Number(f.amount));
  }

  /**
   * Favor: dinheiro emprestado sem juros, só para não esquecer.
   * Guarda só o que se deve. Quanto já voltou vem dos pagamentos.
   */
  function normalizeFavor(f) {
    return {
      id:      isUuid(f.id) ? f.id : newId(),
      person:  String(f.person).trim().slice(0, 120),
      reason:  String(f.reason || '').trim().slice(0, 200) || 'sem motivo',
      amount:  Math.max(0, Number(f.amount) || 0),
      lent_on: dataOuNulo(f.lent_on) || hoje(),
      notes:   f.notes ? String(f.notes).slice(0, 500) : null,
    };
  }

  /* ── pagamento de favor ─────────────────────────────── */

  const ALCANCES = ['item', 'dia', 'total'];

  function validPayment(p) {
    return !!p && typeof p === 'object'
      && typeof p.person === 'string' && p.person.trim() !== ''
      && isFinite(Number(p.amount)) && Number(p.amount) > 0;
  }

  /**
   * Pagamento: dinheiro que voltou. O alcance diz até onde ele vai —
   * um favor, um dia, ou o que a pessoa dever.
   *
   * Um alcance sem o seu alvo não faz sentido, então cai para 'total',
   * que não precisa de alvo nenhum. É o que o banco também cobra.
   *
   * O status separa o que caiu do que só foi combinado. "Me paga 250 por
   * 5 meses" vira cinco linhas: a primeira 'pago' e quatro 'previsto'.
   * Previsto aparece na tela como "2 de 5", mas não abate nada — senão a
   * dívida sumiria hoje por causa de dinheiro que só chega em janeiro.
   */
  function normalizePayment(p) {
    let alcance = ALCANCES.indexOf(p.scope) >= 0 ? p.scope : 'total';
    const favorId = isUuid(p.favor_id) ? p.favor_id : null;
    const dia = dataOuNulo(p.scope_day);
    if (alcance === 'item' && !favorId) alcance = 'total';
    if (alcance === 'dia'  && !dia)     alcance = 'total';

    // ou o combinado vem inteiro, ou não vem — meio combinado o banco recusa
    const i = Math.round(Number(p.plan_index));
    const t = Math.round(Number(p.plan_total));
    const planoOk = isUuid(p.plan_id) && isFinite(i) && isFinite(t)
      && i >= 1 && t >= 1 && i <= t;
    return {
      id:        isUuid(p.id) ? p.id : newId(),
      person:    String(p.person).trim().slice(0, 120),
      amount:    Math.max(0, Number(p.amount) || 0),
      paid_on:   dataOuNulo(p.paid_on) || hoje(),
      scope:     alcance,
      favor_id:  alcance === 'item' ? favorId : null,
      scope_day: alcance === 'dia'  ? dia : null,
      status:    p.status === 'previsto' ? 'previsto' : 'pago',
      plan_id:    planoOk ? p.plan_id : null,
      plan_index: planoOk ? Math.round(Number(p.plan_index)) : null,
      plan_total: planoOk ? Math.round(Number(p.plan_total)) : null,
      notes:     p.notes ? String(p.notes).slice(0, 500) : null,
    };
  }

  /* ══════════════════════════════════════════════════════
     REPARTIR OS PAGAMENTOS ENTRE OS FAVORES

     Fica aqui, e não na tela, porque é a regra que decide os
     números que todo o resto mostra — e porque assim dá para
     testá-la sozinha, sem navegador.

     Duas decisões governam o resultado:

     1. O mais específico manda. Primeiro entram os pagamentos
        de item, depois os de dia, e só então os de total. Se
        entrasse ao contrário, um pagamento avulso já teria
        engolido o item que a pessoa quis quitar de propósito.

     2. Dentro de um alcance, enche-se um favor de cada vez, do
        mais antigo para o mais novo. Sobrou depois de fechar o
        último? Vira crédito da pessoa, não some.

     Contas em centavos: 0.1 + 0.2 em ponto flutuante não dá 0.3,
     e um resto de centavo faria um favor quitado parecer aberto.
     ══════════════════════════════════════════════════════ */

  const cent = (v) => Math.round((Number(v) || 0) * 100);
  const real = (c) => c / 100;

  /** Mesma normalização de nome que a tela usa para agrupar. */
  function chaveNome(n) {
    return String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /**
   * Devolve { pago: {favorId: valor}, credito: {chaveDaPessoa: valor} }.
   * Ninguém guarda isso: é recalculado a cada desenho, e por isso
   * editar ou apagar um favor nunca deixa uma divisão velha para trás.
   */
  function alocarFavores(favors, payments) {
    /* Ordem em que o dinheiro entra: dia mais antigo primeiro e, dentro
       do dia, a ordem em que os favores foram lançados — que é a mesma
       que a tela mostra. O id NÃO serve de desempate: ele é aleatório, e
       isso deixaria imprevisível qual conta do dia recebe o troco. */
    const lista = (favors || []).map(function (f, i) { return { f: f, i: i }; })
      .sort(function (a, b) {
        return String(a.f.lent_on).localeCompare(String(b.f.lent_on)) || a.i - b.i;
      }).map(function (x) { return x.f; });

    const devendo = {};   // favorId → centavos ainda em aberto
    const pago    = {};
    lista.forEach(function (f) {
      devendo[f.id] = Math.max(0, cent(f.amount));
      pago[f.id] = 0;
    });

    /** Despeja `resto` centavos na lista, na ordem. Devolve o que sobrou. */
    function derramar(alvos, resto) {
      for (let i = 0; i < alvos.length && resto > 0; i++) {
        const id = alvos[i].id;
        const cabe = Math.min(resto, devendo[id]);
        if (cabe <= 0) continue;
        devendo[id] -= cabe;
        pago[id] += cabe;
        resto -= cabe;
      }
      return resto;
    }

    const credito = {};
    const sobrou = function (p, resto) {
      if (resto <= 0) return;
      const k = chaveNome(p.person);
      credito[k] = (credito[k] || 0) + resto;
    };

    const daPessoa = function (p) {
      const k = chaveNome(p.person);
      return lista.filter(function (f) { return chaveNome(f.person) === k; });
    };

    const ordem = { item: 0, dia: 1, total: 2 };
    // parcela combinada ainda não é dinheiro: fica de fora antes de ordenar
    const pags = (payments || []).filter(function (p) {
      return p.status !== 'previsto';
    }).sort(function (a, b) {
      return ordem[a.scope] - ordem[b.scope]
        || String(a.paid_on).localeCompare(String(b.paid_on))
        || String(a.id).localeCompare(String(b.id));
    });

    pags.forEach(function (p) {
      const valor = cent(p.amount);
      if (valor <= 0) return;
      let alvos;
      if (p.scope === 'item') {
        alvos = lista.filter(function (f) { return f.id === p.favor_id; });
      } else if (p.scope === 'dia') {
        alvos = daPessoa(p).filter(function (f) { return f.lent_on === p.scope_day; });
      } else {
        alvos = daPessoa(p);
      }
      sobrou(p, derramar(alvos, valor));
    });

    const pagoReal = {};
    Object.keys(pago).forEach(function (id) { pagoReal[id] = real(pago[id]); });
    const credReal = {};
    Object.keys(credito).forEach(function (k) { credReal[k] = real(credito[k]); });
    return { pago: pagoReal, credito: credReal };
  }

  /* ── mapeamento app ⇄ banco ─────────────────────────── */
  function toRow(e, index) {
    return {
      id:            e.id,
      user_id:       user.id,
      name:          e.name,
      type:          e.type,
      hidden:        !!e.hidden,
      position:      index,
      amount:        e.type === 'ui' ? null : (Number(e.amount) || 0),
      min_amount:    e.type === 'ui' ? (Number(e.min_amount) || 0) : null,
      max_amount:    e.type === 'ui' ? (Number(e.max_amount) || 0) : null,
      may_not_occur: e.type === 'ui' ? !!e.may_not_occur : false,
      months:        e.type === 'fs' ? [] : (e.months || []),
    };
  }

  function fromRow(r) {
    const e = { id: r.id, name: r.name, type: r.type, hidden: !!r.hidden };
    if (r.type === 'ui') {
      e.min_amount    = Number(r.min_amount) || 0;
      e.max_amount    = Number(r.max_amount) || 0;
      e.may_not_occur = !!r.may_not_occur;
    } else {
      e.amount = Number(r.amount) || 0;
    }
    if (r.type !== 'fs') e.months = (r.months || []).map(Number);
    return e;
  }

  function toLoanRow(l, index) {
    return {
      id: l.id, user_id: user.id,
      person: l.person,
      principal: l.principal,
      total_due: l.total_due,
      received: l.received,
      lent_on: l.lent_on,
      due_on: l.due_on,
      method: l.method,
      installments: l.method === 'parcelado' ? l.installments : null,
      installment_amount: l.method === 'mensal' ? l.installment_amount : null,
      // sem isto, cada mensalidade nova geraria uma linha idêntica
      // à anterior e o diff nunca a enviaria
      received_interest: l.received_interest,
      notes: l.notes,
      position: index,
    };
  }

  function fromLoanRow(r) {
    return normalizeLoan({
      id: r.id, person: r.person,
      principal: r.principal, total_due: r.total_due, received: r.received,
      received_interest: r.received_interest,
      lent_on: r.lent_on, due_on: r.due_on,
      method: r.method, installments: r.installments,
      installment_amount: r.installment_amount, notes: r.notes,
    });
  }

  function toAccountRow(a, index) {
    return {
      id: a.id, user_id: user.id,
      kind: a.kind, name: a.name, amount: a.amount,
      frequency:  a.kind === 'renda'    ? a.frequency  : null,
      due_day:    a.kind === 'fixa'     ? a.due_day    : null,
      paid_on:    a.kind === 'fixa'     ? a.paid_on    : null,
      avg_amount: a.kind === 'variavel' ? a.avg_amount : null,
      notes: a.notes,
      position: index,
    };
  }

  function fromAccountRow(r) {
    return normalizeAccount({
      id: r.id, kind: r.kind, name: r.name, amount: r.amount,
      frequency: r.frequency, due_day: r.due_day, paid_on: r.paid_on,
      avg_amount: r.avg_amount, notes: r.notes,
    });
  }

  function toFavorRow(f, index) {
    return {
      id: f.id, user_id: user.id,
      person: f.person, reason: f.reason,
      amount: f.amount,
      lent_on: f.lent_on, notes: f.notes,
      position: index,
    };
  }

  function fromFavorRow(r) {
    return normalizeFavor({
      id: r.id, person: r.person, reason: r.reason,
      amount: r.amount, lent_on: r.lent_on, notes: r.notes,
    });
  }

  function sameFavorRow(a, b) {
    return JSON.stringify(toFavorRow(a, a.__pos)) === JSON.stringify(toFavorRow(b, b.__pos));
  }

  function toPaymentRow(p, index) {
    return {
      id: p.id, user_id: user.id,
      person: p.person, amount: p.amount, paid_on: p.paid_on,
      scope: p.scope, favor_id: p.favor_id, scope_day: p.scope_day,
      // sem o status aqui, marcar uma parcela como recebida geraria
      // uma linha idêntica e o diff nunca a enviaria
      status: p.status,
      plan_id: p.plan_id, plan_index: p.plan_index, plan_total: p.plan_total,
      notes: p.notes, position: index,
    };
  }

  function fromPaymentRow(r) {
    return normalizePayment({
      id: r.id, person: r.person, amount: r.amount, paid_on: r.paid_on,
      scope: r.scope, favor_id: r.favor_id, scope_day: r.scope_day,
      status: r.status, plan_id: r.plan_id,
      plan_index: r.plan_index, plan_total: r.plan_total, notes: r.notes,
    });
  }

  function samePaymentRow(a, b) {
    return JSON.stringify(toPaymentRow(a, a.__pos)) === JSON.stringify(toPaymentRow(b, b.__pos));
  }

  function sameAccountRow(a, b) {
    return JSON.stringify(toAccountRow(a, a.__pos)) === JSON.stringify(toAccountRow(b, b.__pos));
  }

  function sameLoanRow(a, b) {
    return JSON.stringify(toLoanRow(a, a.__pos)) === JSON.stringify(toLoanRow(b, b.__pos));
  }

  /** Compara duas entradas já normalizadas, incluindo a posição. */
  function sameRow(a, b) {
    return JSON.stringify(toRow(a, a.__pos)) === JSON.stringify(toRow(b, b.__pos));
  }

  /* Toda coleção segue o mesmo diff: mudou a linha, sobe a linha. */
  const COLECOES = [
    { chave: 'entries',  tabela: 'entries',  toRow: toRow,         same: sameRow },
    { chave: 'loans',    tabela: 'loans',    toRow: toLoanRow,     same: sameLoanRow },
    { chave: 'accounts', tabela: 'accounts', toRow: toAccountRow,  same: sameAccountRow },
    { chave: 'favors',   tabela: 'favors',   toRow: toFavorRow,    same: sameFavorRow },
    { chave: 'payments', tabela: 'favor_payments',
                         toRow: toPaymentRow, same: samePaymentRow },
  ];

  /* O estado zerado. Existe como função porque um literal solto em
     cada ponto é onde uma coleção nova acaba esquecida — e coleção
     esquecida aqui não fica só de fora: chega como [] e o diff APAGA
     a tabela inteira. */
  function estadoVazio(saldo) {
    const vazio = { saldoInicial: saldo === undefined ? 0 : saldo, hubOrder: null };
    COLECOES.forEach(function (c) { vazio[c.chave] = []; });
    return vazio;
  }

  /* ── cache local ────────────────────────────────────── */
  function readLocal() {
    const raw = lsGet(kState());
    if (raw) {
      try {
        const d = JSON.parse(raw);
        if (d && Array.isArray(d.entries)) {
          return {
            entries: d.entries.filter(validEntry).map(normalize),
            saldoInicial: Number(d.saldoInicial) || 0,
            loans: Array.isArray(d.loans) ? d.loans.filter(validLoan).map(normalizeLoan) : [],
            accounts: Array.isArray(d.accounts) ? d.accounts.filter(validAccount).map(normalizeAccount) : [],
            favors: Array.isArray(d.favors) ? d.favors.filter(validFavor).map(normalizeFavor) : [],
            payments: Array.isArray(d.payments)
              ? d.payments.filter(validPayment).map(normalizePayment) : [],
            hubOrder: Array.isArray(d.hubOrder) ? d.hubOrder : null,
          };
        }
      } catch (e) {}
    }
    return null;
  }

  function readLegacy() {
    for (const key of [LEGACY_V1, LEGACY_SIM]) {
      const raw = lsGet(key);
      if (!raw) continue;
      try {
        const d = JSON.parse(raw);
        if (!d || !Array.isArray(d.entries)) continue;
        const clean = d.entries.filter(validEntry).map(normalize);
        if (!clean.length && d.entries.length) continue;   // blob corrompido
        return Object.assign(estadoVazio(Number(d.saldoInicial) || 0), { entries: clean });
      } catch (e) {}
    }
    return null;
  }

  function writeLocal(state) {
    return lsSet(kState(), JSON.stringify({
      v: 4,
      entries: state.entries,
      saldoInicial: state.saldoInicial,
      loans: state.loans || [],
      accounts: state.accounts || [],
      favors: state.favors || [],
      payments: state.payments || [],
      hubOrder: state.hubOrder || null,
      savedAt: Date.now(),
    }));
  }

  function readSynced() {
    const raw = lsGet(kSynced());
    if (!raw) return null;
    try {
      const d = JSON.parse(raw);
      if (d && Array.isArray(d.entries)) return d;
    } catch (e) {}
    return null;
  }
  function writeSynced(state) {
    synced = state ? clone(state) : null;
    if (state) lsSet(kSynced(), JSON.stringify(state));
    else lsDel(kSynced());
  }

  /* ── status ─────────────────────────────────────────── */
  function status(txt, kind) { if (onStatus) onStatus(txt, kind); }

  /* ══════════════════════════════════════════════════════
     SINCRONIZAÇÃO
     ══════════════════════════════════════════════════════ */

  /** Baixa o estado da nuvem. Devolve null se não houver nada lá. */
  async function pull() {
    const er = await client.from('entries')
      .select('*').eq('user_id', user.id).order('position', { ascending: true });
    if (er.error) throw er.error;

    /* hub_order só existe a partir da migração v3 */
    let sr = await client.from('settings')
      .select('saldo_inicial, hub_order').eq('user_id', user.id).maybeSingle();
    if (sr.error && /hub_order|column/i.test(sr.error.message || '')) {
      sr = await client.from('settings')
        .select('saldo_inicial').eq('user_id', user.id).maybeSingle();
    }
    if (sr.error) throw sr.error;

    /* As tabelas dos módulos novos são opcionais: se o SQL ainda não rodou,
       aquele módulo fica vazio em vez de derrubar a sincronização toda. */
    async function opcional(tabela, mapear, arquivo) {
      const r = await client.from(tabela)
        .select('*').eq('user_id', user.id).order('position', { ascending: true });
      if (!r.error) return r.data.map(mapear);
      if (!/schema cache|does not exist/i.test(r.error.message || '')) throw r.error;
      if (window.console) console.warn('[orçamento] tabela ' + tabela + ' ausente — rode ' + arquivo);
      return [];
    }

    const loans    = await opcional('loans',    fromLoanRow,    'supabase/schema-loans.sql');
    const accounts = await opcional('accounts', fromAccountRow, 'supabase/schema-accounts.sql');
    const favors   = await opcional('favors',   fromFavorRow,   'supabase/schema-favors.sql');
    const payments = await opcional('favor_payments', fromPaymentRow,
                                    'supabase/schema-favors-pagamentos.sql');

    if (!er.data.length && !sr.data && !loans.length
        && !accounts.length && !favors.length && !payments.length) return null;
    return {
      entries: er.data.map(fromRow),
      saldoInicial: sr.data ? (Number(sr.data.saldo_inicial) || 0) : 0,
      hubOrder: (sr.data && Array.isArray(sr.data.hub_order)) ? sr.data.hub_order : null,
      loans: loans,
      accounts: accounts,
      favors: favors,
      payments: payments,
    };
  }

  /**
   * Envia as diferenças entre `state` e o último estado confirmado.
   * Como o diff sempre parte de `synced`, uma tentativa que falhou
   * é recuperada só chamando push() de novo — não há fila a manter.
   */
  /**
   * Envia as diferenças entre `state` e o último estado confirmado.
   * Como o diff sempre parte de `synced`, uma tentativa que falhou é
   * recuperada só chamando push() de novo — não há fila a manter.
   */
  async function push(state) {
    if (!client || !user || pushing) return;
    pushing = true;
    try {
      /* um plano por coleção: o que criar/atualizar e o que apagar */
      const planos = COLECOES.map(function (col) {
        const antes = (synced && synced[col.chave]) ? synced[col.chave] : [];
        const porId = {};
        antes.forEach(function (x, i) { x.__pos = i; porId[x.id] = x; });

        const agora = state[col.chave] || [];
        const upserts = [];
        agora.forEach(function (x, i) {
          x.__pos = i;
          const velho = porId[x.id];
          if (!velho || !col.same(velho, x)) upserts.push(col.toRow(x, i));
        });

        const vivos = {};
        agora.forEach(function (x) { vivos[x.id] = true; });
        const deletes = antes.filter(function (x) { return !vivos[x.id]; })
                             .map(function (x) { return x.id; });

        return { col: col, upserts: upserts, deletes: deletes };
      });

      const ordemAntes = synced ? JSON.stringify(synced.hubOrder || null) : null;
      const ordemAgora = JSON.stringify(state.hubOrder || null);
      const saldoMudou = !synced || synced.saldoInicial !== state.saldoInicial
                         || ordemAntes !== ordemAgora;
      const temTrabalho = saldoMudou || planos.some(function (p) {
        return p.upserts.length || p.deletes.length;
      });

      if (!temTrabalho) { dirty = false; status('salvo ✓', 'ok'); return; }

      status('sincronizando…', 'saving');

      for (const p of planos) {
        /* apaga antes de inserir: evita bater em índice único ao renomear */
        if (p.deletes.length) {
          const r = await client.from(p.col.tabela).delete()
            .eq('user_id', user.id).in('id', p.deletes);
          if (r.error) throw r.error;
        }
        if (p.upserts.length) {
          const r = await client.from(p.col.tabela).upsert(p.upserts, { onConflict: 'id' });
          if (r.error) throw r.error;
        }
      }

      if (saldoMudou) {
        const linha = { user_id: user.id, saldo_inicial: state.saldoInicial };
        if (state.hubOrder) linha.hub_order = state.hubOrder;
        let r = await client.from('settings').upsert(linha, { onConflict: 'user_id' });
        if (r.error && /hub_order|column/i.test(r.error.message || '')) {
          // sem a migração v3 a ordem fica só no aparelho
          delete linha.hub_order;
          r = await client.from('settings').upsert(linha, { onConflict: 'user_id' });
        }
        if (r.error) throw r.error;
      }

      const confirmado = { saldoInicial: state.saldoInicial, hubOrder: state.hubOrder || null };
      COLECOES.forEach(function (col) { confirmado[col.chave] = clone(state[col.chave] || []); });
      writeSynced(confirmado);

      dirty = false;
      status('salvo ✓', 'ok');
    } catch (err) {
      dirty = true;
      status(navigator.onLine ? 'erro ao sincronizar' : 'offline — salvo aqui',
             navigator.onLine ? 'err' : 'readonly');
      if (window.console) console.warn('[orçamento] falha ao sincronizar:', err.message || err);
    } finally {
      pushing = false;
    }
  }

  /**
   * Assinatura estável do estado — serve para responder "mudou alguma
   * coisa de verdade?".
   *
   * Passa por toRow porque é ele que define o que o servidor guarda: o
   * que não vai para a linha (posição na memória, campo derivado) não
   * pode contar como mudança.
   */
  function assinatura(st) {
    if (!st) return '';
    const partes = COLECOES.map(function (c) {
      return c.chave + ':' + (st[c.chave] || []).map(function (r, i) {
        try { return JSON.stringify(c.toRow(r, i)); } catch (e) { return ''; }
      }).join('|');
    });
    partes.push('saldo:' + (Number(st.saldoInicial) || 0));
    partes.push('hub:' + JSON.stringify(st.hubOrder || null));
    return partes.join('\n');
  }

  /* realtime — outro aparelho gravou */
  let remoteTimer = null;
  function subscribe() {
    if (!client || !user || channel) return;
    // sai de COLECOES para que uma tabela nova não fique fora do
    // realtime por esquecimento — foi o que aconteceu com favors
    const tabelas = COLECOES.map(function (c) { return c.tabela; }).concat(['settings']);
    channel = tabelas.reduce(function (ch, tabela) {
      return ch.on('postgres_changes',
        { event: '*', schema: 'public', table: tabela, filter: 'user_id=eq.' + user.id },
        scheduleRemote);
    }, client.channel('orcamento:' + user.id)).subscribe();
  }
  function scheduleRemote() {
    // Enquanto houver mudança local pendente, o que está aqui é mais novo:
    // buscar agora sobrescreveria a edição do usuário.
    if (dirty || pushing) return;
    clearTimeout(remoteTimer);
    remoteTimer = setTimeout(async function () {
      if (dirty || pushing) return;
      try {
        const remote = await pull();
        if (!remote) return;

        /* O Realtime devolve TAMBÉM as gravações deste aparelho: salvar
           aqui dispara um evento que volta para cá. O eco chega depois
           do push terminar, quando dirty e pushing já são false, então
           as travas acima não o pegam.

           Por isso a pergunta certa não é "chegou evento?" e sim
           "o que veio é diferente do que eu já tinha?". Sem isto, cada
           edição do usuário virava um aviso de "outro aparelho". */
        const mudou = assinatura(remote) !== assinatura(synced);

        writeSynced(remote);
        writeLocal(remote);
        if (mudou && onRemote) onRemote(remote);
      } catch (e) {}
    }, 400);
  }
  function unsubscribe() {
    if (channel) { try { client.removeChannel(channel); } catch (e) {} channel = null; }
  }

  /** Preenche o que a chamada não mandou, para o diff não apagar nada. */
  function completar(state) {
    const cheio = Object.assign(estadoVazio(), state || {});
    COLECOES.forEach(function (c) {
      if (!Array.isArray(cheio[c.chave])) cheio[c.chave] = [];
    });
    cheio.hubOrder = cheio.hubOrder || null;
    return cheio;
  }

  /* ══════════════════════════════════════════════════════
     API PÚBLICA
     ══════════════════════════════════════════════════════ */
  const Store = {

    /** 'cloud' quando há Supabase configurado e disponível; senão 'local'. */
    mode: 'local',
    newId: newId,
    normalize: normalize,
    validEntry: validEntry,
    normalizeLoan: normalizeLoan,
    validLoan: validLoan,
    normalizeAccount: normalizeAccount,
    validAccount: validAccount,
    normalizeFavor: normalizeFavor,
    validFavor: validFavor,
    normalizePayment: normalizePayment,
    validPayment: validPayment,
    alocarFavores: alocarFavores,
    estadoVazio: estadoVazio,
    FREQ_MES: FREQ_MES,
    hoje: hoje,

    onRemoteChange(fn) { onRemote = fn; },
    onStatusChange(fn) { onStatus = fn; },

    /** Cria o cliente. Falha silenciosa cai para o modo local. */
    init() {
      const cfg = window.ORCAMENTO_CONFIG || {};
      if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase) {
        this.mode = 'local';
        return false;
      }
      try {
        client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storage: sessionStore,
          },
        });
        this.mode = 'cloud';
        return true;
      } catch (e) {
        client = null;
        this.mode = 'local';
        return false;
      }
    },

    get user() { return user; },
    get isDirty() { return dirty; },

    /** "Lembrar" — define onde a sessão fica guardada. */
    get remember() {
      try { return localStorage.getItem(REMEMBER_KEY) !== '0'; } catch (e) { return true; }
    },
    setRemember(on) {
      try { localStorage.setItem(REMEMBER_KEY, on ? '1' : '0'); } catch (e) {}
    },

    /* ── autenticação ─────────────────────────────────── */
    async currentSession() {
      if (!client) return null;
      try {
        const { data } = await client.auth.getSession();
        return data.session || null;
      } catch (e) { return null; }
    },

    onAuthChange(fn) {
      if (!client) return;
      client.auth.onAuthStateChange(function (event, session) {
        fn(event, session);
      });
    },

    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },

    async signUp(email, password) {
      const { data, error } = await client.auth.signUp({
        email, password,
        options: { emailRedirectTo: location.href.split('#')[0].split('?')[0] },
      });
      if (error) throw error;
      // sem sessão = o projeto exige confirmação por e-mail
      return { needsConfirmation: !data.session, data };
    },

    async sendReset(email) {
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: location.href.split('#')[0].split('?')[0],
      });
      if (error) throw error;
    },

    async updatePassword(password) {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
    },

    async signOut() {
      unsubscribe();
      try { await client.auth.signOut(); } catch (e) {}
      user = null;
      scope = 'local';
      synced = null;
      dirty = false;
    },

    /* ── ciclo de vida dos dados ──────────────────────── */

    /** Define o usuário e passa a usar as chaves locais dele. */
    setUser(u) {
      user = u || null;
      scope = user ? user.id : 'local';
      synced = readSynced();
    },

    /** Estado para desenhar a tela agora, sem esperar a rede. */
    localState() {
      return readLocal();
    },

    /** Estado legado (localStorage anterior ao login), para migrar. */
    legacyState() {
      return readLegacy();
    },

    /**
     * Reconcilia nuvem e aparelho no login.
     *  - nuvem tem dados          → a nuvem vence
     *  - nuvem vazia + dados aqui → sobem para a nuvem
     *  - tudo vazio               → devolve null (o app semeia)
     */
    async reconcile(localFallback) {
      if (this.mode !== 'cloud' || !user) return { state: readLocal(), source: 'local' };
      try {
        status('sincronizando…', 'saving');
        const remote = await pull();
        if (remote) {
          writeSynced(remote);
          writeLocal(remote);
          status('salvo ✓', 'ok');
          return { state: remote, source: 'cloud' };
        }
        const local = readLocal() || localFallback;
        const temAlgo = local && COLECOES.some(function (c) {
          return local[c.chave] && local[c.chave].length;
        });
        if (temAlgo) {
          // saldoInicial null força o diff a enviar tudo
          writeSynced(estadoVazio(null));
          await push(local);
          return { state: local, source: 'uploaded' };
        }
        writeSynced(estadoVazio());
        return { state: null, source: 'empty' };
      } catch (err) {
        status('offline — usando dados deste aparelho', 'readonly');
        if (window.console) console.warn('[orçamento] sem conexão com o Supabase:', err.message || err);
        return { state: readLocal(), source: 'offline' };
      }
    },

    /**
     * O app chama isto a cada mudança, sempre com o estado COMPLETO.
     *
     * Recebe um objeto, e não uma lista de argumentos, porque o diff
     * trata coleção ausente como coleção esvaziada: esquecer um campo
     * na chamada apagaria a tabela. Com nomes, o esquecimento aparece
     * na hora de escrever a chamada.
     */
    save(state) {
      state = completar(state);
      const ok = writeLocal(state);
      if (this.mode !== 'cloud' || !user) {
        status(ok ? 'salvo ✓' : 'erro ao salvar', ok ? 'ok' : 'err');
        return;
      }
      dirty = true;
      push(state);
    },

    /** Reenvia o que ficou pendente (volta da conexão, app reaberto). */
    retry(state) {
      if (this.mode !== 'cloud' || !user || !dirty) return;
      push(completar(state));
    },

    /** Apaga os dados deste usuário — aqui e na nuvem. */
    async wipe() {
      lsDel(kState());
      lsDel(kSynced());
      lsDel(LEGACY_V1);
      lsDel(LEGACY_SIM);
      synced = null;
      dirty = false;
      if (this.mode === 'cloud' && user) {
        try {
          await client.from('entries').delete().eq('user_id', user.id);
          await client.from('settings').delete().eq('user_id', user.id);
          for (const c of COLECOES) {
            if (c.chave === 'entries') continue;   // já apagada acima
            const r = await client.from(c.tabela).delete().eq('user_id', user.id);
            if (r.error && !/schema cache|does not exist/i.test(r.error.message || '')) throw r.error;
          }
          writeSynced(estadoVazio());
        } catch (e) {
          if (window.console) console.warn('[orçamento] falha ao apagar na nuvem:', e.message || e);
          throw e;
        }
      }
    },

    startRealtime() { subscribe(); },
    stopRealtime()  { unsubscribe(); },
  };

  window.Store = Store;
})();
