/* Guarda o markup contra dois erros que já custaram caro:
   - id repetido (getElementById devolve o primeiro e o resto quebra em silêncio)
   - campo de formulário que não é um <input> de verdade
   - referência de ícone sem símbolo no sprite
*/
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..') + '/';
const html = fs.readFileSync(ROOT + 'index.html', 'utf8');
const app = fs.readFileSync(ROOT + 'assets/js/app.js', 'utf8');

let fails = 0;
const check = (n, c, x) => {
  if (c) console.log('  ok   ' + n);
  else { fails++; console.log('  FALHA ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); }
};

/* ── 1. nenhum id repetido ────────────────────────────── */
{
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const cont = {};
  ids.forEach((i) => { cont[i] = (cont[i] || 0) + 1; });
  const dup = Object.keys(cont).filter((i) => cont[i] > 1);
  check('nenhum id duplicado no index.html', dup.length === 0, dup);
}

/* ── 2. todo campo de dinheiro é um input ─────────────── */
{
  const m = app.match(/const CAMPOS_DINHEIRO = \[([\s\S]*?)\]/);
  check('a lista CAMPOS_DINHEIRO existe', !!m);
  if (m) {
    const campos = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    const ruins = campos.filter(function (id) {
      // o id tem de pertencer a uma tag <input ...>
      const re = new RegExp('<input[^>]*\\sid="' + id + '"', 'i');
      return !re.test(html);
    });
    check('todo campo de dinheiro é um <input>', ruins.length === 0, ruins);
    check('há campos de dinheiro declarados', campos.length > 0, campos.length);
  }
}

/* ── 3. ids que o JS lê com .value existem como input ─── */
{
  const lidos = [...app.matchAll(/\$\('([a-z0-9-]+)'\)\.value/gi)].map((x) => x[1]);
  const unicos = [...new Set(lidos)];
  const ruins = unicos.filter(function (id) {
    const re = new RegExp('<(input|select|textarea)[^>]*\\sid="' + id + '"', 'i');
    return !re.test(html);
  });
  check('todo id lido com .value é campo de formulário', ruins.length === 0, ruins);
}

/* ── 4. todo ícone usado existe no sprite ─────────────── */
{
  const usados = [...html.matchAll(/use href="#(i-[a-z0-9-]+)"/g)].map((m) => m[1]);
  const noJs = [...app.matchAll(/ico\('([a-z0-9-]+)'/g)].map((m) => 'i-' + m[1]);
  const porMapa = [...app.matchAll(/(?:^|\s)(?:ico|navIco): '([a-z0-9-]+)'/gm)].map((m) => 'i-' + m[1]);
  const simbolos = [...html.matchAll(/symbol id="(i-[a-z0-9-]+)"/g)].map((m) => m[1]);
  const faltando = [...new Set(usados.concat(noJs, porMapa))].filter((i) => simbolos.indexOf(i) < 0);
  check('todo ícone referenciado existe no sprite', faltando.length === 0, faltando);
}

console.log(fails === 0 ? '\nTODOS OS TESTES DE MARKUP PASSARAM' : '\n' + fails + ' FALHA(S)');
process.exit(fails ? 1 : 0);
