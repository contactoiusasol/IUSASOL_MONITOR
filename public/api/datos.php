<?php
/**
 * Endpoint de lectura de los archivos de datos (CSV/XLSX).
 *
 * Los archivos viven en ../datos/ y estan bloqueados para HTTP por
 * ../datos/.htaccess. Este script los sirve desde disco UNICAMENTE si la
 * peticion trae una sesion de Supabase valida (usuario logueado en la app).
 *
 * Autenticacion: el cliente envia el access_token en el encabezado
 * X-Auth-Token. El servidor lo verifica contra Supabase
 * (GET /auth/v1/user con la anon key, que es un valor publico). La
 * verificacion se cachea 5 minutos en el temporal del sistema.
 *
 * Desactivable con 'datos_auth' => false en token.config.php.
 *
 * COMPATIBLE: PHP 5.4 a 8.x (sin tipos de dato, sin ??).
 */

// --- Archivos permitidos (lista blanca) ------------------------------------
$archivos = array(
    'systems.csv' => 'text/csv; charset=utf-8',
    'MedidoresMonitoreo.csv' => 'text/csv; charset=utf-8',
    'listadoSFV.xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ListadoFacturacion.xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
);

// --- Configuracion (valores publicos; sobrescribibles en token.config.php) --
$suUrl = 'https://xfyznfdbxufrrpkeqrpe.supabase.co';
$suKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhmeXpuZmRieHVmcnJwa2VxcnBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI4ODA0MTQsImV4cCI6MjA3ODQ1NjQxNH0.SppETaRqu_9EunJtMcfvMRneyfEEJRsONv6tNfu-EvA';
$requerirAuth = true;

$cfgFile = __DIR__ . '/token.config.php';
if (is_file($cfgFile)) {
    $cfg = require $cfgFile;
    if (is_array($cfg)) {
        if (isset($cfg['supabase_url']) && $cfg['supabase_url'] !== '') {
            $suUrl = $cfg['supabase_url'];
        }
        if (isset($cfg['supabase_anon_key']) && $cfg['supabase_anon_key'] !== '') {
            $suKey = $cfg['supabase_anon_key'];
        }
        if (isset($cfg['datos_auth'])) {
            $requerirAuth = (bool) $cfg['datos_auth'];
        }
    }
}

if (!headers_sent()) {
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, no-store');
}

function datos_responder($code, $mensaje)
{
    if (!headers_sent()) {
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(array(
            'response' => array('code' => $code, 'result' => 'error', 'message' => $mensaje),
        ), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }
    exit;
}

/** Trae el token enviado por el cliente (varios formatos por compatibilidad). */
function datos_token_solicitud()
{
    if (!empty($_SERVER['HTTP_X_AUTH_TOKEN'])) {
        return trim((string) $_SERVER['HTTP_X_AUTH_TOKEN']);
    }
    if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
        $h = trim((string) $_SERVER['HTTP_AUTHORIZATION']);
        if (stripos($h, 'Bearer ') === 0) {
            return trim(substr($h, 7));
        }
        return $h;
    }
    if (function_exists('getallheaders')) {
        $headers = getallheaders();
        if (is_array($headers)) {
            foreach ($headers as $name => $value) {
                if (strcasecmp($name, 'X-Auth-Token') === 0) {
                    return trim((string) $value);
                }
                if (strcasecmp($name, 'Authorization') === 0) {
                    $v = trim((string) $value);
                    if (stripos($v, 'Bearer ') === 0) {
                        return trim(substr($v, 7));
                    }
                    return $v;
                }
            }
        }
    }
    return '';
}

/**
 * Verifica el JWT contra Supabase.
 * Devuelve true (valido), false (rechazado) o null (no se pudo verificar
 * por red: en ese caso se permite la lectura para no dejar la app caida).
 */
function datos_sesion_valida($jwt, $url, $key)
{
    // Cache de verificaciones positivas: 5 minutos.
    $cache = sys_get_temp_dir() . '/iusasol_sesion_' . sha1($jwt) . '.json';
    if (is_file($cache)) {
        $c = json_decode((string) file_get_contents($cache), true);
        if (is_array($c) && !empty($c['ok']) && isset($c['hasta']) && (int) $c['hasta'] > time()) {
            return true;
        }
    }

    if (!function_exists('curl_init') || $url === '' || $key === '') {
        error_log('[IUSASOL] datos.php sin curl o sin config de Supabase: se omite verificacion.');
        return null;
    }

    $ch = curl_init(rtrim($url, '/') . '/auth/v1/user');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
    curl_setopt($ch, CURLOPT_HTTPHEADER, array(
        'apikey: ' . $key,
        'Authorization: Bearer ' . $jwt,
        'Accept: application/json',
    ));
    $body = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $errno = curl_errno($ch);
    $err = curl_error($ch);
    curl_close($ch);

    if ($errno !== 0) {
        // Fallo de red hacia Supabase (no es un rechazo de sesion).
        error_log('[IUSASOL] datos.php no pudo contactar Supabase (' . $err . '): se permite la lectura.');
        return null;
    }

    if ($status === 200) {
        @file_put_contents($cache, json_encode(array('ok' => 1, 'hasta' => time() + 300)), LOCK_EX);
        return true;
    }

    error_log('[IUSASOL] datos.php sesion rechazada por Supabase (HTTP ' . $status . ').');
    return false;
}

