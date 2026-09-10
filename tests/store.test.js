/* Testa a camada de dados com um cliente Supabase falso que só
   registra as operações — verifica que o diff por linha está certo. */
const fs = require('fs');
const vm = require('vm');

const ROOT = require("path").join(__dirname, "..") + "/";
const src = fs.readFileSync(ROOT + 'assets/js/store.js', 'utf8');

let uuidN = 0;

function makeEnv(ops, remote) {
  const mem = {};
  const win = {
    ORCAMENTO_CONFIG: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' },
    crypto: { randomUUID: () => 'uuid-' + (++uuidN) },
    console: { warn() {} },
    navigator: { onLine: true },
    setTimeout, clearTimeout,
    JSON, Math, Number, String, Array, Object, Promise, Error, RegExp, Date,
  };
  win.window = win;
  win.localStorage = {
    getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: (k) => { delete mem[k]; },
  };

  // ── cliente falso ──
  function from(name) {
    return {
      select() {
        const q = {
          eq() { return q; },
          order() { return q; },
          maybeSingle: () => Promise.resolve({
            data: (remote && remote.settings) || null, error: null }),
          then: (res) => res({
            data: (remote && remote[name]) || [], error: null }),
        };
        return q;
      },
      upsert(rows) {
        ops.push({ op: 'upsert', table: name, rows });
        return Promise.resolve({ error: null });
      },
      delete() {
        const d = {
          eq() { return d; },
          in(col, vals) {
            ops.push({ op: 'delete', table: name, ids: vals });
            return Promise.resolve({ error: null });
          },
          then: (res) => { ops.push({ op: 'delete-all', table: name }); return res({ error: null }); },
        };
        return d;
      },
    };
  }
  win.supabase = {
    createClient: () => ({
      from,
      auth: {},
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel() {},
    }),
  };
  win.mem = mem;
  return win;
}

