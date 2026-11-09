import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, preview } from 'vite';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

for (const mode of ['dev', 'preview']) {
  test(`Vite ${mode} cria sala e aceita participante pela API integrada`, async t => {
    const options = { root, logLevel: 'silent', server: { host: '127.0.0.1', port: 0 }, preview: { host: '127.0.0.1', port: 0 } };
    let instance;
    if (mode === 'preview') {
      const output = await mkdtemp(join(tmpdir(), 'dfs-preview-test-'));
      t.after(() => rm(output, { recursive: true, force: true }));
      await writeFile(join(output, 'index.html'), '<!doctype html><title>Teste</title>');
      instance = await preview({ ...options, build: { outDir: output } });
    } else {
      instance = await createServer(options);
      await instance.listen();
    }
    t.after(async () => {
      instance.httpServer.closeAllConnections();
      if (mode === 'dev') await instance.close();
      else await new Promise(resolve => instance.httpServer.close(resolve));
    });
    const origin = `http://127.0.0.1:${instance.httpServer.address().port}`;
    const created = await fetch(origin + '/api/rooms', { method: 'POST' });
    assert.equal(created.status, 201);
    assert.match(created.headers.get('content-type'), /application\/json/);
    const host = await created.json();
    const joined = await fetch(`${origin}/api/rooms/${host.code}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Participante de teste' }) });
    assert.equal(joined.status, 201);
    const player = await joined.json();
    const state = await fetch(`${origin}/api/rooms/${host.code}/state`, { headers: { Authorization: `Bearer ${player.token}` } });
    assert.equal((await state.json()).players.length, 1);
  });
}
