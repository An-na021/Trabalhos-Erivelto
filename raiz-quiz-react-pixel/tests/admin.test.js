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
