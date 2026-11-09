import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { AdminAuth } from '../server/admin.js';
import { createApi } from '../server/api.js';
import { GameManager } from '../server/game.js';

const password = 'senha-de-admin-para-teste';

test('Administração bloqueada sem senha forte configurada', () => {
  for (const value of ['', 'curta']) {
    const auth = new AdminAuth({ password: value });
    assert.throws(() => auth.login(value, 'teste'), error => error.status === 503);
    assert.throws(() => auth.authorize('qualquer-token'), error => error.status === 503);
  }
});

test('Senha correta emite sessão temporária; logout e expiração revogam acesso', () => {
  let now = 0;
  const auth = new AdminAuth({ password, now: () => now, sessionDuration: 1000 });
  assert.throws(() => auth.login('incorreta', 'teste'), error => error.status === 401);
  const first = auth.login(password, 'teste');
  auth.authorize(first.token);
  assert.notEqual(first.token, password);
  assert.equal(first.expiresAt, 1000);
  auth.logout(first.token);
  assert.throws(() => auth.authorize(first.token), error => error.status === 401);
  const second = auth.login(password, 'teste');
  now = 1000;
  assert.throws(() => auth.authorize(second.token), error => error.status === 401);
});

test('Tentativas de senha têm limite e voltam a ser permitidas após a janela', () => {
  let now = 0;
  const auth = new AdminAuth({ password, now: () => now });
  for (let i = 0; i < 10; i++) assert.throws(() => auth.login('errada', 'origem'), error => error.status === 401);
  assert.throws(() => auth.login(password, 'origem'), error => error.status === 429);
  // Outra conexão não é bloqueada por esse contador.
  auth.authorize(auth.login(password, 'outra-origem').token);
  now = 15 * 60 * 1000;
  auth.authorize(auth.login(password, 'origem').token);
});

