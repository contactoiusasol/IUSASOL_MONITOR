import { supabase } from './supabase';

/**
 * Descarga un archivo de datos (CSV/XLSX) desde /api/datos.php.
 *
 * Los archivos viven en /datos/ en el servidor, bloqueados para HTTP.
 * Este helper agrega la sesion de Supabase (X-Auth-Token) para que el
 * servidor verifique que hay un usuario logueado antes de entregarlos.
 *
 * @param {string} nombre - Nombre del archivo (debe estar en la lista
 *   blanca de datos.php: systems.csv, MedidoresMonitoreo.csv,
 *   listadoSFV.xlsx, ListadoFacturacion.xlsx)
 * @returns {Promise<Response>} respuesta lista para .arrayBuffer()/.text()
 */
export async function fetchDato(nombre) {
  let token = '';
  try {
    const { data } = await supabase.auth.getSession();
    token = data?.session?.access_token || '';
  } catch {
    token = '';
  }

  const response = await fetch(`/api/datos.php?f=${encodeURIComponent(nombre)}`, {
    headers: token ? { 'X-Auth-Token': token } : {}
  });

  if (!response.ok) {
    let mensaje = '';
    try {
      const body = await response.json();
      mensaje = body?.response?.message || '';
    } catch {
      // cuerpo no JSON (por ejemplo el index de la SPA): se ignora
    }
    if (response.status === 401) {
      throw new Error(mensaje || 'Tu sesión expiró. Cierra sesión y vuelve a entrar.');
    }
    throw new Error(mensaje || `No se pudo cargar ${nombre} (HTTP ${response.status}).`);
  }

  return response;
}
