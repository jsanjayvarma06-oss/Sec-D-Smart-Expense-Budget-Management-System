import process from 'node:process';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// The dev server proxies /api to Express so the browser sees one origin and the
// SameSite=Strict session cookie is sent with every API call.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': env.API_PROXY_TARGET || 'http://localhost:4000',
      },
    },
  };
});