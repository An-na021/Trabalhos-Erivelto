import test from 'node:test';
import assert from 'node:assert/strict';
import { requestApi, apiUrl } from '../src/api-client.js';

test('API e eventos usam o mesmo endereço remoto, preservando o modo local', () => {
  assert.equal(apiUrl('/api/rooms', ''), '/api/rooms');
  assert.equal(apiUrl('/api/rooms', ' https://dfs-api.onrender.com/ '), 'https://dfs-api.onrender.com/api/rooms');
  assert.equal(apiUrl('/api/rooms/123456/events?token=abc', 'https://dfs-api.onrender.com'), 'https://dfs-api.onrender.com/api/rooms/123456/events?token=abc');
});

test('Servidor antigo sem API mostra orientação em vez de erro ao interpretar JSON', async () => {
  for (const response of [
    new Response('', { status: 404 }),
    new Response('<html>Quiz estático</html>', { headers: { 'Content-Type': 'text/html' } }),
    new Response('{', { headers: { 'Content-Type': 'application/json' } }),
  ]) {
    await assert.rejects(requestApi('/api/rooms', {}, undefined, async () => response), /servidor de salas não está disponível/);
  }
});

test('Cliente preserva criação de sala, credenciais e mensagens válidas da API', async () => {
  const value = await requestApi('/api/rooms', {}, 'credencial', async (path, options) => {
    assert.equal(path, '/api/rooms');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer credencial');
    return Response.json({ code: '123456', token: 'host', role: 'host' }, { status: 201 });
  });
  assert.equal(value.code, '123456');
  await assert.rejects(requestApi('/api/rooms/123456/join', { name: 'Ana' }, undefined,
    async () => Response.json({ error: 'Esse nome já está na sala.' }, { status: 409 })), error => error.status === 409 && /nome já/.test(error.message));
});

test('Falha de rede mostra como restabelecer a conexão', async () => {
  await assert.rejects(requestApi('/api/rooms', {}, undefined, async () => { throw new TypeError('Failed to fetch'); }), /terminal da competição/);
});

test('Cliente envia exclusão com método DELETE e credencial administrativa', async () => {
  const result = await requestApi('/api/admin/rooms/123456', undefined, 'admin-token', async (path, options) => {
    assert.equal(path, '/api/admin/rooms/123456');
    assert.equal(options.method, 'DELETE');
    assert.equal(options.headers.Authorization, 'Bearer admin-token');
    assert.equal(options.body, undefined);
    return Response.json({ ok: true });
  }, 'DELETE');
  assert.equal(result.ok, true);
});
