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
  /** Esquece tudo o que este aparelho guarda do usuário atual. */
  function limparLocal() {
    lsDel(kState());
    lsDel(kSynced());
    lsDel(LEGACY_V1);
    lsDel(LEGACY_SIM);
    synced = null;
    dirty = false;
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
      // marcado: o que falta receber entra na projeção do simulador
      to_savings: !!l.to_savings,
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

    /* O dia vale para QUALQUER tipo: uma assinatura cobra num dia, a
       renda cai num dia. Antes só a conta fixa tinha, e o razão era
       obrigado a chutar o dia 1 para todas as outras.

       Nulo continua sendo resposta legítima, e quer dizer coisas
       diferentes: na renda, "no 5º dia útil"; nas demais, "no dia 1". */
    const d = parseInt(a.due_day, 10);
    out.due_day = (d >= 1 && d <= 31) ? d : null;

    if (kind === 'renda') {
      out.frequency = FREQ_OK.indexOf(a.frequency) >= 0 ? a.frequency : 'mensal';
    } else if (kind === 'fixa') {
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
      // quando ela combinou de pagar. Nulo = sem prazo, e sem prazo
      // não existe atraso
      due_on:  dataOuNulo(f.due_on),
      // liga os favores nascidos de um "repete por N meses". Nulo = avulso
      series_id: isUuid(f.series_id) ? f.series_id : null,
      // marcado: o que falta receber entra na projeção do simulador.
      // Sem due_on não há mês onde pôr, então a tela exige a data.
      to_savings: !!f.to_savings && !!dataOuNulo(f.due_on),
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

  /**
   * Quais favores uma exclusão leva junto.
   *
   *   'este'     — só ele, mesmo fazendo parte de uma série
   *   'proximos' — ele e os que vencem DEPOIS, na mesma série
   *   'todos'    — a série inteira
   *
   * "Próximos" se decide pelo VENCIMENTO, não pela ordem em que as
   * linhas foram criadas: basta editar uma para as duas divergirem, e
   * quem olha a tela está vendo a ordem dos vencimentos.
   *
   * Favor sem série é sempre só ele — não há série de que falar.
   */
  function favoresDaExclusao(favors, id, alcance) {
    const lista = favors || [];
    const alvo = lista.find(function (f) { return f.id === id; });
    if (!alvo) return [];
    if (!alvo.series_id || alcance === 'este') return [alvo];

    const daSerie = lista.filter(function (f) { return f.series_id === alvo.series_id; });
    if (alcance === 'todos') return daSerie;

    return daSerie.filter(function (f) {
      // o próprio alvo entra sempre, mesmo que outro empate no vencimento
      if (f.id === alvo.id) return true;
      return ordemFavor(f) > ordemFavor(alvo);
    });
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
  /**
   * A data que manda num favor é a de PAGAMENTO — quando ela combinou de
   * pagar. A data em que o dinheiro saiu continua guardada, mas não ordena
   * mais nada: o que interessa é quando o dinheiro deve voltar.
   *
   * Nulo é o fim da fila: favor sem prazo combinado não disputa lugar com
   * quem tem data marcada.
   */
  function ordemFavor(f) {
    return f && f.due_on ? f.due_on : '9999-12-31';
  }

  /**
   * Percentuais inteiros de uma divisão, somando exatamente 100.
   *
   * Arredondar cada fatia por conta própria dá 99 ou 101 — num gráfico de
   * composição a diferença aparece como sobra ou corte na ponta, e a
   * legenda deixa de fechar. Método do maior resto: todo mundo leva o
   * piso, e os pontos que faltam vão para quem tem a maior parte
   * fracionária (empate, o de menor índice, para a saída ser estável).
   *
   * Valor negativo ou não numérico conta como zero. Soma zero devolve
   * zeros — não há divisão para descrever.
   */
  function pctInteiros(valores) {
    const vals = (valores || []).map(function (v) {
      const n = Number(v);
      return isFinite(n) && n > 0 ? n : 0;
    });
    const soma = vals.reduce(function (a, v) { return a + v; }, 0);
    if (soma <= 0) return vals.map(function () { return 0; });

    const exatos = vals.map(function (v) { return (v / soma) * 100; });
    const out = exatos.map(Math.floor);
    let faltam = 100 - out.reduce(function (a, v) { return a + v; }, 0);

    const porResto = exatos
      .map(function (v, i) { return { i: i, frac: v - Math.floor(v) }; })
      .sort(function (a, b) { return (b.frac - a.frac) || (a.i - b.i); });

    for (let k = 0; k < porResto.length && faltam > 0; k++, faltam--) {
      out[porResto[k].i]++;
    }
    return out;
  }

  function alocarFavores(favors, payments) {
    /* Ordem em que o dinheiro entra: vence antes, enche antes — a mesma
       ordem que a tela mostra. Se as duas discordassem, o pagamento cairia
       num favor diferente daquele que o usuário viu.

       Dentro do mesmo vencimento vale a ordem de lançamento. O id NÃO serve
       de desempate: ele é aleatório, e isso deixaria imprevisível qual conta
       do dia recebe o troco. */
    const lista = (favors || []).map(function (f, i) { return { f: f, i: i }; })
      .sort(function (a, b) {
        return ordemFavor(a.f).localeCompare(ordemFavor(b.f)) || a.i - b.i;
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
        /* O grupo é o vencimento. O lent_on entra junto por causa dos
           pagamentos registrados antes desta mudança, que guardaram a data
           em que o dinheiro saiu — sem isto, eles perderiam o alvo e
           virariam crédito do nada. */
        alvos = daPessoa(p).filter(function (f) {
          return f.due_on === p.scope_day
            || (!f.due_on && f.lent_on === p.scope_day);
        });
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
      to_savings: l.to_savings,
      notes: l.notes,
      position: index,
    };
  }

  function fromLoanRow(r) {
    return normalizeLoan({
      id: r.id, person: r.person,
      principal: r.principal, total_due: r.total_due, received: r.received,
      received_interest: r.received_interest, to_savings: r.to_savings,
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
      /* O dia vale para todo tipo. Antes só a conta fixa o enviava, e o
         dia das outras nunca chegava ao banco — voltava nulo no outro
         aparelho e a conta mudava de data sozinha. */
      due_day:    a.due_day,
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
      lent_on: f.lent_on, due_on: f.due_on, series_id: f.series_id,
      to_savings: f.to_savings, notes: f.notes,
      position: index,
    };
  }

  function fromFavorRow(r) {
    return normalizeFavor({
      id: r.id, person: r.person, reason: r.reason,
      amount: r.amount, lent_on: r.lent_on, due_on: r.due_on,
      series_id: r.series_id, to_savings: r.to_savings, notes: r.notes,
    });
  }

  function sameFavorRow(a, b) {
    return JSON.stringify(toFavorRow(a, a.__pos)) === JSON.stringify(toFavorRow(b, b.__pos));
  }

  /* ══════════════════════════════════════════════════════
     FLUX — o razão diário
     ══════════════════════════════════════════════════════
     Os outros módulos respondem "quanto vou ter guardado". O FLUX
     responde "quanto eu tenho no dia X". É um razão: cada linha é um
     movimento com data, e a tela soma tudo desde uma âncora.

     Nada daqui entra em entradasDoCalculo(): ver fluxSaldoEm sobre
     por que o planejamento diário não pode vazar para o simulador. */

  const FLUX_KINDS = ['entrada', 'saida', 'diario', 'economia', 'cartao'];
  const FLUX_FREQS = ['mensal', 'semanal', 'diaria', 'anual'];
  const FLUX_RULES = ['data', 'quinto_util', 'dia_util'];

  /* As 7 faixas de cor do saldo, separadas por 6 limiares. */
  const FLUX_LIMITES_PADRAO = [-100, 0, 100, 300, 1000, 2000];

  function validFlux(f) {
    return !!f && typeof f === 'object'
      && typeof f.description === 'string' && f.description.trim() !== ''
      && isFinite(Number(f.amount));
  }

  /**
   * Um movimento do razão.
   *
   * O valor é sempre positivo: quem decide o sinal é o kind, e só
   * 'entrada' soma. Guardar o sinal no valor faria a mesma linha
   * significar coisas diferentes conforme quem a lesse.
   */
  function normalizeFlux(f) {
    const freq = FLUX_FREQS.indexOf(f.repeat_freq) >= 0 ? f.repeat_freq : null;
    const puladas = Array.isArray(f.skipped)
      ? f.skipped.map(dataOuNulo).filter(Boolean) : [];
    let vezes = Math.floor(Number(f.repeat_times));
    if (!freq || !isFinite(vezes) || vezes < 2) vezes = null;
    if (vezes !== null && vezes > 600) vezes = 600;
    return {
      id:          isUuid(f.id) ? f.id : newId(),
      kind:        FLUX_KINDS.indexOf(f.kind) >= 0 ? f.kind : 'saida',
      description: String(f.description).trim().slice(0, 120),
      amount:      Math.max(0, Number(f.amount) || 0),
      on_date:     dataOuNulo(f.on_date) || hoje(),
      repeat_freq: freq,
      repeat_times: vezes,
      /* a regra só muda algo no mensal; guardá-la sempre evita um
         null que depois vira 'data' em metade dos caminhos */
      repeat_rule: FLUX_RULES.indexOf(f.repeat_rule) >= 0 ? f.repeat_rule : 'data',
      // qual cartão pagou; só faz sentido no tipo cartao
      card_id:     (f.kind === 'cartao' && isUuid(f.card_id)) ? f.card_id : null,
      // sem repetição não há ocorrência para pular
      skipped:     freq ? puladas : [],
      notes:       f.notes ? String(f.notes).slice(0, 500) : null,
    };
  }

  function toFluxRow(f, index) {
    return {
      id: f.id, user_id: user.id,
      kind: f.kind, description: f.description, amount: f.amount,
      on_date: f.on_date,
      repeat_freq: f.repeat_freq, repeat_times: f.repeat_times,
      repeat_rule: f.repeat_rule, skipped: f.skipped, card_id: f.card_id,
      notes: f.notes, position: index,
    };
  }

  function fromFluxRow(r) {
    return normalizeFlux({
      id: r.id, kind: r.kind, description: r.description, amount: r.amount,
      on_date: r.on_date, repeat_freq: r.repeat_freq, repeat_times: r.repeat_times,
      repeat_rule: r.repeat_rule, skipped: r.skipped, notes: r.notes,
      card_id: r.card_id,
    });
  }

  function sameFluxRow(a, b) {
    return JSON.stringify(toFluxRow(a, a.__pos)) === JSON.stringify(toFluxRow(b, b.__pos));
  }


  /* ── FLUX: a regra que gera as ocorrências ──────────────
     Uma linha que repete não vira N linhas no banco: ela continua
     sendo uma, e a tela pergunta "você acontece neste dia?". Guardar
     as ocorrências geradas envelheceria na primeira edição. */

  /** Dias do mês (1-12 em `mes`). */
  function diasNoMes(ano, mes) { return new Date(ano, mes, 0).getDate(); }

  /* ── dias úteis ──────────────────────────────────────────
     Quem decide o que é dia útil é a empresa, não o calendário: 0 é
     domingo e 6 é sábado, e o padrão é de segunda a sexta. */

  const DIAS_UTEIS_PADRAO = [1, 2, 3, 4, 5];

  /* A lista do usuário logado. Quem desenha não deveria ter de
     carregá-la em toda chamada — mas os testes precisam fixá-la, e por
     isso toda função aqui aceita a lista como último argumento. */
  let diasUteis = DIAS_UTEIS_PADRAO.slice();

  /* Contar e receber são perguntas diferentes: quem trabalha de segunda
     a sábado CONTA o sábado para chegar ao 5º dia útil, mas RECEBE na
     sexta ou na segunda. Uma lista só acertava uma das duas. */
  let diasPagamento = DIAS_UTEIS_PADRAO.slice();

  /* Só dois lados fazem sentido; qualquer outra coisa cai no mais comum. */

  function normalizeDiasUteis(v) {
    if (!Array.isArray(v)) return DIAS_UTEIS_PADRAO.slice();
    const limpos = [];
    v.forEach(function (d) {
      const n = Math.floor(Number(d));
      if (n >= 0 && n <= 6 && limpos.indexOf(n) < 0) limpos.push(n);
    });
    /* Lista vazia faria a contagem do 5º dia útil nunca terminar, e
       o deslocamento de data girar para sempre. */
    if (!limpos.length) return DIAS_UTEIS_PADRAO.slice();
    return limpos.sort(function (a, b) { return a - b; });
  }

  function ehDiaUtil(iso, uteis) {
    const p = partesData(iso);
    const dia = new Date(p.a, p.m - 1, p.d).getDay();
    return normalizeDiasUteis(uteis).indexOf(dia) >= 0;
  }

  /**
   * O enésimo dia útil do mês, contando só os dias que a empresa conta.
   * Se o mês não tiver tantos (um mês com um único dia útil por semana),
   * devolve o último dia útil que existir.
   */
  function diaUtilDoMes(ano, mes, n, uteis) {
    const lista = normalizeDiasUteis(uteis);
    const total = diasNoMes(ano, mes);
    let contados = 0, ultimo = total;
    for (let dia = 1; dia <= total; dia++) {
      if (lista.indexOf(new Date(ano, mes - 1, dia).getDay()) < 0) continue;
      contados++;
      ultimo = dia;
      if (contados === n) return dia;
    }
    return ultimo;
  }

  function quintoDiaUtil(ano, mes, uteis) {
    return diaUtilDoMes(ano, mes, 5, uteis);
  }

  /**
   * A data em que o dinheiro entra de verdade.
   *
   * Recebe a lista de dias em que o pagamento CAI — que não é a mesma
   * dos dias que CONTAM para o 5º útil. Quem trabalha de segunda a
   * sábado conta o sábado e ainda assim recebe na sexta ou na segunda.
   *
   * Quando a data cai fora dessa lista, ela anda para o dia de
   * pagamento MAIS PRÓXIMO: sábado está a um dia da sexta e a dois da
   * segunda, então vem para a sexta; no domingo é o contrário, e ele
   * vai para a segunda.
   *
   * Não há escolha a fazer porque não há dúvida: a distância decide. Um
   * seletor de "sempre antes" ou "sempre depois" erraria por dois dias
   * numa das pontas do fim de semana, e obrigaria o usuário a resolver
   * uma pergunta que o calendário já responde.
   *
   * No empate — possível num calendário com folga no meio da semana —
   * volta: antecipar cumpre o combinado de "até o dia tal" enquanto
   * adiar o quebra.
   */
  function ajustarParaDiaUtil(iso, pagamento) {
    const data = dataOuNulo(iso);
    if (!data) return null;
    const lista = normalizeDiasUteis(pagamento);
    const p = partesData(data);
    const base = new Date(p.a, p.m - 1, p.d);
    if (lista.indexOf(base.getDay()) >= 0) return data;

    const iso3 = function (d) {
      return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
    };
    const anda = function (passo) {
      const d = new Date(base.getTime());
      // 7 passos bastam: alguma parada cai na lista, que nunca é vazia
      for (let i = 1; i <= 7; i++) {
        d.setDate(d.getDate() + passo);
        if (lista.indexOf(d.getDay()) >= 0) return { iso: iso3(d), dist: i };
      }
      return null;
    };

    const atras = anda(-1), frente = anda(1);
    if (!atras) return frente ? frente.iso : data;
    if (!frente) return atras.iso;
    return frente.dist < atras.dist ? frente.iso : atras.iso;
  }


  function partesData(iso) {
    const p = String(iso).split('-').map(Number);
    return { a: p[0], m: p[1], d: p[2] };
  }

  /** Quantos dias inteiros separam duas datas ISO (b - a). */
  function diasEntre(a, b) {
    const pa = partesData(a), pb = partesData(b);
    const ta = Date.UTC(pa.a, pa.m - 1, pa.d), tb = Date.UTC(pb.a, pb.m - 1, pb.d);
    return Math.round((tb - ta) / 86400000);
  }

  /**
   * Qual é o índice da ocorrência que cairia em `data` — 0 é a
   * primeira (a própria on_date). Negativo quando a data não é uma
   * ocorrência possível daquela frequência.
   */
  function indiceOcorrencia(f, data) {
    const ini = partesData(f.on_date), alvo = partesData(data);
    if (f.repeat_freq === 'diaria') {
      const n = diasEntre(f.on_date, data);
      return n < 0 ? -1 : n;
    }
    if (f.repeat_freq === 'semanal') {
      const n = diasEntre(f.on_date, data);
      return (n < 0 || n % 7 !== 0) ? -1 : n / 7;
    }
    if (f.repeat_freq === 'anual') {
      const n = alvo.a - ini.a;
      return n < 0 ? -1 : n;
    }
    // mensal
    const n = (alvo.a - ini.a) * 12 + (alvo.m - ini.m);
    return n < 0 ? -1 : n;
  }

  /**
   * O movimento `f` acontece no dia `data`?
   *
   * O dia esperado no mensal encolhe para o último dia do mês quando
   * o original não existe ali — dia 31 em fevereiro cai no 28/29, em
   * vez de simplesmente sumir daquele mês.
   */
  function fluxOcorreEm(f, data, uteis) {
    if (!f || !dataOuNulo(data)) return false;
    if (f.skipped && f.skipped.indexOf(data) >= 0) return false;
    /* A data de origem NÃO vale sozinha quando há regra de dia útil: ela
       carrega o dia combinado (o 5, o 10), não a data em que o dinheiro
       cai. Deixá-la passar aqui furava o ajuste — o salário aparecia no
       sábado da semente E na sexta calculada pela regra. */
    const temRegra = f.repeat_freq === 'mensal' && f.repeat_rule !== 'data';
    if (!temRegra && f.on_date === data) return true;
    if (!f.repeat_freq) return false;

    const i = indiceOcorrencia(f, data);
    /* O índice 0 — o mês da própria semente — TAMBÉM conta. Ele estava
       barrado junto com os negativos, e para um mensal com regra de dia
       útil isso apagava o primeiro mês inteiro: o atalho da on_date não
       vale (ela carrega o dia combinado, não a data de pagamento) e o
       cálculo da regra nunca era alcançado. O lançamento de setembro só
       nascia em outubro.
       As contas derivadas sofriam o mesmo: primeira() escolhe o mês da
       âncora de propósito, e esse mês vinha vazio. */
    if (i < 0) return false;
    if (f.repeat_times !== null && i >= f.repeat_times) return false;
    if (f.repeat_freq === 'diaria' || f.repeat_freq === 'semanal') return true;

    const ini = partesData(f.on_date);
    // anual: mesmo mês E mesmo dia; sem o mês, cairia 12 vezes no ano
    if (f.repeat_freq === 'anual' && partesData(data).m !== ini.m) return false;

    const alvo = partesData(data);
    /* dia_util: o dia combinado, andado quando não for dia de pagamento.
       É o que uma conta fixa faz de verdade — vence no sábado, sai na
       sexta. */
    if (f.repeat_rule === 'dia_util' && f.repeat_freq === 'mensal') {
      const combinado = alvo.a + '-' + String(alvo.m).padStart(2, '0') + '-' +
        String(Math.min(ini.d, diasNoMes(alvo.a, alvo.m))).padStart(2, '0');
      // a data anda pelos dias de PAGAMENTO, não pelos de contagem
      return data === ajustarParaDiaUtil(combinado, diasPagamento);
    }

    /* quinto_util: a CONTAGEM usa os dias úteis, mas a data resultante
       ainda precisa passar pelo ajuste — quem conta o sábado chega a um
       5º útil que cai no sábado, e não recebe no sábado. Sem este passo
       o dinheiro aparecia num dia em que ele não entra. */
    if (f.repeat_rule === 'quinto_util' && f.repeat_freq === 'mensal') {
      const quinto = alvo.a + '-' + String(alvo.m).padStart(2, '0') + '-' +
        String(quintoDiaUtil(alvo.a, alvo.m, uteis || diasUteis)).padStart(2, '0');
      return data === ajustarParaDiaUtil(quinto, diasPagamento);
    }

    return alvo.d === Math.min(ini.d, diasNoMes(alvo.a, alvo.m));
  }

  /** Só 'entrada' soma; os outros quatro tipos saem do bolso. */
  function fluxSinal(kind) { return kind === 'entrada' ? 1 : -1; }

  /** O que entrou menos o que saiu num dia. */
  function fluxMovimentoEm(lista, data, uteis) {
    return (lista || []).reduce(function (t, f) {
      return fluxOcorreEm(f, data, uteis) ? t + fluxSinal(f.kind) * f.amount : t;
    }, 0);
  }

  function somaIntervalo(lista, de, ate) {
    let total = 0;
    const passos = diasEntre(de, ate);
    const p = partesData(de);
    for (let i = 0; i <= passos; i++) {
      const d = new Date(p.a, p.m - 1, p.d + i);
      const iso = d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
      total += fluxMovimentoEm(lista, iso);
    }
    return total;
  }

  /**
   * O saldo do razão no fim do dia `alvo`.
   *
   * A âncora é a abertura do dia em que `saldoInicial` valia, e os
   * movimentos do próprio dia da âncora já contam. Antes dela o
   * cálculo anda para trás, desfazendo o que houve.
   *
   * O planejamento diário desconta só os dias DEPOIS de hoje: é
   * previsão de gasto, não gasto. Por isso ele fica dentro do FLUX e
   * nunca entra em entradasDoCalculo() — o simulador trata dinheiro
   * incerto no cenário otimista, e um gasto previsto derrubando o
   * acumulado seria a mesma desonestidade ao contrário.
   */
  function fluxSaldoEm(cfg) {
    const lista = cfg.lancamentos || [];
    const ancora = dataOuNulo(cfg.ancora) || hoje();
    const alvo = dataOuNulo(cfg.alvo) || hoje();
    const agora = dataOuNulo(cfg.hoje) || hoje();
    const inicial = Number(cfg.saldoInicial) || 0;
    const diario = Math.max(0, Number(cfg.diario) || 0);

    const movimentos = alvo >= ancora
      ? somaIntervalo(lista, ancora, alvo)
      : -somaIntervalo(lista, alvo, ancora) + fluxMovimentoEm(lista, alvo);

    const futuros = alvo > agora ? diasEntre(agora, alvo) : 0;
    return inicial + movimentos - diario * futuros;
  }

  function fluxLimites(v) {
    return (Array.isArray(v) && v.length === 6 && v.every(function (n) { return isFinite(Number(n)); }))
      ? v.map(Number) : FLUX_LIMITES_PADRAO.slice();
  }


  /**
   * As sete faixas proporcionais à renda mensal.
   *
   * Um saldo de R$ 2.000 é folga larga para quem ganha 1.600 e aperto
   * para quem ganha 12.000 — faixas fixas dizem a mesma coisa para os
   * dois, e uma delas está errada. As proporções, em relação à renda:
   *
   *   −5%  o vermelho cheio: já passou do limite
   *    0   qualquer negativo é negativo
   *   10%  sobra que não paga um imprevisto
   *   25%  cerca de uma semana de folga
   *   60%  mais de metade do mês coberto
   *  125%  um mês inteiro na conta, e uma sobra
   *
   * São réguas de bolso, não lei — por isso a tela sugere e o usuário
   * ajusta, em vez de o app decidir sozinho.
   *
   * Arredonda para a dezena mais próxima: um limiar de R$ 383,17 dá
   * uma precisão que a conta não tem.
   */
  function fluxLimitesSugeridos(renda) {
    const r = Math.max(0, Number(renda) || 0);
    if (!r) return FLUX_LIMITES_PADRAO.slice();
    const dez = (v) => Math.round(v / 10) * 10;
    return [dez(-0.05 * r), 0, dez(0.10 * r), dez(0.25 * r), dez(0.60 * r), dez(1.25 * r)];
  }
  /** Em qual das 7 faixas o saldo cai (0 = pior, 6 = melhor). */
  function fluxFaixa(valor, limites) {
    const l = fluxLimites(limites);
    if (valor <= l[0]) return 0;
    let faixa = 1;
    for (let i = 1; i < l.length; i++) if (valor >= l[i]) faixa = i + 1;
    return faixa;
  }

  /* ── FLUX: cartões ──────────────────────────────────────
     Um gasto no cartão não sai do bolso no dia da compra: sai no dia
     em que a fatura vence. Qual fatura ele pegou depende do dia de
     fechamento — e é por isso que o cartão precisa de cadastro. */

  function validFluxCard(c) {
    return !!c && typeof c === 'object'
      && typeof c.name === 'string' && c.name.trim() !== ''
      && isFinite(Number(c.closing_day)) && isFinite(Number(c.due_day));
  }

  function diaValido(v) {
    const n = Math.floor(Number(v));
    return isFinite(n) ? Math.min(31, Math.max(1, n)) : 1;
  }

  function normalizeFluxCard(c) {
    return {
      id:   isUuid(c.id) ? c.id : newId(),
      name: String(c.name).trim().slice(0, 60),
      /* 1 a 31 mesmo em mês curto: guardar "todo dia 31" e mostrar 28
         é honesto; guardar 28 perderia o combinado. Quem encolhe para
         o último dia é fluxFatura, na hora de calcular. */
      closing_day: diaValido(c.closing_day),
      due_day:     diaValido(c.due_day),
    };
  }

  function toFluxCardRow(c, index) {
    return {
      id: c.id, user_id: user.id, name: c.name,
      closing_day: c.closing_day, due_day: c.due_day, position: index,
    };
  }

  function fromFluxCardRow(r) {
    return normalizeFluxCard({
      id: r.id, name: r.name, closing_day: r.closing_day, due_day: r.due_day,
    });
  }

  function sameFluxCardRow(a, b) {
    return JSON.stringify(toFluxCardRow(a, a.__pos)) === JSON.stringify(toFluxCardRow(b, b.__pos));
  }

  /** "AAAA-MM-DD" do dia pedido, encolhido ao último dia do mês curto. */
  function diaNoMes(ano, mes, dia) {
    const d = Math.min(diaValido(dia), diasNoMes(ano, mes));
    return ano + '-' + String(mes).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  /**
   * A fatura que uma compra pega, e quando ela vence.
   *
   * Duas regras, nesta ordem:
   *
   *   1. A compra entra na fatura que ainda não fechou. Comprou no dia
   *      do fechamento, ainda entra nessa; um dia depois, já é a do mês
   *      seguinte.
   *   2. O vencimento é no mês do fechamento quando cai depois dele, e
   *      no mês seguinte quando não cai — fecha dia 25 e vence dia 5
   *      significa vencer em julho a fatura que fechou em junho.
   *
   * Sem a regra 2 o razão mostraria o dinheiro saindo até um mês antes
   * do que sai de verdade, e o saldo do fim do mês ficaria menor que a
   * realidade justamente nos meses apertados.
   */
  function fluxFatura(cartao, refISO) {
    const c = normalizeFluxCard(cartao);
    const ref = dataOuNulo(refISO) || hoje();
    const p = partesData(ref);

    let fa = p.a, fm = p.m;
    if (ref > diaNoMes(fa, fm, c.closing_day)) {
      const d = new Date(p.a, p.m, 1);      // mês seguinte, virando o ano sozinho
      fa = d.getFullYear(); fm = d.getMonth() + 1;
    }
    const fechamento = diaNoMes(fa, fm, c.closing_day);

    let va = fa, vm = fm;
    if (c.due_day <= c.closing_day) {
      const d = new Date(fa, fm, 1);
      va = d.getFullYear(); vm = d.getMonth() + 1;
    }
    return { fechamento: fechamento, vencimento: diaNoMes(va, vm, c.due_day) };
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
    /* Antes de 'flux': o movimento aponta para o cartão, e inserir o
       filho antes do pai bateria na chave estrangeira. */
    { chave: 'fluxCards', tabela: 'flux_cards',
                         toRow: toFluxCardRow, same: sameFluxCardRow },
    { chave: 'flux',     tabela: 'flux_entries',
                         toRow: toFluxRow,    same: sameFluxRow },
  ];

  /* O estado zerado. Existe como função porque um literal solto em
     cada ponto é onde uma coleção nova acaba esquecida — e coleção
     esquecida aqui não fica só de fora: chega como [] e o diff APAGA
     a tabela inteira. */
  function estadoVazio(saldo) {
    const vazio = { saldoInicial: saldo === undefined ? 0 : saldo,
                    hubOrder: null, horizonte: 12,
                    /* O razão do FLUX tem abertura própria: somar a do
                       simulador faria o mesmo dinheiro contar duas vezes. */
                    fluxSaldo: 0, fluxAncora: null, fluxDiario: 0,
                    fluxLimites: FLUX_LIMITES_PADRAO.slice(),
                    diasUteis: DIAS_UTEIS_PADRAO.slice(),
                    diasPagamento: DIAS_UTEIS_PADRAO.slice() };
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
            horizonte: normalizeHorizonte(d.horizonte),
            flux: Array.isArray(d.flux) ? d.flux.filter(validFlux).map(normalizeFlux) : [],
            fluxCards: Array.isArray(d.fluxCards) ? d.fluxCards.filter(validFluxCard).map(normalizeFluxCard) : [],
            fluxSaldo: Number(d.fluxSaldo) || 0,
            fluxAncora: dataOuNulo(d.fluxAncora),
            fluxDiario: Math.max(0, Number(d.fluxDiario) || 0),
            fluxLimites: fluxLimites(d.fluxLimites),
            diasUteis: normalizeDiasUteis(d.diasUteis),
            diasPagamento: normalizeDiasUteis(d.diasPagamento),
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
      horizonte: normalizeHorizonte(state.horizonte),
      flux: state.flux || [],
      fluxCards: state.fluxCards || [],
      fluxSaldo: Number(state.fluxSaldo) || 0,
      fluxAncora: dataOuNulo(state.fluxAncora),
      fluxDiario: Math.max(0, Number(state.fluxDiario) || 0),
      fluxLimites: fluxLimites(state.fluxLimites),
      diasUteis: normalizeDiasUteis(state.diasUteis),
      diasPagamento: normalizeDiasUteis(state.diasPagamento),
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

    /* Cada degrau é uma migração: hub_order veio na v3, horizon_months no
       horizonte, os quatro flux_* no FLUX. Quem não rodou a última continua
       lendo as anteriores em vez de perder tudo. */
    const COLS_FLUX = 'flux_saldo_inicial, flux_saldo_inicial_data, flux_diario,' +
      ' flux_limites, dias_uteis, dias_pagamento';
    let sr = await client.from('settings')
      .select('saldo_inicial, hub_order, horizon_months, ' + COLS_FLUX)
      .eq('user_id', user.id).maybeSingle();
    if (sr.error && /flux_|column/i.test(sr.error.message || '')) {
      sr = await client.from('settings')
        .select('saldo_inicial, hub_order, horizon_months').eq('user_id', user.id).maybeSingle();
    }
    if (sr.error && /horizon_months|column/i.test(sr.error.message || '')) {
      sr = await client.from('settings')
        .select('saldo_inicial, hub_order').eq('user_id', user.id).maybeSingle();
    }
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
    const flux     = await opcional('flux_entries', fromFluxRow, 'supabase/schema-flux.sql');
    const fluxCards = await opcional('flux_cards', fromFluxCardRow, 'supabase/schema-flux-cartoes.sql');

    if (!er.data.length && !sr.data && !loans.length
        && !accounts.length && !favors.length && !payments.length
        && !flux.length && !fluxCards.length) return null;
    return {
      entries: er.data.map(fromRow),
      saldoInicial: sr.data ? (Number(sr.data.saldo_inicial) || 0) : 0,
      hubOrder: (sr.data && Array.isArray(sr.data.hub_order)) ? sr.data.hub_order : null,
      horizonte: normalizeHorizonte(sr.data && sr.data.horizon_months),
      loans: loans,
      accounts: accounts,
      favors: favors,
      payments: payments,
      flux: flux,
      fluxCards: fluxCards,
      /* Escalares do razão. Sem a migração eles vêm undefined e caem
         no padrão — o módulo abre zerado em vez de quebrar. */
      fluxSaldo: sr.data ? (Number(sr.data.flux_saldo_inicial) || 0) : 0,
      fluxAncora: dataOuNulo(sr.data && sr.data.flux_saldo_inicial_data),
      fluxDiario: sr.data ? Math.max(0, Number(sr.data.flux_diario) || 0) : 0,
      fluxLimites: fluxLimites(sr.data && sr.data.flux_limites),
      diasUteis: normalizeDiasUteis(sr.data && sr.data.dias_uteis),
      diasPagamento: normalizeDiasUteis(sr.data && sr.data.dias_pagamento),
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
                         || ordemAntes !== ordemAgora
                         || (synced.horizonte || 12) !== (state.horizonte || 12)
                         || (synced.fluxSaldo || 0) !== (state.fluxSaldo || 0)
                         || (synced.fluxAncora || null) !== (state.fluxAncora || null)
                         || (synced.fluxDiario || 0) !== (state.fluxDiario || 0)
                         || JSON.stringify(fluxLimites(synced.fluxLimites))
                            !== JSON.stringify(fluxLimites(state.fluxLimites))
                         || JSON.stringify(normalizeDiasUteis(synced.diasUteis))
                            !== JSON.stringify(normalizeDiasUteis(state.diasUteis))
                         || JSON.stringify(normalizeDiasUteis(synced.diasPagamento))
                            !== JSON.stringify(normalizeDiasUteis(state.diasPagamento));
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
        linha.horizon_months = normalizeHorizonte(state.horizonte);
        linha.flux_saldo_inicial = Number(state.fluxSaldo) || 0;
        linha.flux_saldo_inicial_data = dataOuNulo(state.fluxAncora);
        linha.flux_diario = Math.max(0, Number(state.fluxDiario) || 0);
        linha.flux_limites = fluxLimites(state.fluxLimites);
        linha.dias_uteis = normalizeDiasUteis(state.diasUteis);
        linha.dias_pagamento = normalizeDiasUteis(state.diasPagamento);
        let r = await client.from('settings').upsert(linha, { onConflict: 'user_id' });
        if (r.error && /flux_|dias_uteis|dia_nao_util|dias_pagamento|column/i.test(r.error.message || '')) {
          // sem a migração do FLUX, o razão fica só no aparelho
          delete linha.flux_saldo_inicial; delete linha.flux_saldo_inicial_data;
          delete linha.flux_diario; delete linha.flux_limites;
          delete linha.dias_uteis;
          delete linha.dias_pagamento;
          r = await client.from('settings').upsert(linha, { onConflict: 'user_id' });
        }
        if (r.error && /horizon_months|column/i.test(r.error.message || '')) {
          // sem a migração do horizonte, ele fica só no aparelho
          delete linha.horizon_months;
          r = await client.from('settings').upsert(linha, { onConflict: 'user_id' });
        }
        if (r.error && /hub_order|column/i.test(r.error.message || '')) {
          // sem a migração v3 a ordem fica só no aparelho
          delete linha.hub_order;
          r = await client.from('settings').upsert(linha, { onConflict: 'user_id' });
        }
        if (r.error) throw r.error;
      }

      const confirmado = {
        saldoInicial: state.saldoInicial, hubOrder: state.hubOrder || null,
        horizonte: normalizeHorizonte(state.horizonte),
        fluxSaldo: Number(state.fluxSaldo) || 0,
        fluxAncora: dataOuNulo(state.fluxAncora),
        fluxDiario: Math.max(0, Number(state.fluxDiario) || 0),
        fluxLimites: fluxLimites(state.fluxLimites),
        diasUteis: normalizeDiasUteis(state.diasUteis),
        diasPagamento: normalizeDiasUteis(state.diasPagamento),
      };
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

  /** Horizonte da projeção: inteiro entre 1 e 120, 12 quando vier lixo. */
  function normalizeHorizonte(v) {
    const n = parseInt(v, 10);
    return (isFinite(n) && n >= 1 && n <= 120) ? n : 12;
  }

  /** Preenche o que a chamada não mandou, para o diff não apagar nada. */
  function completar(state) {
    const cheio = Object.assign(estadoVazio(), state || {});
    COLECOES.forEach(function (c) {
      if (!Array.isArray(cheio[c.chave])) cheio[c.chave] = [];
    });
    cheio.hubOrder = cheio.hubOrder || null;
    cheio.horizonte = normalizeHorizonte(cheio.horizonte);
    cheio.fluxSaldo = Number(cheio.fluxSaldo) || 0;
    cheio.fluxAncora = dataOuNulo(cheio.fluxAncora);
    cheio.fluxDiario = Math.max(0, Number(cheio.fluxDiario) || 0);
    cheio.fluxLimites = fluxLimites(cheio.fluxLimites);
    cheio.diasUteis = normalizeDiasUteis(cheio.diasUteis);
    cheio.diasPagamento = normalizeDiasUteis(cheio.diasPagamento);
    return cheio;
  }

  /* ══════════════════════════════════════════════════════
     ECONOMIA COMPARTILHADA

     O que vem de outra pessoa NUNCA entra nos arrays que o
     diff envia. Fica num balde à parte, só de leitura — se
     encostasse em `entries`, o próximo save tentaria gravar
     a economia alheia na conta de quem está olhando.

     Não há proteção no cliente contra edição: o RLS do banco
     não tem política de escrita para dado de terceiro. Aqui
     a separação é para o app não TENTAR, não para impedir.
     ══════════════════════════════════════════════════════ */

  /** Chama uma função do Postgres. Erro conhecido vira mensagem em português. */
  async function rpc(nome, args) {
    if (!client || !user) throw new Error('sem sessão');
    const r = await client.rpc(nome, args || {});
    if (r.error) {
      const m = r.error.message || '';
      if (/não encontrado/i.test(m)) throw new Error('Código não encontrado.');
      if (/é o seu/i.test(m))        throw new Error('Esse código é o seu.');
      if (/schema cache|does not exist|function/i.test(m)) {
        throw new Error('Rode supabase/schema-compartilhar.sql no Supabase.');
      }
      throw new Error(m);
    }
    return r.data;
  }

  /**
   * Puxa a economia de quem me deu acesso.
   *
   * Uma consulta por tabela para todos os donos de uma vez — o RLS já
   * filtra o que eu posso ver, então pedir `in (donos)` é só para não
   * trazer os meus próprios dados de volta.
   */
  async function puxarCompartilhadas(conexoes) {
    const donos = (conexoes || [])
      .filter(function (c) { return c.papel === 'dono'; })
      .map(function (c) { return c.pessoa_id; });
    if (!donos.length) return [];

    async function tabela(nome, mapear) {
      const r = await client.from(nome).select('*').in('user_id', donos);
      if (r.error) {
        if (/schema cache|does not exist/i.test(r.error.message || '')) return [];
        throw r.error;
      }
      return r.data.map(function (row) {
        const o = mapear(row);
        o.__dono = row.user_id;      // de quem é, para colorir
        return o;
      });
    }

    const [entries, accounts, loans, favors, payments, settings] = await Promise.all([
      tabela('entries', fromRow),
      tabela('accounts', fromAccountRow),
      tabela('loans', fromLoanRow),
      tabela('favors', fromFavorRow),
      tabela('favor_payments', fromPaymentRow),
      client.from('settings').select('user_id, saldo_inicial').in('user_id', donos)
        .then(function (r) { return r.error ? [] : r.data; }),
    ]);

    /* Um pacote por dono: a projeção precisa saber de quem é cada linha
       para colorir, e o saldo inicial de cada um entra uma vez só. */
    return donos.map(function (id) {
      /* Duas linhas por pessoa desde que o vínculo virou mútuo. A cor que
         vale é a da direção em que EU olho — papel 'dono'. Pegar a
         primeira que aparecesse traria a cor que a outra pessoa escolheu. */
      const c = (conexoes || []).find(function (x) {
        return x.pessoa_id === id && x.papel === 'dono';
      }) || {};
      const st = settings.find(function (x) { return x.user_id === id; });
      const meu = function (lista) {
        return lista.filter(function (x) { return x.__dono === id; });
      };
      return {
        dono: id, email: c.email || '', color: c.color || 'rosa',
        saldoInicial: st ? (Number(st.saldo_inicial) || 0) : 0,
        entries: meu(entries), accounts: meu(accounts),
        loans: meu(loans), favors: meu(favors), payments: meu(payments),
      };
    });
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

    /* FLUX — o razão diário. A regra de ocorrência e o saldo ficam aqui,
       fora do app.js, para terem teste: o app.js precisa de DOM. */
    normalizeFlux: normalizeFlux,
    validFlux: validFlux,
    FLUX_KINDS: FLUX_KINDS,
    FLUX_FREQS: FLUX_FREQS,
    FLUX_LIMITES_PADRAO: FLUX_LIMITES_PADRAO,
    fluxOcorreEm: fluxOcorreEm,
    fluxMovimentoEm: fluxMovimentoEm,
    fluxSaldoEm: fluxSaldoEm,
    fluxFaixa: fluxFaixa,
    fluxLimites: fluxLimites,
    fluxLimitesSugeridos: fluxLimitesSugeridos,
    fluxSinal: fluxSinal,
    /* O número da ocorrência que cai numa data — 0 é a primeira. É o
       que permite cortar uma série "daqui em diante". */
    fluxIndiceOcorrencia: indiceOcorrencia,
    quintoDiaUtil: quintoDiaUtil,
    diaUtilDoMes: diaUtilDoMes,
    ehDiaUtil: ehDiaUtil,
    ajustarParaDiaUtil: ajustarParaDiaUtil,
    normalizeDiasUteis: normalizeDiasUteis,
    DIAS_UTEIS_PADRAO: DIAS_UTEIS_PADRAO,
    setDiasPagamento: function (v) { diasPagamento = normalizeDiasUteis(v); return diasPagamento; },
    getDiasPagamento: function () { return diasPagamento.slice(); },
    /* Guardar a lista aqui evita repassá-la em cada desenho; o
       adoptState do app.js a ajusta quando o estado chega. */
    setDiasUteis: function (v) { diasUteis = normalizeDiasUteis(v); return diasUteis; },
    getDiasUteis: function () { return diasUteis.slice(); },
    normalizeFluxCard: normalizeFluxCard,
    validFluxCard: validFluxCard,
    fluxFatura: fluxFatura,
    normalizeHorizonte: normalizeHorizonte,
    normalizePayment: normalizePayment,
    validPayment: validPayment,
    alocarFavores: alocarFavores,
    ordemFavor: ordemFavor,
    pctInteiros: pctInteiros,
    favoresDaExclusao: favoresDaExclusao,
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

    /**
     * Apaga a conta inteira, depois de conferir a senha.
     *
     * A ordem importa: conferir ANTES de apagar. Apagar as tabelas
     * primeiro e só então descobrir que a senha estava errada deixaria
     * o pior dos mundos — dados perdidos e a conta ainda de pé.
     *
     * Quem apaga as linhas é o `on delete cascade` de auth.users, não o
     * app: uma varredura tabela a tabela erra por omissão toda vez que
     * nasce uma tabela nova. Ver supabase/schema-apagar-conta.sql.
     */
    async deleteAccount(password) {
      if (this.mode !== 'cloud' || !user) throw new Error('sem conta para apagar');
      const email = user.email;
      if (!email) throw new Error('conta sem e-mail');

      // a senha é conferida contra o servidor; erro aqui aborta tudo
      const { error: authErr } = await client.auth.signInWithPassword({ email, password });
      if (authErr) { const e = new Error('senha'); e.senhaErrada = true; throw e; }

      const { error } = await client.rpc('delete_user');
      if (error) {
        /* A função não existe até alguém rodar o SQL. Sem esta
           distinção o usuário lê "erro" e tenta de novo para sempre. */
        if (/function|does not exist|schema cache/i.test(error.message || '')) {
          const e = new Error('rpc');
          e.faltaMigracao = true;
          throw e;
        }
        throw error;
      }

      unsubscribe();
      limparLocal();
      try { await client.auth.signOut(); } catch (e) {}
      user = null;
      scope = 'local';
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
      limparLocal();
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

    /* ── compartilhar a economia ─────────────────────── */

    /** Cria ou troca o meu código. Trocar invalida o anterior. */
    async gerarCodigo() { return rpc('gerar_codigo'); },

    /** Entra na economia de alguém. Devolve { owner_id, owner_email }. */
    async usarCodigo(code) {
      const d = await rpc('usar_codigo', { p_code: String(code || '').trim().toUpperCase() });
      return (d && d[0]) || null;
    },

    /** Quem vê a minha e de quem eu vejo. */
    async conexoes() {
      if (this.mode !== 'cloud' || !user) return [];
      try { return (await rpc('minhas_conexoes')) || []; } catch (e) { return []; }
    },

    /** O meu código atual, ou null se ainda não gerei. */
    async meuCodigo() {
      if (this.mode !== 'cloud' || !user) return null;
      const r = await client.from('settings').select('share_code')
        .eq('user_id', user.id).maybeSingle();
      return (!r.error && r.data) ? r.data.share_code : null;
    },

    /* Desfaz os DOIS lados. Um DELETE direto apagaria só uma direção e
       deixaria meia conexão de pé, sem nada na tela explicando. */
    async removerConexao(id) { return rpc('desconectar', { p_share: id }); },

    async trocarCor(id, cor) { return rpc('trocar_cor', { p_share: id, p_color: cor }); },

    /** A economia de quem me deu acesso — só leitura. */
    async compartilhadas() {
      if (this.mode !== 'cloud' || !user) return [];
      try { return await puxarCompartilhadas(await this.conexoes()); }
      catch (e) {
        if (window.console) console.warn('[orçamento] compartilhadas:', e.message || e);
        return [];
      }
    },

    startRealtime() { subscribe(); },
    stopRealtime()  { unsubscribe(); },
  };

  window.Store = Store;
})();
