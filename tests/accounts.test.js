/* Testes do módulo de contas na camada de dados. */
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

const A1 = 'cccccccc-1111-4111-8111-111111111111';
const A2 = 'dddddddd-2222-4222-8222-222222222222';

(async function () {

  /* 1: normalização por tipo */
  {
    const S = load([]).Store;

    const renda = S.normalizeAccount({ kind: 'renda', name: '  Salário ', amount: 3000, frequency: 'mensal' });
    check('renda apara o nome', renda.name === 'Salário', renda.name);
    check('renda guarda a frequência', renda.frequency === 'mensal');
    check('renda não usa campos de outros tipos',
      renda.due_day === null && renda.avg_amount === null && renda.paid_on === null);

    const freqRuim = S.normalizeAccount({ kind: 'renda', name: 'X', amount: 1, frequency: 'inventada' });
    check('frequência inválida cai para mensal', freqRuim.frequency === 'mensal', freqRuim.frequency);

    const fixa = S.normalizeAccount({ kind: 'fixa', name: 'Aluguel', amount: 900, due_day: 10, paid_on: '2026-09-09' });
    check('fixa guarda dia e data de pagamento', fixa.due_day === 10 && fixa.paid_on === '2026-09-09', fixa.paid_on);

    const semPagar = S.normalizeAccount({ kind: 'fixa', name: 'Luz', amount: 100, due_day: 5 });
    check('fixa sem pagamento fica com paid_on nulo', semPagar.paid_on === null);

    const dataRuim = S.normalizeAccount({ kind: 'fixa', name: 'X', amount: 1, due_day: 5, paid_on: 'ontem' });
    check('data de pagamento inválida vira nula', dataRuim.paid_on === null, dataRuim.paid_on);

    const diaRuim = S.normalizeAccount({ kind: 'fixa', name: 'X', amount: 1, due_day: 99 });
    check('dia fora de 1–31 vira 1', diaRuim.due_day === 1, diaRuim.due_day);

    const varSemMedia = S.normalizeAccount({ kind: 'variavel', name: 'Luz', amount: 180 });
    check('variável sem média usa o próprio valor', varSemMedia.avg_amount === 180, varSemMedia.avg_amount);

    const varComMedia = S.normalizeAccount({ kind: 'variavel', name: 'Luz', amount: 220, avg_amount: 180 });
    check('variável respeita a média informada', varComMedia.avg_amount === 180);

    const ass = S.normalizeAccount({ kind: 'assinatura', name: 'Netflix', amount: 44.9 });
    check('assinatura guarda só o mensal', ass.amount === 44.9 && ass.frequency === null);

    const kindRuim = S.normalizeAccount({ kind: 'xpto', name: 'X', amount: 1 });
    check('tipo inválido cai para fixa', kindRuim.kind === 'fixa', kindRuim.kind);

    check('conta sem nome é inválida', !S.validAccount({ kind: 'fixa', name: '  ', amount: 1 }));
    check('conta sem tipo é inválida', !S.validAccount({ name: 'X', amount: 1 }));
    check('conta válida passa', S.validAccount({ kind: 'fixa', name: 'X', amount: 1 }));

    check('tabela de frequências existe',
      S.FREQ_MES.mensal === 1 && S.FREQ_MES.quinzenal === 2 && S.FREQ_MES.pontual === 0, S.FREQ_MES);
  }

  /* 2: envio */
  {
    const ops = [];
    const S = load(ops).Store;
    S.init(); S.setUser({ id: 'u1' });
    const a = S.normalizeAccount({ id: A1, kind: 'fixa', name: 'Aluguel', amount: 900, due_day: 10 });
    S.save([], 0, [], [a]); await tick();
    const up = ops.find((o) => o.op === 'upsert' && o.table === 'accounts');
    check('conta sobe para a tabela accounts', up && up.rows.length === 1, up && up.rows.length);
    check('campos vão certos', up && up.rows[0].kind === 'fixa' && up.rows[0].due_day === 10
      && up.rows[0].frequency === null && up.rows[0].avg_amount === null, up && up.rows[0]);
    check('a linha não leva mais o booleano paid', up && !('paid' in up.rows[0]), up && Object.keys(up.rows[0]));
    check('user_id e position vão', up && up.rows[0].user_id === 'u1' && up.rows[0].position === 0);
  }

  /* 3: alterar manda só a alterada */
  {
    const ops = [];
    const S = load(ops).Store;
    S.init(); S.setUser({ id: 'u1' });
    const a = S.normalizeAccount({ id: A1, kind: 'fixa', name: 'Aluguel', amount: 900, due_day: 10 });
    const b = S.normalizeAccount({ id: A2, kind: 'assinatura', name: 'Netflix', amount: 44.9 });
    S.save([], 0, [], [a, b]); await tick();
    ops.length = 0;
    S.save([], 0, [], [a, Object.assign({}, b, { amount: 55.9 })]); await tick();
    const up = ops.find((o) => o.op === 'upsert' && o.table === 'accounts');
    check('só a conta alterada sobe', up && up.rows.length === 1, up && up.rows.map((r) => r.name));
    check('valor novo é enviado', up && up.rows[0].amount === 55.9);
  }

  /* 4: excluir */
  {
    const ops = [];
    const S = load(ops).Store;
    S.init(); S.setUser({ id: 'u1' });
    const a = S.normalizeAccount({ id: A1, kind: 'fixa', name: 'A', amount: 1, due_day: 5 });
    const b = S.normalizeAccount({ id: A2, kind: 'fixa', name: 'B', amount: 2, due_day: 6 });
    S.save([], 0, [], [a, b]); await tick();
    ops.length = 0;
    S.save([], 0, [], [a]); await tick();
    const del = ops.find((o) => o.op === 'delete' && o.table === 'accounts');
    check('exclusão vira DELETE em accounts', del && del.ids[0] === A2, del);
  }

  /* 5: as três coleções convivem e nada sobra */
  {
    const ops = [];
    const S = load(ops).Store;
    S.init(); S.setUser({ id: 'u1' });
    const e = S.normalize({ id: A1, name: 'Renda', type: 'ci', amount: 100, months: [1] });
    const l = S.normalizeLoan({ id: A2, person: 'B', principal: 200, total_due: 260 });
    const c = S.normalizeAccount({ id: 'eeeeeeee-3333-4333-8333-333333333333',
      kind: 'renda', name: 'Salário', amount: 3000, frequency: 'mensal' });
    S.save([e], 7, [l], [c]); await tick();
    const tabelas = ops.filter((o) => o.op === 'upsert').map((o) => o.table).sort();
    check('grava nas quatro tabelas',
      JSON.stringify(tabelas) === '["accounts","entries","loans","settings"]', tabelas);
    const salvo = S.localState();
    check('cache local guarda as três coleções',
      salvo && salvo.entries.length === 1 && salvo.loans.length === 1 && salvo.accounts.length === 1,
      salvo && { e: salvo.entries.length, l: salvo.loans.length, a: salvo.accounts.length });

    ops.length = 0;
    S.save([e], 7, [l], [c]); await tick();
    check('reenvio idêntico não gera tráfego', ops.length === 0, ops);
  }

  /* 6: tabela accounts ausente não derruba o resto */
  {
    const ops = [];
    const win = makeEnv(ops, null);
    const origCreate = win.supabase.createClient;
    win.supabase.createClient = function () {
      const c = origCreate();
      const from0 = c.from;
      c.from = (name) => {
        if (name !== 'accounts') return from0(name);
        return {
          select: () => ({ eq() { return this; }, order() { return this; },
            then: (res) => res({ data: null, error: { message: "Could not find the table 'public.accounts' in the schema cache" } }) }),
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
      entries: [S.normalize({ id: A1, name: 'X', type: 'ci', amount: 1, months: [1] })],
      saldoInicial: 0, loans: [], accounts: [],
    });
    check('sem a tabela accounts, o resto continua', r.source === 'uploaded' || r.source === 'cloud', r.source);
  }

  /* 7: a ordem do hub viaja na conta, não no aparelho */
  {
    const ops = [];
    const S = load(ops).Store;
    S.init(); S.setUser({ id: 'u1' });
    S.save([], 0, [], [], ['contas', 'eco', 'loans']);
    await tick();
    const st = ops.find((o) => o.op === 'upsert' && o.table === 'settings');
    check('ordem do hub sobe em settings',
      st && JSON.stringify(st.rows.hub_order) === '["contas","eco","loans"]', st && st.rows);

    ops.length = 0;
    S.save([], 0, [], [], ['contas', 'eco', 'loans']); await tick();
    check('mesma ordem não gera tráfego', ops.length === 0, ops);

    ops.length = 0;
    S.save([], 0, [], [], ['eco', 'contas', 'loans']); await tick();
    check('reordenar dispara gravação',
      ops.some((o) => o.table === 'settings'), ops.map((o) => o.table));

    const salvo = S.localState();
    check('cache local guarda a ordem',
      salvo && JSON.stringify(salvo.hubOrder) === '["eco","contas","loans"]', salvo && salvo.hubOrder);
  }

  /* 8: sem a coluna hub_order (banco anterior à v3) o resto grava igual */
  {
    const ops = [];
    const win = makeEnv(ops, null);
    const orig = win.supabase.createClient;
    win.supabase.createClient = function () {
      const c = orig();
      const from0 = c.from;
      c.from = (name) => {
        const base = from0(name);
        if (name !== 'settings') return base;
        return Object.assign({}, base, {
          upsert(linha) {
            if ('hub_order' in linha) {
              return Promise.resolve({ error: { message: 'column settings.hub_order does not exist' } });
            }
            ops.push({ op: 'upsert', table: name, rows: linha });
            return Promise.resolve({ error: null });
          },
        });
      };
      return c;
    };
    vm.createContext(win); vm.runInContext(src, win);
    const S = win.Store;
    S.init(); S.setUser({ id: 'u1' });
    S.save([], 42, [], [], ['eco']); await tick();
    const st = ops.find((o) => o.table === 'settings');
    check('sem a coluna, o saldo grava mesmo assim', st && st.rows.saldo_inicial === 42, st && st.rows);
    check('e a ordem não vai junto', st && !('hub_order' in st.rows));
  }

  console.log(fails === 0 ? '\nTODOS OS TESTES DE CONTAS PASSARAM' : '\n' + fails + ' FALHA(S)');
  process.exit(fails ? 1 : 0);
})();
