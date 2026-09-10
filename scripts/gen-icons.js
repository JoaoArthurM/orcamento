/* Baixa os ícones da Iconoir que o app usa e gera um sprite SVG inline.
   Vendorizar (em vez do CSS via CDN) mantém os ícones funcionando offline —
   o service worker só cacheia same-origin. */
const https = require('https');
const fs = require('fs');

const VERSAO = '7.12.1';
const BASE = `https://cdn.jsdelivr.net/npm/iconoir@${VERSAO}/icons/regular/`;

const ICONES = [
  // login
  'mail', 'lock', 'eye', 'eye-closed', 'shield-check',
  // navegação
  'plus', 'nav-arrow-left', 'drag', 'nav-arrow-right', 'check',
  // cabeçalhos e ações
  'edit-pencil', 'graph-up', 'calendar', 'table-rows', 'search', 'trash',
  // tipos de entrada
  'piggy-bank', 'donate', 'safe', 'coins', 'dice-five', 'hand-cash', 'bank',
  'info-circle',
  // kpis / conta / ajustes
  'wallet', 'log-out', 'settings', 'refresh', 'repeat', 'user',
  // copiar a cobrança para mandar por mensagem
  'send-diagonal',
];

function baixar(nome) {
  return new Promise((ok, falha) => {
    https.get(BASE + nome + '.svg', (res) => {
      if (res.statusCode !== 200) { falha(new Error(nome + ' → HTTP ' + res.statusCode)); return; }
      let s = '';
      res.on('data', (d) => { s += d; });
      res.on('end', () => ok(s));
    }).on('error', falha);
  });
}

(async function () {
  const symbols = [];
  for (const nome of ICONES) {
    const svg = await baixar(nome);
    // fica só o conteúdo interno; o wrapper vira <symbol>
    const m = svg.match(/<svg[^>]*>([\s\S]*?)<\/svg>/);
    if (!m) throw new Error('sem conteúdo: ' + nome);
    let inner = m[1]
      .replace(/\s*fill="black"/g, ' fill="currentColor"')  // pontos sólidos herdam a cor
      .replace(/\r?\n\s*/g, '')
      .trim();
    symbols.push(`<symbol id="i-${nome}" viewBox="0 0 24 24">${inner}</symbol>`);
    process.stdout.write('.');
  }
  console.log('\n' + symbols.length + ' ícones');

  const sprite =
`<!-- Ícones da Iconoir (MIT) — https://iconoir.com · v${VERSAO}
     Vendorizados: só os usados pelo app, para funcionarem offline.
     Regenerar: scripts/gen-icons.js -->
<svg xmlns="http://www.w3.org/2000/svg" class="ico-sprite" aria-hidden="true" focusable="false">
${symbols.join('\n')}
</svg>`;

  const alvo = process.argv[2] || "index.html";
  let html = fs.readFileSync(alvo, "utf8");
  const ini = html.indexOf("<!-- Ícones da Iconoir");
  const fim = html.indexOf("</svg>", html.indexOf("class=\"ico-sprite\""));
  if (ini < 0 || fim < 0) throw new Error("bloco do sprite não encontrado em " + alvo);
  html = html.slice(0, ini) + sprite + html.slice(fim + 6);
  fs.writeFileSync(alvo, html);
  console.log("sprite:", (sprite.length / 1024).toFixed(1) + " KB → " + alvo);
})();
