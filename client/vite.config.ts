import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, 'VITE_');

  return {
    plugins: [react()],
    envDir: root,
    server: {
      host: '127.0.0.1',
      port: 8088,
      strictPort: true,
      proxy: {
        '/api': { target: env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:3001' },
      },
    },
    preview: {
      host: '127.0.0.1',
      port: 8088,
      strictPort: true,
    },
  };
});
