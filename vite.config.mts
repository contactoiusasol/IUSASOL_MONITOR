import path from 'node:path';

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const devToken = env.VITE_IUSASOL_TOKEN || '';

  if (!devToken) {
    console.warn(
      '\n[vite] Falta VITE_IUSASOL_TOKEN en .env.local: las llamadas a la API fallaran en desarrollo.\n'
    );
  }

  // En desarrollo no existe PHP, asi que Vite replica el proxy de produccion
  // (public/api/proxy.php): toma la ruta de ?path=, la reenvia a la API real
  // y agrega el token desde .env.local. El codigo del cliente es identico
  // en desarrollo y produccion.
  const apiProxy = {
    '/api/proxy.php': {
      target: 'https://api.iusasol.mx',
      changeOrigin: true,
      headers: { Authorization: `Bearer ${devToken}` },
      rewrite: (reqPath) => {
        const url = new URL(reqPath, 'http://localhost');
        const apiPath = url.searchParams.get('path') || '';
        url.searchParams.delete('path');
        return `/v2.1/api/${apiPath}${url.search}`;
      }
    }
  };

  return {
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
      proxy: apiProxy
    },
    preview: {
      port: 3000,
      proxy: apiProxy
    }
  };
});
