import { defineConfig, loadEnv } from 'vite';
import { createApi } from './server/api.js';
import { GameManager } from './server/game.js';

export default defineConfig(({ mode }) => {
  const adminPassword = process.env.ADMIN_PASSWORD || loadEnv(mode, process.cwd(), 'ADMIN_').ADMIN_PASSWORD || '';
  return {
    server: { host: '0.0.0.0' },
    preview: { host: '0.0.0.0' },
    plugins: [{
      name: 'dfs-multiplayer',
      configureServer(server) {
        const manager = new GameManager(); server.middlewares.use(createApi(manager, { adminPassword }));
        server.httpServer?.on('close', () => manager.dispose());
      },
      configurePreviewServer(server) {
        const manager = new GameManager(); server.middlewares.use(createApi(manager, { adminPassword }));
        server.httpServer?.on('close', () => manager.dispose());
      },
    }],
  };
});
