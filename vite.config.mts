import path from 'node:path';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/',
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^~(.+)/,
        replacement: path.join(process.cwd(), 'node_modules/$1')
      },
      {
        find: /^src(.+)/,
        replacement: path.join(process.cwd(), 'src/$1')
      }
    ]
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'https://api.iusasol.mx',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/v2.1/api')
      }
    }
  },
  preview: {
    port: 3000
  }
});
