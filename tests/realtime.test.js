/* Realtime: o eco da própria gravação não pode virar aviso.
 *
 * O Supabase manda de volta as mudanças feitas por este mesmo aparelho.
 * Esse eco chega depois do push terminar — quando `dirty` e `pushing` já
 * voltaram a false — então as travas de "tem coisa pendente" não o pegam,
 * e cada edição do usuário virava um "Atualizado de outro aparelho".
 *
 * O que vale é a comparação: mudou de verdade em relação ao que eu já
 * tinha, ou é a minha própria linha voltando?
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..') + '/';
const src = fs.readFileSync(ROOT + 'assets/js/store.js', 'utf8');

let uuidN = 0;

/**
 * Ambiente com realtime de mentira: guarda o callback registrado no
 * canal para que o teste possa disparar o evento na hora que quiser.
 */
function makeEnv(estadoRemoto) {
  const mem = {};
  const disparos = [];
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
      select() {
        const q = { eq: () => q, order: () => q,
          maybeSingle: () => Promise.resolve({ data: estadoRemoto.settings || null, error: null }),
          then: (res) => res({ data: estadoRemoto[name] || [], error: null }) };
        return q;
      },
      upsert(rows) {
        // o servidor guarda o que subiu — é isso que o pull devolve depois
        const lista = Array.isArray(rows) ? rows : [rows];
        if (name === 'settings') { estadoRemoto.settings = lista[0]; return Promise.resolve({ error: null }); }
        estadoRemoto[name] = estadoRemoto[name] || [];
        lista.forEach(function (r) {
          const i = estadoRemoto[name].findIndex(function (x) { return x.id === r.id; });
          if (i >= 0) estadoRemoto[name][i] = r; else estadoRemoto[name].push(r);
        });
        return Promise.resolve({ error: null });
      },
      delete() {
        const d = { eq: () => d,
          in: (c, vals) => {
            estadoRemoto[name] = (estadoRemoto[name] || [])
              .filter(function (x) { return vals.indexOf(x.id) < 0; });
            return Promise.resolve({ error: null });
          },
          then: (res) => res({ error: null }) };
        return d;
      },
    };
  }

  win.supabase = { createClient: () => ({
    from, auth: {},
    channel: () => {
      const ch = { on(tipo, cfg, fn) { disparos.push(fn); return ch; }, subscribe() { return ch; } };
      return ch;
    },
    removeChannel() {},
  }) };
  win.__disparos = disparos;
  return win;
}

function load(estadoRemoto) {
  const w = makeEnv(estadoRemoto);
  vm.createContext(w);
  vm.runInContext(src, w);
  return w;
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
const check = (n, c, x) => { if (c) console.log('  ok   ' + n);
  else { fails++; console.log('  FALHA ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };

const E1 = '11111111-1111-4111-8111-111111111111';
const E2 = '22222222-2222-4222-8222-222222222222';

(async function () {

  /* 1: eu gravo, o servidor ecoa — não é para avisar nada */
  {
    const servidor = {};
    const w = load(servidor);
    const S = w.Store;
    S.init(); S.setUser({ id: 'u1' });
    S.startRealtime();
    check('o canal registrou os ouvintes', w.__disparos.length >= 5, w.__disparos.length);

    let avisos = 0;
    S.onRemoteChange(function () { avisos++; });

    const e = S.normalize({ id: E1, name: 'Salário', type: 'ci', amount: 3200, months: [9] });
    S.save({ entries: [e], saldoInicial: 0 });
    await espera(20);

    // o Supabase devolve a nossa própria gravação
    w.__disparos.forEach(function (fn) { fn({ eventType: 'UPDATE' }); });
    await espera(600);

    check('o eco da própria gravação não avisa', avisos === 0, avisos);
  }

  /* 2: outro aparelho grava de verdade — aí sim avisa */
  {
    const servidor = {};
    const w = load(servidor);
    const S = w.Store;
    S.init(); S.setUser({ id: 'u1' });
    S.startRealtime();

    let avisos = 0, ultimo = null;
    S.onRemoteChange(function (st) { avisos++; ultimo = st; });

    const e = S.normalize({ id: E1, name: 'Salário', type: 'ci', amount: 3200, months: [9] });
    S.save({ entries: [e], saldoInicial: 0 });
    await espera(20);

    // o outro aparelho acrescenta uma linha direto no servidor
    servidor.entries.push({ id: E2, user_id: 'u1', name: 'Aluguel', type: 'os',
      hidden: false, position: 1, amount: 1200, min_amount: null, max_amount: null,
      may_not_occur: false, months: [9] });

    w.__disparos.forEach(function (fn) { fn({ eventType: 'INSERT' }); });
    await espera(600);

    check('mudança real de outro aparelho avisa', avisos === 1, avisos);
    check('e traz a linha nova', ultimo && ultimo.entries.length === 2,
      ultimo && ultimo.entries.map(function (x) { return x.name; }));
  }

  /* 3: mudança só no saldo inicial também conta */
  {
    const servidor = {};
    const w = load(servidor);
    const S = w.Store;
    S.init(); S.setUser({ id: 'u1' });
    S.startRealtime();

    let avisos = 0;
    S.onRemoteChange(function () { avisos++; });

    const e = S.normalize({ id: E1, name: 'X', type: 'ci', amount: 10, months: [9] });
    S.save({ entries: [e], saldoInicial: 0 });
    await espera(20);

    servidor.settings = { user_id: 'u1', saldo_inicial: 999, hub_order: null };
    w.__disparos.forEach(function (fn) { fn({ eventType: 'UPDATE' }); });
    await espera(600);

    check('saldo mudado de fora avisa', avisos === 1, avisos);
  }

  /* 4: exclusão feita aqui também ecoa, e também não pode avisar */
  {
    const servidor = {};
    const w = load(servidor);
    const S = w.Store;
    S.init(); S.setUser({ id: 'u1' });
    S.startRealtime();

    const a = S.normalize({ id: E1, name: 'A', type: 'ci', amount: 10, months: [9] });
    const b = S.normalize({ id: E2, name: 'B', type: 'ci', amount: 20, months: [9] });
    S.save({ entries: [a, b], saldoInicial: 0 });
    await espera(20);

    let avisos = 0;
    S.onRemoteChange(function () { avisos++; });

    S.save({ entries: [a], saldoInicial: 0 });     // apaguei B aqui
    await espera(20);
    w.__disparos.forEach(function (fn) { fn({ eventType: 'DELETE' }); });
    await espera(600);

    check('o eco de uma exclusão minha não avisa', avisos === 0, avisos);
  }

  console.log(fails === 0 ? '\nTODOS OS TESTES DE REALTIME PASSARAM' : '\n' + fails + ' FALHA(S)');
  process.exit(fails ? 1 : 0);
})();
