import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi } from './api.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const root = fileURLToPath(new URL('../dist/', import.meta.url));
if (!existsSync(resolve(root, 'index.html'))) { console.error('Execute npm run build antes de npm start.'); process.exit(1); }
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const api = createApi();
const server = createServer((req, res) => api(req, res, () => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname); } catch { res.writeHead(400); res.end(); return; }
  const target = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!target.startsWith(root.endsWith(sep) ? root : root + sep) || !existsSync(target) || !statSync(target).isFile()) { res.writeHead(404); res.end('Não encontrado'); return; }
  res.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream', 'Cache-Control': extname(target) === '.html' ? 'no-cache' : 'public, max-age=3600' });
  createReadStream(target).pipe(res);
}));
const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => console.log(`Competição DFS em http://localhost:${port}. Use o endereço de rede exibido na sala para conectar os celulares.`));
