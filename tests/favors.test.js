/* Testes do módulo de favores na camada de dados. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..') + '/';
const src = fs.readFileSync(ROOT + 'assets/js/store.js', 'utf8');

let uuidN = 0;
function makeEnv(ops, remote) {
  const mem = {};
  const win = {
    ORCAMENTO_CONFIG: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' },
    crypto: { randomUUID: () => 'uuid-' + (++uuidN) },
    console: { warn() {} }, navigator: { onLine: true },
    setTimeout, clearTimeout,
    JSON, Math, Number, String, Array, Object, Promise, Error, RegExp, Date, parseInt, isFinite,
  };
  win.window = win;
  win.localStorage = { getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
  function from(name) {
    return {
      select() { const q = { eq: () => q, order: () => q,
        maybeSingle: () => Promise.resolve({ data: (remote && remote.settings) || null, error: null }),
        then: (res) => res({ data: (remote && remote[name]) || [], error: null }) }; return q; },
      upsert(rows) { ops.push({ op: 'upsert', table: name, rows }); return Promise.resolve({ error: null }); },
      delete() { const d = { eq: () => d,
        in: (c, v) => { ops.push({ op: 'delete', table: name, ids: v }); return Promise.resolve({ error: null }); },
        then: (res) => res({ error: null }) }; return d; },
    };
  }
  win.supabase = { createClient: () => ({ from, auth: {},
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {} }) };
  win.mem = mem;
  return win;
}
function load(ops, remote) { const w = makeEnv(ops, remote); vm.createContext(w); vm.runInContext(src, w); return w; }
const tick = () => new Promise((r) => setTimeout(r, 0));

let fails = 0;
const check = (n, c, x) => { if (c) console.log('  ok   ' + n);
  else { fails++; console.log('  FALHA ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };

const F1 = '11111111-aaaa-4aaa-8aaa-111111111111';
const F2 = '22222222-bbbb-4bbb-8bbb-222222222222';

(async function () {

  /* 1: normalização e o exemplo dos 900 */
  {
    const S = load([]).Store;

    const f = S.normalizeFavor({ person: '  Jamilly  ', reason: '  mercado  ', amount: 900, paid: 500 });
    check('nome e motivo são aparados', f.person === 'Jamilly' && f.reason === 'mercado', [f.person, f.reason]);
    check('deve 900, pagou 500 → falta 400', f.amount - f.paid === 400, f.amount - f.paid);
    check('porcentagem paga é 55,6%',
      Math.round((f.paid / f.amount) * 1000) / 10 === 55.6, (f.paid / f.amount) * 100);
    check('data ganha o dia de hoje', /^\d{4}-\d{2}-\d{2}$/.test(f.lent_on), f.lent_on);

    // não dá para ter pago mais do que deve
    const demais = S.normalizeFavor({ person: 'X', reason: 'y', amount: 100, paid: 250 });
    check('pago acima do total é limitado', demais.paid === 100, demais.paid);

    const negativo = S.normalizeFavor({ person: 'X', reason: 'y', amount: -50, paid: -10 });
    check('valores negativos viram zero', negativo.amount === 0 && negativo.paid === 0);

    const semMotivo = S.normalizeFavor({ person: 'X', amount: 10 });
    check('sem motivo ganha um padrão', semMotivo.reason === 'sem motivo', semMotivo.reason);

    check('favor sem nome é inválido', !S.validFavor({ person: '  ', reason: 'x', amount: 1 }));
    check('favor válido passa', S.validFavor({ person: 'A', reason: 'x', amount: 1 }));
  }

  /* 2: envio */
  {
    const ops = [];
    const S = load(ops).Store;
    S.init(); S.setUser({ id: 'u1' });
    const f = S.normalizeFavor({ id: F1, person: 'Jamilly', reason: 'mercado',
      amount: 900, paid: 500, lent_on: '2026-09-01' });
    S.save([], 0, [], [], null, [f]);
    await tick();
    const up = ops.find((o) => o.op === 'upsert' && o.table === 'favors');
    check('favor sobe para a tabela favors', up && up.rows.length === 1, up && up.rows.length);
    check('campos vão completos', up && up.rows[0].person === 'Jamilly'
      && up.rows[0].reason === 'mercado' && up.rows[0].amount === 900
      && up.rows[0].paid === 500 && up.rows[0].lent_on === '2026-09-01', up && up.rows[0]);
    check('user_id e position vão', up && up.rows[0].user_id === 'u1' && up.rows[0].position === 0);
    check('falta e % não são gravados',
      up && !('falta' in up.rows[0]) && !('pct' in up.rows[0]), up && Object.keys(up.rows[0]));
  }

  /* 3: registrar um pagamento manda só aquele favor */
  {
    const ops = [];
    const S = load(ops).Store;
    S.init(); S.setUser({ id: 'u1' });
    const a = S.normalizeFavor({ id: F1, person: 'Ana', reason: 'uber', amount: 100, paid: 0 });
    const b = S.normalizeFavor({ id: F2, person: 'Bia', reason: 'almoço', amount: 60, paid: 0 });
    S.save([], 0, [], [], null, [a, b]); await tick();
    ops.length = 0;
    S.save([], 0, [], [], null, [a, Object.assign({}, b, { paid: 60 })]); await tick();
    const up = ops.find((o) => o.op === 'upsert' && o.table === 'favors');
    check('só o favor pago sobe', up && up.rows.length === 1, up && up.rows.map((r) => r.person));
    check('valor pago atualizado', up && up.rows[0].paid === 60);
  }

  /* 4: excluir */
  {
    const ops = [];
    const S = load(ops).Store;
    S.init(); S.setUser({ id: 'u1' });
    const a = S.normalizeFavor({ id: F1, person: 'Ana', reason: 'x', amount: 10 });
    const b = S.normalizeFavor({ id: F2, person: 'Bia', reason: 'y', amount: 20 });
    S.save([], 0, [], [], null, [a, b]); await tick();
    ops.length = 0;
    S.save([], 0, [], [], null, [a]); await tick();
    const del = ops.find((o) => o.op === 'delete' && o.table === 'favors');
    check('exclusão vira DELETE em favors', del && del.ids[0] === F2, del);
  }

  /* 5: convive com as outras coleções */
  {
    const ops = [];
    const S = load(ops).Store;
    S.init(); S.setUser({ id: 'u1' });
    const e = S.normalize({ id: F1, name: 'Renda', type: 'ci', amount: 100, months: [1] });
    const l = S.normalizeLoan({ id: F2, person: 'B', principal: 200, total_due: 260 });
    const c = S.normalizeAccount({ id: 'cccccccc-3333-4333-8333-333333333333',
      kind: 'fixa', name: 'Luz', amount: 90, due_day: 5 });
    const f = S.normalizeFavor({ id: 'dddddddd-4444-4444-8444-444444444444',
      person: 'Ana', reason: 'uber', amount: 40, paid: 10 });
    S.save([e], 7, [l], [c], null, [f]); await tick();
    const tabelas = ops.filter((o) => o.op === 'upsert').map((o) => o.table).sort();
    check('grava nas cinco tabelas',
      JSON.stringify(tabelas) === '["accounts","entries","favors","loans","settings"]', tabelas);
    const salvo = S.localState();
    check('cache local guarda os favores', salvo && salvo.favors.length === 1, salvo && salvo.favors);

    ops.length = 0;
    S.save([e], 7, [l], [c], null, [f]); await tick();
    check('reenvio idêntico não gera tráfego', ops.length === 0, ops);
  }

  /* 6: tabela ausente não derruba o resto */
  {
    const ops = [];
    const win = makeEnv(ops, null);
    const origCreate = win.supabase.createClient;
    win.supabase.createClient = function () {
      const c = origCreate();
      const from0 = c.from;
      c.from = (name) => {
        if (name !== 'favors') return from0(name);
        return {
          select: () => ({ eq() { return this; }, order() { return this; },
            then: (res) => res({ data: null, error: { message: "Could not find the table 'public.favors' in the schema cache" } }) }),
          upsert: () => Promise.resolve({ error: null }),
          delete: () => ({ eq() { return this; }, in: () => Promise.resolve({ error: null }),
                           then: (res) => res({ error: null }) }),
        };
      };
      return c;
    };
    vm.createContext(win); vm.runInContext(src, win);
    const S = win.Store;
    S.init(); S.setUser({ id: 'u1' });
    const r = await S.reconcile({
      entries: [S.normalize({ id: F1, name: 'X', type: 'ci', amount: 1, months: [1] })],
      saldoInicial: 0, loans: [], accounts: [], favors: [],
    });
    check('sem a tabela favors, o resto continua', r.source === 'uploaded' || r.source === 'cloud', r.source);
  }

  console.log(fails === 0 ? '\nTODOS OS TESTES DE FAVORES PASSARAM' : '\n' + fails + ' FALHA(S)');
  process.exit(fails ? 1 : 0);
})();
