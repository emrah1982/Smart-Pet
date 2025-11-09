import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In Docker: use container hostname, outside Docker: use localhost
const CONFIG_API = process.env.VITE_CONFIG_API || 'http://localhost:8082';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: CONFIG_API,
        changeOrigin: true
      },
      '/devices': {
        target: CONFIG_API,
        changeOrigin: true
      },
      '/auth': {
        target: CONFIG_API,
        changeOrigin: true
      }
    }
  },
  build: { outDir: 'dist' }
});
