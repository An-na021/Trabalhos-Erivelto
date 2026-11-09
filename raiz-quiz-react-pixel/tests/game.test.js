import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { GameManager, answerPoints } from '../server/game.js';
import { createApi } from '../server/api.js';
import { questions } from '../src/questions.js';

const bank = [
  { id: 1, title: 'Um', prompt: 'Pergunta', options: ['A', 'B', 'C', 'D'], correct: 1, explanation: 'Correção' },
  { id: 2, title: 'Dois', prompt: 'Código', code: 'print(1)', options: ['A', 'B', 'C', 'D'], correct: 2, explanation: 'Correção' },
];
function fixture() {
  let now = 1000;
  const timers = [];
  const manager = new GameManager({ bank, now: () => now, schedule: callback => { timers.push(callback); return callback; }, cancel: () => {} });
  const host = manager.create();
  const ana = manager.join(host.code, 'Ana');
  const bia = manager.join(host.code, 'Bia');
  return { manager, host, ana, bia, timers, advance: ms => { now += ms; } };
}

test('Sala valida nomes, duplicatas, código e credenciais', () => {
  const { manager: m, host } = fixture();
  assert.match(host.code, /^\d{6}$/);
  assert.throws(() => m.join(host.code, ' ana '), /já está/);
  assert.throws(() => m.join(host.code, 'A'), /2 e 24/);
  assert.throws(() => m.snapshot(host.code, 'token falso'), /não é válida/);
  assert.throws(() => m.join('000000', 'Teste'), /não encontrada/);
});

test('Só apresentador inicia e avança; cada participante tem uma resposta', () => {
  const { manager: m, host, ana, bia } = fixture();
  assert.throws(() => m.command(host.code, ana.token, 'start'), /apresentador/);
  m.command(host.code, host.token, 'start');
  assert.throws(() => m.join(host.code, 'Caio'), /já começou/);
  assert.throws(() => m.command(host.code, host.token, 'next'), /correção/);
  assert.throws(() => m.answer(host.code, host.token, 1, 1), /apresentador/);
  assert.throws(() => m.answer(host.code, ana.token, 99, 1), /já mudou/);
  assert.throws(() => m.answer(host.code, ana.token, 1, 9), /válida/);
  m.answer(host.code, ana.token, 1, 1);
  assert.throws(() => m.answer(host.code, ana.token, 1, 1), /já foi registrada/);
  assert.equal(m.snapshot(host.code, host.token).phase, 'question');
  m.answer(host.code, bia.token, 1, 0);
  assert.equal(m.snapshot(host.code, host.token).phase, 'reveal');
});

test('Servidor aplica 45s e 60s, encerra o prazo e recusa resposta atrasada', () => {
  const { manager: m, host, ana, advance, timers } = fixture();
  m.command(host.code, host.token, 'start');
  assert.equal(m.snapshot(host.code, ana.token).duration, 45000);
  advance(45000);
  assert.throws(() => m.answer(host.code, ana.token, 1, 1), /tempo/);
  assert.equal(m.snapshot(host.code, ana.token).me.score, 0);
  m.command(host.code, host.token, 'next');
  assert.equal(m.snapshot(host.code, ana.token).duration, 60000);
  advance(60000); timers.at(-1)();
  assert.equal(m.snapshot(host.code, ana.token).phase, 'reveal');
  m.command(host.code, host.token, 'next');
  assert.equal(m.snapshot(host.code, host.token).phase, 'finished');
});

test('Gabarito, pontos da rodada e ranking ficam ocultos até a correção', () => {
  const { manager: m, host, ana, bia } = fixture();
  m.command(host.code, host.token, 'start');
  let view = m.answer(host.code, ana.token, 1, 1);
  assert.equal(view.question.correct, undefined);
  assert.equal(view.question.explanation, undefined);
  assert.deepEqual(view.ranking, []);
  assert.equal(view.me.points, null);
  assert.equal(view.me.score, 0);
  assert.equal(view.me.answered, true);
  assert.equal(JSON.stringify(view).includes(ana.token), false);
  m.answer(host.code, bia.token, 1, 0);
  view = m.snapshot(host.code, ana.token);
  assert.equal(view.question.correct, 1);
  assert.equal(view.me.points, 1000);
  assert.deepEqual(view.distribution, [1, 1, 0, 0]);
});

test('Acertos rápidos pontuam mais; classificação acumula as rodadas', () => {
  assert.equal(answerPoints(false, 0, 45000), 0);
  assert.equal(answerPoints(true, 0, 45000), 1000);
  assert.equal(answerPoints(true, 22500, 45000), 750);
  const { manager: m, host, ana, bia, advance } = fixture();
  m.command(host.code, host.token, 'start');
  advance(1000); m.answer(host.code, bia.token, 1, 1);
  advance(10000); m.answer(host.code, ana.token, 1, 1);
  let view = m.snapshot(host.code, host.token);
  assert.equal(view.ranking[0].name, 'Bia');
  m.command(host.code, host.token, 'next');
  m.answer(host.code, ana.token, 2, 2); m.answer(host.code, bia.token, 2, 0);
  m.command(host.code, host.token, 'next');
  view = m.snapshot(host.code, host.token);
  assert.equal(view.ranking[0].name, 'Ana');
  assert.equal(view.ranking[0].correct, 2);
});

