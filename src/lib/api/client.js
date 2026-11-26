import axios from 'axios';

/**
 * Cliente central de la API IUSASOL.
 *
 * - En producción las peticiones van a /api/proxy.php (PHP en el servidor),
 *   donde vive el token: el JavaScript NUNCA lleva el token.
 * - En desarrollo, vite las reenvía a la API real con el token de
 *   VITE_IUSASOL_TOKEN (solo en .env.local, no se sube a git).
 *
 * Todas las respuestas validan el envelope { response: { code, message } }
 * que devuelve la API; los errores se lanzan como ApiError con mensaje
 * amigable en español.
 */

export class ApiError extends Error {
  constructor(message, { status = 0, code = null, trace = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.trace = trace;
  }
}

const client = axios.create({
  baseURL: '/api/',
  timeout: 30000,
});

client.interceptors.response.use(
  (response) => {
    const env = response.data && response.data.response;
    if (env && typeof env === 'object' && env.code !== undefined && Number(env.code) !== 200) {
      throw new ApiError(env.message || `Error de la API (código ${env.code})`, {
        status: response.status,
        code: env.code,
        trace: env.trace || null,
      });
    }
    return response;
  },
  (error) => {
    if (error instanceof ApiError) throw error;
    if (error.response) {
      const { status } = error.response;
      if (status === 401) throw new ApiError('La API rechazó la autorización (token inválido o expirado).', { status });
      if (status === 403) throw new ApiError('Acceso denegado por la API.', { status });
      if (status === 404) throw new ApiError('Endpoint no encontrado en la API.', { status });
      if (status >= 500) throw new ApiError('La API reportó un error interno.', { status });
      throw new ApiError(`Error de la API (HTTP ${status}).`, { status });
    }
    if (error.code === 'ECONNABORTED') {
      throw new ApiError('Tiempo de espera agotado al consultar la API.', { status: 0 });
    }
    throw new ApiError('Sin conexión con la API. Verifica tu red.', { status: 0 });
  }
);

/**
 * GET a un endpoint de la API vía proxy.
 * @param {string} path - Ruta relativa, p. ej. 'Reports/ISOL/Meters'
 * @param {object} [params] - Query string
 * @param {object} [opts] - { timeout } opcional en ms
 * @returns {Promise<object>} cuerpo JSON (response.code ya validado)
 */
export function apiGet(path, params = {}, opts = {}) {
  const config = { params: { path, ...params } };
  if (opts.timeout != null) config.timeout = opts.timeout;
  return client.get('proxy.php', config).then((res) => res.data);
}
