/* Regressão do motor de cálculo — mv() e calc().
 *
 * São porte fiel do simulator.html original, e três comportamentos
 * parecem bug de propósito (veja o CLAUDE.md). Sem teste, a chance de
 * alguém "corrigi-los" de boa-fé é alta.
 *
 * Antes isto morava numa nota do CLAUDE.md, ancorada nos dados de
 * exemplo que ficavam no código — e o número dependia também do mês em
 * que se rodasse. Aqui a janela de 12 meses é fixada, então o resultado
 * é o mesmo em qualquer dia.
 *
 * O código é extraído do app.js e rodado numa VM: app.js é uma IIFE de
 * navegador, não exporta nada, e não vale partir o arquivo só por causa
 * do teste.
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..') + '/';
const app = fs.readFileSync(ROOT + 'assets/js/app.js', 'utf8');

/* ── extrai o bloco de cálculo ───────────────────────── */
const INI = '  /** Janela rolante de 12 meses a partir do mês corrente. */';
const FIM = '  /* ══════════════════════════════════════════════════════\n     FAVORES';
const i = app.indexOf(INI);
const f = app.indexOf(FIM);
if (i < 0 || f < 0) {
  console.log('  FALHA não achei o bloco de cálculo no app.js');
  console.log('        (os marcadores mudaram? veja INI/FIM neste arquivo)');
  process.exit(1);
}
const fonte = app.slice(i, f).replace('const uid = () => window.Store.newId();', '');

