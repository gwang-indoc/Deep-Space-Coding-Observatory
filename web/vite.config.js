import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // three.js core alone minifies to ~680 kB and cannot be split further.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Keep the large, rarely-changing 3D libraries in their own chunks so the
        // app chunk stays small and browsers can cache vendor code across rebuilds.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/three\//.test(id)) return 'three';
          if (/node_modules\/(@react-three|postprocessing|three-stdlib|maath)\//.test(id)) return 'three-react';
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
          return undefined;
        },
      },
    },
  },
  server: {
    proxy: {
      '/events': 'http://localhost:4321',
      '/event': 'http://localhost:4321',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.js'],
  },
});
