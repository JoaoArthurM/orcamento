/* Testes do módulo de empréstimos na camada de dados. */
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
  win.localStorage = {
    getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: (k) => { delete mem[k]; },
  };
  function from(name) {
    return {
      select() {
        const q = {
          eq: () => q, order: () => q,
          maybeSingle: () => Promise.resolve({ data: (remote && remote.settings) || null, error: null }),
          then: (res) => res({ data: (remote && remote[name]) || [], error: null }),
        };
        return q;
      },
      upsert(rows) { ops.push({ op: 'upsert', table: name, rows }); return Promise.resolve({ error: null }); },
      delete() {
        const d = {
          eq: () => d,
          in: (c, v) => { ops.push({ op: 'delete', table: name, ids: v }); return Promise.resolve({ error: null }); },
          then: (res) => res({ error: null }),
        };
        return d;
      },
    };
  }
  win.supabase = {
    createClient: () => ({
      from, auth: {},
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel() {},
    }),
  };
  win.mem = mem;
  return win;
}
function load(ops, remote) { const w = makeEnv(ops, remote); vm.createContext(w); vm.runInContext(src, w); return w; }
const tick = () => new Promise((r) => setTimeout(r, 0));

let fails = 0;
const check = (n, c, x) => {
  if (c) console.log('  ok   ' + n);
  else { fails++; console.log('  FALHA ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); }
};

const L1 = 'aaaaaaaa-1111-4111-8111-111111111111';
const L2 = 'bbbbbbbb-2222-4222-8222-222222222222';

(async function () {

  /* 1: normalização */
  {
    const S = load([]).Store;
    const l = S.normalizeLoan({ person: '  Jamilly  ', principal: 1000, total_due: 1200, method: 'avista' });
    check('nome é aparado', l.person === 'Jamilly', l.person);
    check('juros derivam de total - principal', l.total_due - l.principal === 200);
    check('lent_on ganha a data de hoje', /^\d{4}-\d{2}-\d{2}$/.test(l.lent_on), l.lent_on);
    check('due_on vazio vira null', l.due_on === null);

    const abaixo = S.normalizeLoan({ person: 'X', principal: 500, total_due: 300 });
    check('total abaixo do emprestado é corrigido', abaixo.total_due === 500, abaixo.total_due);

    const parc = S.normalizeLoan({ person: 'X', principal: 100, total_due: 120, method: 'parcelado', installments: 3 });
    check('parcelado guarda o nº de parcelas', parc.installments === 3 && parc.installment_amount === null);

    const mens = S.normalizeLoan({ person: 'X', principal: 100, total_due: 120, method: 'mensal', installment_amount: 40 });
    check('mensal guarda o valor da mensalidade', mens.installment_amount === 40 && mens.installments === null);

    const ruim = S.normalizeLoan({ person: 'X', principal: 100, total_due: 120, method: 'inventado' });
    check('método inválido cai para avista', ruim.method === 'avista', ruim.method);

    check('empréstimo sem nome é inválido', !S.validLoan({ person: '  ', principal: 1, total_due: 1 }));
    check('empréstimo válido passa', S.validLoan({ person: 'A', principal: 1, total_due: 2 }));
  }

  /* 2: primeiro envio */
  {
    const ops = [];
    const S = load(ops).Store;
    S.init(); S.setUser({ id: 'u1' });
    const l = S.normalizeLoan({ id: L1, person: 'Jamilly', principal: 1000, total_due: 1200,
      lent_on: '2026-09-01', due_on: '2026-12-01', method: 'parcelado', installments: 4 });
    S.save([], 0, [l]);
    await tick();
    const up = ops.find((o) => o.op === 'upsert' && o.table === 'loans');
    check('empréstimo sobe para a tabela loans', up && up.rows.length === 1, up && up.rows.length);
    check('campos vão completos', up && up.rows[0].person === 'Jamilly'
      && up.rows[0].principal === 1000 && up.rows[0].total_due === 1200
      && up.rows[0].installments === 4 && up.rows[0].due_on === '2026-12-01', up && up.rows[0]);
    check('user_id vai na linha', up && up.rows[0].user_id === 'u1');
    check('position preserva a ordem', up && up.rows[0].position === 0);
  }

  /* 3: alterar manda só o alterado */
  {
    const ops = [];
    const S = load(ops).Store;
    S.init(); S.setUser({ id: 'u1' });
    const a = S.normalizeLoan({ id: L1, person: 'A', principal: 100, total_due: 110 });
    const b = S.normalizeLoan({ id: L2, person: 'B', principal: 200, total_due: 260 });
    S.save([], 0, [a, b]); await tick();
    ops.length = 0;
    S.save([], 0, [a, Object.assign({}, b, { received: 60 })]); await tick();
    const up = ops.find((o) => o.op === 'upsert' && o.table === 'loans');
    check('só o empréstimo alterado sobe', up && up.rows.length === 1, up && up.rows.map((r) => r.person));
    check('valor recebido atualizado', up && up.rows[0].received === 60);
  }

  /* 4: excluir */
  {
    const ops = [];
    const S = load(ops).Store;
    S.init(); S.setUser({ id: 'u1' });
    const a = S.normalizeLoan({ id: L1, person: 'A', principal: 100, total_due: 110 });
    const b = S.normalizeLoan({ id: L2, person: 'B', principal: 200, total_due: 260 });
    S.save([], 0, [a, b]); await tick();
    ops.length = 0;
    S.save([], 0, [a]); await tick();
    const del = ops.find((o) => o.op === 'delete' && o.table === 'loans');
    check('exclusão vira DELETE na tabela certa', del && del.ids[0] === L2, del);
  }

  /* 5: nada mudou, nada é enviado */
  {
    const ops = [];
    const S = load(ops).Store;
    S.init(); S.setUser({ id: 'u1' });
    const a = S.normalizeLoan({ id: L1, person: 'A', principal: 100, total_due: 110 });
    S.save([], 5, [a]); await tick();
    ops.length = 0;
    S.save([], 5, [a]); await tick();
    check('estado idêntico não gera tráfego', ops.length === 0, ops);
  }

  /* 6: entradas e empréstimos convivem */
  {
    const ops = [];
    const S = load(ops).Store;
    S.init(); S.setUser({ id: 'u1' });
    const e = S.normalize({ id: L1, name: 'Renda', type: 'ci', amount: 100, months: [1] });
    const l = S.normalizeLoan({ id: L2, person: 'B', principal: 200, total_due: 260 });
    S.save([e], 7, [l]); await tick();
    const tabelas = ops.filter((o) => o.op === 'upsert').map((o) => o.table).sort();
    check('grava nas três tabelas', JSON.stringify(tabelas) === '["entries","loans","settings"]', tabelas);
    const salvo = S.localState();
    check('cache local guarda os empréstimos', salvo && salvo.loans && salvo.loans.length === 1, salvo && salvo.loans);
  }

  /* 7: tabela ausente não derruba a sincronização */
  {
    const ops = [];
    const win = makeEnv(ops, null);
    const origCreate = win.supabase.createClient;
    win.supabase.createClient = function () {
      const c = origCreate();
      const from0 = c.from;
      c.from = (name) => {
        if (name !== 'loans') return from0(name);
        return {
          select: () => ({
            eq() { return this; }, order() { return this; },
            then: (res) => res({ data: null, error: { message: "Could not find the table 'public.loans' in the schema cache" } }),
          }),
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
      entries: [S.normalize({ id: L1, name: 'X', type: 'ci', amount: 1, months: [1] })],
      saldoInicial: 0, loans: [],
    });
    check('sem a tabela loans, o resto continua funcionando',
      r.source === 'uploaded' || r.source === 'cloud', r.source);
  }

  /* 8: na mensalidade, o total a receber é derivado */
  {
    const S = load([]).Store;

    const m = S.normalizeLoan({ person: 'X', principal: 2500, total_due: 0,
      method: 'mensal', installment_amount: 300 });
    check('mensal: total = emprestado + mensalidade', m.total_due === 2800, m.total_due);
    check('mensal: a mensalidade vira o juro', m.total_due - m.principal === 300);

    // mesmo se vier um total errado de fora, o cálculo manda
    const forcado = S.normalizeLoan({ person: 'X', principal: 2500, total_due: 9999,
      method: 'mensal', installment_amount: 300 });
    check('mensal: total digitado é ignorado', forcado.total_due === 2800, forcado.total_due);

    // sem mensalidade, não há juro
    const zero = S.normalizeLoan({ person: 'X', principal: 1000, total_due: 5000,
      method: 'mensal', installment_amount: 0 });
    check('mensal sem mensalidade: juro zero', zero.total_due === 1000, zero.total_due);

    // os outros métodos continuam com o total digitado
    const vista = S.normalizeLoan({ person: 'X', principal: 150, total_due: 200, method: 'avista' });
    check('à vista mantém o total digitado', vista.total_due === 200, vista.total_due);

    const parc = S.normalizeLoan({ person: 'X', principal: 1000, total_due: 1200,
      method: 'parcelado', installments: 4 });
    check('parcelado mantém o total digitado', parc.total_due === 1200, parc.total_due);
  }

  /* 9: o progresso acompanha o que já foi recebido */
  {
    const S = load([]).Store;
    const l = S.normalizeLoan({ person: 'X', principal: 2500, total_due: 0,
      method: 'mensal', installment_amount: 300, received: 1400 });
    check('mensal guarda o recebido', l.received === 1400);
    check('em aberto = total − recebido', l.total_due - l.received === 1400,
      l.total_due - l.received);
  }

  console.log(fails === 0 ? '\nTODOS OS TESTES DE EMPRÉSTIMOS PASSARAM' : '\n' + fails + ' FALHA(S)');
  process.exit(fails ? 1 : 0);
})();
