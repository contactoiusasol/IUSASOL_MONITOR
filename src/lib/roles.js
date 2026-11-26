import { supabase } from './supabase';

/**
 * Devuelve el rol del usuario en sesión: 'admin', 'usuario' o null (sin sesión).
 *
 * Lee public.user_roles con RLS: cada usuario solo ve su propia fila y nadie
 * puede escribir desde el navegador. Si la tabla todavía no existe o falla la
 * consulta, se asume 'usuario' (nadie queda como admin por accidente).
 *
 * @param {string} userId - id del usuario de Supabase
 * @returns {Promise<'admin'|'usuario'|null>}
 */
export async function obtenerRol(userId) {
  if (!userId) return null;

  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.warn('No se pudo leer user_roles:', error.message);
      return 'usuario';
    }

    return data?.role === 'admin' ? 'admin' : 'usuario';
  } catch (err) {
    console.warn('No se pudo leer user_roles:', err);
    return 'usuario';
  }
}