function load(ops, remote) {
  const win = makeEnv(ops, remote);
  vm.createContext(win);
  vm.runInContext(src, win);
  return win;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

let fails = 0;
const check = (name, cond, extra) => {
  if (cond) console.log('  ok   ' + name);
  else { fails++; console.log('  FALHA ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
};

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';

(async function () {

  // ── 1: primeiro envio manda tudo ──
  {
    const ops = [];
    const S = load(ops).Store;
    S.init(); S.setUser({ id: 'u1' });
    const es = [
      S.normalize({ id: U1, name: 'Consórcio', type: 'co', amount: 2997, months: [11] }),
      S.normalize({ id: U2, name: 'Décimo', type: 'ui', min_amount: 0, max_amount: 5000, may_not_occur: true, months: [12] }),
    ];
    S.save({ entries: es, saldoInicial: 1933.71 });
    await tick();
    const up = ops.find((o) => o.op === 'upsert' && o.table === 'entries');
    check('envia as 2 entradas', up && up.rows.length === 2, up && up.rows.length);
    check('position preserva a ordem', up && up.rows[0].position === 0 && up.rows[1].position === 1);
    check('ui manda min/max e amount null', up && up.rows[1].amount === null && up.rows[1].max_amount === 5000);
    check('fixo manda amount e min/max null', up && up.rows[0].amount === 2997 && up.rows[0].min_amount === null);
    check('months vai como array', up && JSON.stringify(up.rows[0].months) === '[11]');
    check('user_id vai em toda linha', up && up.rows.every((r) => r.user_id === 'u1'));
    const st = ops.find((o) => o.table === 'settings');
    check('settings recebe o saldo inicial', st && st.rows.saldo_inicial === 1933.71, st && st.rows);
  }

  // ── 2: mudar uma entrada envia só ela ──
  {
    const ops = [];
    const S = load(ops).Store;
    S.init(); S.setUser({ id: 'u1' });
    const e1 = S.normalize({ id: U1, name: 'A', type: 'ci', amount: 100, months: [1] });
    const e2 = S.normalize({ id: U2, name: 'B', type: 'ci', amount: 200, months: [2] });
    S.save({ entries: [e1, e2], saldoInicial: 0 }); await tick();
    ops.length = 0;
    S.save({ entries: [e1, Object.assign({}, e2, { amount: 999 })], saldoInicial: 0 }); await tick();
    const up = ops.find((o) => o.op === 'upsert' && o.table === 'entries');
    check('só a entrada alterada sobe', up && up.rows.length === 1, up && up.rows.map((r) => r.name));
    check('sobe com o valor novo', up && up.rows[0].amount === 999);
    check('settings não é reenviado sem mudança', !ops.some((o) => o.table === 'settings'));
  }

  // ── 3: excluir vira DELETE ──
  {
    const ops = [];
    const S = load(ops).Store;
    S.init(); S.setUser({ id: 'u1' });
    const e1 = S.normalize({ id: U1, name: 'A', type: 'ci', amount: 100, months: [1] });
    const e2 = S.normalize({ id: U2, name: 'B', type: 'ci', amount: 200, months: [2] });
    S.save({ entries: [e1, e2], saldoInicial: 0 }); await tick();
    ops.length = 0;
    S.save({ entries: [e1], saldoInicial: 0 }); await tick();
    const del = ops.find((o) => o.op === 'delete');
    check('exclusão vira DELETE', del && del.ids.length === 1 && del.ids[0] === U2, del);
    check('exclusão não faz upsert da removida',
      !ops.some((o) => o.op === 'upsert' && o.table === 'entries' && o.rows.some((r) => r.id === U2)));
  }

  // ── 4: reordenar reenvia as posições ──
  {
    const ops = [];
    const S = load(ops).Store;
    S.init(); S.setUser({ id: 'u1' });
    const e1 = S.normalize({ id: U1, name: 'A', type: 'ci', amount: 100, months: [1] });
    const e2 = S.normalize({ id: U2, name: 'B', type: 'ci', amount: 200, months: [2] });
    S.save({ entries: [e1, e2], saldoInicial: 0 }); await tick();
    ops.length = 0;
    S.save({ entries: [e2, e1], saldoInicial: 0 }); await tick();
    const up = ops.find((o) => o.op === 'upsert' && o.table === 'entries');
    check('reordenar reenvia as duas posições', up && up.rows.length === 2, up && up.rows.length);
    check('posições novas corretas',
      up && up.rows.find((r) => r.id === U2).position === 0 && up.rows.find((r) => r.id === U1).position === 1);
  }

  // ── 5: nada mudou, nada é enviado ──
  {
    const ops = [];
    const S = load(ops).Store;
    S.init(); S.setUser({ id: 'u1' });
    const e1 = S.normalize({ id: U1, name: 'A', type: 'ci', amount: 100, months: [1] });
    S.save({ entries: [e1], saldoInicial: 10 }); await tick();
    ops.length = 0;
    S.save({ entries: [e1], saldoInicial: 10 }); await tick();
    check('estado idêntico não gera tráfego', ops.length === 0, ops);
  }

  // ── 6: ids curtos viram uuid ──
  {
    const S = load([]).Store;
    const e = S.normalize({ id: 'xe8pmpho', name: 'Antiga', type: 'co', amount: 10, months: [1] });
    check('id curto do simulador vira uuid', e.id !== 'xe8pmpho' && String(e.id).startsWith('uuid-'), e.id);
    const keep = S.normalize({ id: U1, name: 'X', type: 'co', amount: 1, months: [1] });
    check('uuid existente é preservado', keep.id === U1);
  }

  // ── 7: reconcile — nuvem com dados vence o aparelho ──
  {
    const ops = [];
    const remote = { entries: [
      { id: U1, name: 'DaNuvem', type: 'ci', hidden: false, position: 0, amount: 42,
        min_amount: null, max_amount: null, may_not_occur: false, months: [3] },
    ], settings: { saldo_inicial: 500 } };
    const win = load(ops, remote);
    const S = win.Store;
    S.init(); S.setUser({ id: 'u1' });
    S.save({ entries: [S.normalize({ id: U2, name: 'DaquiSo', type: 'ci', amount: 1, months: [1] })], saldoInicial: 9 });
    await tick();
    ops.length = 0;
    const r = await S.reconcile(null);
    check('nuvem com dados vence', r.source === 'cloud' && r.state.entries[0].name === 'DaNuvem', r.source);
    check('saldo vem da nuvem', r.state.saldoInicial === 500, r.state.saldoInicial);
    check('reconcile não reenvia nada', ops.length === 0, ops);
  }

  // ── 8: reconcile — nuvem vazia sobe o que está aqui ──
  {
    const ops = [];
    const S = load(ops, null).Store;
    S.init(); S.setUser({ id: 'u1' });
    const local = { entries: [S.normalize({ id: U1, name: 'Local', type: 'ci', amount: 7, months: [1] })], saldoInicial: 3 };
    const r = await S.reconcile(local);
    check('nuvem vazia → sobe o local', r.source === 'uploaded', r.source);
    const up = ops.find((o) => o.op === 'upsert' && o.table === 'entries');
    check('a entrada local foi enviada', up && up.rows[0].name === 'Local', up && up.rows);
  }

  // ── 9: modo local sem credenciais ──
  {
    const win = makeEnv([], null);
    win.ORCAMENTO_CONFIG = { SUPABASE_URL: '', SUPABASE_ANON_KEY: '' };
    vm.createContext(win); vm.runInContext(src, win);
    const S = win.Store;
    check('sem credenciais → modo local', S.init() === false && S.mode === 'local');
    S.save({ entries: [S.normalize({ id: U1, name: 'X', type: 'ci', amount: 5, months: [1] })], saldoInicial: 7 });
    const saved = JSON.parse(win.mem['orcamento:v2:local:state']);
    check('modo local grava no localStorage', saved.entries.length === 1 && saved.saldoInicial === 7);
  }

  // ── 10: biblioteca ausente ──
  {
    const win = makeEnv([], null);
    delete win.supabase;
    vm.createContext(win); vm.runInContext(src, win);
    check('sem a biblioteca → modo local', win.Store.init() === false && win.Store.mode === 'local');
  }

  // ── 11: migra o localStorage antigo do simulador ──
  {
    const win = makeEnv([], null);
    vm.createContext(win); vm.runInContext(src, win);
    win.mem['sim-state'] = JSON.stringify({
      entries: [{ id: 'xe8pmpho', name: 'Consórcio 1', type: 'co', hidden: false, amount: 2997, months: [11] }],
      saldoInicial: 1933.71,
    });
    const S = win.Store;
    S.init();
    const legacy = S.legacyState();
    check('lê a chave antiga sim-state', legacy && legacy.entries.length === 1, legacy);
    check('mantém valor e saldo na migração',
      legacy && legacy.entries[0].amount === 2997 && legacy.saldoInicial === 1933.71);
  }

  console.log(fails === 0 ? '\nTODOS OS TESTES DO STORE PASSARAM' : '\n' + fails + ' FALHA(S)');
  process.exit(fails ? 1 : 0);
})();
