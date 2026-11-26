import fs from 'node:fs';

import path from 'node:path';

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo/preview no hay PHP: Vite replica public/api/datos.php
// leyendo el archivo de public/datos/ directamente del disco (sin sesion;
// en produccion la sesion SI se valida en el servidor).
const DATOS_TIPOS = {
  'systems.csv': 'text/csv; charset=utf-8',
  'MedidoresMonitoreo.csv': 'text/csv; charset=utf-8',
  'listadoSFV.xlsx':
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'ListadoFacturacion.xlsx':
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

function datosDevMiddleware(req, res, next) {
  const url = (req.url || '').split('?')[0];
  if (url !== '/api/datos.php') return next();

  const query = new URL(req.url || '', 'http://localhost').searchParams;
  const nombre = query.get('f') || '';
  const tipo = DATOS_TIPOS[nombre];

  if (!tipo) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        response: { code: 404, result: 'error', message: 'Archivo no encontrado.' }
      })
    );
    return;
  }

  const archivo = path.join(process.cwd(), 'public', 'datos', nombre);
  if (!fs.existsSync(archivo)) {
    res.statusCode = 404;
    res.end('Archivo no encontrado en el servidor.');
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', tipo);
  fs.createReadStream(archivo).pipe(res);
}

const datosDevPlugin = () => ({
  name: 'iusasol-datos-dev',
  configureServer(server) {
    server.middlewares.use(datosDevMiddleware);
  },
  configurePreviewServer(server) {
    server.middlewares.use(datosDevMiddleware);
  }
});

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
    plugins: [react(), datosDevPlugin()],
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
