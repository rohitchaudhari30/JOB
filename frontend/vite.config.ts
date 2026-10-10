import fs from 'fs'
import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const realCwd = fs.realpathSync(process.cwd());
if (process.cwd() !== realCwd) {
  process.chdir(realCwd);
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err: any, _req, res: any) => {
            if (err?.code === 'ECONNREFUSED' || err?.code === 'ECONNRESET') {
              if (res && typeof res.writeHead === 'function' && !res.headersSent) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ detail: 'Backend server is initializing...' }));
              }
              return;
            }
            console.error('[vite] Proxy error:', err.message);
          });
        },
      },
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err: any) => {
            if (err?.code === 'ECONNREFUSED' || err?.code === 'ECONNRESET') {
              // Silently ignore transient connection refused while backend is booting
              return;
            }
            console.error('[vite] WebSocket proxy error:', err.message);
          });
        },
      },
    },
  },
  // @ts-expect-error - Vitest configuration extensions
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
