import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
  server: {
    proxy: {
      '/events': 'http://localhost:4321',
      '/event': 'http://localhost:4321',
    },
  },
  test: {
    environment: 'jsdom',
  },
});