test('Assinantes recebem atualizações; reconexão mantém resposta e pontos', () => {
  const { manager: m, host, ana, bia } = fixture();
  const events = [];
  const unsubscribe = m.subscribe(host.code, ana.token, state => events.push(state));
  m.command(host.code, host.token, 'start'); m.answer(host.code, ana.token, 1, 1);
  assert.equal(events.at(-1).me.answered, true);
  assert.equal(m.snapshot(host.code, ana.token).me.choice, 1);
  unsubscribe(); const length = events.length;
  m.answer(host.code, bia.token, 1, 1);
  assert.equal(events.length, length);
  assert.equal(m.snapshot(host.code, ana.token).me.score, 1000);
});

test('Partida completa com 15 perguntas produz pódio com três participantes reais', () => {
  let now = 0;
  const manager = new GameManager({ now: () => now, schedule: () => null, cancel: () => {} });
  const host = manager.create();
  const players = ['Ana', 'Bia', 'Caio'].map(name => manager.join(host.code, name));
  manager.command(host.code, host.token, 'start');
  for (const q of questions) {
    for (let i = 0; i < players.length; i++) {
      now += 1000;
      manager.answer(host.code, players[i].token, q.id, i === 2 ? (q.correct + 1) % 4 : q.correct);
    }
    manager.command(host.code, host.token, 'next');
  }
  const result = manager.snapshot(host.code, host.token);
  assert.equal(result.phase, 'finished');
  assert.equal(result.total, 15);
  assert.deepEqual(result.ranking.map(p => p.name), ['Ana', 'Bia', 'Caio']);
  assert.deepEqual(result.ranking.map(p => p.correct), [15, 15, 0]);
  assert.equal(result.ranking[2].score, 0);
  manager.dispose();
});

test('HTTP permite criar/entrar/controlar/responder e transmite eventos ao vivo', async t => {
  const manager = new GameManager({ bank });
  const server = createServer(createApi(manager, { adminPassword: 'senha-admin-de-teste' }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { manager.dispose(); server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const post = async (path, body, token) => {
    const res = await fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const { body: admin } = await post('/api/admin/login', { password: 'senha-admin-de-teste' });
  const { body: host } = await post('/api/rooms', {}, admin.token);
  const { body: player } = await post(`/api/rooms/${host.code}/join`, { name: 'Jogador' });
  const controller = new AbortController();
  const stream = await fetch(`${origin}/api/rooms/${host.code}/events?token=${player.token}`, { signal: controller.signal });
  assert.match(stream.headers.get('content-type'), /text\/event-stream/);
  const reader = stream.body.getReader();
  const event = new TextDecoder().decode((await reader.read()).value);
  assert.ok(event.includes('"phase":"lobby"'));
  await reader.cancel(); controller.abort();
  const denied = await post(`/api/rooms/${host.code}/command`, { action: 'start' }, player.token);
  assert.equal(denied.status, 403);
  await post(`/api/rooms/${host.code}/command`, { action: 'start' }, host.token);
  const response = await post(`/api/rooms/${host.code}/answer`, { questionId: 1, choice: 1 }, player.token);
  assert.equal(response.body.phase, 'reveal');
  assert.ok(response.body.me.points >= 500);
});

test('Publicação aceita origem autorizada, preflight, SSE e convite público', async t => {
  const manager = new GameManager({ bank });
  const site = 'https://quiz-dfs.vercel.app';
  const server = createServer(createApi(manager, { allowedOrigins: [site], publicSiteUrl: site, adminPassword: 'senha-admin-de-teste' }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { manager.dispose(); server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const health = await fetch(origin + '/api/health');
  assert.deepEqual(await health.json(), { ok: true });
  const preflight = await fetch(origin + '/api/rooms', { method: 'OPTIONS', headers: { Origin: site, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,authorization' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), site);
  assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/);
  const blocked = await fetch(origin + '/api/rooms', { method: 'POST', headers: { Origin: 'https://outro-site.example' } });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.headers.get('access-control-allow-origin'), null);
  const login = await fetch(origin + '/api/admin/login', { method: 'POST', headers: { Origin: site, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'senha-admin-de-teste' }) });
  const admin = await login.json();
  const created = await fetch(origin + '/api/rooms', { method: 'POST', headers: { Origin: site, Authorization: `Bearer ${admin.token}` } });
  assert.equal(created.status, 201);
  const host = await created.json();
  const network = await fetch(origin + '/api/network', { headers: { Origin: site } });
  assert.deepEqual((await network.json()).addresses, [site]);
  const controller = new AbortController();
  const stream = await fetch(`${origin}/api/rooms/${host.code}/events?token=${host.token}`, { headers: { Origin: site }, signal: controller.signal });
  assert.equal(stream.headers.get('access-control-allow-origin'), site);
  const reader = stream.body.getReader();
  assert.match(new TextDecoder().decode((await reader.read()).value), /"phase":"lobby"/);
  await reader.cancel(); controller.abort();
});