/**
 * Extrae el sujeto (sub / user id) del payload de un JWT de Supabase.
 * No verifica la firma aqui: el JWT ya fue validado contra Supabase en
 * datos_sesion_valida() antes de llegar a esta funcion.
 */
function datos_jwt_sub($jwt)
{
    $partes = explode('.', $jwt);
    if (count($partes) < 2) {
        return '';
    }
    $payload = strtr($partes[1], '-_', '+/');
    $resto = strlen($payload) % 4;
    if ($resto !== 0) {
        $payload .= str_repeat('=', 4 - $resto);
    }
    $datos = json_decode(base64_decode($payload), true);
    if (!is_array($datos) || empty($datos['sub'])) {
        return '';
    }
    return (string) $datos['sub'];
}

/**
 * true solo si el usuario del JWT tiene rol 'admin' en public.user_roles.
 * Se consulta con el propio JWT (RLS: solo puede leer su propia fila).
 * FAIL-CLOSED: cualquier duda (sin red, tabla ausente, rol 'usuario')
 * devuelve false y se registra en el log.
 */
function datos_es_admin($jwt, $url, $key)
{
    $cache = sys_get_temp_dir() . '/iusasol_rol_' . sha1($jwt) . '.json';
    if (is_file($cache)) {
        $c = json_decode((string) file_get_contents($cache), true);
        if (is_array($c) && isset($c['hasta']) && (int) $c['hasta'] > time()) {
            return !empty($c['admin']);
        }
    }

    $sub = datos_jwt_sub($jwt);
    if ($sub === '' || $url === '' || $key === '' || !function_exists('curl_init')) {
        error_log('[IUSASOL] datos.php: no se pudo leer el sujeto del JWT para consultar el rol.');
        return false;
    }

    $endpoint = rtrim($url, '/')
        . '/rest/v1/user_roles?user_id=eq.' . rawurlencode($sub)
        . '&select=role&limit=1';

    $ch = curl_init($endpoint);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
    curl_setopt($ch, CURLOPT_HTTPHEADER, array(
        'apikey: ' . $key,
        'Authorization: Bearer ' . $jwt,
        'Accept: application/json',
    ));
    $body = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $errno = curl_errno($ch);
    $err = curl_error($ch);
    curl_close($ch);

    if ($errno !== 0) {
        error_log('[IUSASOL] datos.php no pudo consultar user_roles (' . $err . ').');
        return false;
    }

    $esAdmin = false;
    if ($status === 200) {
        $filas = json_decode((string) $body, true);
        if (is_array($filas)) {
            foreach ($filas as $fila) {
                if (isset($fila['role']) && $fila['role'] === 'admin') {
                    $esAdmin = true;
                    break;
                }
            }
        }
    } else {
        error_log('[IUSASOL] datos.php user_roles HTTP ' . $status . ': ' . substr((string) $body, 0, 200));
    }

    @file_put_contents(
        $cache,
        json_encode(array('admin' => $esAdmin ? 1 : 0, 'hasta' => time() + 300)),
        LOCK_EX
    );
    return $esAdmin;
}

// ===========================================================================
// Flujo principal
// ===========================================================================

$f = isset($_GET['f']) ? (string) $_GET['f'] : '';

if ($f === '' || !isset($archivos[$f])) {
    datos_responder(404, 'Archivo no encontrado.');
}

// listadoSFV.xlsx es EXCLUSIVO de administradores: ademas de la sesion
// (que se valida abajo) exige rol 'admin'. Sin auth activa no hay forma
// de comprobarlo -> se niega (fail-closed).
$requiereAdmin = ($f === 'listadoSFV.xlsx');
if ($requiereAdmin && !$requerirAuth) {
    datos_responder(403, 'Configuracion invalida: listadoSFV.xlsx requiere autenticacion activa.');
}

if ($requerirAuth) {
    $jwt = datos_token_solicitud();
    if ($jwt === '') {
        datos_responder(401, 'Sesion requerida para consultar los datos.');
    }
    $estado = datos_sesion_valida($jwt, $suUrl, $suKey);
    if ($estado === false) {
        datos_responder(401, 'Sesion no valida o expirada.');
    }
    // null = no se pudo verificar por red -> se permite (ya quedo en el log).

    if ($requiereAdmin && !datos_es_admin($jwt, $suUrl, $suKey)) {
        datos_responder(403, 'Se requiere rol de administrador para consultar listadoSFV.');
    }
}

$ruta = __DIR__ . '/../datos/' . $f;
if (!is_file($ruta)) {
    datos_responder(404, 'Archivo no encontrado en el servidor.');
}

$tamano = filesize($ruta);
if (!headers_sent()) {
    header('Content-Type: ' . $archivos[$f]);
    header('Content-Length: ' . $tamano);
    header('Content-Disposition: inline; filename="' . $f . '"');
}

// Limpia buffers para no truncar archivos grandes.
while (ob_get_level() > 0) {
    ob_end_clean();
}

readfile($ruta);
exit;
