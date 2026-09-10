/* ══════════════════════════════════════════════════════
   orçamento. — simulador econômico
   App web (PWA) · lógica de cálculo portada 1:1 do simulator.html
   ══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── CONSTANTES ─────────────────────────────────────── */
  const APP_VERSION = '3.4.2';

  const MS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const MS_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                   'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  const TYPES = {
    fs: { label:'Poupança',      section:'Poupança frequente', order:0 },
    os: { label:'Pontual',       section:'Poupança pontual',   order:1 },
    ci: { label:'Renda certa',   section:'Renda certa',        order:2 },
    ui: { label:'Renda incerta', section:'Renda incerta',      order:3 },
    em: { label:'Empréstimo',    section:'Empréstimo',         order:4 },
    co: { label:'Consórcio',     section:'Consórcio',          order:5 },
  };
  const ORDER = ['fs','os','ci','ui','em','co'];

  const TYPE_STYLE = {
    fs: { bg:'var(--fs-bg)', fg:'var(--fs-fg)' },
    os: { bg:'var(--os-bg)', fg:'var(--os-fg)' },
    ci: { bg:'var(--ci-bg)', fg:'var(--ci-fg)' },
    ui: { bg:'var(--ui-bg)', fg:'var(--ui-fg)' },
    em: { bg:'var(--em-bg)', fg:'var(--em-fg)' },
    co: { bg:'var(--co-bg)', fg:'var(--co-fg)' },
  };
  /* ícone da Iconoir por tipo de entrada */
  const TYPE_ICON = {
    fs: 'piggy-bank',   // poupança frequente
    os: 'safe',         // poupança pontual
    ci: 'coins',        // renda certa
    ui: 'dice-five',    // renda incerta
    em: 'hand-cash',    // empréstimo
    co: 'bank',         // consórcio
  };

  const DOT_COLOR = { fs:'#123A2C', os:'#93AA9B', ci:'#4A8A5F', ui:'#B58F3F', em:'#C05848', co:'#4A72B5' };
  const ICON_BG   = { fs:'#F1F6EE', os:'#F1F6EE', ci:'#E9F6D6', ui:'#FAF2DF', em:'#FEF0EE', co:'#EEF3FD' };

  /* ── ESTADO ─────────────────────────────────────────── */
  let entries      = [];
  let loans        = [];
  let contas       = [];
  let editContaId  = null;
  let hubOrder     = null;   // ordem dos módulos no hub, vinda da conta
  let favores      = [];
  let pagamentos   = [];        // pagamentos de favor, com alcance
  let editFavorId  = null;
  let editPagId    = null;
  let pessoaAberta = null;   // qual pessoa está expandida na lista
  let saldoInicial = 0;
  let screen       = 'hub';     // hub · eco · loans
  let loanFilter   = 'todos';   // todos · aberto · atrasados · quitados
  let loanPerson   = null;      // filtro por pessoa (null = todas)
  let editLoanId   = null;
  let view         = 'p';        // 'p' pessimista · 'o' otimista
  let tab          = 'resumo';
  let selMonth     = 0;          // índice 0..11 na janela de 12 meses
  let editId       = null;
  let selM         = [];         // meses marcados no formulário
  let w12          = get12M();
  let isDesktop    = false;

  const $  = (id) => document.getElementById(id);
  /** Referência ao sprite de ícones embutido no index.html. */
  const ico = (n, cls) => '<svg class="ico' + (cls ? ' ' + cls : '') +
    '" aria-hidden="true"><use href="#i-' + n + '"/></svg>';
  const el = {};

  /* ══════════════════════════════════════════════════════
     LÓGICA DE CÁLCULO — porte fiel do simulador original
     ══════════════════════════════════════════════════════ */

  /** Janela rolante de 12 meses a partir do mês corrente. */
  function get12M() {
    const hoje = new Date();
    const sm = hoje.getMonth();
    const sy = hoje.getFullYear();
    const months = [];
    for (let i = 0; i < 12; i++) {
      const idx = (sm + i) % 12;
      const y   = sy + Math.floor((sm + i) / 12);
      months.push({ m: idx + 1, y });
    }
    return months;
  }

  const uid = () => window.Store.newId();

  /**
   * Valor de uma entrada num dado mês.
   * `fs` (poupança frequente) ignora a lista de meses e só começa no 2º mês
   * da janela — comportamento original preservado.
   */
  function mv(e, m, isFirst) {
    if (e.type === 'fs') {
      if (isFirst) return null;              // poupança começa no próximo mês
      return { kind: 'fixed', val: e.amount };
    }
    if (!e.months || !e.months.includes(m)) return null;
    if (e.type === 'os' || e.type === 'ci' || e.type === 'em' || e.type === 'co') {
      return { kind: 'fixed', val: e.amount };
    }
    if (e.type === 'ui') {
      const lo = e.may_not_occur ? 0 : e.min_amount;
      return { kind: 'range', lo, hi: e.max_amount };
    }
    return null;
  }

  /**
   * Projeção dos 12 meses.
   * out  = poupança (fs + os) · inC = renda certa (ci + em + co)
   * inLP = piso da renda incerta (mantido por compatibilidade, não entra em nenhum total)
   * inLO = teto da renda incerta — só o cenário otimista o considera.
   */
  function calc() {
    const win  = get12M();
    const rows = [];
    win.forEach(function (mo, i) {
      let out = 0, inC = 0, inLP = 0, inLO = 0;
      entries.filter(function (e) { return !e.hidden; }).forEach(function (e) {
        const v = mv(e, mo.m, i === 0);
        if (!v) return;
        if (e.type === 'fs' || e.type === 'os') out += v.val;
        else if (e.type === 'ci' || e.type === 'em' || e.type === 'co') inC += v.val;
        else if (e.type === 'ui') { inLP += v.lo; inLO += v.hi; }
      });
      rows.push({ m: mo.m, y: mo.y, out: out, inC: inC, inLP: inLP, inLO: inLO,
                  netP: out + inC, netO: out + inC + inLO });
    });
    let cp = 0, co = 0;
    rows.forEach(function (r, i) {
      if (i === 0) { r.netP += saldoInicial; r.netO += saldoInicial; }
      cp += r.netP; r.cumP = cp;
      co += r.netO; r.cumO = co;
    });
    return rows;
  }

  /* ══════════════════════════════════════════════════════
     FAVORES
     Dinheiro emprestado sem juros.

     São três níveis, e o pagamento pode entrar em qualquer um:

       pessoa  → o que ela deve por tudo
         dia   → a saída daquele dia (o Uber, a comida, a roupa)
           item → um gasto solto

     Quem reparte o pagamento entre os itens é Store.alocarFavores;
     aqui só se lê o resultado. Nada disso é guardado.
     ══════════════════════════════════════════════════════ */

  let alocacao = { pago: {}, credito: {} };

  /** Refaz a divisão. Chamada uma vez por desenho, não por item. */
  function realocar() {
    alocacao = Store.alocarFavores(favores, pagamentos);
  }

  function favorInfo(f) {
    const pago  = alocacao.pago[f.id] || 0;
    const falta = Math.max(0, f.amount - pago);
    const pct   = f.amount > 0 ? (pago / f.amount) * 100 : 0;
    const quitado = falta < 0.005 && f.amount > 0;

    /* Passou do combinado e ainda falta dinheiro: está atrasado, e a
       cobrança escorrega para o mês seguinte — o mesmo que se faz com
       a parcela que não caiu.

       A data guardada NÃO muda: o deslize é recalculado a cada desenho.
       Assim o app não reescreve o banco só porque o tempo passou, e
       acerta a conta mesmo depois de semanas fechado.

       Nada disto entra em Store.alocarFavores: lá a ordem é a da dívida
       mais antiga, e um favor atrasado continua sendo o mais antigo. Se
       a data deslizada vazasse para lá, o pagamento cairia no favor
       errado. */
    let atrasado = false, vence = f.due_on, meses = 0;
    if (f.due_on && !quitado) {
      const hoje = Store.hoje();
      while (mesAdiante(f.due_on, meses) < hoje) {
        meses++;
        if (meses > 600) break;          // trava contra data absurda
      }
      atrasado = meses > 0;
      vence = mesAdiante(f.due_on, meses);
    }

    return { pago: pago, falta: falta, pct: pct, quitado: quitado,
             atrasado: atrasado, vence: vence, mesesAtraso: meses };
  }

  /**
   * Agrupa os favores de uma pessoa pela data em que ela combinou de
   * pagar. A data em que o dinheiro saiu fica registrada em cada item,
   * mas não agrupa nem ordena mais nada.
   *
   * Quem vence antes aparece em cima: é lista de cobrança, e o que está
   * atrasado tem que ser a primeira coisa que se vê. Favor sem prazo
   * combinado vai para um grupo próprio, no fim.
   *
   * A mesma ordem vale em Store.alocarFavores — se as duas discordassem,
   * o pagamento cairia num favor diferente do que está na tela.
   */
  const SEM_PRAZO = 'sem-prazo';

  function porDia(itens) {
    const mapa = {};
    itens.forEach(function (f) {
      const chave = f.due_on || SEM_PRAZO;
      if (!mapa[chave]) mapa[chave] = { dia: f.due_on || null, chave: chave, itens: [],
                                        total: 0, pago: 0, atrasados: 0 };
      const d = mapa[chave];
      const i = favorInfo(f);
      d.itens.push(f);
      d.total += f.amount;
      d.pago  += i.pago;
      if (i.atrasado) d.atrasados++;
      // o grupo escorrega junto com os seus itens
      if (i.atrasado && (!d.vence || i.vence < d.vence)) d.vence = i.vence;
    });
    return Object.keys(mapa).sort(function (a, b) {
      // o mesmo critério do Store: sem prazo é o fim da fila
      return (a === SEM_PRAZO ? '9999-12-31' : a)
        .localeCompare(b === SEM_PRAZO ? '9999-12-31' : b);
    }).map(function (k) {
      const d = mapa[k];
      d.falta   = Math.max(0, d.total - d.pago);
      d.pct     = d.total > 0 ? (d.pago / d.total) * 100 : 0;
      d.quitado = d.falta < 0.005 && d.total > 0;
      return d;
    });
  }

  /** Agrupa por pessoa, somando total, pago e falta. */
  function porPessoa() {
    const mapa = {};
    favores.forEach(function (f) {
      const chave = chavePessoa(f.person);
      if (!mapa[chave]) {
        mapa[chave] = { chave: chave, nome: f.person, itens: [],
                        total: 0, pago: 0, desde: f.lent_on,
                        atrasados: 0, vence: null };
      }
      const p = mapa[chave];
      const i = favorInfo(f);
      p.itens.push(f);
      p.total += f.amount;
      p.pago  += i.pago;
      if (i.atrasado) p.atrasados++;
      if (i.vence && !i.quitado && (!p.vence || i.vence < p.vence)) p.vence = i.vence;
      if (f.lent_on < p.desde) p.desde = f.lent_on;
    });
    return Object.keys(mapa).map(function (k) {
      const p = mapa[k];
      p.falta   = Math.max(0, p.total - p.pago);
      p.pct     = p.total > 0 ? (p.pago / p.total) * 100 : 0;
      p.quitado = p.falta < 0.005 && p.total > 0;
      // pagou mais do que devia: fica de crédito
      p.credito = alocacao.credito[k] || 0;
      p.dias    = porDia(p.itens);
      return p;
    }).sort(function (a, b) {
      // atrasado primeiro; depois quem deve mais
      return (b.atrasados > 0) - (a.atrasados > 0) || b.falta - a.falta;
    });
  }

  /** Os pagamentos que já caíram, do mais recente para o mais antigo. */
  function pagamentosDe(chave) {
    return pagamentos.filter(function (p) {
      return chavePessoa(p.person) === chave && p.status !== 'previsto';
    }).sort(function (a, b) { return String(b.paid_on).localeCompare(String(a.paid_on)); });
  }

  function favoresResumo() {
    const pessoas = porPessoa();
    const total = favores.reduce(function (a, f) { return a + f.amount; }, 0);
    const pago  = pessoas.reduce(function (a, p) { return a + p.pago; }, 0);
    return {
      total: total, pago: pago, falta: Math.max(0, total - pago),
      pct: total > 0 ? (pago / total) * 100 : 0,
      pessoas: pessoas.filter(function (p) { return !p.quitado; }).length,
      favores: favores.length,
      atrasados: pessoas.reduce(function (a, p) { return a + p.atrasados; }, 0),
    };
  }

  /* ══════════════════════════════════════════════════════
     CONTAS
     ══════════════════════════════════════════════════════ */
  const KIND_META = {
    renda:      { rotulo: 'Renda',      ico: 'coins',    bg: '#E9F6D6', fg: '#4A8A5F' },
    fixa:       { rotulo: 'Conta fixa', ico: 'calendar', bg: '#FAF2DF', fg: '#B58F3F' },
    variavel:   { rotulo: 'Variável',   ico: 'graph-up', bg: '#FBEFE7', fg: '#D98F62' },
    assinatura: { rotulo: 'Assinatura', ico: 'repeat',   bg: '#F1F6EE', fg: '#93AA9B' },
    economia:   { rotulo: 'Economia',   ico: 'piggy-bank', bg: '#E4F2E9', fg: '#2F6142' },
  };

  const FREQ_LABEL = {
    mensal: 'todo mês', quinzenal: 'a cada 15 dias', semanal: 'toda semana',
    anual: 'uma vez por ano', pontual: 'pontual',
  };

  /** Metas clássicas de poupança sobre a renda. */
  const METAS = [
    { pct: 10, label: 'tranquilo',  bg: 'var(--dark3)',   fg: '#fff',       note: '#8FAE9C' },
    { pct: 20, label: 'equilíbrio', bg: 'var(--lime)',    fg: 'var(--dark)', note: '#4C6B3D' },
    { pct: 30, label: 'agressivo',  bg: 'var(--dark3)',   fg: '#fff',       note: '#8FAE9C' },
  ];

  const doTipo = (k) => contas.filter(function (c) { return c.kind === k; });

  /** "AAAA-MM" de hoje — o mês que manda no estado das contas fixas. */
  const mesAtual = () => Store.hoje().slice(0, 7);

  /**
   * Uma conta fixa está paga só se foi paga NESTE mês. Como o estado é
   * derivado da data, toda conta reabre sozinha na virada do mês — sem
   * rotina agendada nem nada rodando por trás.
   */
  function estaPaga(c) {
    return !!c.paid_on && c.paid_on.slice(0, 7) === mesAtual();
  }

  /** Quanto uma renda vale por mês, seja qual for a frequência. */
  function rendaMensal(c) {
    return c.amount * (Store.FREQ_MES[c.frequency] !== undefined ? Store.FREQ_MES[c.frequency] : 1);
  }

  function contasResumo() {
    const renda      = doTipo('renda').reduce(function (a, c) { return a + rendaMensal(c); }, 0);
    const fixas      = doTipo('fixa').reduce(function (a, c) { return a + c.amount; }, 0);
    const variaveis  = doTipo('variavel').reduce(function (a, c) { return a + c.amount; }, 0);
    const varMedia   = doTipo('variavel').reduce(function (a, c) { return a + (c.avg_amount || 0); }, 0);
    const assinaturas= doTipo('assinatura').reduce(function (a, c) { return a + c.amount; }, 0);
    const economia   = doTipo('economia').reduce(function (a, c) { return a + c.amount; }, 0);
    // guardar é um destino do dinheiro como outro qualquer: sai da sobra
    const comprometido = fixas + variaveis + assinaturas + economia;
    const sobra = renda - comprometido;
    const pct = (v) => (renda > 0 ? Math.max(0, (v / renda) * 100) : 0);
    return {
      renda, fixas, variaveis, varMedia, assinaturas, economia, comprometido, sobra,
      pctFixas: pct(fixas), pctSubs: pct(assinaturas), pctVar: pct(variaveis),
      pctEco: pct(economia),
      pctSobra: renda > 0 ? Math.max(0, (sobra / renda) * 100) : 0,
      fontes: doTipo('renda').length,
      emAberto: doTipo('fixa').filter(function (c) { return !estaPaga(c); }).length,
    };
  }

  /* ══════════════════════════════════════════════════════
     EMPRÉSTIMOS
     ══════════════════════════════════════════════════════ */
  const METHOD_LABEL = {
    avista:    'à vista',
    parcelado: 'parcelado',
    mensal:    'mensalidade',
  };

  const LOAN_FILTERS = [
    { id: 'todos',     label: 'Todos' },
    { id: 'aberto',    label: 'Em aberto' },
    { id: 'atrasados', label: 'Atrasados' },
    { id: 'quitados',  label: 'Quitados' },
  ];

  /** Data de hoje em ISO, para comparar com due_on sem fuso atrapalhar. */
  function hojeISO() { return Store.hoje(); }

  /**
   * Tudo que a tela precisa saber de um empréstimo.
   * Os juros nunca são guardados.
   *
   * Há dois combinados diferentes debaixo do mesmo cartão:
   *
   *   à vista / parcelado — o juro está embutido no total a receber,
   *     e cada real que entra abate esse total até quitar.
   *
   *   mensalidade — o juro é uma quantia fixa que entra TODO MÊS, por
   *     tempo indeterminado, e não abate nada. A dívida é o principal,
   *     e ela só morre quando o principal voltar inteiro. Receber nove
   *     mensalidades de 300 não deixa ninguém perto de quitar 2.500.
   */
  function loanInfo(l) {
    const mensal   = l.method === 'mensal';
    const jurosRec = mensal ? (l.received_interest || 0) : 0;

    // no mensal o juro não é uma previsão: é o que já entrou
    const juros    = mensal ? jurosRec : l.total_due - l.principal;
    const emAberto = Math.max(0, l.total_due - l.received);
    const quitado  = l.received >= l.total_due && l.total_due > 0;

    /* Mensalidade não atrasa: o acerto final não tem prazo, e a data
       ali é só previsão. Sem esta exceção todo empréstimo desse tipo
       ficaria vermelho para sempre no mês seguinte. */
    const atrasado = !quitado && !mensal && !!l.due_on && l.due_on < hojeISO();

    const pct      = l.total_due > 0 ? Math.min(1, l.received / l.total_due) : 0;
    const recebido = l.received + jurosRec;
    const meses    = mensal && l.installment_amount > 0
      ? Math.floor(jurosRec / l.installment_amount) : 0;

    let status = 'Em aberto', sbg = '#F1F6EE', sfg = '#51705E';
    if (quitado)       { status = 'Quitado';  sbg = '#E9F6D6'; sfg = '#2F6142'; }
    else if (atrasado) { status = 'Atrasado'; sbg = '#FEF0EE'; sfg = '#8C3A2F'; }
    else if (mensal && jurosRec > 0) { status = 'Rendendo'; sbg = '#EEF3FD'; sfg = '#2E5A8C'; }
    else if (l.received > 0) { status = 'Parcial'; sbg = '#FAF2DF'; sfg = '#8A6A24'; }

    return { juros, jurosRec, emAberto, quitado, atrasado, pct, status, sbg, sfg,
             mensal, recebido, meses,
             // na mensalidade a porcentagem é POR MÊS, não do total
             jurosPct: l.principal > 0
               ? ((mensal ? (l.installment_amount || 0) : juros) / l.principal) * 100 : 0 };
  }

  /**
   * Totais do topo da tela de empréstimos.
   *
   * "A receber" é o que ainda vem — nunca o volume emprestado. Somar
   * `total_due` de tudo contava o empréstimo já quitado como se ele
   * ainda estivesse por vir, e contava de novo o que já tinha entrado.
   * Por isso é o mesmo acumulado do "em aberto".
   *
   * O juro embutido segue a mesma regra: só o que ainda não caiu, dos
   * empréstimos ainda abertos. Na mensalidade o juro não é previsão —
   * ele já entrou, por fora — então ele nunca entra nesse "inclui".
   */
  function loansResumo() {
    return loans.reduce(function (a, l) {
      const i = loanInfo(l);
      a.emprestado += l.principal;
      if (!i.mensal && !i.quitado) {
        // juro embutido ainda por vir, na proporção do que falta
        a.jurosEmbutido += l.total_due > 0
          ? i.juros * (i.emAberto / l.total_due) : 0;
      }
      if (i.mensal) a.jurosMensal += i.jurosRec;
      // o que entrou de verdade — mensalidade inclusive
      a.recebido += Math.min(l.received, l.total_due) + i.jurosRec;
      a.emAberto += i.emAberto;
      if (!i.quitado) a.ativos++;
      if (i.atrasado) a.atrasados++;
      return a;
    }, { emprestado: 0, jurosEmbutido: 0, jurosMensal: 0,
         recebido: 0, emAberto: 0, ativos: 0, atrasados: 0 });
  }

  function loansFiltrados() {
    return loans.filter(function (l) {
      if (loanPerson && chavePessoa(l.person) !== loanPerson) return false;
      const i = loanInfo(l);
      if (loanFilter === 'aberto')    return !i.quitado;
      if (loanFilter === 'atrasados') return i.atrasado;
      if (loanFilter === 'quitados')  return i.quitado;
      return true;
    });
  }

  /** Uma entrada por pessoa, com o que ela ainda deve. */
  function pessoasDosEmprestimos() {
    const mapa = {};
    loans.forEach(function (l) {
      const k = chavePessoa(l.person);
      if (!mapa[k]) mapa[k] = { chave: k, nome: l.person, n: 0, emAberto: 0, atrasados: 0 };
      const p = mapa[k];
      const i = loanInfo(l);
      p.n++;
      p.emAberto += i.emAberto;
      if (i.atrasado) p.atrasados++;
    });
    return Object.keys(mapa).map(function (k) { return mapa[k]; })
      .sort(function (a, b) { return b.emAberto - a.emAberto; });
  }

  function iniciais(nome) {
    const p = String(nome).trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '—';
    return (p[0].charAt(0) + (p[1] ? p[1].charAt(0) : '')).toUpperCase();
  }

  /** Cor do bloco de avatar, estável por nome. */
  const AVATAR_BG = ['#E9F6D6', '#FAF2DF', '#EEF3FD', '#FEF0EE', '#F1F6EE'];
  const AVATAR_FG = ['#2F6142', '#8A6A24', '#2E5A8C', '#8C3A2F', '#51705E'];
  /**
   * Cor estável por pessoa. Normaliza antes de somar, para que
   * "Marina", "marina" e "Marina " caiam sempre na mesma cor.
   */
  function chavePessoa(nome) {
    return String(nome || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function avatarIdx(nome) {
    const k = chavePessoa(nome);
    let h = 0;
    for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) % 997;
    return h % AVATAR_BG.length;
  }

  /** "09/set" — curto, para caber no cartão. */
  /**
   * Data curta. O ano aparece SÓ quando não é o corrente.
   *
   * Numa lista que atravessa a virada — 9 meses lançados em 2026 caem
   * metade em 2027 — '07/jan' sozinho é ambíguo, e dois grupos diferentes
   * ficariam com o mesmo título.
   */
  /** dd/mm/aaaa — a mensagem sai do app, quem lê não tem o contexto. */
  function dataLonga(iso) {
    if (!iso) return '—';
    const p = String(iso).split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function dataCurta(iso) {
    if (!iso) return '—';
    const p = iso.split('-');
    const curta = p[2] + '/' + MS[parseInt(p[1], 10) - 1].toLowerCase();
    return p[0] === Store.hoje().slice(0, 4) ? curta : curta + '/' + p[0].slice(2);
  }

  /* ── FORMATAÇÃO ─────────────────────────────────────── */
  function num(n, dec) {
    const d = dec === undefined ? 2 : dec;
    return Number(n || 0).toLocaleString('pt-BR',
      { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  /** Como o original: mostra centavos so quando existem (224,5 · 1.250). */
  function numRaw(n) {
    return Number(n || 0).toLocaleString('pt-BR');
  }
  function short(v) {
    const n = Number(v);
    if (Math.abs(n) >= 1000) {
      return (n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k';
    }
    return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  }
  /* ══════════════════════════════════════════════════════
     MÁSCARA DE DINHEIRO
     ══════════════════════════════════════════════════════ */

  /** Todo campo de valor do app. */
  const CAMPOS_DINHEIRO = [
    'si', 'm-si',                                        // saldo inicial
    'famt', 'fmin', 'fmax',                              // entradas
    'lo-principal', 'lo-f-total', 'lo-f-received', 'lo-received-interest',
    'lo-installment-amount',                             // empréstimos
    'ct-amount', 'ct-avg',                               // contas
    'fv-amount', 'pg-amount',                            // favores
  ];

  /**
   * Máscara de centavos, como nos apps de banco: cada dígito entra pela
   * direita. 1 → 0,01 · 12 → 0,12 · 1243 → 12,43 · 124300 → 1.243,00
   *
   * O cursor fica sempre no fim, e é justamente isso que evita o salto de
   * caret que atrapalha máscaras que agrupam o milhar durante a digitação.
   */
  function mascaraDinheiro(input) {
    if (!input) return;

    function aoDigitar() {
      const digitos = input.value.replace(/\D/g, '').slice(0, 12);   // até 9.999.999.999,99
      input.value = digitos
        ? (Number(digitos) / 100).toLocaleString('pt-BR',
            { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '';
      aoFim();
    }

    function aoFim() {
      const fim = input.value.length;
      try { input.setSelectionRange(fim, fim); } catch (e) {}
    }

    input.addEventListener('input', aoDigitar);
    // clicar no meio do número não deixa editar no meio: volta para o fim
    input.addEventListener('focus', function () { setTimeout(aoFim, 0); });
    input.addEventListener('click', aoFim);
  }

  /** Aceita "1.234,56", "1234.56", "1234" e devolve Number. */
  function parseBRL(s) {
    if (s === null || s === undefined) return 0;
    s = String(s).trim().replace(/\s|R\$/g, '');
    if (!s) return 0;
    if (/\.\d{3},/.test(s) || /,\d{1,2}$/.test(s)) {
      return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
    }
    if (/\.\d{3}$/.test(s)) return parseFloat(s.replace(/\./g, '')) || 0;
    return parseFloat(s.replace(',', '.')) || 0;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  /** "Jan · Fev" para até 2 meses, "Set – Dez" acima disso. */
  function fmtMonths(ms) {
    if (!ms || !ms.length) return 'todo mês';
    if (ms.length <= 2) return ms.map(function (x) { return MS[x - 1]; }).join(' · ');
    return MS[ms[0] - 1] + ' – ' + MS[ms[ms.length - 1] - 1];
  }
  function entryHint(e) {
    if (e.type === 'fs') return 'todo mês';
    return fmtMonths(e.months);
  }
  function entryAmountTxt(e) {
    if (e.type === 'ui') {
      return numRaw(e.min_amount || 0) + '–' + numRaw(e.max_amount || 0);
    }
    return numRaw(e.amount || 0);
  }
  /** Curva de Bézier suave entre pontos, como no original. */
  function curve(pts, closeY) {
    if (!pts.length) return '';
    let d = 'M ' + pts[0].x + ' ' + pts[0].y;
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1], p1 = pts[i], mx = (p0.x + p1.x) / 2;
      d += ' C ' + mx + ' ' + p0.y + ' ' + mx + ' ' + p1.y + ' ' + p1.x + ' ' + p1.y;
    }
    if (closeY !== undefined) {
      d += ' L ' + pts[pts.length - 1].x + ' ' + closeY + ' L ' + pts[0].x + ' ' + closeY + ' Z';
    }
    return d;
  }

  /* ══════════════════════════════════════════════════════
     PERSISTÊNCIA — delegada ao Store (local + Supabase)
     ══════════════════════════════════════════════════════ */
  let saveTimer = null;
  let statusTimer = null;

  function setStatus(txt, cls) {
    clearTimeout(statusTimer);
    [el.saveSt, el.saveStD, el.saveStL, el.saveStC, el.saveStF].forEach(function (n) {
      if (!n) return;
      n.textContent = txt || '';
      n.className = 'save-st' + (txt ? ' vis ' + (cls || '') : '');
    });
    if (cls === 'ok') statusTimer = setTimeout(function () { setStatus(''); }, 2000);
  }

  /** O estado completo, do jeito que o Store espera receber. */
  function estadoAtual() {
    return {
      entries: entries, saldoInicial: saldoInicial,
      loans: loans, accounts: contas,
      favors: favores, payments: pagamentos,
      hubOrder: hubOrder,
    };
  }

  /** Toda mudança passa por aqui; o Store decide local vs. nuvem. */
  function triggerSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      Store.save(estadoAtual());
    }, 500);
  }

  /** Aplica um estado vindo do Store (login, nuvem, outro aparelho). */
  function adoptState(state) {
    entries      = state.entries;
    saldoInicial = state.saldoInicial;
    loans        = state.loans || [];
    contas       = state.accounts || [];
    favores      = state.favors || [];
    pagamentos   = state.payments || [];
    if (Array.isArray(state.hubOrder)) hubOrder = state.hubOrder;
  }

  /* Quem está começando começa vazio. Vem do Store para não ficar
     para trás quando nascer uma coleção nova. */
  function estadoInicial() { return Store.estadoVazio(); }

  /* ══════════════════════════════════════════════════════
     LAYOUT — realoca componentes entre mobile e desktop
     ══════════════════════════════════════════════════════ */
  const mqDesktop = window.matchMedia('(min-width: 1024px)');

  let mounted = false;

  function applyLayout() {
    const desk = mqDesktop.matches;
    if (mounted && desk === isDesktop) return;
    isDesktop = desk;
    mounted = true;

    if (desk) {
      $('slot-sb-hero').appendChild(el.cHero);
      $('slot-sb-list').appendChild(el.cList);
      $('slot-sb-legend').appendChild(el.cLegend);
      $('slot-main-kpis').appendChild(el.cKpis);
      $('slot-settings-sheet').appendChild(el.cSettings);
      $('sb').appendChild(el.sheetForm);
      $('sb').appendChild(el.sheetSettings);
    } else {
      // o mobile tem hero e KPIs próprios; os do desktop saem do fluxo
      $('parked').appendChild(el.cHero);
      $('parked').appendChild(el.cKpis);
      const tabelas = $('slot-tabelas');
      tabelas.appendChild(el.cList);
      tabelas.appendChild(el.cLegend);
      $('slot-settings').appendChild(el.cSettings);
      $('app').appendChild(el.sheetForm);
      $('app').appendChild(el.sheetSettings);
    }
    closeSheets(true);
  }

  /* Cada módulo define o rótulo da barra de baixo e o título do topo. */
  const MODULOS = {
    eco:    { titulo: 'economia.',    navLbl: 'simulador',   navIco: 'piggy-bank',      view: 'view-sim' },
    loans:  { titulo: 'empréstimos.', navLbl: 'empréstimos', navIco: 'hand-cash',       view: 'view-loans' },
    contas: { titulo: 'contas.',      navLbl: 'contas',      navIco: 'wallet',          view: 'view-contas' },
    favores:{ titulo: 'favores.',     navLbl: 'favores',     navIco: 'donate',          view: 'view-favores' },
  };

  const VIEWS = ['view-hub', 'view-sim', 'view-loans', 'view-contas', 'view-favores', 'view-tabelas', 'view-settings'];

  /* Onde o usuário estava. sessionStorage: o reload mantém, uma aba nova
     começa do hub. */
  const TELA_KEY = 'orcamento:tela';

  function lembrarTela() {
    try { sessionStorage.setItem(TELA_KEY, JSON.stringify({ screen: screen, tab: tab })); } catch (e) {}
  }

  function telaLembrada() {
    try {
      const d = JSON.parse(sessionStorage.getItem(TELA_KEY) || 'null');
      if (d && (d.screen === 'hub' || MODULOS[d.screen])) return d;
    } catch (e) {}
    return null;
  }

  /* Ordem dos módulos no hub — o usuário reordena arrastando. */
  const ORDEM_PADRAO = ['loans', 'eco', 'contas', 'favores'];
  const ORDEM_KEY = 'orcamento:hub-ordem';

  function lerOrdem() {
    // a conta manda; o aparelho é só o fallback do modo local
    let salvo = hubOrder;
    if (!Array.isArray(salvo)) {
      try { salvo = JSON.parse(localStorage.getItem(ORDEM_KEY) || 'null'); } catch (e) {}
    }
    if (!Array.isArray(salvo)) return ORDEM_PADRAO.slice();
    // mantém só os módulos conhecidos e acrescenta os que faltarem
    const limpa = salvo.filter(function (m) { return ORDEM_PADRAO.indexOf(m) >= 0; });
    ORDEM_PADRAO.forEach(function (m) { if (limpa.indexOf(m) < 0) limpa.push(m); });
    return limpa;
  }

  function aplicarOrdem() {
    const caixa = $('hub-cards');
    lerOrdem().forEach(function (m) {
      const n = caixa.querySelector('[data-mod="' + m + '"]');
      if (n) caixa.appendChild(n);
    });
  }

  function gravarOrdem() {
    const m = Array.prototype.map.call($('hub-cards').children, function (n) { return n.dataset.mod; });
    hubOrder = m;
    try { localStorage.setItem(ORDEM_KEY, JSON.stringify(m)); } catch (e) {}
    triggerSave();   // sobe junto com o resto do estado
  }

  /**
   * Navega entre hub, módulos e o menu.
   *   setScreen('hub')            → tela de escolha
   *   setScreen('eco'|'loans')    → módulo, aba principal
   *   setScreen('tabelas')        → lançamentos do módulo aberto
   *   setScreen('settings')       → ajustes (só pelo hub)
   */
  function setScreen(destino) {
    if (destino === 'tabelas' || destino === 'settings') {
      tab = destino;
    } else {
      screen = destino;
      tab = 'main';
    }

    const noHub = screen === 'hub' && tab === 'main';
    const mod = MODULOS[screen];
    const alvo = tab === 'settings' ? 'view-settings'
               : tab === 'tabelas'  ? 'view-tabelas'
               : (noHub ? 'view-hub' : mod.view);

    VIEWS.forEach(function (v) {
      const n = $(v);
      if (n) n.classList.toggle('on', v === alvo);
    });

    /* topo: voltar + título */
    $('btn-back').hidden = noHub;
    $('appbar-title').textContent =
      noHub ? 'orçamento.' :
      tab === 'settings' ? 'ajustes.' :
      tab === 'tabelas'  ? 'tabelas.' : mod.titulo;

    /* a barra de baixo só existe dentro de um módulo */
    const semNavbar = noHub || tab === 'settings';
    el.navbar.hidden = semNavbar;
    $('app').classList.toggle('sem-navbar', semNavbar);
    if (mod) {
      $('nav-main-lbl').textContent = mod.navLbl;
      $('nav-main-ico').innerHTML = ico(mod.navIco, 'navico');
    }
    Array.prototype.forEach.call(el.navbar.querySelectorAll('.navitem'), function (b) {
      const on = b.dataset.tab === tab;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });

    /* a legenda dos tipos só faz sentido na tabela da economia */
    el.cLegend.hidden = !(tab === 'tabelas' && screen === 'eco');

    const ab = document.querySelector('.appbar');
    if (ab) ab.classList.remove('flutuando');
    ajustarContrasteTopo(true);

    lembrarTela();

    if (tab === 'tabelas') renderList();
    if (alvo === 'view-sim' && lastRows) renderCurve(lastRows);
  }

  /** O botão de voltar sobe um nível: tabelas → módulo, módulo → hub. */
  function voltar() {
    if (tab === 'tabelas' && screen !== 'hub') setScreen(screen);
    else { screen = 'hub'; setScreen('hub'); }
  }

  /* ══════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════ */
  let lastRows = null;

  function render() {
    realocar();
    w12 = get12M();
    if (selMonth > w12.length - 1) selMonth = w12.length - 1;
    const rows = calc();
    lastRows = rows;

    renderHero(rows);
    renderKPIs(rows);
    renderList();
    renderMonthStrip();
    renderMonthEntries(rows);
    renderCurve(rows);
    renderMonthTable(rows);
    renderLoans();
    renderContas();
    renderFavores();
    renderHub(rows);
    if (isDesktop) renderTable(rows);
  }

  function acumOf(rows) {
    return rows.map(function (r) { return view === 'p' ? r.cumP : r.cumO; });
  }
  function netOf(r) { return view === 'p' ? r.netP : r.netO; }

  /* ── cartão escuro ──────────────────────────────────── */
  function renderHero(rows) {
    const acum = acumOf(rows);
    const finalVal = acum[acum.length - 1];

    // destaque = acumulado em dezembro do ano corrente (cai no último mês se dezembro ficou fora)
    const curY = new Date().getFullYear();
    let decIdx = -1;
    w12.forEach(function (mo, i) { if (mo.m === 12 && mo.y === curY) decIdx = i; });
    const sbVal = decIdx >= 0 ? acum[decIdx] : finalVal;

    const periodo = decIdx >= 0 ? 'Acumulado em dezembro ' + curY : 'Acumulado em 12 meses';
    const pct = saldoInicial > 0
      ? '+' + Math.round(((sbVal - saldoInicial) / saldoInicial) * 100) + '%'
      : null;
    const growth = pct || '12 meses';

    // sidebar (desktop)
    el.sbFinal.textContent = num(sbVal);
    el.sbFinalLabel.textContent = periodo;
    el.sbGrowth.textContent = growth;

    // cartão do mobile — mostra o total do fim da janela
    const last = w12[w12.length - 1];
    $('m-acum-val').textContent = num(finalVal);
    $('m-acum-period').textContent = 'em ' + MS[last.m - 1].toLowerCase() + ' ' + String(last.y).slice(2);
    $('m-growth').textContent = pct ? pct + ' no período' : '12 meses';

    const txt = 'Cenário ' + (view === 'p' ? 'pessimista' : 'otimista');
    if (el.scenarioTab) el.scenarioTab.textContent = txt;
    $('m-scenario-tab').textContent = txt;
    $('m-table-note').textContent = 'cenário ' + (view === 'p' ? 'pessimista' : 'otimista');
  }

  /* ── KPIs ───────────────────────────────────────────── */
  function renderKPIs(rows) {
    const optimistic = view === 'o';
    const tot = rows.reduce(function (a, r) {
      return { out: a.out + r.out, inC: a.inC + r.inC, inLP: a.inLP + r.inLP, inLO: a.inLO + r.inLO };
    }, { out: 0, inC: 0, inLP: 0, inLO: 0 });
    const acum = acumOf(rows);
    const finalVal = acum[acum.length - 1];

    const kpis = [
      { label:'Poupança', note:'12 meses de aportes', val: short(tot.out), ico:'piggy-bank',
        bg:'#FFFFFF', fg:'#123A2C', labelFg:'#6F8C7C', noteFg:'#9CB2A4',
        tick:'#123A2C', tickBg:'#F1F6EE', dot:'#E4EDDF' },
      { label:'Renda certa', note:'aportes anuais', val: short(tot.inC), ico:'coins',
        bg:'#FFFFFF', fg:'#123A2C', labelFg:'#6F8C7C', noteFg:'#9CB2A4',
        tick:'#4A8A5F', tickBg:'#E9F6D6', dot:'#E4EDDF' },
      { label:'Renda incerta',
        note: optimistic ? 'considerada' : 'fora da projeção',
        val: optimistic ? short(tot.inLO) : '0', ico:'dice-five',
        bg:'#FFFFFF', fg:'#8A6A24', labelFg:'#6F8C7C', noteFg:'#9CB2A4',
        tick:'#B58F3F', tickBg:'#FAF2DF', dot:'#EFE3C6' },
      { label:'Saldo do período',
        note:'cenário ' + (optimistic ? 'otimista' : 'pessimista'),
        val: short(finalVal), ico:'wallet',
        bg:'var(--lime)', fg:'#123A2C', labelFg:'#4C6B3D', noteFg:'#557A44',
        tick:'#123A2C', tickBg:'rgba(255,255,255,.6)', dot:'rgba(18,58,44,.22)' },
    ];

    $('m-kpis').innerHTML = kpis.map(function (k) {
      return '<div class="m-kpi" style="background:' + k.bg + ';--kpi-dot:' + k.dot + '">' +
        '<span class="m-kpi-top">' +
          '<span class="m-kpi-lbl" style="color:' + k.labelFg + '">' + k.label + '</span>' +
          '<span class="m-kpi-ico" style="background:' + k.tickBg + ';color:' + k.tick + '">' +
            ico(k.ico) + '</span>' +
        '</span>' +
        '<span class="m-kpi-val-wrap">' +
          '<span class="m-kpi-pfx" style="color:' + k.noteFg + '">R$</span>' +
          '<span class="m-kpi-val" style="color:' + k.fg + '">' + k.val + '</span>' +
        '</span>' +
      '</div>';
    }).join('') + '<span style="flex:none;width:2px"></span>';

    el.cKpis.innerHTML = kpis.map(function (k) {
      return '<div class="kpi" style="background:' + k.bg + ';--kpi-dot:' + k.dot + '">' +
        '<div class="kpi-top">' +
          '<span class="kpi-label" style="color:' + k.labelFg + '">' + k.label + '</span>' +
          '<span class="kpi-tick" style="background:' + k.tickBg + ';color:' + k.tick + '">' +
            ico(k.ico, 'kpi-ico') + '</span>' +
        '</div>' +
        '<div class="kpi-val-wrap">' +
          '<span class="kpi-pfx" style="color:' + k.noteFg + '">R$</span>' +
          '<span class="kpi-val" style="color:' + k.fg + '">' + k.val + '</span>' +
        '</div>' +
        '<span class="kpi-note" style="color:' + k.noteFg + '">' + k.note + '</span>' +
      '</div>';
    }).join('');
  }

  /* ══════════════════════════════════════════════════════
     TABELAS — os lançamentos do módulo aberto, pesquisáveis
     ══════════════════════════════════════════════════════ */

  /** Cada módulo diz o que listar, como procurar e como mostrar. */
  const TABELAS = {
    eco: {
      titulo: 'Entradas',
      itens: () => entries,
      procura: (e) => e.name,
      abrir: (id) => openForm(id),
      linha: function (e) {
        const T = TYPES[e.type];
        return {
          icoNome: TYPE_ICON[e.type], icoBg: ICON_BG[e.type], icoFg: DOT_COLOR[e.type],
          nome: e.name, sub: T.label + ' · ' + entryHint(e),
          valor: entryAmountTxt(e), oculto: e.hidden,
        };
      },
    },
    loans: {
      titulo: 'Empréstimos',
      itens: () => loans,
      procura: (l) => l.person,
      abrir: (id) => openLoan(id),
      linha: function (l) {
        const i = loanInfo(l);
        return {
          icoNome: 'hand-cash', icoBg: i.sbg, icoFg: i.sfg,
          nome: l.person, sub: i.status + ' · ' + Math.round(i.pct * 100) + '% pago',
          valor: numRaw(l.total_due), tag: i.status, tagBg: i.sbg, tagFg: i.sfg,
        };
      },
    },
    favores: {
      titulo: 'Favores',
      itens: () => favores,
      procura: (f) => f.person + ' ' + f.reason,
      abrir: (id) => openFavor(id),
      linha: function (f) {
        const i = favorInfo(f);
        return {
          icoNome: 'donate',
          icoBg: i.quitado ? '#E9F6D6' : '#EEF3FD',
          icoFg: i.quitado ? '#2F6142' : '#2E5A8C',
          nome: f.person,
          sub: f.reason + ' · ' + (i.quitado ? 'quitado' : 'falta R$ ' + num(i.falta)),
          valor: numRaw(f.amount),
        };
      },
    },
    contas: {
      titulo: 'Contas',
      itens: () => contas,
      procura: (c) => c.name,
      abrir: (id) => openConta(id),
      linha: function (c) {
        const m = KIND_META[c.kind];
        let sub = m.rotulo;
        if (c.kind === 'renda') sub += ' · ' + FREQ_LABEL[c.frequency];
        if (c.kind === 'fixa') sub += ' · dia ' + c.due_day + (estaPaga(c) ? ' · pago' : ' · em aberto');
        if (c.kind === 'assinatura') sub += ' · R$ ' + num(c.amount * 12) + '/ano';
        return {
          icoNome: m.ico, icoBg: m.bg, icoFg: m.fg,
          nome: c.name, sub: sub, valor: numRaw(c.amount),
        };
      },
    },
  };

  /** A tabela do módulo aberto. Usada no mobile e na sidebar do desktop. */
  function renderList() {
    const spec = TABELAS[screen] || TABELAS.eco;
    const q = (el.esearch.value || '').toLowerCase().trim();
    const todos = spec.itens();
    const lista = todos.filter(function (x) {
      return String(spec.procura(x)).toLowerCase().includes(q);
    });

    const t = $('elist-title');
    if (t) t.textContent = spec.titulo;
    el.elistCount.textContent = todos.length;
    el.esearch.placeholder = 'Buscar em ' + spec.titulo.toLowerCase();

    if (!lista.length) {
      el.elist.innerHTML =
        '<div class="empty-list">' +
          '<span class="empty-dots"></span>' +
          '<span class="empty-title">Nada aqui</span>' +
          '<span class="empty-sub">' +
            (q ? 'Nada casa com “' + esc(q) + '”'
               : 'Toque no + para criar o primeiro registro.') +
          '</span>' +
        '</div>';
      return;
    }

    el.elist.innerHTML = lista.map(function (x) {
      const r = spec.linha(x);
      return '<div class="eitem' + (r.oculto ? ' dim' : '') + '">' +
        '<span class="ei-icon" style="background:' + r.icoBg + ';color:' + r.icoFg + '">' +
          ico(r.icoNome, 'ei-ico') + '</span>' +
        '<span class="ei-body">' +
          '<span class="ei-name">' + esc(r.nome) + '</span>' +
          '<span class="ei-meta">' + esc(r.sub) + '</span>' +
        '</span>' +
        '<span class="ei-amt"><span class="ei-pfx">R$</span>' +
          '<span class="ei-val">' + r.valor + '</span></span>' +
        '<div class="eacts">' +
          (screen === 'eco'
            ? '<button class="ib" data-act="tog" data-id="' + x.id + '" ' +
              'aria-label="' + (x.hidden ? 'Mostrar' : 'Ocultar') + '">' +
              (x.hidden ? svgEyeOff() : svgEye()) + '</button>'
            : '') +
          '<button class="ib" data-act="edit" data-id="' + x.id + '" aria-label="Editar">' +
            svgEdit() + '</button>' +
          '<button class="ib del" data-act="del" data-id="' + x.id + '" aria-label="Excluir">' +
            svgTrash() + '</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  /* ── seletor de mês (mobile) ────────────────────────── */
  function renderMonthStrip() {
    $('m-months').innerHTML = w12.map(function (mo, i) {
      const cls = 'm-chip' + (i === selMonth ? ' on' : '') + (i === 0 ? ' today' : '');
      return '<button class="' + cls + '" data-mi="' + i + '" role="tab" ' +
        'aria-selected="' + (i === selMonth) + '">' +
        '<span class="mn">' + MS[mo.m - 1] + '</span>' +
        '<span class="yr">' + (i === 0 ? 'hoje' : mo.y) + '</span>' +
      '</button>';
    }).join('') + '<span style="flex:none;width:2px"></span>';
  }

  function scrollMonthIntoView() {
    const chip = $('m-months').querySelector('.m-chip.on');
    if (chip && chip.scrollIntoView) {
      chip.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }
  }

  /* ── entradas do mês selecionado (mobile) ───────────── */
  function renderMonthEntries(rows) {
    const i   = selMonth;
    const mo  = w12[i];
    const net = netOf(rows[i]);

    $('m-sel-lbl').textContent = MS_FULL[mo.m - 1] + ' ' + mo.y;
    const saldoEl = $('m-sel-saldo');
    saldoEl.textContent = 'saldo R' + '$' + num(net);
    saldoEl.className = 'm-sel-saldo' + (net < 0 ? ' neg' : '');

    // agrupadas na ordem dos tipos, como no resto do app
    const linhas = [];
    ORDER.forEach(function (type) {
      entries.forEach(function (e) {
        if (e.hidden || e.type !== type) return;
        const v = mv(e, mo.m, i === 0);
        if (!v) return;
        const ts = TYPE_STYLE[type];
        const valTxt = v.kind === 'range' ? num(v.lo) + '–' + num(v.hi) : num(v.val);
        linhas.push('<div class="m-erow">' +
          '<span class="m-erow-icon" style="background:' + ICON_BG[type] + ';color:' + DOT_COLOR[type] + '">' +
            ico(TYPE_ICON[type], 'ei-ico') + '</span>' +
          '<span class="m-erow-body">' +
            '<span class="m-erow-name">' + esc(e.name) + '</span>' +
            '<span class="m-erow-grp">' + TYPES[type].section + '</span>' +
          '</span>' +
          '<span class="m-erow-amt"><span class="m-erow-pfx">R$</span>' +
            '<span class="m-erow-val" style="color:' + ts.fg + '">' + valTxt + '</span></span>' +
        '</div>');
      });
    });

    /* Conta nova é diferente de mês vazio: sem nada lançado em lugar
       nenhum, a tela é só zero, e quem chegou agora precisa saber por
       onde começar. Antes isso ficava escondido pelos dados de exemplo. */
    $('m-entries').innerHTML = linhas.length ? linhas.join('')
      : (entries.length
        ? '<div class="m-empty"><span class="m-empty-dots"></span>' +
          '<span>Nenhuma entrada neste mês</span></div>'
        : '<div class="m-empty primeira">' +
          '<span class="m-empty-ico">' + ico('piggy-bank') + '</span>' +
          '<span class="m-empty-tit">Comece pelo que entra e sai</span>' +
          '<span class="m-empty-sub">Toque em <b>+ Entrada</b> para lançar um salário, ' +
            'uma poupança ou uma renda que ainda não é certa. A projeção dos ' +
            '12 meses se monta sozinha.</span>' +
          '</div>');
  }

  /* ── tabela mês a mês (mobile) ──────────────────────── */
  function renderMonthTable(rows) {
    const acum = acumOf(rows);
    let h = '<div class="m-thead"><span>mês</span><span>saldo</span><span>acumulado</span></div>';
    h += w12.map(function (mo, i) {
      const net = netOf(rows[i]);
      const on  = i === selMonth;
      const dot = net < 0 ? '#C05848' : (net > 0 ? '#4A8A5F' : '#C6DAB9');
      return '<button class="m-trow' + (on ? ' on' : '') + '" data-mi="' + i + '">' +
        '<span class="m-trow-m">' +
          '<span class="m-trow-dot" style="background:' + dot + '"></span>' +
          MS[mo.m - 1] + '</span>' +
        '<span class="m-trow-saldo' + (net < 0 ? ' neg' : '') + '">' + num(net) + '</span>' +
        '<span class="m-trow-acum">' + num(acum[i]) + '</span>' +
      '</button>';
    }).join('');
    $('m-table').innerHTML = h;
  }

  /* ── curva do acumulado (mobile) ────────────────────── */
  function renderCurve(rows) {
    const box = $('m-curve-body');
    if (!box) return;
    const acum = acumOf(rows);
    const finalVal = acum[acum.length - 1];
    $('m-curve-final').textContent = 'R' + '$' + short(finalVal) + ' final';

    // viewBox fixo com preserveAspectRatio="none": o traço acompanha a
    // largura sem depender de medir o elemento (que pode estar oculto)
    const W = 1140, H = 74, pad = 8;
    const lo = Math.min(0, Math.min.apply(null, acum));
    const hi = Math.max(1, Math.max.apply(null, acum));
    const span = (hi - lo) || 1;
    const n = acum.length;

    const pts = acum.map(function (v, i) {
      return {
        x: (W / n) * (i + 0.5),
        y: pad + (H - pad * 2) * (1 - (v - lo) / span),
      };
    });

    let out = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" ' +
      'role="img" aria-label="Curva do saldo acumulado nos próximos 12 meses">' +
      '<path d="' + curve(pts, H) + '" fill="rgba(201,232,142,.14)"></path>' +
      '<path d="' + curve(pts) + '" fill="none" stroke="var(--lime)" stroke-width="2.5" ' +
        'stroke-linecap="round" vector-effect="non-scaling-stroke"></path>' +
      '</svg>';

    // os pontos ficam fora do SVG para não esticarem com o preserveAspectRatio
    out += '<div class="m-curve-dots">' + pts.map(function (p, i) {
      const on = i === selMonth;
      const last = i === n - 1;
      const size = on ? 11 : (last ? 9 : 8);
      const bg = on ? '#fff' : 'var(--lime)';
      return '<span class="m-curve-cell">' +
        '<span class="m-curve-dot" style="top:' + ((p.y / H) * 100).toFixed(2) +
          '%;width:' + size + 'px;height:' + size + 'px;background:' + bg + '"></span></span>';
    }).join('') + '</div>';

    box.innerHTML = out;

    $('m-curve-axis').innerHTML = w12.map(function (mo, i) {
      return '<span' + (i === selMonth ? ' class="on"' : '') + '>' + MS[mo.m - 1] + '</span>';
    }).join('');
  }

  /* ── tela de empréstimos ────────────────────────────── */
  function renderLoans() {
    const r = loansResumo();

    $('lo-active').textContent = r.ativos === 1 ? '1 empréstimo ativo' : r.ativos + ' empréstimos ativos';
    const late = $('lo-late');
    late.textContent = r.atrasados + (r.atrasados === 1 ? ' atrasado' : ' atrasados');
    late.className = 'lo-late' + (r.atrasados === 0 ? ' zero' : '');

    $('lo-total').textContent    = num(r.emAberto);
    /* Juro de mensalidade não está embutido no que falta receber: ele já
       entrou, por fora. Dizer 'inclui' ali seria contar duas vezes. */
    $('lo-interest').textContent = r.jurosMensal > 0
      ? (r.jurosEmbutido > 0
          ? 'inclui R$ ' + num(r.jurosEmbutido) + ' de juros · R$ ' +
            num(r.jurosMensal) + ' já recebidos de mensalidade'
          : 'mais R$ ' + num(r.jurosMensal) + ' já recebidos de mensalidade')
      : (r.jurosEmbutido > 0
          ? 'inclui R$ ' + num(r.jurosEmbutido) + ' de juros'
          : (loans.length ? 'sem juros a receber' : 'nada emprestado ainda'));
    $('lo-received').textContent = num(r.recebido);
    $('lo-open').textContent     = num(r.emprestado);

    /* cartões de pessoa — só aparecem quando há mais de uma */
    const pessoas = pessoasDosEmprestimos();
    const faixa = $('lo-pessoas');
    faixa.hidden = pessoas.length < 2;
    if (!faixa.hidden) {
      faixa.innerHTML =
        '<button class="lo-pcard' + (loanPerson ? '' : ' on') + '" data-p="" role="tab" ' +
          'aria-selected="' + !loanPerson + '">' +
          '<span class="lo-pav" style="background:#F1F6EE;color:#51705E">' + ico('user') + '</span>' +
          '<span class="lo-pnome"><b>Todas</b><span>' + pessoas.length + ' pessoas</span></span>' +
        '</button>' +
        pessoas.map(function (p) {
          const ai = avatarIdx(p.nome);
          const on = loanPerson === p.chave;
          const nota = p.emAberto > 0 ? 'deve R$ ' + short(p.emAberto) : 'quitado';
          return '<button class="lo-pcard' + (on ? ' on' : '') + '" data-p="' + esc(p.chave) + '" ' +
            'role="tab" aria-selected="' + on + '">' +
            '<span class="lo-pav" style="background:' + AVATAR_BG[ai] + ';color:' + AVATAR_FG[ai] + '">' +
              esc(iniciais(p.nome)) + '</span>' +
            '<span class="lo-pnome"><b>' + esc(p.nome) + '</b><span>' + nota +
              (p.atrasados ? ' · atrasado' : '') + '</span></span>' +
          '</button>';
        }).join('') + '<span style="flex:none;width:2px"></span>';
    }

    $('lo-filters').innerHTML = LOAN_FILTERS.map(function (f) {
      return '<button class="lo-chip' + (f.id === loanFilter ? ' on' : '') + '" data-f="' + f.id + '" ' +
        'role="tab" aria-selected="' + (f.id === loanFilter) + '">' + f.label + '</button>';
    }).join('') + '<span style="flex:none;width:2px"></span>';

    const lista = loansFiltrados();
    $('lo-count').textContent = lista.length === 1
      ? '1 empréstimo' : lista.length + ' empréstimos';

    if (!lista.length) {
      $('lo-list').innerHTML =
        '<div class="empty-list">' +
          '<span class="empty-dots"></span>' +
          '<span class="empty-title">' +
            (loans.length ? 'Nada neste filtro' : 'Nenhum empréstimo') + '</span>' +
          '<span class="empty-sub">' +
            (loans.length ? 'Troque o filtro acima para ver os outros.'
                          : 'Toque no + para registrar quem está te devendo.') + '</span>' +
        '</div>';
      return;
    }

    $('lo-list').innerHTML = lista.map(function (l) {
      const i  = loanInfo(l);
      const ai = avatarIdx(l.person);
      let metodo = METHOD_LABEL[l.method];
      if (l.method === 'parcelado' && l.installments) metodo = l.installments + 'x';
      if (l.method === 'mensal' && l.installment_amount) metodo = 'R$ ' + num(l.installment_amount) + '/mês';

      const barBg = i.quitado ? 'var(--ok)' : (i.atrasado ? '#C05848' : 'var(--lime)');

      return '<button class="lo-card" data-id="' + l.id + '">' +
        '<span class="lo-head">' +
          '<span class="lo-avatar" style="background:' + AVATAR_BG[ai] + ';color:' + AVATAR_FG[ai] + '">' +
            esc(iniciais(l.person)) + '</span>' +
          '<span class="lo-who">' +
            '<span class="lo-name">' + esc(l.person) + '</span>' +
            '<span class="lo-meta">emprestado em ' + dataCurta(l.lent_on) + ' · ' + metodo + '</span>' +
          '</span>' +
          '<span class="lo-status" style="background:' + i.sbg + ';color:' + i.sfg + '">' + i.status + '</span>' +
        '</span>' +

        '<span class="lo-grid">' +
          celula('Emprestado', l.principal, '') +
          celula(i.mensal ? 'Juros recebidos' : 'Juros', i.juros, 'juros') +
          celula(i.mensal ? 'Falta voltar' : 'A receber',
                 i.mensal ? i.emAberto : l.total_due, 'total') +
        '</span>' +

        (i.mensal
          ? '<span class="lo-mensal-nota">' +
              'R$ ' + num(l.installment_amount) + '/mês de juro' +
              (i.meses ? ' · ' + i.meses + (i.meses === 1 ? ' mês recebido' : ' meses recebidos') : '') +
              ' · entrou R$ ' + num(i.recebido) + ' no total' +
            '</span>'
          : '') +

        '<span class="lo-bar-row">' +
          '<span class="lo-bar"><span style="width:' + (i.pct * 100).toFixed(1) +
            '%;background:' + barBg + '"></span></span>' +
          '<span class="lo-bar-lbl">' + Math.round(i.pct * 100) +
            (i.mensal ? '% do principal' : '% pago') + '</span>' +
        '</span>' +
      '</button>';
    }).join('');
  }

  function celula(k, v, cls) {
    return '<span class="lo-cell">' +
      '<span class="lo-cell-k">' + k + '</span>' +
      '<span class="lo-cell-v-wrap">' +
        '<span class="lo-cell-pfx">R$</span>' +
        '<span class="lo-cell-v' + (cls ? ' ' + cls : '') + '">' + num(v) + '</span>' +
      '</span></span>';
  }

  /* ── tela de contas ─────────────────────────────────── */
  function renderContas() {
    const r = contasResumo();

    $('ct-renda').textContent = 'R$ ' + num(r.renda);
    $('ct-sobra').textContent = num(r.sobra);
    $('ct-sobra-note').textContent = r.renda > 0
      ? Math.round(r.pctSobra) + '% da renda não comprometida'
      : 'cadastre uma renda para ver a sobra';

    /* barra empilhada — só desenha o que existe */
    const faixas = [
      { pct: r.pctFixas, cor: '#B58F3F', nome: 'Contas' },
      { pct: r.pctSubs,  cor: '#93AA9B', nome: 'Assinaturas' },
      { pct: r.pctVar,   cor: '#D98F62', nome: 'Variáveis' },
      { pct: r.pctEco,   cor: '#2F6142', nome: 'Economia' },
      { pct: r.pctSobra, cor: 'var(--lime)', nome: 'Livre' },
    ];
    $('ct-bar').innerHTML = faixas.map(function (f) {
      return '<span style="width:' + Math.min(100, f.pct).toFixed(1) + '%;background:' + f.cor + '"></span>';
    }).join('');
    $('ct-legend').innerHTML = faixas.map(function (f) {
      return '<span class="ct-leg"><i style="background:' + f.cor + '"></i>' +
        f.nome + ' ' + Math.round(f.pct) + '%</span>';
    }).join('');

    renderPizza(r);

    /* rendas */
    const rendas = doTipo('renda');
    $('ct-renda-count').textContent = rendas.length === 1 ? '1 fonte' : rendas.length + ' fontes';
    $('ct-rendas').innerHTML = rendas.length ? rendas.map(function (c) {
      const m = KIND_META.renda;
      const equiv = c.frequency !== 'mensal' && c.frequency !== 'pontual'
        ? ' · R$ ' + num(rendaMensal(c)) + '/mês' : '';
      return linha(c, m, FREQ_LABEL[c.frequency] + equiv, 'renda');
    }).join('') : vazio('Nenhuma renda', 'Toque no + para cadastrar o que entra.');

    /* contas fixas */
    const fixas = doTipo('fixa');
    $('ct-fixas-total').textContent = 'R$ ' + num(r.fixas) + '/mês';
    $('ct-fixas').innerHTML = fixas.length ? fixas.map(function (c) {
      const paga = estaPaga(c);
      return cartao(c, KIND_META.fixa, 'vence dia ' + c.due_day, {
        texto: paga ? 'pago' : 'em aberto',
        bg: paga ? '#E9F6D6' : '#FAF2DF',
        fg: paga ? '#2F6142' : '#8A6A24',
        id: c.id,
      });
    }).join('') : '<div class="card m-card">' + vazio('Nenhuma conta fixa', 'Aluguel, luz, internet…') + '</div>';

    /* contas variáveis */
    const vars = doTipo('variavel');
    $('ct-var-total').textContent = 'média R$ ' + num(r.varMedia) + '/mês';
    $('ct-variaveis').innerHTML = vars.length ? vars.map(function (c) {
      const m = KIND_META.variavel;
      const media = c.avg_amount || 0;
      const delta = media > 0 ? ((c.amount - media) / media) * 100 : 0;
      const sinal = delta > 0.5 ? '+' : '';
      const varia = media > 0
        ? ' · variou ' + sinal + delta.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + '%'
        : '';
      return cartao(c, m, 'média R$ ' + num(media) + '/mês' + varia);
    }).join('') : '<div class="card m-card">' + vazio('Nenhuma conta variável', 'Mercado, combustível…') + '</div>';

    /* assinaturas */
    const subs = doTipo('assinatura');
    $('ct-subs-ano').textContent = 'R$ ' + num(r.assinaturas * 12) + '/ano';
    $('ct-subs').innerHTML = subs.length
      ? '<div class="ct-subs-head"><span>Total mensal</span><span>R$ ' + num(r.assinaturas) + '</span></div>' +
        subs.map(function (c) {
          return linha(c, KIND_META.assinatura, 'R$ ' + num(c.amount * 12) + '/ano');
        }).join('')
      : vazio('Nenhuma assinatura', 'Streaming, apps, academia…');

    /* economia */
    const ecos = doTipo('economia');
    $('ct-eco-total').textContent = 'R$ ' + num(r.economia) + '/mês';
    $('ct-economia').innerHTML = ecos.length
      ? ecos.map(function (c) {
          return linha(c, KIND_META.economia, 'R$ ' + num(c.amount * 12) + '/ano', 'renda');
        }).join('')
      : vazio('Nada guardado ainda', 'Cadastre quanto você separa por mês.');

    /* metas — com a economia real comparada a elas */
    const pctReal = r.renda > 0 ? (r.economia / r.renda) * 100 : 0;
    $('ct-save-sub').textContent = r.economia > 0
      ? 'Você guarda R$ ' + num(r.economia) + ' — ' +
        pctReal.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '% da renda'
      : 'Sobre a renda de R$ ' + num(r.renda);
    $('ct-metas').innerHTML = METAS.map(function (t) {
      const batida = pctReal >= t.pct;
      return '<div class="ct-meta' + (batida ? ' batida' : '') + '" style="background:' + t.bg + '">' +
        (batida ? '<span class="ct-meta-ok">' + ico('check') + '</span>' : '') +
        '<span class="ct-meta-pct" style="color:' + t.fg + '">' + t.pct + '%</span>' +
        '<span class="ct-meta-v-wrap">' +
          '<span class="ct-meta-pfx" style="color:' + t.note + '">R$</span>' +
          '<span class="ct-meta-v" style="color:' + t.fg + '">' + num(r.renda * t.pct / 100) + '</span>' +
        '</span>' +
        '<span class="ct-meta-lbl" style="color:' + t.note + '">' + t.label + '</span>' +
      '</div>';
    }).join('');
  }

  /** Rosca dos gastos: fixas, variáveis e assinaturas. */
  function renderPizza(r) {
    const fatias = [
      { nome: 'Contas fixas', v: r.fixas,       cor: '#B58F3F' },
      { nome: 'Variáveis',    v: r.variaveis,   cor: '#D98F62' },
      { nome: 'Assinaturas',  v: r.assinaturas, cor: '#93AA9B' },
      // guardar também é destino do dinheiro — mesma cor da faixa lá em cima
      { nome: 'Economia',     v: r.economia,    cor: '#2F6142' },
    ].filter(function (f) { return f.v > 0; });

    const total = fatias.reduce(function (a, f) { return a + f.v; }, 0);
    $('ct-pizza-total').textContent = 'R$ ' + num(total) + ' por mês';

    const cartao = $('ct-pizza-card');
    if (!total) {
      cartao.classList.add('vazio');
      $('ct-pizza').innerHTML = '';
      $('ct-pizza-leg').innerHTML =
        '<span class="ct-pz-nome">Cadastre uma conta ou uma economia ' +
        'para ver para onde vai o seu dinheiro.</span>';
      return;
    }
    cartao.classList.remove('vazio');

    /* uma volta = 2πr; cada fatia ocupa a sua fração do traço */
    const R_ = 41, VOLTA = 2 * Math.PI * R_;
    let acumulado = 0;
    const arcos = fatias.map(function (f) {
      const frac = f.v / total;
      const arco = '<circle class="fatia" cx="59" cy="59" r="' + R_ + '" stroke="' + f.cor + '" ' +
        'stroke-dasharray="' + (frac * VOLTA).toFixed(2) + ' ' + VOLTA.toFixed(2) + '" ' +
        'stroke-dashoffset="' + (-acumulado * VOLTA).toFixed(2) + '"></circle>';
      acumulado += frac;
      return arco;
    }).join('');

    // a maior fatia é a que o miolo destaca
    const maior = fatias.slice().sort(function (a, b) { return b.v - a.v; })[0];
    const pctMaior = Math.round((maior.v / total) * 100);

    $('ct-pizza').innerHTML =
      '<svg viewBox="0 0 118 118" role="img" aria-label="Divisão dos gastos do mês">' +
        '<circle cx="59" cy="59" r="' + R_ + '" fill="none" stroke="#F1F5EE" stroke-width="17"></circle>' +
        arcos +
      '</svg>' +
      '<span class="ct-pizza-centro">' +
        '<span class="ct-pizza-pct" style="color:' + maior.cor + '">' + pctMaior + '%</span>' +
        '<span class="ct-pizza-cap">' + maior.nome.toLowerCase() + '</span>' +
      '</span>';

    $('ct-pizza-leg').innerHTML = fatias.map(function (f) {
      const pct = Math.round((f.v / total) * 100);
      return '<span class="ct-pz">' +
        '<i style="background:' + f.cor + '"></i>' +
        '<span class="ct-pz-nome">' + f.nome + '</span>' +
        '<span class="ct-pz-val">R$ ' + num(f.v) + '</span>' +
        '<span class="ct-pz-pct">' + pct + '%</span>' +
      '</span>';
    }).join('');
  }

  function linha(c, m, sub, cls) {
    return '<button class="ct-row" data-cid="' + c.id + '">' +
      '<span class="ct-ico" style="background:' + m.bg + ';color:' + m.fg + '">' + ico(m.ico) + '</span>' +
      '<span class="ct-body">' +
        '<span class="ct-name">' + esc(c.name) + '</span>' +
        '<span class="ct-sub">' + sub + '</span>' +
      '</span>' +
      '<span class="ct-amt"><span class="ct-amt-pfx">R$</span>' +
        '<span class="ct-amt-v' + (cls ? ' ' + cls : '') + '">' + num(c.amount) + '</span></span>' +
    '</button>';
  }

  function cartao(c, m, sub, pill) {
    return '<button class="ct-card" data-cid="' + c.id + '">' +
      '<span class="ct-ico" style="background:' + m.bg + ';color:' + m.fg + '">' + ico(m.ico) + '</span>' +
      '<span class="ct-body">' +
        '<span class="ct-name">' + esc(c.name) + '</span>' +
        '<span class="ct-sub-row">' +
          '<span class="ct-sub">' + sub + '</span>' +
          (pill
            // a pastilha é o próprio botão de marcar/desmarcar
            ? '<span class="ct-pill" role="button" tabindex="0" data-pago="' + pill.id + '" ' +
              'style="background:' + pill.bg + ';color:' + pill.fg + '">' + pill.texto + '</span>'
            : '') +
        '</span>' +
      '</span>' +
      '<span class="ct-amt"><span class="ct-amt-pfx">R$</span>' +
        '<span class="ct-amt-v">' + num(c.amount) + '</span></span>' +
    '</button>';
  }

  /** Alterna o pagamento do mês corrente. */
  function alternarPago(id) {
    const c = contas.find(function (x) { return x.id === id; });
    if (!c) return;
    c.paid_on = estaPaga(c) ? null : Store.hoje();
    render(); triggerSave();
    toast(c.paid_on ? '“' + c.name + '” marcada como paga' : '“' + c.name + '” reaberta');
  }

  function vazio(titulo, sub) {
    return '<div class="m-empty"><span class="m-empty-dots"></span>' +
      '<span>' + titulo + ' — ' + sub + '</span></div>';
  }

  /* ── tela de favores ────────────────────────────────── */
  function renderFavores() {
    const r = favoresResumo();

    // o destaque é o que falta receber, não o que já foi emprestado
    $('fv-total').textContent = num(r.falta);
    $('fv-pago-note').textContent = r.pago > 0
      ? 'de R$ ' + num(r.total) + ' · ' + Math.round(r.pct) + '% já pago'
      : (r.total > 0 ? 'de R$ ' + num(r.total) + ' · nada pago ainda' : 'nada emprestado ainda');

    $('fv-pessoas').textContent = r.pessoas;
    $('fv-favores-note').textContent = r.atrasados
      ? r.atrasados + (r.atrasados === 1 ? ' favor atrasado' : ' favores atrasados')
      : (r.favores
          ? r.favores + (r.favores === 1 ? ' favor no total' : ' favores no total')
          : 'nenhum favor');
    $('fv-favores-note').classList.toggle('atraso', r.atrasados > 0);

    const pessoas = porPessoa();
    if (!pessoas.length) {
      $('fv-lista').innerHTML =
        '<div class="empty-list">' +
          '<span class="empty-dots"></span>' +
          '<span class="empty-title">Ninguém te deve nada</span>' +
          '<span class="empty-sub">Toque no + para anotar um favor.</span>' +
        '</div>';
      return;
    }

    $('fv-lista').innerHTML = pessoas.map(function (p) {
      const ai = avatarIdx(p.nome);
      const aberta = pessoaAberta === p.chave;
      const cor = p.quitado ? 'var(--ok)' : 'var(--lime)';

      /* um bloco por dia: é assim que o gasto acontece — uma saída,
         várias contas. O pagamento pode fechar o dia inteiro de uma vez. */
      const dias = p.dias.map(function (d) {
        const itens = d.itens.map(function (f) {
          const i = favorInfo(f);
          const parcial = i.pago > 0 && !i.quitado;
          return '<div class="fv-item' + (i.quitado ? ' quitado' : '') +
              (i.atrasado ? ' atrasado' : '') + '">' +
            '<span class="fv-faixa" style="background:' +
              (i.quitado ? 'var(--ok)'
                : (i.atrasado ? '#C05848' : (parcial ? '#B58F3F' : '#C6D5CB'))) + '"></span>' +
            '<button class="fv-item-abrir" data-fid="' + f.id + '">' +
              '<span class="fv-item-corpo">' +
                '<span class="fv-motivo">' + esc(f.reason) + '</span>' +
                (function () {
                  /* O vencimento agora é o título do grupo; aqui vai a data
                     em que o dinheiro saiu, que continua registrada. */
                  const partes = ['pego em ' + dataCurta(f.lent_on)];
                  if (parcial) partes.push('pago R$ ' + num(i.pago) + ' de ' + num(f.amount));
                  if (i.atrasado) partes.push('atrasado');
                  return '<span class="fv-quando">' + partes.join(' · ') + '</span>';
                })() +
              '</span>' +
              '<span class="fv-item-val">' +
                '<span class="fv-item-total">R$' + num(f.amount) + '</span>' +
                '<span class="fv-item-falta ' + (i.quitado ? 'quitado' : 'aberto') + '">' +
                  (i.quitado ? 'quitado' : 'falta R$ ' + num(i.falta)) + '</span>' +
              '</span>' +
            '</button>' +
            (i.quitado ? '' :
              '<button class="fv-mini" data-pay="item" data-alvo="' + f.id +
                '" aria-label="Registrar pagamento deste item">' + ico('coins') + '</button>') +
          '</div>';
        }).join('');

        return '<div class="fv-dia' + (d.quitado ? ' quitado' : '') +
            (d.atrasados ? ' atrasado' : '') + '">' +
          '<div class="fv-dia-cab">' +
            '<span class="fv-dia-data">' +
              (d.dia ? dataCurta(d.dia) : 'sem prazo') + '</span>' +
            '<span class="fv-dia-meta">' +
              (d.atrasados && d.vence ? 'foi para ' + dataCurta(d.vence) + ' · ' : '') +
              d.itens.length +
              (d.itens.length === 1 ? ' conta · R$ ' : ' contas · R$ ') + num(d.total) + '</span>' +
            '<span class="fv-dia-falta ' +
              (d.quitado ? 'quitado' : (d.atrasados ? 'vencido' : 'aberto')) + '">' +
              (d.quitado ? 'pago' : 'falta R$ ' + num(d.falta)) + '</span>' +
            (d.quitado ? '' :
              (d.dia
                ? '<button class="fv-mini" data-pay="dia" data-alvo="' +
                    esc(p.chave) + '|' + d.dia +
                    '" aria-label="Registrar pagamento deste vencimento">' + ico('coins') + '</button>'
                : '')) +
          '</div>' +
          '<div class="fv-dia-itens">' + itens + '</div>' +
        '</div>';
      }).join('');

      /* o que ela já pagou, e onde caiu */
      const pags = pagamentosDe(p.chave);
      const historico = pags.length
        ? '<div class="fv-hist">' +
            '<span class="fv-hist-tit">' + pags.length +
              (pags.length === 1 ? ' pagamento' : ' pagamentos') + '</span>' +
            pags.map(function (pg) {
              return '<button class="fv-pag" data-pgid="' + pg.id + '">' +
                '<span class="fv-pag-ico">' + ico('coins') + '</span>' +
                '<span class="fv-pag-corpo">' +
                  '<span class="fv-pag-val">R$ ' + num(pg.amount) + '</span>' +
                  '<span class="fv-pag-meta">' + dataCurta(pg.paid_on) + ' · ' +
                    alcanceLabel(pg) + '</span>' +
                '</span>' +
              '</button>';
            }).join('') +
          '</div>'
        : '';

      return '<div class="fv-pessoa' + (aberta ? ' aberta' : '') + '" data-pessoa="' +
          esc(p.chave) + '">' +
        '<button class="fv-cab" data-abrir="' + esc(p.chave) + '">' +
          '<span class="fv-avatar" style="background:' + AVATAR_BG[ai] + ';color:' + AVATAR_FG[ai] + '">' +
            esc(iniciais(p.nome)) + '</span>' +
          '<span class="fv-quem">' +
            '<span class="fv-nome">' + esc(p.nome) + '</span>' +
            '<span class="fv-meta' + (p.atrasados ? ' atraso' : '') + '">' +
              (p.atrasados
                ? p.atrasados + (p.atrasados === 1 ? ' favor atrasado' : ' favores atrasados')
                : (p.vence && !p.quitado
                    ? 'paga ' + dataCurta(p.vence)
                    : p.itens.length + (p.itens.length === 1 ? ' favor' : ' favores'))) +
            '</span>' +
          '</span>' +
          '<span class="fv-valor"><span class="fv-valor-pfx">R$</span>' +
            '<span class="fv-valor-v">' + num(p.quitado ? p.total : p.falta) + '</span></span>' +
          '<span class="fv-seta" aria-hidden="true"></span>' +
        '</button>' +
        '<span class="fv-barra-linha">' +
          '<span class="fv-barra"><span style="width:' + Math.min(100, p.pct).toFixed(1) +
            '%;background:' + cor + '"></span></span>' +
          '<span class="fv-barra-lbl">' + Math.round(p.pct) + '% pago</span>' +
        '</span>' +
        '<div class="fv-itens">' +
          '<button class="fv-pagar-tudo" data-pay="total" data-alvo="' + esc(p.chave) + '">' +
            ico('coins') + '<span>Registrar pagamento</span>' +
            '<span class="fv-pagar-nota">divide sozinho, pelo que vence antes</span>' +
          '</button>' +
          (p.credito > 0
            ? '<div class="fv-credito">' + ico('info-circle') +
              '<span>Pagou R$ ' + num(p.credito) + ' a mais — fica de crédito.</span></div>'
            : '') +
          dias + historico +
        '</div>' +
      '</div>';
    }).join('');
  }

  /** Como o pagamento aparece no histórico. */
  function alcanceLabel(pg) {
    if (pg.scope === 'item') {
      const f = favores.find(function (x) { return x.id === pg.favor_id; });
      return f ? esc(f.reason) : 'item removido';
    }
    if (pg.scope === 'dia') return 'vencimento ' + dataCurta(pg.scope_day);
    return 'no total';
  }

  /* ── cartões do hub ─────────────────────────────────── */
  function renderHub(rows) {
    const rf = favoresResumo();
    $('hub-favores-val').textContent = num(rf.falta);
    $('hub-favores-note').textContent = rf.favores
      ? rf.pessoas + (rf.pessoas === 1 ? ' pessoa te devendo' : ' pessoas te devendo')
      : 'ninguém te deve';

    const r = loansResumo();
    $('hub-loans-val').textContent = num(r.emAberto);
    $('hub-loans-note').textContent = loans.length
      ? (r.ativos + (r.ativos === 1 ? ' pessoa devendo' : ' pessoas devendo') +
         (r.atrasados ? ' · ' + r.atrasados + ' em atraso' : ''))
      : 'nada emprestado ainda';

    const acum = acumOf(rows);
    const rc = contasResumo();
    $('hub-contas-val').textContent = num(rc.sobra);
    $('hub-contas-note').textContent = contas.length
      ? 'sobra no mês · ' + (rc.emAberto ? rc.emAberto + ' conta(s) em aberto' : 'tudo pago')
      : 'nenhuma conta cadastrada';

    $('hub-eco-val').textContent = num(acum[acum.length - 1]);
    $('hub-eco-note').textContent = entries.length
      ? entries.length + (entries.length === 1 ? ' entrada' : ' entradas') + ' · 12 meses'
      : 'nenhuma entrada ainda';
  }

  /* ── grade de 12 meses (desktop) ────────────────────── */
  function renderTable(rows) {
    const NC  = w12.length;
    const vis = entries.filter(function (e) { return !e.hidden; });
    const NOW = 0;
    const cols = 'grid-template-columns:300px repeat(' + NC + ',minmax(94px,1fr))';
    const colBg = function (i) { return i === NOW ? 'rgba(201,232,142,.20)' : 'transparent'; };

    const headCells = w12.map(function (mo, i) {
      const isJan = mo.m === 1;
      const yrTxt = i === NOW ? 'hoje' : mo.y;
      const pillBg = i === NOW ? 'var(--lime)' : (isJan ? '#E9F6D6' : 'transparent');
      const pillFg = (i === NOW || isJan) ? '#123A2C' : '#51705E';
      return '<div class="th-cell" style="background:' + colBg(i) + '">' +
        '<span class="th-pill" style="background:' + pillBg + ';color:' + pillFg + '">' +
          '<span class="th-mn">' + MS[mo.m - 1] + '</span>' +
          '<span class="th-yr">' + yrTxt + '</span>' +
        '</span></div>';
    }).join('');

    let h = '<div class="th-row" style="' + cols + '">' +
      '<div class="th-lbl">Entrada</div>' + headCells + '</div>';

    const groupColors = ['#FFFFFF', '#F7FAF4'];
    let gi = 0;
    ORDER.forEach(function (type) {
      const grp = vis.filter(function (e) { return e.type === type; });
      if (!grp.length) return;
      const rowBg = groupColors[gi % 2]; gi++;

      h += '<div class="sec-hd" style="background:' + rowBg + '">' +
        '<div class="sec-hd-inner" style="background:' + rowBg + '">' +
          '<span class="sec-icon" style="background:' + ICON_BG[type] + ';color:' + DOT_COLOR[type] + '">' +
            ico(TYPE_ICON[type], 'sec-ico') + '</span>' +
          '<span class="sec-lbl">' + TYPES[type].section + '</span>' +
        '</div><span class="sec-line"></span></div>';

      grp.forEach(function (e) {
        const ts = TYPE_STYLE[e.type];
        const cells = w12.map(function (mo, i) {
          const v = mv(e, mo.m, i === 0);
          const cb = colBg(i);
          if (!v) return '<div class="dc" style="background:' + cb + '"><span class="dc-empty"></span></div>';
          if (v.kind === 'range') {
            return '<div class="dc" style="background:' + cb + '">' +
              '<span class="dc-pill" style="background:var(--ui-bg);color:var(--ui-fg)">R$' +
              numRaw(v.lo) + '–' + numRaw(v.hi) + '</span></div>';
          }
          return '<div class="dc" style="background:' + cb + '">' +
            '<span class="dc-pill" style="background:' + ts.bg + ';color:' + ts.fg + '">R$' +
            numRaw(v.val) + '</span></div>';
        }).join('');

        h += '<div class="drow" style="' + cols + ';background:' + rowBg + '">' +
          '<div class="dr-lbl"><span class="dr-name">' + esc(e.name) + '</span>' +
          '<span class="dr-hint">' + entryHint(e) + '</span></div>' + cells + '</div>';
      });
    });

    if (!vis.length) {
      h += '<div style="text-align:center;padding:30px;color:var(--tx-d);font-size:13px">' +
           'Nenhuma entrada visível</div>';
    }

    h += '<div style="height:12px"></div>';

    /* subtotais */
    const subs = [
      { label:'Renda certa',   fg:'#2F6142', vals: rows.map(function (r) { return r.inC; }) },
      { label:'Renda incerta', fg:'#8A6A24', vals: rows.map(function (r) { return view === 'p' ? 0 : r.inLO; }),
        show: rows.map(function (r) { return r.inLO > 0; }) },
    ];
    subs.forEach(function (st) {
      const cells = w12.map(function (_, i) {
        const v = st.vals[i], cb = colBg(i);
        const show = st.show ? st.show[i] : v > 0;
        if (!show && !v) {
          return '<div class="stc" style="background:' + cb + '">' +
            '<span style="width:4px;height:4px;border-radius:50%;background:#E4EDDF;display:block"></span></div>';
        }
        return '<div class="stc" style="background:' + cb + ';color:' + st.fg + '">R$' + num(v) + '</div>';
      }).join('');
      h += '<div class="strow" style="' + cols + '"><div class="st-lbl">' + st.label + '</div>' + cells + '</div>';
    });

    /* saldo mensal */
    const saldoCells = w12.map(function (_, i) {
      const n = netOf(rows[i]);
      const cb = i === NOW ? 'rgba(255,255,255,.38)' : 'transparent';
      return '<div class="src" style="background:' + cb + '">R$' + num(n) + '</div>';
    }).join('');
    h += '<div class="srow" style="' + cols + '">' +
      '<div class="sr-lbl"><span class="sr-dot"></span>Saldo mensal</div>' + saldoCells + '</div>';

    /* acumulado com curva */
    const acum = acumOf(rows);
    const peak = Math.max.apply(null, acum.concat([1]));
    const finalVal = acum[acum.length - 1];
    const pts = acum.map(function (v, i) { return { x: i * 100 + 50, y: 96 - (v / peak) * 66 }; });

    const acumCells = acum.map(function (v, i) {
      const isLast = i === acum.length - 1;
      const sz = isLast ? 12 : 10;
      const dotTop = pts[i].y - sz / 2;
      const textTop = Math.min(pts[i].y + sz / 2 + 3, 94);
      const dotBg = isLast ? '#FFFFFF' : 'var(--lime)';
      const fg = (i === NOW || isLast) ? '#FFFFFF' : '#B9CFA8';
      return '<div class="ar-cell">' +
        '<span class="ar-dot" style="top:' + dotTop + 'px;width:' + sz + 'px;height:' + sz +
          'px;background:' + dotBg + '"></span>' +
        '<span class="ar-short" style="top:' + textTop + 'px;color:' + fg + '">R$' + short(v) + '</span>' +
      '</div>';
    }).join('');

    h += '<div class="arow">' +
      '<div class="ar-lbl"><span class="ar-title">Acumulado</span>' +
        '<div class="ar-final-wrap"><span class="ar-pfx">R$</span>' +
        '<span class="ar-final-val">' + short(finalVal) + '</span></div></div>' +
      '<div class="ar-chart">' +
        '<svg viewBox="0 0 ' + (NC * 100) + ' 116" preserveAspectRatio="none">' +
          '<path d="' + curve(pts, 116) + '" fill="rgba(201,232,142,.13)"></path>' +
          '<path d="' + curve(pts) + '" fill="none" stroke="var(--lime)" stroke-width="2.5" ' +
            'stroke-linecap="round" vector-effect="non-scaling-stroke"></path>' +
        '</svg>' +
        '<div class="ar-cells">' + acumCells + '</div>' +
      '</div></div>';

    el.tinner.innerHTML = h;
    el.tinner.style.minWidth = (300 + NC * 94) + 'px';
  }

  /* ══════════════════════════════════════════════════════
     AÇÕES
     ══════════════════════════════════════════════════════ */
  function setV(v) {
    view = v;
    ['bp','bo','bp-m','bo-m'].forEach(function (id) {
      const b = $(id);
      if (!b) return;
      const on = b.dataset.view === v;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    render();
  }

  function tog(id) {
    const e = entries.find(function (x) { return x.id === id; });
    if (e) e.hidden = !e.hidden;
    render(); triggerSave();
  }

  function del(id) {
    const e = entries.find(function (x) { return x.id === id; });
    if (!e) return;
    const backup = JSON.parse(JSON.stringify(entries));
    entries = entries.filter(function (x) { return x.id !== id; });
    render(); triggerSave();
    toast('“' + e.name + '” excluída', 'Desfazer', function () {
      entries = backup; render(); triggerSave();
    });
  }

  /* ── formulário ─────────────────────────────────────── */
  function openForm(id) {
    editId = id || null;
    $('ftitle').textContent = editId ? 'Editar entrada' : 'Nova entrada';

    if (editId) {
      const e = entries.find(function (x) { return x.id === editId; });
      $('fn').value   = e.name;
      $('ft').value   = e.type;
      $('famt').value = e.amount !== undefined && e.amount !== null ? num(e.amount, 2) : '';
      $('fmin').value = e.min_amount !== undefined && e.min_amount !== null ? num(e.min_amount, 2) : '';
      $('fmax').value = e.max_amount !== undefined && e.max_amount !== null ? num(e.max_amount, 2) : '';
      $('fmno').checked = !!e.may_not_occur;
      $('fhid').checked = !!e.hidden;
      selM = e.months ? e.months.slice() : [];
    } else {
      $('fn').value = ''; $('ft').value = 'fs';
      $('famt').value = ''; $('fmin').value = ''; $('fmax').value = '';
      $('fmno').checked = false; $('fhid').checked = false;
      selM = [];
    }
    buildRangeSelects(); onTypeChange(); renderMG();
    openSheet(el.sheetForm);
    if (!editId) setTimeout(function () { $('fn').focus(); }, 320);
  }

  function onTypeChange() {
    const t = $('ft').value;
    const isUI  = t === 'ui';
    const isOcc = ['os','ci','ui','em','co'].includes(t);
    $('fa').hidden  = isUI;
    $('fr').hidden  = !isUI;
    $('fmn').hidden = !isUI;
    $('fms').hidden = !isOcc;
  }

  function buildRangeSelects() {
    const firstY = w12[0].y;
    const opts = w12.map(function (mo, i) {
      const yr = mo.y !== firstY ? " '" + String(mo.y).slice(2) : '';
      return '<option value="' + i + '">' + MS[mo.m - 1] + yr + '</option>';
    }).join('');
    $('rFrom').innerHTML = opts;
    $('rTo').innerHTML   = opts;
    $('rFrom').value = '0';
    $('rTo').value   = String(w12.length - 1);
  }

  function applyRange() {
    const from = parseInt($('rFrom').value, 10);
    const to   = parseInt($('rTo').value, 10);
    const lo = Math.min(from, to), hi = Math.max(from, to);
    selM = w12.slice(lo, hi + 1).map(function (x) { return x.m; });
    renderMG();
  }

  function clearRange() {
    selM = [];
    $('rFrom').value = '0';
    $('rTo').value = String(w12.length - 1);
    renderMG();
  }

  function renderMG() {
    const firstY = w12[0].y;
    $('mgrid').innerHTML = w12.map(function (mo) {
      const sel = selM.includes(mo.m);
      const badge = mo.y !== firstY ? '<span class="mp-yr">' + String(mo.y).slice(2) + '</span>' : '';
      return '<button type="button" class="mp' + (sel ? ' sel' : '') + '" data-m="' + mo.m +
        '" aria-pressed="' + sel + '">' + MS[mo.m - 1] + badge + '</button>';
    }).join('');
  }

  function saveEntry() {
    const name = $('fn').value.trim();
    if (!name) { $('fn').focus(); toast('Dê um nome para a entrada'); return; }

    const type   = $('ft').value;
    const hidden = $('fhid').checked;
    const isUI   = type === 'ui';
    const isOcc  = ['os','ci','ui','em','co'].includes(type);

    const e = { id: editId || uid(), name: name, type: type, hidden: hidden };
    if (isUI) {
      e.min_amount = parseBRL($('fmin').value) || 0;
      e.max_amount = parseBRL($('fmax').value) || 0;
      e.may_not_occur = $('fmno').checked;
    } else {
      e.amount = parseBRL($('famt').value) || 0;
    }
    if (isOcc) e.months = selM.slice().sort(function (a, b) { return a - b; });

    if (editId) {
      const idx = entries.findIndex(function (x) { return x.id === editId; });
      if (idx >= 0) entries[idx] = e;
    } else {
      entries.push(e);
    }
    const wasEdit = !!editId;     // closeSheets zera editId
    closeSheets();
    render(); triggerSave();
    toast(wasEdit ? 'Entrada atualizada' : 'Entrada adicionada');
  }

  /* ── formulário de favor ────────────────────────────── */
  function openFavor(id, pessoaSugerida) {
    editFavorId = id || null;
    $('fv-ftitle').textContent = editFavorId ? 'Editar favor' : 'Novo favor';
    $('fv-del').hidden = !editFavorId;
    $('fv-send').hidden = !editFavorId;

    // sugere quem já está na lista, para não haver "Ana" e "ana"
    const nomes = [];
    porPessoa().forEach(function (p) { nomes.push(p.nome); });
    $('fv-pessoas-lista').innerHTML = nomes.map(function (n) {
      return '<option value="' + esc(n) + '"></option>';
    }).join('');

    const f = editFavorId ? favores.find(function (x) { return x.id === editFavorId; }) : null;
    $('fv-person').value = f ? f.person : (pessoaSugerida || '');
    $('fv-reason').value = f ? f.reason : '';
    $('fv-amount').value = f ? num(f.amount) : '';
    $('fv-date').value   = f ? f.lent_on : Store.hoje();
    $('fv-due').value    = f && f.due_on ? f.due_on : '';
    $('fv-notes').value  = f && f.notes ? f.notes : '';
    // repetir só faz sentido ao criar: editando, mexeria num favor só
    $('fv-meses').value  = 1;
    $('fv-repete').hidden = !!editFavorId;

    onFavorAmounts();
    openSheet($('sheet-favor'));
    if (!editFavorId) {
      setTimeout(function () { $(pessoaSugerida ? 'fv-reason' : 'fv-person').focus(); }, 320);
    }
  }

  /**
   * O quanto já voltou não se digita aqui: vem dos pagamentos.
   * Este quadro só mostra como está o favor que se edita.
   */
  function onFavorAmounts() {
    const total = parseBRL($('fv-amount').value) || 0;
    const box = $('fv-saldo');
    const f = editFavorId ? favores.find(function (x) { return x.id === editFavorId; }) : null;
    const pago = f ? (alocacao.pago[f.id] || 0) : 0;

    if (!f) {
      const meses = mesesDoFavor();
      box.className = 'fv-saldo';
      box.textContent = total <= 0
        ? 'Depois, registre os pagamentos pela lista: por item, por dia ou no total.'
        : (meses > 1
            ? meses + '× R$ ' + num(total) + ' — falta receber R$ ' +
              num(total * meses) + ', um por mês.'
            : 'Falta receber: R$ ' + num(total) + ' — registre os pagamentos na lista.');
      return;
    }

    const falta = Math.max(0, total - pago);
    const pct = total > 0 ? (Math.min(pago, total) / total) * 100 : 0;

    if (total > 0 && falta < 0.005) {
      box.className = 'fv-saldo quitado';
      box.textContent = 'Quitado — nada a receber.';
    } else {
      box.className = 'fv-saldo';
      box.textContent = 'Já pago R$ ' + num(pago) + '  ·  falta R$ ' + num(falta) +
        (total > 0 ? '  ·  ' + pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%' : '');
    }
  }

  /** Quantas vezes o mesmo favor se repete, mês a mês. 1 = avulso. */
  function mesesDoFavor() {
    if (editFavorId) return 1;
    const n = parseInt($('fv-meses').value, 10);
    return (isFinite(n) && n >= 1) ? Math.min(60, n) : 1;
  }

  function saveFavor() {
    const person = $('fv-person').value.trim();
    if (!person) { $('fv-person').focus(); toast('Diga quem te deve'); return; }

    const reason = $('fv-reason').value.trim();
    if (!reason) { $('fv-reason').focus(); toast('Diga por que te deve'); return; }

    const amount = parseBRL($('fv-amount').value) || 0;
    if (amount <= 0) { $('fv-amount').focus(); toast('Informe o valor'); return; }

    /* Sem data de pagamento não há o que repetir: só o vencimento anda,
       então as N linhas sairiam idênticas. */
    if (mesesDoFavor() > 1 && !$('fv-due').value) {
      $('fv-due').focus();
      toast('Para repetir, diga quando ela combinou de pagar');
      return;
    }

    const f = Store.normalizeFavor({
      id: editFavorId || undefined,
      person: person,
      reason: reason,
      amount: amount,
      lent_on: $('fv-date').value,
      due_on: $('fv-due').value || null,
      notes: $('fv-notes').value.trim() || null,
    });

    const era = !!editFavorId;
    const meses = mesesDoFavor();
    if (era) {
      const idx = favores.findIndex(function (x) { return x.id === editFavorId; });
      if (idx >= 0) favores[idx] = f;
    } else if (meses > 1) {
      /* "me deve 250 até dezembro, 3 vezes": cada mês é uma cobrança
         própria, com vencimento próprio.

         Só o VENCIMENTO anda. A data em que o dinheiro saiu é a mesma nas
         N linhas: a saída aconteceu uma vez só, num dia só — o que se
         repete é a promessa de pagar. Fazer as duas andarem punha o
         dinheiro saindo em meses em que ninguém pegou nada. */
      for (let i = 0; i < meses; i++) {
        favores.push(Store.normalizeFavor({
          person: f.person, reason: f.reason, amount: f.amount,
          lent_on: f.lent_on,
          due_on: f.due_on ? mesAdiante(f.due_on, i) : null,
          notes: f.notes,
        }));
      }
    } else {
      favores.push(f);
    }
    // deixa aberta a pessoa que acabou de mexer
    pessoaAberta = chavePessoa(f.person);
    closeSheets();
    render(); triggerSave();
    toast(era ? 'Favor atualizado'
              : (meses > 1
                  ? meses + '× R$ ' + num(f.amount) + ' anotados, um por mês'
                  : 'Favor anotado'));
  }

  /* ── formulário de pagamento ────────────────────────── */

  /* O alcance não é escolhido no formulário: ele vem de ONDE se tocou.
     Tocar no dia paga o dia; no item, o item; no cabeçalho, o total.
     Escolher duas vezes a mesma coisa só daria chance de errar. */
  let pagAlvo = null;   // { scope, person, favor_id, scope_day, aberto }

  function alvoDoPagamento(scope, alvo) {
    if (scope === 'item') {
      const f = favores.find(function (x) { return x.id === alvo; });
      if (!f) return null;
      return { scope: 'item', person: f.person, favor_id: f.id, scope_day: null,
               aberto: favorInfo(f).falta, rotulo: f.reason + ' · ' + dataCurta(f.lent_on) };
    }
    if (scope === 'dia') {
      const corte = alvo.indexOf('|');
      const chave = alvo.slice(0, corte);
      const dia = alvo.slice(corte + 1);
      const p = porPessoa().find(function (x) { return x.chave === chave; });
      const d = p && p.dias.find(function (x) { return x.dia === dia; });
      if (!d) return null;
      return { scope: 'dia', person: p.nome, favor_id: null, scope_day: dia,
               aberto: d.falta,
               rotulo: 'vence ' + dataCurta(dia) + ' · ' + d.itens.length +
                       (d.itens.length === 1 ? ' conta' : ' contas') };
    }
    const p = porPessoa().find(function (x) { return x.chave === alvo; });
    if (!p) return null;
    return { scope: 'total', person: p.nome, favor_id: null, scope_day: null,
             aberto: p.falta, rotulo: 'tudo que ' + p.nome + ' deve' };
  }

  function openPagamento(scope, alvo, id) {
    editPagId = id || null;

    if (editPagId) {
      const pg = pagamentos.find(function (x) { return x.id === editPagId; });
      if (!pg) return;
      pagAlvo = alvoDoPagamento(pg.scope,
        pg.scope === 'item' ? pg.favor_id
          : pg.scope === 'dia' ? chavePessoa(pg.person) + '|' + pg.scope_day
          : chavePessoa(pg.person));
      // o alvo pode ter sumido; o pagamento continua válido
      if (!pagAlvo) {
        pagAlvo = { scope: pg.scope, person: pg.person, favor_id: pg.favor_id,
                    scope_day: pg.scope_day, aberto: 0, rotulo: alcanceLabel(pg) };
      }
      $('pg-amount').value = num(pg.amount);
      $('pg-date').value = pg.paid_on;
      $('pg-notes').value = pg.notes || '';
    } else {
      pagAlvo = alvoDoPagamento(scope, alvo);
      if (!pagAlvo) return;
      $('pg-amount').value = '';
      $('pg-date').value = Store.hoje();
      $('pg-notes').value = '';
    }

    $('pg-ftitle').textContent = editPagId ? 'Editar pagamento' : 'Registrar pagamento';
    $('pg-del').hidden = !editPagId;
    $('pg-quem').textContent = pagAlvo.person;
    $('pg-alvo').textContent = pagAlvo.rotulo;
    $('pg-aberto').textContent = 'R$ ' + num(pagAlvo.aberto);

    const ALCANCE_NOTA = {
      item:  'Entra só nesta conta.',
      dia:   'Divide entre as contas deste vencimento, da primeira para a última.',
      total: 'Divide entre tudo que está em aberto, começando pelo que vence antes.',
    };
    $('pg-nota').textContent = ALCANCE_NOTA[pagAlvo.scope];

    onPagamentoAmount();
    openSheet($('sheet-pagamento'));
    if (!editPagId) setTimeout(function () { $('pg-amount').focus(); }, 320);
  }

  /** Avisa quanto o pagamento cobre, e quando ele passa do devido. */
  function onPagamentoAmount() {
    if (!pagAlvo) return;
    const v = parseBRL($('pg-amount').value) || 0;
    const box = $('pg-saldo');

    if (v <= 0) { box.className = 'fv-saldo'; box.textContent = ALVO_VAZIO; return; }

    if (v > pagAlvo.aberto + 0.005) {
      box.className = 'fv-saldo erro';
      box.textContent = 'Passa R$ ' + num(v - pagAlvo.aberto) +
        ' do que está em aberto — a sobra fica de crédito.';
      return;
    }

    box.className = 'fv-saldo';
    const resta = Math.max(0, pagAlvo.aberto - v);
    box.textContent = resta < 0.005
      ? 'Quita tudo deste alcance.'
      : 'Depois deste, faltam R$ ' + num(resta) + '.';
  }
  const ALVO_VAZIO = 'Quanto ela te passou?';

  /**
   * Mesmo dia, N meses adiante — é assim que um favor que se repete
   * ganha a data de cada mês. Dia 31 em mês curto cai no último dia do
   * mês, e não escorrega para o mês seguinte como o Date faria.
   */
  function mesAdiante(iso, n) {
    const p = String(iso).split('-').map(Number);
    const ano = p[0], mes = p[1] - 1 + n, dia = p[2];
    const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
    const d = new Date(Date.UTC(ano, mes, Math.min(dia, ultimo)));
    return d.toISOString().slice(0, 10);
  }

  function savePagamento() {
    if (!pagAlvo) return;
    const amount = parseBRL($('pg-amount').value) || 0;
    if (amount <= 0) { $('pg-amount').focus(); toast('Informe o valor'); return; }

    const pg = Store.normalizePayment({
      id: editPagId || undefined,
      person: pagAlvo.person,
      amount: amount,
      paid_on: $('pg-date').value,
      scope: pagAlvo.scope,
      favor_id: pagAlvo.favor_id,
      scope_day: pagAlvo.scope_day,
      notes: $('pg-notes').value.trim() || null,
    });

    const era = !!editPagId;
    if (era) {
      const idx = pagamentos.findIndex(function (x) { return x.id === editPagId; });
      if (idx >= 0) pagamentos[idx] = pg;
    } else {
      pagamentos.push(pg);
    }

    pessoaAberta = chavePessoa(pg.person);
    closeSheets();
    render(); triggerSave();
    toast(era ? 'Pagamento atualizado'
              : 'Pagamento de R$ ' + num(amount) + ' registrado');
  }

  function delPagamento() {
    const pg = pagamentos.find(function (x) { return x.id === editPagId; });
    if (!pg) return;
    const backup = pagamentos.slice();
    pagamentos = pagamentos.filter(function (x) { return x.id !== editPagId; });
    closeSheets();
    render(); triggerSave();
    toast('Pagamento excluído', 'Desfazer', function () {
      pagamentos = backup; render(); triggerSave();
    });
  }

  function delFavor() {
    const f = favores.find(function (x) { return x.id === editFavorId; });
    if (!f) return;
    const backup = JSON.parse(JSON.stringify(favores));
    const backupPag = pagamentos.slice();
    favores = favores.filter(function (x) { return x.id !== editFavorId; });
    // pagamento amarrado só a este item perde o sentido; os de dia e de
    // total continuam e simplesmente se redistribuem no que sobrou
    pagamentos = pagamentos.filter(function (x) { return x.favor_id !== editFavorId; });
    closeSheets();
    render(); triggerSave();
    toast('Favor de “' + f.person + '” excluído', 'Desfazer', function () {
      favores = backup; pagamentos = backupPag; render(); triggerSave();
    });
  }

  /* ── formulário de conta ────────────────────────────── */
  function openConta(id) {
    editContaId = id || null;
    $('ct-ftitle').textContent = editContaId ? 'Editar conta' : 'Nova conta';
    $('ct-del').hidden = !editContaId;

    const c = editContaId ? contas.find(function (x) { return x.id === editContaId; }) : null;
    $('ct-kind').value      = c ? c.kind : 'fixa';
    $('ct-name').value      = c ? c.name : '';
    $('ct-amount').value    = c ? num(c.amount) : '';
    $('ct-frequency').value = c && c.frequency ? c.frequency : 'mensal';
    $('ct-due-day').value   = c && c.due_day ? c.due_day : '';
    $('ct-paid').checked    = c ? estaPaga(c) : false;
    $('ct-avg').value       = c && c.avg_amount ? num(c.avg_amount) : '';
    $('ct-notes').value     = c && c.notes ? c.notes : '';

    onContaKind();
    openSheet($('sheet-conta'));
    if (!editContaId) setTimeout(function () { $('ct-name').focus(); }, 320);
  }

  /** Cada tipo mostra só os campos que usa. */
  function onContaKind() {
    const k = $('ct-kind').value;
    $('ct-freq-field').hidden = k !== 'renda';
    $('ct-due-field').hidden  = k !== 'fixa';
    $('ct-avg-field').hidden  = k !== 'variavel';
    $('ct-amount-lbl').textContent =
      k === 'renda'      ? 'Quanto entra (R$)' :
      k === 'assinatura' ? 'Valor mensal (R$)' :
      k === 'variavel'   ? 'Valor deste mês (R$)' : 'Valor (R$)';
    onContaAmounts();
  }

  /** Mostra o equivalente mensal e a variação enquanto o usuário digita. */
  function onContaAmounts() {
    const k = $('ct-kind').value;
    const v = parseBRL($('ct-amount').value) || 0;
    const dica = $('ct-amount-hint');

    if (k === 'renda') {
      const f = $('ct-frequency').value;
      const mes = v * (Store.FREQ_MES[f] !== undefined ? Store.FREQ_MES[f] : 1);
      dica.textContent = f === 'mensal' ? '' :
        (f === 'pontual' ? 'Não entra no fluxo mensal.' : 'Equivale a R$ ' + num(mes) + ' por mês.');
      dica.hidden = !dica.textContent;
    } else if (k === 'assinatura') {
      dica.textContent = v > 0 ? 'R$ ' + num(v * 12) + ' por ano.' : '';
      dica.hidden = !v;
    } else {
      dica.hidden = true;
    }

    if (k === 'variavel') {
      const m = parseBRL($('ct-avg').value) || 0;
      const h = $('ct-avg-hint');
      if (m > 0 && v > 0) {
        const d = ((v - m) / m) * 100;
        h.textContent = Math.abs(d) < 0.5 ? 'Em linha com a média.'
          : (d > 0 ? 'Este mês está ' : 'Este mês está ') +
            Math.abs(d).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + '% ' +
            (d > 0 ? 'acima' : 'abaixo') + ' da média.';
        h.hidden = false;
      } else {
        h.textContent = 'Em branco, o valor deste mês vira a referência.';
        h.hidden = false;
      }
    }
  }

  function saveConta() {
    const name = $('ct-name').value.trim();
    if (!name) { $('ct-name').focus(); toast('Dê um nome para a conta'); return; }

    const kind = $('ct-kind').value;
    if (kind === 'fixa') {
      const d = parseInt($('ct-due-day').value, 10);
      if (!(d >= 1 && d <= 31)) { $('ct-due-day').focus(); toast('Informe o dia do vencimento (1 a 31)'); return; }
    }

    const atual = editContaId ? contas.find(function (x) { return x.id === editContaId; }) : null;
    const c = Store.normalizeAccount({
      id: editContaId || undefined,
      kind: kind,
      name: name,
      amount: parseBRL($('ct-amount').value) || 0,
      frequency: $('ct-frequency').value,
      due_day: $('ct-due-day').value,
      // marcar aqui vale para o mês corrente; desmarcar limpa a data
      paid_on: $('ct-paid').checked
        ? ((atual && atual.paid_on && estaPaga(atual)) ? atual.paid_on : Store.hoje())
        : null,
      avg_amount: $('ct-avg').value ? parseBRL($('ct-avg').value) : undefined,
      notes: $('ct-notes').value.trim() || null,
    });

    const era = !!editContaId;
    if (era) {
      const idx = contas.findIndex(function (x) { return x.id === editContaId; });
      if (idx >= 0) contas[idx] = c;
    } else {
      contas.push(c);
    }
    closeSheets();
    render(); triggerSave();
    toast(era ? 'Conta atualizada' : 'Conta cadastrada');
  }

  function delConta() {
    const c = contas.find(function (x) { return x.id === editContaId; });
    if (!c) return;
    const backup = JSON.parse(JSON.stringify(contas));
    contas = contas.filter(function (x) { return x.id !== editContaId; });
    closeSheets();
    render(); triggerSave();
    toast('“' + c.name + '” excluída', 'Desfazer', function () {
      contas = backup; render(); triggerSave();
    });
  }

  /* ── formulário de empréstimo ───────────────────────── */
  function openLoan(id) {
    editLoanId = id || null;
    $('lo-ftitle').textContent = editLoanId ? 'Editar empréstimo' : 'Novo empréstimo';
    $('lo-del').hidden = !editLoanId;
    $('lo-send').hidden = !editLoanId;

    const l = editLoanId ? loans.find(function (x) { return x.id === editLoanId; }) : null;
    $('lo-person').value     = l ? l.person : '';
    $('lo-principal').value  = l ? num(l.principal) : '';
    $('lo-f-total').value    = l ? num(l.total_due) : '';
    $('lo-f-received').value = l ? num(l.received) : '';
    $('lo-received-interest').value = l && l.received_interest ? num(l.received_interest) : '';
    $('lo-lent').value       = l ? l.lent_on : Store.hoje();
    $('lo-due').value        = l && l.due_on ? l.due_on : '';
    $('lo-method').value     = l ? l.method : 'avista';
    $('lo-installments').value = l && l.installments ? l.installments : '';
    $('lo-installment-amount').value = l && l.installment_amount ? num(l.installment_amount) : '';
    $('lo-notes').value      = l && l.notes ? l.notes : '';

    onLoanMethod();
    onLoanAmounts();
    openSheet($('sheet-loan'));
    if (!editLoanId) setTimeout(function () { $('lo-person').focus(); }, 320);
  }

  /** Mostra só o campo do método escolhido. */
  function onLoanMethod() {
    const m = $('lo-method').value;
    $('lo-parc-field').hidden   = m !== 'parcelado';
    $('lo-mensal-field').hidden = m !== 'mensal';
    $('lo-juros-rec-field').hidden = m !== 'mensal';
    // no mensal, "já recebido" passa a significar só o principal de volta
    $('lo-f-received-lbl').textContent = m === 'mensal'
      ? 'Principal devolvido (R$)' : 'Já recebido (R$)';

    // na mensalidade o total a receber é calculado, não digitado
    const derivado = m === 'mensal';
    const campo = $('lo-f-total');
    campo.readOnly = derivado;
    campo.classList.toggle('fi-derivado', derivado);
    $('lo-total-lbl').textContent = derivado ? 'A receber (calculado)' : 'A receber (R$)';

    onLoanAmounts();
  }

  /** Recalcula os juros e a dica de parcela enquanto o usuário digita. */
  function onLoanAmounts() {
    const principal = parseBRL($('lo-principal').value) || 0;
    const metodo    = $('lo-method').value;
    const mensal    = metodo === 'mensal';

    /* Na mensalidade o que se deve é o principal, e só ele. A mensalidade
       corre por fora, todo mês, sem prazo — não é parcela de nada. */
    if (mensal) $('lo-f-total').value = principal ? num(principal) : '';

    const total = parseBRL($('lo-f-total').value) || 0;
    const juros = total - principal;
    const mens  = parseBRL($('lo-installment-amount').value) || 0;
    const jurosRec = parseBRL($('lo-received-interest').value) || 0;

    const box = $('lo-juros');
    if (mensal) {
      box.className = 'lo-juros';
      const pctMes = principal > 0 ? (mens / principal) * 100 : 0;
      box.textContent = mens > 0
        ? 'Juro: R$ ' + num(mens) + ' por mês' +
          (principal > 0 ? '  (' + pctMes.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) +
                           '% ao mês)' : '')
        : 'A mensalidade é o juro — informe quanto ela paga por mês.';
    } else if (juros < 0) {
      box.className = 'lo-juros neg';
      box.textContent = 'O valor a receber está abaixo do emprestado — será ajustado ao salvar.';
    } else {
      box.className = 'lo-juros';
      const pct = principal > 0 ? (juros / principal) * 100 : 0;
      box.textContent = 'Juros: R$ ' + num(juros) +
        (principal > 0 ? '  (' + pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%)' : '');
    }

    if (metodo === 'parcelado') {
      const n = parseInt($('lo-installments').value, 10);
      $('lo-parc-hint').textContent = (n > 0 && total > 0)
        ? n + 'x de R$ ' + num(total / n) : '';
      $('lo-parc-hint').hidden = !(n > 0 && total > 0);
    } else if (mensal) {
      $('lo-mensal-hint').textContent =
        'Entra todo mês e não abate a dívida. Ela quita quando devolver os R$ ' +
        num(principal) + '.';
      $('lo-mensal-hint').hidden = false;

      const meses = mens > 0 ? Math.floor(jurosRec / mens) : 0;
      $('lo-juros-rec-hint').textContent = jurosRec > 0
        ? (meses ? meses + (meses === 1 ? ' mês' : ' meses') + ' de mensalidade · ' : '') +
          'total que já entrou: R$ ' + num(jurosRec + (parseBRL($('lo-f-received').value) || 0))
        : 'Some aqui cada mensalidade que receber.';
    }
  }

  function saveLoan() {
    const person = $('lo-person').value.trim();
    if (!person) { $('lo-person').focus(); toast('Diga quem está devendo'); return; }

    const principal = parseBRL($('lo-principal').value) || 0;
    if (principal <= 0) { $('lo-principal').focus(); toast('Informe quanto foi emprestado'); return; }

    const method = $('lo-method').value;
    if (method === 'parcelado' && !(parseInt($('lo-installments').value, 10) > 0)) {
      $('lo-installments').focus(); toast('Informe o número de parcelas'); return;
    }
    if (method === 'mensal' && !(parseBRL($('lo-installment-amount').value) > 0)) {
      $('lo-installment-amount').focus();
      toast('Informe a mensalidade — ela é o juro do empréstimo'); return;
    }

    const l = Store.normalizeLoan({
      id: editLoanId || undefined,
      person: person,
      principal: principal,
      // no mensal o Store recalcula; aqui vai o que está na tela
      total_due: parseBRL($('lo-f-total').value) || principal,
      received: parseBRL($('lo-f-received').value) || 0,
      received_interest: parseBRL($('lo-received-interest').value) || 0,
      lent_on: $('lo-lent').value,
      due_on: $('lo-due').value,
      method: method,
      installments: $('lo-installments').value,
      installment_amount: parseBRL($('lo-installment-amount').value),
      notes: $('lo-notes').value.trim() || null,
    });

    const era = !!editLoanId;
    if (era) {
      const idx = loans.findIndex(function (x) { return x.id === editLoanId; });
      if (idx >= 0) loans[idx] = l;
    } else {
      loans.push(l);
    }
    closeSheets();
    render(); triggerSave();
    toast(era ? 'Empréstimo atualizado' : 'Empréstimo registrado');
  }

  function delLoan() {
    const l = loans.find(function (x) { return x.id === editLoanId; });
    if (!l) return;
    const backup = JSON.parse(JSON.stringify(loans));
    loans = loans.filter(function (x) { return x.id !== editLoanId; });
    closeSheets();
    render(); triggerSave();
    toast('“' + l.person + '” excluído', 'Desfazer', function () {
      loans = backup; render(); triggerSave();
    });
  }

  /* ── sheets ─────────────────────────────────────────── */
  let openSheetEl = null;
  /* Quantas entradas de histórico as sheets empilharam. Contar aqui — em vez
     de ler history.state — evita dois close() seguidos poparem duas entradas
     e tirarem o usuário do app (pushState é síncrono, back() não é). */
  let sheetHist = 0;

  function openSheet(node) {
    openSheetEl = node;
    node.classList.add('open');
    el.backdrop.classList.add('open');
    if (!isDesktop) {
      try { history.pushState({ sheet: true }, ''); sheetHist++; } catch (err) {}
    }
  }
  function closeSheets(silent) {
    const was = openSheetEl;
    el.sheetForm.classList.remove('open');
    el.sheetSettings.classList.remove('open');
    $('sheet-loan').classList.remove('open');
    $('sheet-conta').classList.remove('open');
    $('sheet-favor').classList.remove('open');
    $('sheet-pagamento').classList.remove('open');
    el.backdrop.classList.remove('open');
    openSheetEl = null;
    editId = null;
    editLoanId = null;
    editContaId = null;
    editFavorId = null;
    if (was && !silent && !isDesktop && sheetHist > 0) {
      sheetHist--;
      try { history.back(); } catch (err) {}
    }
  }

  async function doReset() {
    const fb = $('reset-fb');
    if (el.resetArmed) {
      $('btn-reset').textContent = 'Apagando…';
      try {
        await Store.wipe();
      } catch (e) {
        fb.className = 'fb err';
        fb.textContent = 'Não deu para apagar na nuvem. Verifique a conexão.';
        $('btn-reset').textContent = 'Apagar dados salvos';
        el.resetArmed = false;
        return;
      }
      adoptState(estadoInicial());
      applySI(); render();
      fb.className = 'fb ok';
      fb.textContent = 'Tudo apagado. Comece a lançar quando quiser.';
      $('btn-reset').textContent = 'Apagar dados salvos';
      el.resetArmed = false;
      return;
    }
    el.resetArmed = true;
    $('btn-reset').textContent = 'Confirmar — apagar tudo';
    fb.className = 'fb err';
    fb.textContent = Store.mode === 'cloud'
      ? 'Isto apaga também na nuvem, em todos os aparelhos. Toque de novo para confirmar.'
      : 'Toque de novo para confirmar.';
    setTimeout(function () {
      if (!el.resetArmed) return;
      el.resetArmed = false;
      $('btn-reset').textContent = 'Apagar dados salvos';
      fb.textContent = '';
    }, 5000);
  }

  function applySI() {
    const v = num(saldoInicial);
    if (el.si)  el.si.value  = v;
    if (el.mSi) el.mSi.value = v;
  }

  /* ── toast ──────────────────────────────────────────── */
  let toastTimer = null;
  /* ── cobrança em texto ──────────────────────────────
     O que vai para a área de transferência é a mesma conta que a tela
     mostra: tudo sai de loanInfo()/alocacao, nunca dos campos crus. Em
     mensalidade, principal e juro são coisas separadas — somar os dois
     numa linha só é o erro que fez "2.700 de 2.800" com a dívida
     inteira ainda de pé. Os asteriscos são o negrito do WhatsApp. */

  function textoDoFavor(f) {
    const pago  = alocacao.pago[f.id] || 0;
    const falta = Math.max(0, f.amount - pago);
    const li = ['*' + f.person + '* — ' + f.reason,
                'Valor: R$ ' + num(f.amount),
                'Do dia ' + dataLonga(f.lent_on)];
    if (pago > 0.005) li.push('Já pago: R$ ' + num(pago));
    li.push(falta < 0.005 ? '*Quitado — nada a receber.*'
                          : '*Falta: R$ ' + num(falta) + '*');
    if (f.notes) li.push('', f.notes);
    return li.join('\n');
  }

  function textoDoEmprestimo(l) {
    const i = loanInfo(l);
    const li = ['*' + l.person + '* — empréstimo ' +
                  (i.mensal ? 'por mensalidade' : METHOD_LABEL[l.method]),
                'Emprestado: R$ ' + num(l.principal) + ' em ' + dataLonga(l.lent_on)];

    if (i.mensal) {
      li.push('Mensalidade: R$ ' + num(l.installment_amount || 0) + '/mês' +
              (i.jurosPct > 0 ? ' (' + pctTexto(i.jurosPct) + ' ao mês)' : ''));
      if (i.jurosRec > 0) {
        li.push('Mensalidades já recebidas: R$ ' + num(i.jurosRec) +
                (i.meses ? ' (' + i.meses + (i.meses === 1 ? ' mês' : ' meses') + ')' : ''));
      }
      if (l.received > 0) li.push('Principal devolvido: R$ ' + num(l.received));
      li.push(i.quitado ? '*Principal devolvido por inteiro.*'
                        : '*Falta voltar: R$ ' + num(i.emAberto) + '*');
    } else {
      li.push('A receber: R$ ' + num(l.total_due) +
              (l.method === 'parcelado' && l.installments
                ? ' em ' + l.installments + 'x de R$ ' + num(l.total_due / l.installments)
                : '') +
              (i.juros > 0 ? ' (R$ ' + num(i.juros) + ' de juros · ' + pctTexto(i.jurosPct) + ')' : ''));
      if (l.due_on) li.push('Vence em ' + dataLonga(l.due_on));
      if (l.received > 0) li.push('Já recebido: R$ ' + num(l.received));
      li.push(i.quitado ? '*Quitado — nada a receber.*'
                        : '*Em aberto: R$ ' + num(i.emAberto) + '*');
    }

    if (i.atrasado) li.push('_Atrasado desde ' + dataLonga(l.due_on) + '._');
    if (l.notes) li.push('', l.notes);
    return li.join('\n');
  }

  function pctTexto(p) {
    return p.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
  }

  /** A cópia depende de permissão do navegador: avisa quando não vai. */
  function copiarCobranca(texto) {
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      toast('Este navegador não deixa copiar daqui'); return;
    }
    navigator.clipboard.writeText(texto).then(function () {
      toast('Cobrança copiada — é só colar no WhatsApp');
    }, function () {
      toast('Não consegui copiar — o navegador bloqueou');
    });
  }

  function toast(msg, actionLabel, actionFn) {
    const t = el.toast;
    t.innerHTML = '';
    t.appendChild(document.createTextNode(msg));
    if (actionLabel && actionFn) {
      const b = document.createElement('button');
      b.textContent = actionLabel;
      b.style.cssText = 'margin-left:12px;color:var(--lime);font-weight:600;font-size:12.5px';
      b.addEventListener('click', function () {
        actionFn(); hideToast();
      });
      t.appendChild(b);
    }
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, actionLabel ? 5000 : 2400);
  }
  function hideToast() { el.toast.classList.remove('on'); }

  /* ── ícones ─────────────────────────────────────────── */
  function svgEye() { return ico('eye'); }
  function svgEyeOff() { return ico('eye-closed'); }
  function svgEdit() { return ico('edit-pencil'); }
  function svgTrash() { return ico('trash'); }

  /* ══════════════════════════════════════════════════════
     CONTRASTE DO TOPO
     Os botões flutuam sobre conteúdo que rola — ora claro,
     ora o cartão verde-escuro. Aqui medimos o que está
     atrás de cada um e invertemos a cor quando precisa.
     ══════════════════════════════════════════════════════ */

  /** Extrai a primeira cor de um valor CSS — cor sólida ou gradiente. */
  function primeiraCor(txt) {
    const m = txt && txt.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map(Number);
    return (p.length > 3 && p[3] < 0.5) ? null : p;   // quase transparente não conta
  }

  /**
   * Cor efetiva atrás do elemento.
   *
   * A busca para no #app: dali para trás só existe o <body>, que é
   * verde-escuro apenas como moldura fora da área do app — usá-lo
   * daria o veredito errado. O #app em si pinta um gradiente claro,
   * que está em background-image, não em background-color.
   */
  function corAtras(el) {
    if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect();
    if (!r.width) return null;
    const barra = el.closest('.appbar');
    let pilha = [];
    try {
      pilha = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2) || [];
    } catch (e) { return null; }

    for (let i = 0; i < pilha.length; i++) {
      const n = pilha[i];
      if (barra && barra.contains(n)) continue;            // o próprio botão
      const cs = getComputedStyle(n);

      const solida = primeiraCor(cs.backgroundColor);
      if (solida) return solida;

      const grad = primeiraCor(cs.backgroundImage);
      if (grad) return grad;

      if (n.id === 'app' || n === document.body) break;    // não vai além do app
    }
    return null;
  }

  /** Luminância relativa (WCAG) — abaixo de 0.5 é fundo escuro. */
  function ehEscuro(rgb) {
    if (!rgb) return false;    // o gradiente da página é claro
    const f = rgb.slice(0, 3).map(function (v) {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return (0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]) < 0.5;
  }

  /* Execução direta com limite de frequência. requestAnimationFrame
     seria o natural, mas ele para quando a janela perde o foco — e aí
     os botões ficariam com a cor errada ao voltar. */
  let contrasteUltimo = 0;
  function ajustarContrasteTopo(agora) {
    const t = Date.now();
    if (!agora && t - contrasteUltimo < 60) return;   // no máximo ~16x por segundo
    contrasteUltimo = t;
    ['btn-back', 'm-avatar'].forEach(function (id) {
      const n = $(id);
      if (!n || n.hidden) return;
      n.classList.toggle('claro', ehEscuro(corAtras(n)));
    });
  }

  /* ══════════════════════════════════════════════════════
     HUB — reordenar segurando e arrastando
     ══════════════════════════════════════════════════════ */
  /**
   * Segurar e arrastar para reordenar.
   *
   * No toque, o navegador decide se o gesto é rolagem assim que o dedo se
   * move — e aí cancela o pointer. Por isso: capturamos o ponteiro e, enquanto
   * arrastamos, cortamos o touchmove num listener NÃO passivo. Só assim o
   * gesto fica nosso.
   */
  function ligarArrasto() {
    const caixa = $('hub-cards');
    let alvo = null, timer = null, y0 = 0, dy = 0;
    let passo = 0, indice = 0, destino = 0;
    let arrastando = false, ponteiro = null;

    const cartoes = () => Array.prototype.slice.call(caixa.children);

    function comecar() {
      if (!alvo) return;
      arrastando = true;
      indice = cartoes().indexOf(alvo);
      destino = indice;
      passo = alvo.getBoundingClientRect().height + 14;
      alvo.classList.add('arrastando');
      cartoes().forEach(function (n) { if (n !== alvo) n.classList.add('deslocando'); });
      caixa.classList.add('reordenando');
      if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }
    }

    /** Desloca os vizinhos para abrir espaço onde o cartão vai cair. */
    function mover() {
      const salto = Math.round(dy / passo);
      destino = Math.max(0, Math.min(cartoes().length - 1, indice + salto));
      alvo.style.transform = 'translateY(' + dy + 'px)';
      cartoes().forEach(function (n, i) {
        if (n === alvo) return;
        let d = 0;
        if (indice < destino && i > indice && i <= destino) d = -passo;
        if (indice > destino && i < indice && i >= destino) d = passo;
        n.style.transform = d ? 'translateY(' + d + 'px)' : '';
      });
    }

    function encerrar() {
      const moveu = arrastando && destino !== indice && alvo;
      if (moveu) {
        const irmaos = cartoes();
        const ref = irmaos[destino];
        if (ref) {
          if (destino > indice) caixa.insertBefore(alvo, ref.nextSibling);
          else caixa.insertBefore(alvo, ref);
          gravarOrdem();
          toast('Ordem salva');
        }
      }
      cartoes().forEach(function (n) {
        n.style.transform = '';
        n.classList.remove('arrastando', 'deslocando');
      });
      caixa.classList.remove('reordenando');
      if (alvo && ponteiro !== null && alvo.releasePointerCapture) {
        try { alvo.releasePointerCapture(ponteiro); } catch (e) {}
      }
      clearTimeout(timer);
      // o clique que vem logo depois de arrastar não deve abrir o módulo
      if (moveu) caixa.dataset.acabouDeArrastar = '1';
      alvo = null; ponteiro = null; dy = 0;
      arrastando = false;
    }

    caixa.addEventListener('pointerdown', function (ev) {
      if (ev.button !== undefined && ev.button !== 0) return;
      const c = ev.target.closest('.hub-card');
      if (!c) return;
      alvo = c; ponteiro = ev.pointerId; y0 = ev.clientY; dy = 0;
      // manter o ponteiro conosco mesmo se o dedo sair de cima do cartão
      if (c.setPointerCapture) { try { c.setPointerCapture(ev.pointerId); } catch (e) {} }
      clearTimeout(timer);
      timer = setTimeout(comecar, 450);
    });

    caixa.addEventListener('pointermove', function (ev) {
      if (!alvo || ev.pointerId !== ponteiro) return;
      dy = ev.clientY - y0;
      if (!arrastando) {
        // moveu antes de segurar: era rolagem, desiste
        if (Math.abs(dy) > 10) { clearTimeout(timer); alvo = null; ponteiro = null; }
        return;
      }
      mover();
    });

    /* Sem isto o navegador rola a página e mata o gesto no toque. */
    caixa.addEventListener('touchmove', function (ev) {
      if (arrastando) ev.preventDefault();
    }, { passive: false });

    /* Segurar abre o menu de contexto em alguns navegadores. */
    caixa.addEventListener('contextmenu', function (ev) {
      if (arrastando || alvo) ev.preventDefault();
    });

    ['pointerup', 'pointercancel'].forEach(function (e) {
      caixa.addEventListener(e, function (ev) {
        if (!alvo || (ev.pointerId !== undefined && ev.pointerId !== ponteiro)) return;
        if (!arrastando) { clearTimeout(timer); alvo = null; ponteiro = null; return; }
        encerrar();
      });
    });

    /* toque curto abre o módulo; logo após um arrasto, não */
    caixa.addEventListener('click', function (ev) {
      if (caixa.dataset.acabouDeArrastar) {
        delete caixa.dataset.acabouDeArrastar;
        ev.preventDefault(); ev.stopPropagation();
        return;
      }
      const c = ev.target.closest('[data-go]');
      if (c && !arrastando) setScreen(c.dataset.go);
    }, true);
  }

  /* ══════════════════════════════════════════════════════
     BOOT
     ══════════════════════════════════════════════════════ */
  function cacheEls() {
    el.cHero     = $('c-hero');
    el.cKpis     = $('c-kpis');
    el.cList     = $('c-list');
    el.cLegend   = $('c-legend');
    el.cSettings = $('c-settings');

    el.sheetForm     = $('sheet-form');
    el.sheetSettings = $('sheet-settings');
    el.backdrop      = $('backdrop');
    el.toast         = $('toast');
    el.navbar        = $('navbar');
    el.elist         = $('elist');
    el.elistCount    = $('elist-count');
    el.esearch       = $('esearch');
    el.si            = $('si');
    el.mSi           = $('m-si');
    el.saveSt        = $('save-st');
    el.saveStD       = $('save-st-d');
    el.saveStL       = $('save-st-l');
    el.saveStC       = $('save-st-c');
    el.saveStF       = $('save-st-f');
    el.sbFinal       = $('sb-final');
    el.sbFinalLabel  = $('sb-final-label');
    el.sbGrowth      = $('sb-growth');
    el.scenarioTab   = $('scenario-tab');
    el.tinner        = $('tinner');
  }

  function bindEvents() {
    // antes de tudo: quem lê o valor depois já pega ele formatado
    CAMPOS_DINHEIRO.forEach(function (id) { mascaraDinheiro($(id)); });

    /* cenário */
    ['bp','bo','bp-m','bo-m'].forEach(function (id) {
      const b = $(id);
      if (b) b.addEventListener('click', function () { setV(b.dataset.view); });
    });

    /* navegação por abas */
    el.navbar.addEventListener('click', function (ev) {
      const b = ev.target.closest('.navitem');
      if (!b) return;
      // 'main' volta ao módulo; qualquer outro é o nome da aba
      setScreen(b.dataset.tab === 'main' ? screen : b.dataset.tab);
    });

    /* hub: o link de ajustes (os cartões têm o próprio handler, com arrasto) */
    $('hub-dica').parentElement.addEventListener('click', function (ev) {
      const b = ev.target.closest('.hub-link[data-go]');
      if (b) setScreen(b.dataset.go);
    });
    aplicarOrdem();
    ligarArrasto();

    $('btn-back').addEventListener('click', voltar);

    /* saldo inicial */
    [el.si, el.mSi].forEach(function (inp) {
      if (!inp) return;
      inp.addEventListener('input', function () {
        saldoInicial = parseBRL(inp.value) || 0;
        // não reescreve o campo em edição: formatar no meio da digitação
        // moveria o cursor
        const outro = inp === el.si ? el.mSi : el.si;
        if (outro) outro.value = num(saldoInicial);
        render(); triggerSave();
      });
      inp.addEventListener('blur', applySI);
      inp.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') inp.blur();
      });
    });

    /* busca */
    el.esearch.addEventListener('input', renderList);

    /* lista: ocultar / editar / excluir */
    el.elist.addEventListener('click', function (ev) {
      const b = ev.target.closest('[data-act]');
      if (!b) return;
      const id = b.dataset.id;
      const spec = TABELAS[screen] || TABELAS.eco;
      if (b.dataset.act === 'edit') { spec.abrir(id); return; }
      if (b.dataset.act === 'tog')  { tog(id); return; }
      if (b.dataset.act === 'del') {
        if (screen === 'loans')        { editLoanId = id; delLoan(); }
        else if (screen === 'contas')  { editContaId = id; delConta(); }
        else if (screen === 'favores') { editFavorId = id; delFavor(); }
        else                          { del(id); }
      }
    });

    /* seletor de mês */
    function pickMonth(i, scroll) {
      selMonth = i;
      renderMonthStrip();
      renderMonthEntries(lastRows);
      renderCurve(lastRows);
      renderMonthTable(lastRows);
      if (scroll) scrollMonthIntoView();
    }

    $('m-months').addEventListener('click', function (ev) {
      const b = ev.target.closest('.m-chip');
      if (b) pickMonth(parseInt(b.dataset.mi, 10), true);
    });

    $('m-table').addEventListener('click', function (ev) {
      const b = ev.target.closest('.m-trow');
      if (!b) return;
      pickMonth(parseInt(b.dataset.mi, 10), true);
      $('m-sel-lbl').scrollIntoView({ block: 'start', behavior: 'smooth' });
    });

    /* gráfico: toque num mês abre a projeção daquele mês */
    $('m-curve-body').addEventListener('click', function (ev) {
      const cells = Array.prototype.slice.call(this.querySelectorAll('.m-curve-cell'));
      if (!cells.length) return;
      const x = ev.clientX - this.getBoundingClientRect().left;
      const i = Math.max(0, Math.min(cells.length - 1,
        Math.floor(x / (this.clientWidth / cells.length))));
      pickMonth(i, true);
    });

    /* deslizar para trocar de mês */
    let tx = 0, ty = 0, tracking = false;
    const vp = $('view-sim');
    vp.addEventListener('touchstart', function (ev) {
      if (ev.touches.length !== 1) { tracking = false; return; }
      tx = ev.touches[0].clientX; ty = ev.touches[0].clientY; tracking = true;
    }, { passive: true });
    vp.addEventListener('touchend', function (ev) {
      if (!tracking) return;
      tracking = false;
      const t = ev.changedTouches[0];
      const dx = t.clientX - tx, dy = t.clientY - ty;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
      const next = selMonth + (dx < 0 ? 1 : -1);
      if (next < 0 || next > w12.length - 1) return;
      pickMonth(next, true);
    }, { passive: true });

    /* ações do cartão escuro */
    ['btn-add', 'm-btn-add'].forEach(function (id) {
      const b = $(id);
      if (b) b.addEventListener('click', function () { openForm(null); });
    });
    // o botão central depende do módulo aberto
    $('fab-add').addEventListener('click', function () {
      if (screen === 'loans') openLoan(null);
      else if (screen === 'contas') openConta(null);
      else if (screen === 'favores') openFavor(null);
      else openForm(null);
    });
    ['btn-settings', 'm-btn-edit'].forEach(function (id) {
      const b = $(id);
      if (!b) return;
      b.addEventListener('click', function () {
        if (isDesktop) openSheet(el.sheetSettings);
        else setScreen('tabelas');
      });
    });

    /* formulário */
    $('ft').addEventListener('change', onTypeChange);
    $('rFrom').addEventListener('change', applyRange);
    $('rTo').addEventListener('change', applyRange);
    $('range-clr').addEventListener('click', clearRange);
    $('mgrid').addEventListener('click', function (ev) {
      const b = ev.target.closest('.mp');
      if (!b) return;
      const m = parseInt(b.dataset.m, 10);
      const i = selM.indexOf(m);
      if (i >= 0) selM.splice(i, 1); else selM.push(m);
      renderMG();
    });
    $('form-save').addEventListener('click', saveEntry);
    $('form-cancel').addEventListener('click', function () { closeSheets(); });
    $('form-back').addEventListener('click', function () { closeSheets(); });
    $('settings-back').addEventListener('click', function () { closeSheets(); });
    el.backdrop.addEventListener('click', function () { closeSheets(); });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && openSheetEl) closeSheets();
    });
    window.addEventListener('popstate', function () {
      if (sheetHist > 0) sheetHist--;
      if (openSheetEl) closeSheets(true);
    });

    /* favores */
    $('fv-lista').addEventListener('click', function (ev) {
      const pagar = ev.target.closest('[data-pay]');
      if (pagar) { openPagamento(pagar.dataset.pay, pagar.dataset.alvo); return; }
      const pag = ev.target.closest('[data-pgid]');
      if (pag) { openPagamento(null, null, pag.dataset.pgid); return; }
      const item = ev.target.closest('[data-fid]');
      if (item) { openFavor(item.dataset.fid); return; }
      const cab = ev.target.closest('[data-abrir]');
      if (cab) {
        const chave = cab.dataset.abrir;
        pessoaAberta = (pessoaAberta === chave) ? null : chave;
        renderFavores();
      }
    });
    $('fv-amount').addEventListener('input', onFavorAmounts);
    $('fv-meses').addEventListener('input', onFavorAmounts);
    $('pg-amount').addEventListener('input', onPagamentoAmount);
    $('pg-save').addEventListener('click', savePagamento);
    $('pg-del').addEventListener('click', delPagamento);
    $('pg-cancel').addEventListener('click', function () { closeSheets(); });
    $('pg-back').addEventListener('click', function () { closeSheets(); });
    $('fv-save').addEventListener('click', saveFavor);
    $('fv-send').addEventListener('click', function () {
      const f = favores.find(function (x) { return x.id === editFavorId; });
      if (f) copiarCobranca(textoDoFavor(f));
    });
    $('fv-del').addEventListener('click', delFavor);
    $('fv-cancel').addEventListener('click', function () { closeSheets(); });
    $('fv-back').addEventListener('click', function () { closeSheets(); });

    /* contas */
    ['ct-rendas', 'ct-fixas', 'ct-variaveis', 'ct-subs'].forEach(function (id) {
      $(id).addEventListener('click', function (ev) {
        const p = ev.target.closest('[data-pago]');
        if (p) { ev.preventDefault(); ev.stopPropagation(); alternarPago(p.dataset.pago); return; }
        const b = ev.target.closest('[data-cid]');
        if (b) openConta(b.dataset.cid);
      });
    });
    $('ct-kind').addEventListener('change', onContaKind);
    $('ct-frequency').addEventListener('change', onContaAmounts);
    ['ct-amount', 'ct-avg'].forEach(function (id) {
      $(id).addEventListener('input', onContaAmounts);
    });
    $('ct-save').addEventListener('click', saveConta);
    $('ct-del').addEventListener('click', delConta);
    $('ct-cancel').addEventListener('click', function () { closeSheets(); });
    $('ct-back').addEventListener('click', function () { closeSheets(); });

    /* empréstimos */
    $('lo-pessoas').addEventListener('click', function (ev) {
      const b = ev.target.closest('.lo-pcard');
      if (!b) return;
      loanPerson = b.dataset.p || null;
      renderLoans();
    });
    $('lo-filters').addEventListener('click', function (ev) {
      const b = ev.target.closest('.lo-chip');
      if (!b) return;
      loanFilter = b.dataset.f;
      renderLoans();
    });
    $('lo-list').addEventListener('click', function (ev) {
      const b = ev.target.closest('.lo-card');
      if (b) openLoan(b.dataset.id);
    });
    $('lo-method').addEventListener('change', onLoanMethod);
    ['lo-principal', 'lo-f-total', 'lo-installments', 'lo-installment-amount',
     'lo-f-received', 'lo-received-interest'].forEach(function (id) {
      $(id).addEventListener('input', onLoanAmounts);
    });
    $('lo-save').addEventListener('click', saveLoan);
    $('lo-send').addEventListener('click', function () {
      const l = loans.find(function (x) { return x.id === editLoanId; });
      if (l) copiarCobranca(textoDoEmprestimo(l));
    });
    $('lo-del').addEventListener('click', delLoan);
    $('lo-cancel').addEventListener('click', function () { closeSheets(); });
    $('lo-back').addEventListener('click', function () { closeSheets(); });

    /* ajustes */
    $('btn-reset').addEventListener('click', doReset);

    /* o cabeçalho encolhe assim que a rolagem sai do topo */
    const appbar = document.querySelector('.appbar');
    Array.prototype.forEach.call(document.querySelectorAll('.view-scroll'), function (sc) {
      sc.addEventListener('scroll', function () {
        if (!appbar) return;
        appbar.classList.toggle('flutuando', sc.scrollTop > 8);
        ajustarContrasteTopo();
      }, { passive: true });
    });

    /* layout responsivo */
    if (mqDesktop.addEventListener) mqDesktop.addEventListener('change', onBreakpoint);
    else mqDesktop.addListener(onBreakpoint);


  }

  function onBreakpoint() {
    applyLayout();
    render();
  }

  /* instalação (Android / Chrome) */
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (ev) {
    ev.preventDefault();
    deferredPrompt = ev;
    const card = $('install-card');
    if (card) card.hidden = false;
  });
  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    const card = $('install-card');
    if (card) card.hidden = true;
  });

  /* ══════════════════════════════════════════════════════
     TELA DE ENTRADA
     ══════════════════════════════════════════════════════ */
  let authMode = 'signin';   // signin · signup · reset · recovery

  const AUTH_COPY = {
    signin: {
      eyebrow: 'Olá de novo,', title: 'Bem-vindo!', sub: 'Entre para ver suas projeções',
      submit: 'Entrar', secondary: 'Criar conta', secondaryTo: 'signup',
      pass: 'Senha', ac: 'current-password',
      email: true, options: true, hint: false,
      footText: 'Não tem conta? ', footLink: 'Criar agora', footTo: 'signup',
    },
    signup: {
      eyebrow: 'Vamos começar,', title: 'Criar conta', sub: 'Suas projeções em todos os aparelhos',
      submit: 'Criar conta', secondary: 'Voltar', secondaryTo: 'signin',
      pass: 'Senha', ac: 'new-password',
      email: true, options: false, hint: true,
      footText: 'Já tem conta? ', footLink: 'Entrar', footTo: 'signin',
    },
    reset: {
      eyebrow: 'Sem problema,', title: 'Recuperar', sub: 'Enviamos um link para o seu e-mail',
      submit: 'Enviar link', secondary: 'Voltar', secondaryTo: 'signin',
      pass: null, ac: null,
      email: true, options: false, hint: false,
      footText: 'Lembrou a senha? ', footLink: 'Entrar', footTo: 'signin',
    },
    recovery: {
      eyebrow: 'Quase lá,', title: 'Nova senha', sub: 'Escolha uma senha para a sua conta',
      submit: 'Salvar senha', secondary: null, secondaryTo: null,
      pass: 'Nova senha', ac: 'new-password',
      email: false, options: false, hint: true,
      footText: '', footLink: '', footTo: null,
    },
  };

  function setAuthMode(mode) {
    authMode = mode;
    const c = AUTH_COPY[mode];

    $('auth-eyebrow').textContent = c.eyebrow;
    $('auth-title').textContent   = c.title;
    $('auth-sub').textContent     = c.sub;

    $('auth-email-field').hidden = !c.email;
    $('auth-pass-field').hidden  = !c.pass;
    if (c.pass) {
      $('auth-pass-label').textContent = c.pass;
      $('auth-pass').setAttribute('autocomplete', c.ac);
    }
    $('auth-pass-hint').hidden = !c.hint;
    $('auth-options').hidden   = !c.options;

    $('auth-submit').textContent = c.submit;
    const sec = $('auth-secondary');
    sec.hidden = !c.secondary;
    if (c.secondary) sec.textContent = c.secondary;
    $('auth-actions').classList.toggle('solo', !c.secondary);

    const foot = $('auth-foot');
    if (c.footTo) {
      foot.hidden = false;
      foot.firstChild.nodeValue = c.footText;
      $('auth-foot-btn').textContent = c.footLink;
    } else {
      foot.hidden = true;
    }

    authMsg('');
  }

  function authMsg(txt, kind) {
    const m = $('auth-msg');
    m.textContent = txt || '';
    m.className = 'auth-msg' + (kind ? ' ' + kind : '');
  }

  function authBusy(on) {
    $('auth-submit').disabled = on;
    if (on) authMsg('');
  }

  /** Traduz os erros do Supabase para algo acionável. */
  function authError(err) {
    const raw = ((err && (err.message || err.error_description)) || '').toLowerCase();
    if (raw.includes('invalid login credentials'))   return 'E-mail ou senha incorretos.';
    if (raw.includes('email not confirmed'))         return 'Confirme seu e-mail antes de entrar — veja a caixa de entrada.';
    if (raw.includes('user already registered'))     return 'Já existe uma conta com este e-mail. Tente entrar.';
    if (raw.includes('password should be at least')) return 'A senha precisa de pelo menos 6 caracteres.';
    if (raw.includes('unable to validate email'))    return 'E-mail inválido.';
    if (raw.includes('should be different'))         return 'A nova senha precisa ser diferente da atual.';
    if (raw.includes('reauthentication'))            return 'Por segurança, saia e entre de novo antes de trocar a senha.';
    if (raw.includes('session') && raw.includes('missing')) return 'Sua sessão expirou. Entre de novo.';
    if (raw.includes('rate limit') || raw.includes('too many')) return 'Muitas tentativas seguidas. Espere um minuto.';
    if (raw.includes('failed to fetch') || raw.includes('network')) return 'Sem conexão com o servidor.';
    if (raw.includes('schema cache') || raw.includes('does not exist')) {
      return 'As tabelas ainda não existem no Supabase. Rode supabase/schema.sql no SQL Editor.';
    }
    return (err && err.message) ? err.message : 'Não deu certo. Tente de novo.';
  }

  async function onAuthSubmit(ev) {
    ev.preventDefault();
    const email = $('auth-email').value.trim();
    const pass  = $('auth-pass').value;

    if (authMode !== 'recovery' && !email) { authMsg('Informe seu e-mail.', 'err'); return; }
    if ((authMode === 'signup' || authMode === 'recovery') && pass.length < 6) {
      authMsg('A senha precisa de pelo menos 6 caracteres.', 'err'); return;
    }

    authBusy(true);
    try {
      if (authMode === 'signin') {
        await Store.signIn(email, pass);
        // onAuthChange assume daqui
      } else if (authMode === 'signup') {
        const r = await Store.signUp(email, pass);
        if (r.needsConfirmation) {
          setAuthMode('signin');
          authMsg('Conta criada. Confirme pelo link enviado para ' + email + ' e depois entre.', 'ok');
        }
      } else if (authMode === 'reset') {
        await Store.sendReset(email);
        setAuthMode('signin');
        authMsg('Se houver conta para ' + email + ', o link de redefinição chegou por e-mail.', 'ok');
      } else if (authMode === 'recovery') {
        await Store.updatePassword(pass);
        history.replaceState(null, '', location.pathname);
        const sess = await Store.currentSession();
        if (sess && sess.user) await enterApp(sess.user);
      }
    } catch (err) {
      authMsg(authError(err), 'err');
    } finally {
      authBusy(false);
      if (authMode === 'signin') $('auth-pass').value = '';
    }
  }

  function showAuth(mode) {
    document.body.classList.remove('booting');
    $('auth').hidden = false;
    setAuthMode(mode || 'signin');
  }

  function hideAuth() {
    $('auth').hidden = true;
    $('auth-pass').value = '';
    document.body.classList.remove('booting');
  }

  function setRemember(on) {
    $('auth-remember').setAttribute('aria-pressed', String(on));
    Store.setRemember(on);
  }

  function bindAuth() {
    $('auth-form').addEventListener('submit', onAuthSubmit);

    $('auth-secondary').addEventListener('click', function () {
      setAuthMode(AUTH_COPY[authMode].secondaryTo);
    });
    $('auth-foot-btn').addEventListener('click', function () {
      setAuthMode(AUTH_COPY[authMode].footTo);
    });
    $('auth-to-reset').addEventListener('click', function () { setAuthMode('reset'); });

    $('auth-eye').addEventListener('click', function () {
      const i = $('auth-pass');
      const show = i.type === 'password';
      i.type = show ? 'text' : 'password';
      $('auth-eye').innerHTML = ico(show ? 'eye-closed' : 'eye');
      $('auth-eye').setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
    });

    $('auth-remember').addEventListener('click', function () {
      setRemember($('auth-remember').getAttribute('aria-pressed') !== 'true');
    });
    setRemember(Store.remember);

    $('btn-signout').addEventListener('click', onSignOut);
    $('btn-password').addEventListener('click', onChangePassword);
    $('pw-confirm').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') onChangePassword();
    });
    $('pw-eye').addEventListener('click', function () {
      const campos = [$('pw-new'), $('pw-confirm')];
      const mostrar = campos[0].type === 'password';
      campos.forEach(function (i) { i.type = mostrar ? 'text' : 'password'; });
      $('pw-eye').innerHTML = ico(mostrar ? 'eye-closed' : 'eye');
      $('pw-eye').setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
    });
  }

  async function onChangePassword() {
    const fb = $('password-fb');
    const nova = $('pw-new').value;
    const conf = $('pw-confirm').value;

    const erro = (m) => { fb.className = 'fb err'; fb.textContent = m; };

    if (nova.length < 6) { erro('A senha precisa de pelo menos 6 caracteres.'); $('pw-new').focus(); return; }
    if (nova !== conf)   { erro('As duas senhas não coincidem.'); $('pw-confirm').focus(); return; }

    const btn = $('btn-password');
    btn.disabled = true;
    fb.className = 'fb';
    fb.textContent = 'Atualizando…';
    try {
      await Store.updatePassword(nova);
      $('pw-new').value = '';
      $('pw-confirm').value = '';
      fb.className = 'fb ok';
      fb.textContent = 'Senha atualizada.';
      toast('Senha atualizada');
      setTimeout(function () { if (fb.textContent === 'Senha atualizada.') fb.textContent = ''; }, 4000);
    } catch (err) {
      erro(authError(err));
    } finally {
      btn.disabled = false;
    }
  }

  async function onSignOut() {
    Store.stopRealtime();
    await Store.signOut();
    location.reload();
  }

  /* ══════════════════════════════════════════════════════
     BOOT
     ══════════════════════════════════════════════════════ */

  /** Entra no app com um usuário autenticado. */
  async function enterApp(u) {
    Store.setUser(u);
    hideAuth();
    $('account-card').hidden = false;
    $('password-card').hidden = false;
    $('btn-signout').hidden = false;
    $('account-email').textContent = u.email || '—';

    // iniciais a partir do e-mail, para o avatar do topo
    const nome = (u.email || '').split('@')[0].replace(/[._-]+/g, ' ').trim();
    const ini = nome ? nome.split(/\s+/).slice(0, 2)
      .map(function (p) { return p.charAt(0); }).join('').toUpperCase() : '—';
    ['m-avatar', 'avatar'].forEach(function (id) {
      const n = $(id);
      if (n) n.textContent = ini || '—';
    });

    // desenha já com o que houver neste aparelho, sem esperar a rede
    const cached = Store.localState() || Store.legacyState();
    adoptState(cached || estadoInicial());
    applySI(); render();
    const onde = telaLembrada();
    if (onde && onde.screen !== 'hub') {
      screen = onde.screen;
      setScreen(onde.tab === 'main' ? onde.screen : onde.tab);
    } else {
      setScreen('hub');
    }

    const r = await Store.reconcile(Store.legacyState() || estadoInicial());
    if (r.state) {
      adoptState(r.state); applySI(); render();
    } else {
      // conta nova: gravar vazio é o mesmo caminho de "apaguei tudo".
      // Nada a enviar até a primeira entrada.
      adoptState(estadoInicial()); applySI(); render();
    }

    Store.startRealtime();
    Store.retry(estadoAtual());
  }

  function startLocalOnly() {
    hideAuth();
    $('account-card').hidden = true;
    $('password-card').hidden = true;
    $('btn-signout').hidden = true;
    const cached = Store.localState() || Store.legacyState();
    adoptState(cached || estadoInicial());
    applySI(); render();
    const onde = telaLembrada();
    if (onde && onde.screen !== 'hub') {
      screen = onde.screen;
      setScreen(onde.tab === 'main' ? onde.screen : onde.tab);
    } else {
      setScreen('hub');
    }
  }

  function init() {
    document.body.classList.add('booting');
    cacheEls();
    applyLayout();
    bindEvents();
    bindAuth();
    $('app-version').textContent = 'v' + APP_VERSION;
    $('btn-install').addEventListener('click', function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () { deferredPrompt = null; $('install-card').hidden = true; });
    });

    // o primeiro ajuste espera o layout assentar
    setTimeout(function () { ajustarContrasteTopo(true); }, 60);
    window.addEventListener('resize', ajustarContrasteTopo);

    Store.onStatusChange(setStatus);
    Store.onRemoteChange(function (state) {
      adoptState(state); applySI(); render();
      toast('Atualizado de outro aparelho');
    });

    // reenvia o que ficou pendente quando a conexão volta
    window.addEventListener('online', function () { Store.retry(estadoAtual()); });

    if (!Store.init()) {
      startLocalOnly();
    } else {
      Store.onAuthChange(function (event, session) {
        if (event === 'PASSWORD_RECOVERY') { showAuth('recovery'); return; }
        if (event === 'SIGNED_IN' && session && !Store.user) enterApp(session.user);
        if (event === 'SIGNED_OUT') { Store.stopRealtime(); showAuth('signin'); }
      });
      bootCloud();
    }

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      });
    }
  }

  async function bootCloud() {
    // o link de redefinição abre direto no formulário de nova senha
    if (/type=recovery/.test(location.hash) || /type=recovery/.test(location.search)) {
      showAuth('recovery');
      return;
    }
    const session = await Store.currentSession();
    if (session && session.user) await enterApp(session.user);
    else showAuth('signin');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
