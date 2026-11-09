import { networkInterfaces } from 'node:os';
import { GameError, GameManager } from './game.js';
import { AdminAuth } from './admin.js';

async function readBody(req) {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (Buffer.byteLength(text) > 8192) throw new GameError('Requisição muito grande.', 413);
  }
  try { return JSON.parse(text || '{}'); } catch { throw new GameError('Dados inválidos.'); }
}
export function createApi(manager = new GameManager(), { allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean), publicSiteUrl = process.env.PUBLIC_SITE_URL || '', adminPassword = process.env.ADMIN_PASSWORD || '' } = {}) {
  const admins = new AdminAuth({ password: adminPassword });
  return async function api(req, res, next = () => { res.writeHead(404); res.end(); }) {
    const url = new URL(req.url, 'http://local');
    if (!url.pathname.startsWith('/api/')) return next();
    const json = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    try {
      const origin = req.headers.origin;
      const sameOrigin = origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`;
      if (origin && !sameOrigin && !allowedOrigins.includes(origin)) throw new GameError('Este endereço do site não está autorizado no servidor da competição.', 403);
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '600' });
        res.end(); return;
      }
      if (req.method === 'GET' && url.pathname === '/api/health') return json(200, { ok: true });
      const bearer = req.headers.authorization?.replace(/^Bearer /, '');
      if (req.method === 'POST' && url.pathname === '/api/admin/login') {
        const body = await readBody(req);
        return json(200, admins.login(body.password, req.socket.remoteAddress || 'unknown'));
      }
      if (req.method === 'POST' && url.pathname === '/api/admin/logout') {
        admins.logout(bearer); return json(200, { ok: true });
      }
      if (req.method === 'GET' && url.pathname === '/api/network') {
        if (publicSiteUrl) return json(200, { addresses: [new URL(publicSiteUrl).origin] });
        const port = req.socket.localPort;
        const interfaces = Object.entries(networkInterfaces()).sort(([a], [b]) => Number(/wi-?fi|wireless|wlan/i.test(b)) - Number(/wi-?fi|wireless|wlan/i.test(a)));
        const addresses = [...new Set(interfaces.flatMap(([, list]) => list).filter(n => n && n.family === 'IPv4' && !n.internal).map(n => `http://${n.address}:${port}`))];
        return json(200, { addresses });
      }
      if (req.method === 'POST' && url.pathname === '/api/rooms') {
        admins.authorize(bearer);
        return json(201, manager.create());
      }
      const match = url.pathname.match(/^\/api\/rooms\/(\d{6})\/(join|state|events|command|answer)$/);
      if (!match) throw new GameError('Rota não encontrada.', 404);
      const [, code, action] = match;
      const credential = req.headers.authorization?.replace(/^Bearer /, '') || url.searchParams.get('token');
      if (req.method === 'GET' && action === 'state') return json(200, manager.snapshot(code, credential));
      if (req.method === 'GET' && action === 'events') {
        manager.snapshot(code, credential);
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.flushHeaders?.();
        const unsubscribe = manager.subscribe(code, credential, state => res.write(`data: ${JSON.stringify(state)}\n\n`));
        const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);
        heartbeat.unref?.(); res.on('close', () => { unsubscribe(); clearInterval(heartbeat); });
        return;
      }
      if (req.method === 'POST') {
        const body = await readBody(req);
        if (action === 'join') return json(201, manager.join(code, body.name));
        if (action === 'command') return json(200, manager.command(code, credential, body.action));
        if (action === 'answer') return json(200, manager.answer(code, credential, body.questionId, body.choice));
      }
      throw new GameError('Método não permitido.', 405);
    } catch (err) {
      if (res.headersSent) { res.end(); return; }
      if (!(err instanceof GameError)) console.error(err);
      json(err.status || 500, { error: err instanceof GameError ? err.message : 'Não foi possível concluir. Tente novamente.' });
    }
  };
}