let fails = 0;
const check = (n, c, x) => { if (c) console.log('  ok   ' + n);
  else { fails++; console.log('  FALHA ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };

/**
 * Roda o motor com uma janela fixa, começando em setembro.
 * `entries` e `saldoInicial` são as duas variáveis que calc() lê do
 * escopo de cima no app.js.
 */
function motor(entries, saldoInicial, mesInicial) {
  const ctx = { entries: entries, saldoInicial: saldoInicial, window: {}, Math: Math, Number: Number, Array: Array };
  vm.createContext(ctx);
  vm.runInContext(fonte, ctx);
  // congela a janela: sem isto o resultado mudaria a cada mês do ano
  const inicio = (mesInicial === undefined ? 9 : mesInicial) - 1;
  ctx.get12M = function () {
    const out = [];
    for (let k = 0; k < 12; k++) {
      const idx = (inicio + k) % 12;
      out.push({ m: idx + 1, y: 2026 + Math.floor((inicio + k) / 12) });
    }
    return out;
  };
  vm.runInContext('var __rows = calc();', ctx);
  return ctx.__rows;
}

const E = (o) => Object.assign({ hidden: false, months: [] }, o);

(function () {

  /* 1: os três comportamentos que parecem bug e são intencionais */
  {
    // fs pula o primeiro mês da janela E ignora a lista de meses
    const rows = motor([E({ type: 'fs', amount: 100, months: [1] })], 0);
    check('fs não entra no 1º mês da janela', rows[0].out === 0, rows[0].out);
    check('fs entra do 2º mês em diante', rows[1].out === 100 && rows[11].out === 100,
      [rows[1].out, rows[11].out]);
    check('fs ignora a lista de meses',
      rows.slice(1).every(function (r) { return r.out === 100; }),
      rows.map(function (r) { return r.out; }));

    // poupança SOMA no saldo, não subtrai
    check('poupança soma no líquido', rows[1].netP === 100, rows[1].netP);

    // inLP é somado e nunca usado: o cenário pessimista trata renda
    // incerta como zero
    const inc = motor([E({ type: 'ui', min_amount: 500, max_amount: 900, months: [9] })], 0);
    check('inLP acumula o piso', inc[0].inLP === 500, inc[0].inLP);
    check('mas o pessimista ignora a renda incerta', inc[0].netP === 0, inc[0].netP);
    check('o otimista usa o teto', inc[0].netO === 900, inc[0].netO);

    // may_not_occur zera o piso
    const talvez = motor([E({ type: 'ui', min_amount: 500, max_amount: 900,
      may_not_occur: true, months: [9] })], 0);
    check('may_not_occur zera o piso', talvez[0].inLP === 0, talvez[0].inLP);
    check('e não mexe no teto', talvez[0].netO === 900, talvez[0].netO);
  }

  /* 2: onde cada tipo entra */
  {
    const so = motor([E({ type: 'os', amount: 70, months: [9] })], 0);
    check('os entra na poupança', so[0].out === 70 && so[0].inC === 0, [so[0].out, so[0].inC]);

    ['ci', 'em', 'co'].forEach(function (t) {
      const r = motor([E({ type: t, amount: 40, months: [9] })], 0);
      check(t + ' entra na renda certa', r[0].inC === 40 && r[0].out === 0, [r[0].inC, r[0].out]);
    });

    const escondida = motor([E({ type: 'ci', amount: 999, months: [9], hidden: true })], 0);
    check('entrada escondida não conta', escondida[0].inC === 0, escondida[0].inC);

    const foraDoMes = motor([E({ type: 'ci', amount: 999, months: [3] })], 0);
    check('mês fora da lista não conta em setembro', foraDoMes[0].inC === 0, foraDoMes[0].inC);
    check('e conta quando o mês chega na janela', foraDoMes[6].inC === 999, foraDoMes[6].inC);
  }

  /* 3: saldo inicial e acumulado */
  {
    const rows = motor([E({ type: 'ci', amount: 100, months: [9, 10, 11] })], 250);
    check('saldo inicial entra só no 1º mês',
      rows[0].netP === 350 && rows[1].netP === 100, [rows[0].netP, rows[1].netP]);
    check('cumP acumula mês a mês',
      rows[0].cumP === 350 && rows[1].cumP === 450 && rows[2].cumP === 550,
      [rows[0].cumP, rows[1].cumP, rows[2].cumP]);
    check('cumP para de crescer sem entradas', rows[11].cumP === 550, rows[11].cumP);
  }

  /* 4: regressão de conjunto.
        Mistura os seis tipos; qualquer mudança no motor move estes dois
        números. Eles não têm significado próprio — servem de âncora. */
  {
    const conjunto = [
      E({ type: 'co', amount: 2997, months: [11] }),
      E({ type: 'co', amount: 2997, months: [4] }),
      E({ type: 'ci', amount: 1250, months: [1, 2, 3, 4, 5, 6, 7, 10, 11, 12] }),
      E({ type: 'ui', min_amount: 0, max_amount: 5000, may_not_occur: true, months: [12] }),
      E({ type: 'ci', amount: 5000, months: [11] }),
      E({ type: 'ui', min_amount: 0, max_amount: 4400, months: [10] }),
      E({ type: 'em', amount: 600, months: [12] }),
      E({ type: 'em', amount: 250, months: [9, 10, 11, 12] }),
      E({ type: 'os', amount: 4100, months: [12] }),
      E({ type: 'ui', min_amount: 583.9, max_amount: 803.9, months: [9] }),
      E({ type: 'em', amount: 1690, months: [9] }),
      E({ type: 'em', amount: 200, months: [9] }),
      E({ type: 'em', amount: 520, months: [9] }),
      E({ type: 'ci', amount: 179, months: [9] }),
      E({ type: 'ci', amount: 250, months: [9, 10, 11] }),
      E({ type: 'ci', amount: 224.5, months: [9] }),
    ];
    const rows = motor(conjunto, 1933.71);
    const cumP = Math.round(rows[11].cumP * 100) / 100;
    const cumO = Math.round(rows[11].cumO * 100) / 100;
    check('regressão: cumP = 34691.21', cumP === 34691.21, cumP);
    check('regressão: cumO = 44895.11', cumO === 44895.11, cumO);
  }

  /* 5: sem nada lançado, o motor não quebra — é o estado de quem
        acabou de criar a conta, agora que não há mais dados de exemplo */
  {
    const vazio = motor([], 0);
    check('12 meses mesmo sem entradas', vazio.length === 12, vazio.length);
    check('tudo zero, nada de NaN',
      vazio.every(function (r) {
        return r.out === 0 && r.inC === 0 && r.netP === 0 && r.cumP === 0
          && r.netO === 0 && r.cumO === 0;
      }), vazio[0]);

    const soSaldo = motor([], 500);
    check('só saldo inicial acumula sem sumir',
      soSaldo[0].cumP === 500 && soSaldo[11].cumP === 500,
      [soSaldo[0].cumP, soSaldo[11].cumP]);
  }

  console.log(fails === 0 ? '\nTODOS OS TESTES DE CÁLCULO PASSARAM' : '\n' + fails + ' FALHA(S)');
  process.exit(fails ? 1 : 0);
})();
