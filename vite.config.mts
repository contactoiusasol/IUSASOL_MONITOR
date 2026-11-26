import fs from 'node:fs';

import path from 'node:path';

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo/preview no hay PHP: Vite replica public/api/datos.php
// leyendo el archivo de public/datos/ directamente del disco.
// La sesion NO se valida (es local), pero el rol admin de listadoSFV.xlsx
// SI: se verifica contra Supabase igual que en produccion.
const DATOS_TIPOS = {
  'systems.csv': 'text/csv; charset=utf-8',
  'MedidoresMonitoreo.csv': 'text/csv; charset=utf-8',
  'listadoSFV.xlsx':
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'ListadoFacturacion.xlsx':
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

function responderJson(res, code, message) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ response: { code, result: 'error', message } }));
}

/** true solo si el JWT pertenece a un usuario con rol 'admin' en Supabase. */
async function devEsAdmin(env, jwt) {
  try {
    const parte = jwt.split('.')[1] || '';
    const base64 = parte.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
    if (!payload.sub) return false;

    const url =
      `${env.VITE_SUPABASE_URL}/rest/v1/user_roles` +
      `?user_id=eq.${encodeURIComponent(payload.sub)}&select=role&limit=1`;
    const r = await fetch(url, {
      headers: {
        apikey: env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/json'
      }
    });
    if (!r.ok) return false;
    const filas = await r.json();
    return Array.isArray(filas) && filas.some((f) => f?.role === 'admin');
  } catch {
    return false;
  }
}

function datosDevMiddleware(env) {
  return async (req, res, next) => {
    const url = (req.url || '').split('?')[0];
    if (url !== '/api/datos.php') return next();

    try {
      const query = new URL(req.url || '', 'http://localhost').searchParams;
      const nombre = query.get('f') || '';
      const tipo = DATOS_TIPOS[nombre];

      if (!tipo) {
        responderJson(res, 404, 'Archivo no encontrado.');
        return;
      }

      // listadoSFV.xlsx: solo administradores (igual que en produccion)
      if (nombre === 'listadoSFV.xlsx') {
        const jwt = req.headers['x-auth-token'] || '';
        if (!jwt || !(await devEsAdmin(env, jwt))) {
          responderJson(
            res,
            403,
            'Se requiere rol de administrador para consultar listadoSFV.'
          );
          return;
        }
      }

      const archivo = path.join(process.cwd(), 'public', 'datos', nombre);
      if (!fs.existsSync(archivo)) {
        responderJson(res, 404, 'Archivo no encontrado en el servidor.');
        return;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', tipo);
      fs.createReadStream(archivo).pipe(res);
    } catch (err) {
      responderJson(res, 500, 'Error interno del servidor de desarrollo.');
    }
  };
}

const datosDevPlugin = (env) => ({
  name: 'iusasol-datos-dev',
  configureServer(server) {
    server.middlewares.use(datosDevMiddleware(env));
  },
  configurePreviewServer(server) {
    server.middlewares.use(datosDevMiddleware(env));
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
    plugins: [react(), datosDevPlugin(env)],
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