test('API exige admin para criar; token de sala e token de participante não dão esse acesso', async t => {
  const manager = new GameManager();
  const server = createServer(createApi(manager, { adminPassword: password }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { manager.dispose(); server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const post = async (path, body = {}, token) => {
    const response = await fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  assert.equal((await post('/api/rooms')).status, 401);
  assert.equal(manager.rooms.size, 0);
  assert.equal((await post('/api/admin/login', { password: 'errada' })).status, 401);
  const login = await post('/api/admin/login', { password });
  assert.equal(login.status, 200);
  assert.equal(JSON.stringify(login.body).includes(password), false);
  const created = await post('/api/rooms', {}, login.body.token);
  assert.equal(created.status, 201);
  const host = created.body;
  const player = await post(`/api/rooms/${host.code}/join`, { name: 'Participante' });
  assert.equal(player.status, 201);
  assert.equal((await post('/api/rooms', {}, player.body.token)).status, 401);
  assert.equal((await post('/api/rooms', {}, host.token)).status, 401);
  assert.equal((await post(`/api/rooms?token=${login.body.token}`)).status, 401);
  assert.equal((await post('/api/admin/logout', {}, login.body.token)).status, 200);
  assert.equal((await post('/api/rooms', {}, login.body.token)).status, 401);
  // A sessão de apresentador já criada continua limitada à sua sala.
  assert.equal((await post(`/api/rooms/${host.code}/command`, { action: 'start' }, host.token)).status, 200);
});

test('Servidor sem ADMIN_PASSWORD não libera criação anônima', async t => {
  const manager = new GameManager();
  const server = createServer(createApi(manager, { adminPassword: '' }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { manager.dispose(); server.closeAllConnections(); server.close(); });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/rooms`, { method: 'POST' });
  assert.equal(response.status, 503);
  assert.equal(manager.rooms.size, 0);
});

test('Somente admin lista e exclui salas; participantes conectados são avisados', async t => {
  const manager = new GameManager();
  const server = createServer(createApi(manager, { adminPassword: password, allowedOrigins: ['https://quiz.example'] }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { manager.dispose(); server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, method = 'GET', token, body) => {
    const response = await fetch(origin + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  const { body: admin } = await request('/api/admin/login', 'POST', undefined, { password });
  const { body: host } = await request('/api/rooms', 'POST', admin.token);
  const { body: player } = await request(`/api/rooms/${host.code}/join`, 'POST', undefined, { name: 'Participante' });
  for (const invalidToken of [undefined, player.token, host.token]) {
    assert.equal((await request('/api/admin/rooms', 'GET', invalidToken)).status, 401);
    assert.equal((await request(`/api/admin/rooms/${host.code}`, 'DELETE', invalidToken)).status, 401);
  }
  assert.equal(manager.rooms.size, 1);
  const list = await request('/api/admin/rooms', 'GET', admin.token);
  assert.equal(list.status, 200);
  assert.equal(list.body.rooms[0].code, host.code);
  assert.equal(list.body.rooms[0].playerCount, 1);
  assert.equal(list.body.rooms[0].phase, 'lobby');
  assert.equal(JSON.stringify(list.body).includes(host.token), false);
  assert.equal(JSON.stringify(list.body).includes(player.token), false);
  const preflight = await fetch(`${origin}/api/admin/rooms/${host.code}`, { method: 'OPTIONS', headers: { Origin: 'https://quiz.example', 'Access-Control-Request-Method': 'DELETE' } });
  assert.match(preflight.headers.get('access-control-allow-methods'), /DELETE/);
  const stream = await fetch(`${origin}/api/rooms/${host.code}/events?token=${player.token}`);
  const reader = stream.body.getReader();
  await reader.read();
  assert.equal((await request(`/api/admin/rooms/${host.code}`, 'DELETE', admin.token)).status, 200);
  let output = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    output += new TextDecoder().decode(value);
  }
  assert.match(output, /event: room-closed/);
  assert.match(output, /excluída por um administrador/);
  assert.equal(manager.listeners.has(host.code), false);
  assert.equal((await request(`/api/rooms/${host.code}/state`, 'GET', host.token)).status, 404);
  assert.equal((await request(`/api/rooms/${host.code}/join`, 'POST', undefined, { name: 'Outro' })).status, 404);
  assert.equal((await request(`/api/admin/rooms/${host.code}`, 'DELETE', admin.token)).status, 404);
  assert.deepEqual((await request('/api/admin/rooms', 'GET', admin.token)).body.rooms, []);
  await request('/api/admin/logout', 'POST', admin.token);
  assert.equal((await request('/api/admin/rooms', 'GET', admin.token)).status, 401);
});

test('Excluir sala em andamento cancela o cronômetro e não interfere em outra sala', () => {
  let timeout;
  const canceled = [];
  const manager = new GameManager({ schedule: callback => { timeout = callback; return callback; }, cancel: timer => canceled.push(timer) });
  const host = manager.create();
  const other = manager.create();
  manager.join(host.code, 'Ana');
  manager.command(host.code, host.token, 'start');
  let closed = '';
  manager.subscribe(host.code, host.token, () => {}, message => { closed = message; });
  const currentTimeout = timeout;
  manager.remove(host.code);
  assert.ok(canceled.includes(currentTimeout));
  assert.match(closed, /excluída/);
  // Um callback já enfileirado não pode ressuscitar nem publicar a sala removida.
  assert.doesNotThrow(() => currentTimeout());
  assert.equal(manager.rooms.has(host.code), false);
  assert.equal(manager.snapshot(other.code, other.token).phase, 'lobby');
  manager.dispose();
});

test('Lista apresenta fases, progresso e finalizadas; remove salas expiradas', () => {
  let now = 0;
  const bank = [{ id: 1, options: ['A', 'B'], correct: 0 }];
  const manager = new GameManager({ bank, now: () => now, schedule: () => null, cancel: () => {} });
  const first = manager.create();
  now = 1000;
  const second = manager.create();
  const player = manager.join(second.code, 'Bia');
  manager.command(second.code, second.token, 'start');
  let list = manager.list();
  assert.equal(list[0].code, second.code);
  assert.equal(list[0].phase, 'question');
  assert.equal(list[0].questionNumber, 1);
  manager.answer(second.code, player.token, 1, 0);
  assert.equal(manager.list()[0].phase, 'reveal');
  manager.command(second.code, second.token, 'next');
  assert.equal(manager.list()[0].phase, 'finished');
  now = 12 * 60 * 60 * 1000 + 1;
  list = manager.list();
  assert.equal(list.some(room => room.code === first.code), false);
  assert.equal(list.some(room => room.code === second.code), true);
  manager.dispose();
});

test('Reentrar como apresentador preserva a rodada, o cronômetro e as respostas', () => {
  let now = 0;
  let scheduled = 0;
  const manager = new GameManager({
    bank: [{ id: 1, options: ['A', 'B'], correct: 0 }], now: () => now,
    schedule: callback => { scheduled++; return callback; }, cancel: () => {},
  });
  const host = manager.create();
  const ana = manager.join(host.code, 'Ana');
  manager.join(host.code, 'Bia');
  const unsubscribe = manager.subscribe(host.code, host.token, () => {});
  manager.command(host.code, host.token, 'start');
  now = 5000;
  manager.answer(host.code, ana.token, 1, 0);
  const before = manager.snapshot(host.code, ana.token);
  const originalTimer = manager.rooms.get(host.code).timer;
  unsubscribe(); // A guia do apresentador é fechada.
  now = 10000;
  const returned = manager.resumeHost(host.code);
  assert.deepEqual(returned, host);
  const restored = manager.snapshot(host.code, returned.token);
  assert.equal(restored.role, 'host');
  assert.equal(restored.phase, 'question');
  assert.equal(restored.index, before.index);
  assert.equal(restored.deadline, before.deadline);
  assert.equal(restored.answeredCount, 1);
  assert.equal(manager.snapshot(host.code, ana.token).me.choice, 0);
  assert.deepEqual(restored.players, before.players);
  assert.equal(manager.rooms.get(host.code).timer, originalTimer);
  assert.equal(scheduled, 1);
  // Se o prazo passou enquanto a guia estava fechada, a reentrada recebe a correção.
  now = 46000;
  manager.resumeHost(host.code);
  assert.equal(manager.snapshot(host.code, returned.token).phase, 'reveal');
  assert.equal(manager.snapshot(host.code, ana.token).me.correct, 1);
  assert.ok(manager.snapshot(host.code, ana.token).me.score > 500);
  manager.command(host.code, returned.token, 'next');
  assert.equal(manager.snapshot(host.code, manager.resumeHost(host.code).token).phase, 'finished');
  manager.remove(host.code);
  assert.throws(() => manager.resumeHost(host.code), error => error.status === 404);
  manager.dispose();
});

test('Novo login de admin recupera apresentação sem a credencial da guia antiga', async t => {
  const manager = new GameManager();
  const server = createServer(createApi(manager, { adminPassword: password }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { manager.dispose(); server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, method, token, body) => {
    const response = await fetch(origin + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  const { body: firstAdmin } = await request('/api/admin/login', 'POST', undefined, { password });
  const { body: host } = await request('/api/rooms', 'POST', firstAdmin.token);
  const { body: player } = await request(`/api/rooms/${host.code}/join`, 'POST', undefined, { name: 'Ana' });
  const route = `/api/admin/rooms/${host.code}/enter`;
  for (const unauthorized of [undefined, player.token, host.token, 'falso']) {
    assert.equal((await request(route, 'POST', unauthorized)).status, 401);
  }
  // Outra guia tem somente o novo login de administrador e o código listado.
  const { body: freshAdmin } = await request('/api/admin/login', 'POST', undefined, { password });
  const list = await request('/api/admin/rooms', 'GET', freshAdmin.token);
  assert.equal(list.body.rooms[0].code, host.code);
  const restored = await request(route, 'POST', freshAdmin.token);
  assert.equal(restored.status, 200);
  assert.equal(restored.body.role, 'host');
  assert.equal(restored.body.code, host.code);
  const view = await request(`/api/rooms/${host.code}/state`, 'GET', restored.body.token);
  assert.equal(view.body.phase, 'lobby');
  assert.equal(view.body.players.length, 1);
  const start = await request(`/api/rooms/${host.code}/command`, 'POST', restored.body.token, { action: 'start' });
  assert.equal(start.status, 200);
  assert.equal(start.body.phase, 'question');
  await request('/api/admin/logout', 'POST', freshAdmin.token);
  assert.equal((await request(route, 'POST', freshAdmin.token)).status, 401);
  await request(`/api/admin/rooms/${host.code}`, 'DELETE', firstAdmin.token);
  assert.equal((await request(route, 'POST', firstAdmin.token)).status, 404);
});
