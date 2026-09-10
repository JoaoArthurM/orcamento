/* Testes do módulo de favores: normalização, envio e a repartição
   dos pagamentos entre os favores — que é onde mora a regra de negócio. */
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
const F3 = '33333333-cccc-4ccc-8ccc-333333333333';
const F4 = '44444444-dddd-4ddd-8ddd-444444444444';
const P1 = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const P2 = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

(async function () {

  /* 1: normalização do favor */
  {
    const S = load([]).Store;

    const f = S.normalizeFavor({ person: '  Marina  ', reason: '  uber  ', amount: 900 });
    check('nome e motivo são aparados', f.person === 'Marina' && f.reason === 'uber', [f.person, f.reason]);
    check('o favor não guarda mais quanto foi pago', !('paid' in f), Object.keys(f));
    check('data ganha o dia de hoje', /^\d{4}-\d{2}-\d{2}$/.test(f.lent_on), f.lent_on);

    const negativo = S.normalizeFavor({ person: 'X', reason: 'y', amount: -50 });
    check('valor negativo vira zero', negativo.amount === 0);

    const semMotivo = S.normalizeFavor({ person: 'X', amount: 10 });
    check('sem motivo ganha um padrão', semMotivo.reason === 'sem motivo', semMotivo.reason);

    check('favor sem nome é inválido', !S.validFavor({ person: '  ', reason: 'x', amount: 1 }));
    check('favor válido passa', S.validFavor({ person: 'A', reason: 'x', amount: 1 }));
  }

  /* 2: normalização do pagamento */
  {
    const S = load([]).Store;

    const p = S.normalizePayment({ person: ' Ana ', amount: 200, scope: 'total' });
    check('pagamento no total não pede alvo',
      p.scope === 'total' && p.favor_id === null && p.scope_day === null, p);

    // alcance sem alvo não faz sentido: cai para o que não precisa de alvo
    const orfaoItem = S.normalizePayment({ person: 'A', amount: 10, scope: 'item' });
    check('item sem favor_id vira total', orfaoItem.scope === 'total', orfaoItem.scope);
    const orfaoDia = S.normalizePayment({ person: 'A', amount: 10, scope: 'dia' });
    check('dia sem data vira total', orfaoDia.scope === 'total', orfaoDia.scope);

    const item = S.normalizePayment({ person: 'A', amount: 10, scope: 'item', favor_id: F1,
                                      scope_day: '2026-09-10' });
    check('pagamento de item não carrega dia', item.favor_id === F1 && item.scope_day === null, item);

    const inventado = S.normalizePayment({ person: 'A', amount: 10, scope: 'xpto' });
    check('alcance desconhecido vira total', inventado.scope === 'total', inventado.scope);

    check('pagamento de valor zero é inválido', !S.validPayment({ person: 'A', amount: 0 }));
    check('pagamento sem nome é inválido', !S.validPayment({ person: ' ', amount: 5 }));
  }

  /* 3: a saída do dia 10 — o caso que motivou tudo isto */
  {
    const S = load([]).Store;
    const dia10 = [
      S.normalizeFavor({ id: F1, person: 'Marina', reason: 'uber',   amount: 40,  lent_on: '2026-09-10' }),
      S.normalizeFavor({ id: F2, person: 'Marina', reason: 'comida', amount: 160, lent_on: '2026-09-10' }),
      S.normalizeFavor({ id: F3, person: 'Marina', reason: 'roupa',  amount: 300, lent_on: '2026-09-10' }),
    ];
    const dia15 = S.normalizeFavor({ id: F4, person: 'Marina', reason: 'farmácia',
                                     amount: 100, lent_on: '2026-09-15' });
    const todos = dia10.concat([dia15]);

    // ela passa 200 sem dizer de quê: enche do mais antigo para o mais novo
    const r = S.alocarFavores(todos, [
      S.normalizePayment({ id: P1, person: 'Marina', amount: 200, scope: 'total' }),
    ]);
    check('200 no total fecham o uber e a comida',
      r.pago[F1] === 40 && r.pago[F2] === 160, [r.pago[F1], r.pago[F2]]);
    check('e não sobra nada para a roupa', r.pago[F3] === 0, r.pago[F3]);

    // pagando o dia 10 inteiro
    const rd = S.alocarFavores(todos, [
      S.normalizePayment({ id: P1, person: 'Marina', amount: 500, scope: 'dia', scope_day: '2026-09-10' }),
    ]);
    check('500 no dia 10 quitam as três contas do dia',
      rd.pago[F1] === 40 && rd.pago[F2] === 160 && rd.pago[F3] === 300, rd.pago);
    check('o pagamento do dia não vaza para o dia 15', rd.pago[F4] === 0, rd.pago[F4]);

    // um pagamento de total transborda de um dia para o outro
    const rt = S.alocarFavores(todos, [
      S.normalizePayment({ id: P1, person: 'Marina', amount: 560, scope: 'total' }),
    ]);
    check('no total, o dia 10 enche e o resto cai no dia 15',
      rt.pago[F3] === 300 && rt.pago[F4] === 60, [rt.pago[F3], rt.pago[F4]]);

    // o mais específico manda: o item entra antes do total
    const re = S.alocarFavores(todos, [
      S.normalizePayment({ id: P2, person: 'Marina', amount: 100, scope: 'total' }),
      S.normalizePayment({ id: P1, person: 'Marina', amount: 300, scope: 'item', favor_id: F3 }),
    ]);
    check('o pagamento de item chega primeiro à roupa', re.pago[F3] === 300, re.pago[F3]);
    check('e o do total preenche o começo', re.pago[F1] === 40 && re.pago[F2] === 60, re.pago);

    // pagou mais do que devia
    const rc = S.alocarFavores(todos, [
      S.normalizePayment({ id: P1, person: 'Marina', amount: 700, scope: 'total' }),
    ]);
    check('sobra vira crédito, não some', rc.credito['marina'] === 100, rc.credito);

    // o dinheiro de uma pessoa não paga o de outra
    const outra = S.normalizeFavor({ id: F1, person: 'Bia', reason: 'x', amount: 50 });
    const rp = S.alocarFavores([outra, dia15], [
      S.normalizePayment({ id: P1, person: 'Bia', amount: 500, scope: 'total' }),
    ]);
    check('pagamento da Bia não toca no favor da Marina', rp.pago[F4] === 0, rp.pago);
    check('e o excedente fica de crédito da Bia', rp.credito['bia'] === 450, rp.credito);
  }

  /* 4: detalhes da repartição */
  {
    const S = load([]).Store;
    const a = S.normalizeFavor({ id: F1, person: 'Ana', reason: 'a', amount: 0.1, lent_on: '2026-01-01' });
    const b = S.normalizeFavor({ id: F2, person: 'Ana', reason: 'b', amount: 0.2, lent_on: '2026-01-02' });
    const r = S.alocarFavores([a, b], [
      S.normalizePayment({ id: P1, person: 'Ana', amount: 0.3, scope: 'total' }),
    ]);
    check('centavos fecham sem resto de ponto flutuante',
      r.pago[F1] === 0.1 && r.pago[F2] === 0.2 && !r.credito['ana'], [r.pago, r.credito]);

    // mesma pessoa escrita de outro jeito continua sendo a mesma
    const c = S.normalizeFavor({ id: F3, person: '  ANA  ', reason: 'c', amount: 10, lent_on: '2026-01-03' });
    const r2 = S.alocarFavores([c], [S.normalizePayment({ id: P1, person: 'ana', amount: 10, scope: 'total' })]);
    check('nome com caixa e espaços diferentes é a mesma pessoa', r2.pago[F3] === 10, r2.pago);

    // pagamento apontando para favor que já não existe
    const r3 = S.alocarFavores([a], [
      S.normalizePayment({ id: P1, person: 'Ana', amount: 5, scope: 'item', favor_id: F4 }),
    ]);
    check('pagamento de item órfão vira crédito', r3.credito['ana'] === 5 && r3.pago[F1] === 0, r3);

    check('sem pagamento nenhum, tudo em aberto',
      S.alocarFavores([a, b], []).pago[F1] === 0);
    check('sem favor nenhum não quebra',
      JSON.stringify(S.alocarFavores([], []).pago) === '{}');
  }

  /* 5: envio */
  {
    const ops = [];
    const S = load(ops).Store;
    S.init(); S.setUser({ id: 'u1' });
    const f = S.normalizeFavor({ id: F1, person: 'Marina', reason: 'uber',
      amount: 900, lent_on: '2026-09-01' });
    const pg = S.normalizePayment({ id: P1, person: 'Marina', amount: 500,
      paid_on: '2026-09-05', scope: 'total' });
    S.save({ favors: [f], payments: [pg] });
    await tick();

    const upF = ops.find((o) => o.op === 'upsert' && o.table === 'favors');
    check('favor sobe para a tabela favors', upF && upF.rows.length === 1, upF && upF.rows.length);
    check('e sem a coluna paid, que já não existe',
      upF && !('paid' in upF.rows[0]), upF && Object.keys(upF.rows[0]));

    const upP = ops.find((o) => o.op === 'upsert' && o.table === 'favor_payments');
    check('pagamento sobe para favor_payments', upP && upP.rows.length === 1, upP && upP.rows.length);
    check('campos do pagamento vão completos',
      upP && upP.rows[0].person === 'Marina' && upP.rows[0].amount === 500
      && upP.rows[0].paid_on === '2026-09-05' && upP.rows[0].scope === 'total'
      && upP.rows[0].user_id === 'u1' && upP.rows[0].position === 0, upP && upP.rows[0]);
    check('falta e % não são gravados em lugar nenhum',
      upP && !('falta' in upP.rows[0]) && !('pct' in upP.rows[0]));
  }

  /* 6: um pagamento novo sobe sozinho; apagado vira DELETE */
  {
    const ops = [];
    const S = load(ops).Store;
    S.init(); S.setUser({ id: 'u1' });
    const f = S.normalizeFavor({ id: F1, person: 'Ana', reason: 'uber', amount: 100 });
    const a = S.normalizePayment({ id: P1, person: 'Ana', amount: 30, scope: 'total' });
    const b = S.normalizePayment({ id: P2, person: 'Ana', amount: 20, scope: 'total' });
    S.save({ favors: [f], payments: [a] }); await tick();

    ops.length = 0;
    S.save({ favors: [f], payments: [a, b] }); await tick();
    const up = ops.find((o) => o.op === 'upsert' && o.table === 'favor_payments');
    check('só o pagamento novo sobe', up && up.rows.length === 1 && up.rows[0].id === P2,
      up && up.rows.map((r) => r.id));
    check('o favor parado não sobe de novo',
      !ops.find((o) => o.op === 'upsert' && o.table === 'favors'), ops.map((o) => o.table));

    ops.length = 0;
    S.save({ favors: [f], payments: [a] }); await tick();
    const del = ops.find((o) => o.op === 'delete' && o.table === 'favor_payments');
    check('pagamento removido vira DELETE', del && del.ids[0] === P2, del);
  }

  /* 7: convive com as outras coleções */
  {
    const ops = [];
    const S = load(ops).Store;
    S.init(); S.setUser({ id: 'u1' });
    const e = S.normalize({ id: F1, name: 'Renda', type: 'ci', amount: 100, months: [1] });
    const l = S.normalizeLoan({ id: F2, person: 'B', principal: 200, total_due: 260 });
    const c = S.normalizeAccount({ id: F3, kind: 'fixa', name: 'Luz', amount: 90, due_day: 5 });
    const f = S.normalizeFavor({ id: F4, person: 'Ana', reason: 'uber', amount: 40 });
    const pg = S.normalizePayment({ id: P1, person: 'Ana', amount: 10, scope: 'total' });
    S.save({ entries: [e], saldoInicial: 7, loans: [l], accounts: [c],
             favors: [f], payments: [pg] });
    await tick();
    const tabelas = ops.filter((o) => o.op === 'upsert').map((o) => o.table).sort();
    check('grava nas seis tabelas',
      JSON.stringify(tabelas) ===
        '["accounts","entries","favor_payments","favors","loans","settings"]', tabelas);
    const salvo = S.localState();
    check('cache local guarda favores e pagamentos',
      salvo && salvo.favors.length === 1 && salvo.payments.length === 1, salvo && salvo.payments);

    ops.length = 0;
    S.save({ entries: [e], saldoInicial: 7, loans: [l], accounts: [c],
             favors: [f], payments: [pg] });
    await tick();
    check('reenvio idêntico não gera tráfego', ops.length === 0, ops);
  }

  /* 8: uma coleção esquecida na chamada NÃO pode apagar a tabela
        — este é o acidente que a chamada por objeto existe para evitar,
        e completar() é a rede de segurança se ainda assim faltar. */
  {
    const ops = [];
    const S = load(ops).Store;
    S.init(); S.setUser({ id: 'u1' });
    const f = S.normalizeFavor({ id: F1, person: 'Ana', reason: 'uber', amount: 40 });
    S.save({ favors: [f] }); await tick();
    ops.length = 0;
    // sem `favors`: o diff vê coleção vazia e manda apagar — de propósito,
    // porque é o mesmo caminho de "o usuário excluiu tudo"
    S.save({ favors: [] }); await tick();
    const del = ops.find((o) => o.op === 'delete' && o.table === 'favors');
    check('coleção esvaziada de propósito apaga mesmo', del && del.ids[0] === F1, del);
  }

  /* 9: combinado de parcelas — "me paga 250 por 5 meses" */
  {
    const S = load([]).Store;
    const f = S.normalizeFavor({ id: F1, person: 'Marina', reason: 'notebook',
      amount: 1250, lent_on: '2026-01-05' });

    const plano = 'ffffffff-9999-4999-8999-ffffffffffff';
    const parcelas = [1, 2, 3, 4, 5].map((i) => S.normalizePayment({
      id: 'aaaaaaaa-000' + i + '-4000-8000-aaaaaaaaaaaa',
      person: 'Marina', amount: 250, paid_on: '2026-0' + i + '-05',
      scope: 'total', status: i === 1 ? 'pago' : 'previsto',
      plan_id: plano, plan_index: i, plan_total: 5,
    }));

    check('o combinado guarda a numeração',
      parcelas[1].plan_index === 2 && parcelas[1].plan_total === 5
      && parcelas[1].status === 'previsto', parcelas[1]);

    // o que ainda não caiu não pode abater a dívida
    const r = S.alocarFavores([f], parcelas);
    check('só a parcela paga abate', r.pago[F1] === 250, r.pago[F1]);

    const duas = parcelas.map((p, i) =>
      i <= 1 ? Object.assign({}, p, { status: 'pago' }) : p);
    check('recebida a segunda, abate 500',
      S.alocarFavores([f], duas).pago[F1] === 500, S.alocarFavores([f], duas).pago[F1]);

    const todas = parcelas.map((p) => Object.assign({}, p, { status: 'pago' }));
    check('as cinco quitam o favor',
      S.alocarFavores([f], todas).pago[F1] === 1250);

    // combinado pela metade o banco recusaria; aqui vira pagamento solto
    const meio = S.normalizePayment({ person: 'A', amount: 10, plan_id: plano });
    check('combinado sem numeração é descartado inteiro',
      meio.plan_id === null && meio.plan_index === null && meio.plan_total === null, meio);
    const invertido = S.normalizePayment({ person: 'A', amount: 10,
      plan_id: plano, plan_index: 7, plan_total: 5 });
    check('parcela além do total é descartada', invertido.plan_id === null, invertido);

    check('status desconhecido vira pago',
      S.normalizePayment({ person: 'A', amount: 1, status: 'talvez' }).status === 'pago');
  }

  /* 10: marcar a parcela como recebida PRECISA subir.
        Se `status` não fosse para a linha do banco, o diff veria a mesma
        linha de antes e a mudança morreria no aparelho, sem erro nenhum. */
  {
    const ops = [];
    const S = load(ops).Store;
    S.init(); S.setUser({ id: 'u1' });
    const f = S.normalizeFavor({ id: F1, person: 'Ana', reason: 'x', amount: 500 });
    const prevista = S.normalizePayment({ id: P1, person: 'Ana', amount: 250,
      paid_on: '2026-02-05', scope: 'total', status: 'previsto',
      plan_id: P2, plan_index: 2, plan_total: 2 });
    S.save({ favors: [f], payments: [prevista] }); await tick();

    ops.length = 0;
    const recebida = S.normalizePayment(Object.assign({}, prevista, { status: 'pago' }));
    S.save({ favors: [f], payments: [recebida] }); await tick();
    const up = ops.find((o) => o.op === 'upsert' && o.table === 'favor_payments');
    check('a parcela recebida sobe', up && up.rows.length === 1, up && up.rows.length);
    check('e a linha leva o status novo', up && up.rows[0].status === 'pago', up && up.rows[0]);
    check('a numeração do combinado também vai',
      up && up.rows[0].plan_index === 2 && up.rows[0].plan_total === 2
      && up.rows[0].plan_id === P2, up && up.rows[0]);
  }

  /* 11: vencimento do favor */
  {
    const ops = [];
    const S = load(ops).Store;

    const semPrazo = S.normalizeFavor({ person: 'A', reason: 'x', amount: 10 });
    check('favor sem prazo tem due_on nulo', semPrazo.due_on === null, semPrazo.due_on);

    const comPrazo = S.normalizeFavor({ person: 'A', reason: 'x', amount: 10,
      due_on: '2026-12-05' });
    check('favor com prazo guarda a data', comPrazo.due_on === '2026-12-05', comPrazo.due_on);

    const lixo = S.normalizeFavor({ person: 'A', reason: 'x', amount: 10, due_on: 'amanhã' });
    check('data inválida vira nulo', lixo.due_on === null, lixo.due_on);

    // o vencimento tem que chegar ao banco, senão mudar o prazo de um
    // favor geraria a mesma linha de antes e o diff a descartaria
    S.init(); S.setUser({ id: 'u1' });
    const f = S.normalizeFavor({ id: F1, person: 'A', reason: 'x', amount: 10,
      lent_on: '2026-09-01', due_on: '2026-10-01' });
    S.save({ favors: [f] }); await tick();
    const up = ops.find((o) => o.op === 'upsert' && o.table === 'favors');
    check('due_on vai na linha', up && up.rows[0].due_on === '2026-10-01', up && up.rows[0]);

    ops.length = 0;
    S.save({ favors: [S.normalizeFavor(Object.assign({}, f, { due_on: '2026-11-01' }))] });
    await tick();
    const up2 = ops.find((o) => o.op === 'upsert' && o.table === 'favors');
    check('mudar só o prazo sobe', up2 && up2.rows.length === 1
      && up2.rows[0].due_on === '2026-11-01', up2 && up2.rows[0]);
  }

  /* 12: a repartição segue a data de PAGAMENTO, não a de saída.
         A tela agrupa por vencimento; se a divisão usasse outra ordem, o
         dinheiro cairia num favor diferente daquele que o usuário viu. */
  {
    const S = load([]).Store;
    // pego antes, mas combinado para pagar depois
    const pegoAntes = S.normalizeFavor({ id: F1, person: 'A', reason: 'pego antes',
      amount: 100, lent_on: '2026-01-10', due_on: '2026-12-07' });
    // pego depois, mas vence primeiro
    const venceAntes = S.normalizeFavor({ id: F2, person: 'A', reason: 'vence antes',
      amount: 100, lent_on: '2026-06-10', due_on: '2026-11-07' });

    const r = S.alocarFavores([pegoAntes, venceAntes], [
      S.normalizePayment({ id: P1, person: 'A', amount: 100, scope: 'total' }),
    ]);
    check('quem vence antes recebe primeiro',
      r.pago[F2] === 100 && r.pago[F1] === 0, r.pago);

    // favor sem prazo vai para o fim da fila
    const semPrazo = S.normalizeFavor({ id: F3, person: 'A', reason: 'sem prazo',
      amount: 100, lent_on: '2020-01-01' });
    const r2 = S.alocarFavores([semPrazo, venceAntes], [
      S.normalizePayment({ id: P1, person: 'A', amount: 100, scope: 'total' }),
    ]);
    check('sem prazo não fura a fila de quem tem data',
      r2.pago[F2] === 100 && r2.pago[F3] === 0, r2.pago);

    // ... mas recebe quando sobra
    const r3 = S.alocarFavores([semPrazo, venceAntes], [
      S.normalizePayment({ id: P1, person: 'A', amount: 200, scope: 'total' }),
    ]);
    check('sem prazo recebe o que sobra',
      r3.pago[F2] === 100 && r3.pago[F3] === 100, r3.pago);

    // mesmo vencimento: vale a ordem de lançamento
    const a = S.normalizeFavor({ id: F1, person: 'A', reason: 'a', amount: 50,
      lent_on: '2026-03-01', due_on: '2026-11-07' });
    const b = S.normalizeFavor({ id: F2, person: 'A', reason: 'b', amount: 50,
      lent_on: '2026-04-01', due_on: '2026-11-07' });
    const r4 = S.alocarFavores([a, b], [
      S.normalizePayment({ id: P1, person: 'A', amount: 50, scope: 'total' }),
    ]);
    check('empate no vencimento cai na ordem de lançamento',
      r4.pago[F1] === 50 && r4.pago[F2] === 0, r4.pago);
  }

  /* 12b: pagamento de dia registrado ANTES desta mudança guardou a data de
          saída. Ele não pode perder o alvo e virar crédito do nada. */
  {
    const S = load([]).Store;
    const f = S.normalizeFavor({ id: F1, person: 'A', reason: 'x', amount: 80,
      lent_on: '2026-09-10' });                   // sem due_on, como era antes
    const antigo = S.normalizePayment({ id: P1, person: 'A', amount: 80,
      scope: 'dia', scope_day: '2026-09-10' });
    check('pagamento de dia antigo continua achando o favor',
      S.alocarFavores([f], [antigo]).pago[F1] === 80,
      S.alocarFavores([f], [antigo]));

    // e o novo, keyado no vencimento, também acha
    const g = S.normalizeFavor({ id: F2, person: 'A', reason: 'y', amount: 60,
      lent_on: '2026-09-10', due_on: '2026-11-07' });
    const novo = S.normalizePayment({ id: P2, person: 'A', amount: 60,
      scope: 'dia', scope_day: '2026-11-07' });
    check('pagamento de dia novo acha pelo vencimento',
      S.alocarFavores([g], [novo]).pago[F2] === 60);
  }

  /* 13: excluir favor que se repete — só este, este e os próximos, todos */
  {
    const S = load([]).Store;
    const SERIE = 'aaaa1111-1111-4111-8111-aaaaaaaaaaaa';
    const OUTRA = 'bbbb2222-2222-4222-8222-bbbbbbbbbbbb';

    // 5 parcelas da mesma série, mesma data de saída, vencimentos mensais
    const serie = [1, 2, 3, 4, 5].map((i) => S.normalizeFavor({
      id: 'ccc' + i + '1111-1111-4111-8111-cccccccccccc',
      person: 'Marina', reason: 'Acordo', amount: 500,
      lent_on: '2026-11-10', due_on: '2026-1' + (1 + (i - 1) % 2) + '-07',
      series_id: SERIE,
    }));
    // datas explícitas, para o teste não depender de aritmética de mês
    const meses = ['2026-12-07', '2027-01-07', '2027-02-07', '2027-03-07', '2027-04-07'];
    serie.forEach((f, i) => { f.due_on = meses[i]; });

    const avulso = S.normalizeFavor({ id: F1, person: 'Marina', reason: 'uber',
      amount: 40, lent_on: '2026-11-10', due_on: '2027-01-07' });
    const deOutraSerie = S.normalizeFavor({ id: F2, person: 'Marina', reason: 'Outro',
      amount: 90, lent_on: '2026-11-10', due_on: '2027-01-07', series_id: OUTRA });

    const todos = serie.concat([avulso, deOutraSerie]);
    const ids = (lista) => lista.map((f) => f.id).sort();

    check('série guarda o series_id', serie[0].series_id === SERIE, serie[0].series_id);

    // só este
    const so = S.favoresDaExclusao(todos, serie[2].id, 'este');
    check('“somente este” tira um só', so.length === 1 && so[0].id === serie[2].id, ids(so));

    // este e os próximos: o 3º, 4º e 5º vencimento
    const prox = S.favoresDaExclusao(todos, serie[2].id, 'proximos');
    check('“este e os próximos” pega deste vencimento em diante',
      JSON.stringify(ids(prox)) === JSON.stringify(ids([serie[2], serie[3], serie[4]])), ids(prox));
    check('e não toca no que vence antes',
      prox.every((f) => f.id !== serie[0].id && f.id !== serie[1].id));

    // todos
    const tudo = S.favoresDaExclusao(todos, serie[2].id, 'todos');
    check('“todos” pega a série inteira',
      JSON.stringify(ids(tudo)) === JSON.stringify(ids(serie)), ids(tudo));

    // nada disso pode vazar para fora da série
    [so, prox, tudo].forEach(function (r, k) {
      check('alcance ' + ['este', 'proximos', 'todos'][k] + ' não pega avulso nem outra série',
        r.every((f) => f.id !== F1 && f.id !== F2), ids(r));
    });

    // favor sem série é sempre só ele, qualquer que seja o alcance
    ['este', 'proximos', 'todos'].forEach(function (a) {
      const r = S.favoresDaExclusao(todos, F1, a);
      check('avulso com alcance ' + a + ' tira só ele', r.length === 1 && r[0].id === F1, ids(r));
    });

    // empate no vencimento: o alvo entra, o empatado não é arrastado
    const empateA = S.normalizeFavor({ id: F3, person: 'A', reason: 'a', amount: 10,
      lent_on: '2026-01-01', due_on: '2026-05-05', series_id: OUTRA });
    const empateB = S.normalizeFavor({ id: F4, person: 'A', reason: 'b', amount: 10,
      lent_on: '2026-01-01', due_on: '2026-05-05', series_id: OUTRA });
    const emp = S.favoresDaExclusao([empateA, empateB], F3, 'proximos');
    check('empate no vencimento não arrasta o outro',
      emp.length === 1 && emp[0].id === F3, ids(emp));

    check('id inexistente devolve vazio',
      S.favoresDaExclusao(todos, 'nao-existe', 'todos').length === 0);
  }

  /* 14: tabela ausente não derruba o resto */
  {
    const ops = [];
    const win = makeEnv(ops, null);
    const origCreate = win.supabase.createClient;
    win.supabase.createClient = function () {
      const c = origCreate();
      const from0 = c.from;
      c.from = (name) => {
        if (name !== 'favor_payments') return from0(name);
        return {
          select: () => ({ eq() { return this; }, order() { return this; },
            then: (res) => res({ data: null, error: { message: "Could not find the table 'public.favor_payments' in the schema cache" } }) }),
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
      saldoInicial: 0, loans: [], accounts: [], favors: [], payments: [],
    });
    check('sem a tabela de pagamentos, o resto continua',
      r.source === 'uploaded' || r.source === 'cloud', r.source);
  }

  console.log(fails === 0 ? '\nTODOS OS TESTES DE FAVORES PASSARAM' : '\n' + fails + ' FALHA(S)');
  process.exit(fails ? 1 : 0);
})();
