/* ══════════════════════════════════════════════════════
   orçamento. — simulador econômico
   App web (PWA) · lógica de cálculo portada 1:1 do simulator.html
   ══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── CONSTANTES ─────────────────────────────────────── */
  const APP_VERSION = '1.5.1';

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

  /* dados originais — semente na primeira abertura */
  const SEED_ENTRIES = [
    { id:'xe8pmpho', name:'Consórcio 1',     type:'co', hidden:false, amount:2997, months:[11] },
    { id:'vtdaj2m6', name:'Consórcio 2',     type:'co', hidden:false, amount:2997, months:[4] },
    { id:'qu5hjf8f', name:'Poupança Mensal', type:'ci', hidden:false, amount:1250, months:[1,2,3,4,5,6,7,10,11,12] },
    { id:'aw3pl03g', name:'Decimo',          type:'ui', hidden:false, min_amount:0, max_amount:5000, may_not_occur:true, months:[12] },
    { id:'48gx50dh', name:'Loyola',          type:'ci', hidden:false, amount:5000, months:[11] },
    { id:'131cvcnf', name:'Mãe',             type:'ui', hidden:false, min_amount:0, max_amount:4400, may_not_occur:false, months:[10] },
    { id:'yf5ynzpw', name:'Jamilly',         type:'em', hidden:false, amount:600, months:[12] },
    { id:'4oq7p9s4', name:'Jamilly',         type:'em', hidden:false, amount:250, months:[9,10,11,12] },
    { id:'ojci1kxz', name:'Jamilly -TOTAL-', type:'os', hidden:false, amount:4100, months:[12] },
    { id:'u9vox9so', name:'Jamilly',         type:'ui', hidden:false, min_amount:583.9, max_amount:803.9, may_not_occur:false, months:[9] },
    { id:'97bwm78y', name:'Emelly',          type:'em', hidden:false, amount:1690, months:[9] },
    { id:'u9v17xwk', name:'Dona Eliana',     type:'em', hidden:false, amount:200, months:[9] },
    { id:'yrvw7mxa', name:'Lorena',          type:'em', hidden:false, amount:520, months:[9] },
    { id:'lgm7mc5j', name:'Arthur -Tenis-',  type:'ci', hidden:false, amount:179, months:[9] },
    { id:'u54ljv03', name:'Arthur -Pedido-', type:'ci', hidden:false, amount:250, months:[9,10,11] },
    { id:'g4l2wgyd', name:'Arthur -Calça-',  type:'ci', hidden:false, amount:224.5, months:[9] },
  ];
  const SEED_SALDO = 1933.71;

  /* ── ESTADO ─────────────────────────────────────────── */
  let entries      = [];
  let saldoInicial = 0;
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
    [el.saveSt, el.saveStD].forEach(function (n) {
      if (!n) return;
      n.textContent = txt || '';
      n.className = 'save-st' + (txt ? ' vis ' + (cls || '') : '');
    });
    if (cls === 'ok') statusTimer = setTimeout(function () { setStatus(''); }, 2000);
  }

  /** Toda mudança passa por aqui; o Store decide local vs. nuvem. */
  function triggerSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      Store.save(entries, saldoInicial);
    }, 500);
  }

  /** Aplica um estado vindo do Store (login, nuvem, outro aparelho). */
  function adoptState(state) {
    entries      = state.entries;
    saldoInicial = state.saldoInicial;
  }

  function seedState() {
    return {
      entries: JSON.parse(JSON.stringify(SEED_ENTRIES)).map(Store.normalize),
      saldoInicial: SEED_SALDO,
    };
  }

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
      const menu = $('slot-menu');
      menu.appendChild(el.cList);
      menu.appendChild(el.cLegend);
      menu.appendChild(el.cSettings);
      $('app').appendChild(el.sheetForm);
      $('app').appendChild(el.sheetSettings);
    }
    closeSheets(true);
  }

  function setTab(name) {
    tab = name;
    ['sim', 'menu'].forEach(function (t) {
      const v = $('view-' + t);
      if (v) v.classList.toggle('on', t === name);
    });
    Array.prototype.forEach.call(el.navbar.querySelectorAll('.navitem'), function (b) {
      const on = b.dataset.tab === name;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    if (name === 'menu') fillExport();
    if (name === 'sim' && lastRows) renderCurve(lastRows);
  }

  /* ══════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════ */
  let lastRows = null;

  function render() {
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

  /* ── lista de entradas ──────────────────────────────── */
  function renderList() {
    const q = (el.esearch.value || '').toLowerCase().trim();
    const filtered = entries.filter(function (e) { return e.name.toLowerCase().includes(q); });
    el.elistCount.textContent = entries.length;

    if (!filtered.length) {
      el.elist.innerHTML =
        '<div class="empty-list">' +
          '<span class="empty-dots"></span>' +
          '<span class="empty-title">Nenhuma entrada</span>' +
          '<span class="empty-sub">' +
            (q ? 'Nada casa com “' + esc(q) + '”' : 'Toque em “+ Entrada” para começar.') +
          '</span>' +
        '</div>';
      return;
    }

    el.elist.innerHTML = filtered.map(function (e) {
      const T = TYPES[e.type];
      return '<div class="eitem' + (e.hidden ? ' dim' : '') + '">' +
        '<span class="ei-icon" style="background:' + ICON_BG[e.type] + ';color:' + DOT_COLOR[e.type] + '">' +
          ico(TYPE_ICON[e.type], 'ei-ico') + '</span>' +
        '<span class="ei-body">' +
          '<span class="ei-name">' + esc(e.name) + '</span>' +
          '<span class="ei-meta">' + T.label + ' · ' + entryHint(e) + '</span>' +
        '</span>' +
        '<span class="ei-amt"><span class="ei-pfx">R$</span>' +
          '<span class="ei-val">' + entryAmountTxt(e) + '</span></span>' +
        '<div class="eacts">' +
          '<button class="ib" data-act="tog" data-id="' + e.id + '" ' +
            'aria-label="' + (e.hidden ? 'Mostrar' : 'Ocultar') + ' ' + esc(e.name) + '">' +
            (e.hidden ? svgEyeOff() : svgEye()) + '</button>' +
          '<button class="ib" data-act="edit" data-id="' + e.id + '" ' +
            'aria-label="Editar ' + esc(e.name) + '">' + svgEdit() + '</button>' +
          '<button class="ib del" data-act="del" data-id="' + e.id + '" ' +
            'aria-label="Excluir ' + esc(e.name) + '">' + svgTrash() + '</button>' +
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

    $('m-entries').innerHTML = linhas.length ? linhas.join('') :
      '<div class="m-empty"><span class="m-empty-dots"></span>' +
      '<span>Nenhuma entrada neste mês</span></div>';
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

  /* ── sheets ─────────────────────────────────────────── */
  let openSheetEl = null;

  function openSheet(node) {
    openSheetEl = node;
    node.classList.add('open');
    el.backdrop.classList.add('open');
    if (!isDesktop) {
      try { history.pushState({ sheet: true }, ''); } catch (err) {}
    }
  }
  function closeSheets(silent) {
    const was = openSheetEl;
    el.sheetForm.classList.remove('open');
    el.sheetSettings.classList.remove('open');
    el.backdrop.classList.remove('open');
    openSheetEl = null;
    editId = null;
    if (was && !silent && !isDesktop && history.state && history.state.sheet) {
      try { history.back(); } catch (err) {}
    }
  }

  /* ── exportar / importar ────────────────────────────── */
  function fillExport() {
    $('export-ta').value = JSON.stringify({ entries: entries, saldoInicial: saldoInicial }, null, 2);
    $('export-fb').textContent = '';
    $('import-fb').textContent = '';
  }

  function doExport() {
    const ta = $('export-ta');
    const fb = $('export-fb');
    const done = function () { fb.className = 'fb ok'; fb.textContent = 'Copiado!';
                               setTimeout(function () { fb.textContent = ''; }, 2500); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ta.value).then(done).catch(function () {
        ta.select(); document.execCommand('copy'); done();
      });
    } else {
      ta.select(); document.execCommand('copy'); done();
    }
  }

  function doExportFile() {
    const blob = new Blob([$('export-ta').value], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const d    = new Date();
    const stamp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
                  String(d.getDate()).padStart(2, '0');
    a.href = url;
    a.download = 'orcamento-' + stamp + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function doImport() {
    const fb  = $('import-fb');
    const raw = $('import-ta').value.trim();
    if (!raw) { fb.className = 'fb err'; fb.textContent = 'Cole o JSON primeiro.'; return; }
    let d;
    try { d = JSON.parse(raw); }
    catch (err) { fb.className = 'fb err'; fb.textContent = 'JSON inválido — verifique o conteúdo.'; return; }

    if (!d || !Array.isArray(d.entries)) {
      fb.className = 'fb err';
      fb.textContent = 'JSON inválido — campo “entries” não encontrado.';
      return;
    }
    const clean = d.entries.filter(Store.validEntry).map(Store.normalize);
    if (!clean.length) {
      fb.className = 'fb err';
      fb.textContent = 'Nenhuma entrada válida encontrada no JSON.';
      return;
    }
    entries = clean;
    if (typeof d.saldoInicial === 'number' && isFinite(d.saldoInicial)) saldoInicial = d.saldoInicial;
    applySI();
    render(); triggerSave();
    fillExport();                       // fillExport limpa os avisos — mensagem vem depois
    $('import-ta').value = '';
    fb.className = 'fb ok';
    fb.textContent = clean.length + ' entrada(s) importada(s) com sucesso.';
    if (isDesktop) setTimeout(closeSheets, 1400);
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
      adoptState(seedState());
      applySI(); render(); triggerSave();
      fb.className = 'fb ok';
      fb.textContent = 'Dados restaurados ao original.';
      $('btn-reset').textContent = 'Apagar dados salvos';
      el.resetArmed = false;
      fillExport();
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
    el.sbFinal       = $('sb-final');
    el.sbFinalLabel  = $('sb-final-label');
    el.sbGrowth      = $('sb-growth');
    el.scenarioTab   = $('scenario-tab');
    el.tinner        = $('tinner');
  }

  function bindEvents() {
    /* cenário */
    ['bp','bo','bp-m','bo-m'].forEach(function (id) {
      const b = $(id);
      if (b) b.addEventListener('click', function () { setV(b.dataset.view); });
    });

    /* navegação por abas */
    el.navbar.addEventListener('click', function (ev) {
      const b = ev.target.closest('.navitem');
      if (b) setTab(b.dataset.tab);
    });

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
      if (b.dataset.act === 'tog')  tog(id);
      if (b.dataset.act === 'edit') openForm(id);
      if (b.dataset.act === 'del')  del(id);
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
    ['btn-add', 'fab-add', 'm-btn-add'].forEach(function (id) {
      const b = $(id);
      if (b) b.addEventListener('click', function () { openForm(null); });
    });
    ['btn-settings', 'm-btn-edit'].forEach(function (id) {
      const b = $(id);
      if (!b) return;
      b.addEventListener('click', function () {
        if (isDesktop) { fillExport(); openSheet(el.sheetSettings); }
        else setTab('menu');
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
      if (openSheetEl) closeSheets(true);
    });

    /* ajustes */
    $('btn-export').addEventListener('click', doExport);
    $('btn-export-file').addEventListener('click', doExportFile);
    $('btn-import').addEventListener('click', doImport);
    $('btn-reset').addEventListener('click', doReset);

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
    adoptState(cached || seedState());
    applySI(); render();

    const r = await Store.reconcile(Store.legacyState() || seedState());
    if (r.state) {
      adoptState(r.state); applySI(); render();
    } else {
      adoptState(seedState()); applySI(); render(); triggerSave();
    }

    Store.startRealtime();
    Store.retry(entries, saldoInicial);
  }

  function startLocalOnly() {
    hideAuth();
    $('account-card').hidden = true;
    $('password-card').hidden = true;
    const cached = Store.localState() || Store.legacyState();
    adoptState(cached || seedState());
    applySI(); render();
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

    Store.onStatusChange(setStatus);
    Store.onRemoteChange(function (state) {
      adoptState(state); applySI(); render();
      toast('Atualizado de outro aparelho');
    });

    // reenvia o que ficou pendente quando a conexão volta
    window.addEventListener('online', function () { Store.retry(entries, saldoInicial); });

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
