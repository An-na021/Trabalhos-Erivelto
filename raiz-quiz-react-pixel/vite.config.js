import { defineConfig } from 'vite';
import { createApi } from './server/api.js';
import { GameManager } from './server/game.js';

export default defineConfig({
  server: { host: '0.0.0.0' },
  preview: { host: '0.0.0.0' },
  plugins: [{
    name: 'dfs-multiplayer',
    configureServer(server) {
      const manager = new GameManager(); server.middlewares.use(createApi(manager));
      server.httpServer?.on('close', () => manager.dispose());
    },
    configurePreviewServer(server) {
      const manager = new GameManager(); server.middlewares.use(createApi(manager));
      server.httpServer?.on('close', () => manager.dispose());
    },
  }],
});
