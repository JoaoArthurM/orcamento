/* Servidor local do app estático, sem dependências externas. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const args = process.argv.slice(2);
const host = args.includes('--host') ? '0.0.0.0' : '127.0.0.1';
const portIndex = args.indexOf('--port');
const port = portIndex < 0 ? 5175 : Number(args[portIndex + 1]);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Porta inválida. Use --port seguido de um número entre 1 e 65535.');
  process.exit(1);
}
const root = path.resolve(__dirname, '..');
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
};
const publicFiles = new Set(['index.html', 'sw.js', 'manifest.webmanifest']);
const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let name;
  try { name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || 'index.html'; }
  catch { res.writeHead(400).end(); return; }
  const parts = name.split('/');
  if (name.includes('\\') || parts.some(p => p.startsWith('.')) ||
      (!publicFiles.has(name) && !(name.startsWith('assets/') && mime[path.extname(name)]))) {
    res.writeHead(404).end(); return;
  }
  const file = path.resolve(root, name);
  if (!file.startsWith(root + path.sep)) { res.writeHead(404).end(); return; }
  try {
    const body = await fs.promises.readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Length': body.length });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(404).end(); }
});
server.on('error', error => { console.error('Não foi possível iniciar o servidor:', error.message); process.exit(1); });
server.listen(port, host, () => {
  console.log(`Local: http://localhost:${port}/`);
  if (host === '0.0.0.0') {
    const addresses = new Set(Object.values(os.networkInterfaces()).flat()
      .filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address));
    for (const address of addresses) console.log(`Rede:  http://${address}:${port}/`);
  }
});
