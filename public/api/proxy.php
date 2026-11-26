<?php
/**
 * Proxy de la API IUSASOL v2.1 — PUNTO UNICO DEL TOKEN.
 *
 * El JavaScript nunca ve el token: el navegador llama a
 * /api/proxy.php?path=... y este archivo agrega el encabezado
 * Authorization antes de reenviar a https://api.iusasol.mx/v2.1/api/.
 *
 * Token: lee token.config.php (mismo directorio). Si ese archivo define
 * client_id/client_secret/company_key se usa el flujo OAuth2 con
 * refresh_token (cacheado en token.cache.json); si falla, se regresa al
 * token estatico de access_token (fallback).
 *
 * Seguridad: solo GET y solo rutas de la lista blanca (anti-SSRF).
 *
 * COMPATIBILIDAD: escrito para PHP 5.4 a 8.x (sin tipos de dato, sin ??,
 * sin declare) porque el hosting puede correr una version antigua.
 */

// Algunos hostings cortan a los 30s; las 21 megas se piden en paralelo.
if (function_exists('set_time_limit')) {
    @set_time_limit(120);
}
if (function_exists('ini_set')) {
    @ini_set('max_execution_time', '120');
}

if (!headers_sent()) {
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store');
}

/** Responde JSON con el codigo HTTP indicado y termina. */
function iusasol_respond($code, $body)
{
    if (!headers_sent()) {
        http_response_code($code);
        echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }
    exit;
}

/** Responde un error con el envelope que espera la app. */
function iusasol_error($code, $message)
{
    iusasol_respond($code, array(
        'response' => array(
            'code' => $code,
            'result' => 'error',
            'message' => $message,
        ),
    ));
}

function iusasol_config_file()
{
    return __DIR__ . '/token.config.php';
}

function iusasol_cache_file()
{
    return __DIR__ . '/token.cache.json';
}

function iusasol_config()
{
    $file = iusasol_config_file();
    if (is_file($file)) {
        $config = require $file;
        if (is_array($config)) {
            return $config;
        }
    }
    return array();
}

function iusasol_oauth_configured()
{
    $c = iusasol_config();
    return !empty($c['client_id']) && !empty($c['client_secret']) && !empty($c['company_key']);
}

function iusasol_read_cache()
{
    $file = iusasol_cache_file();
    if (!is_file($file)) {
        return null;
    }
    $data = json_decode((string) file_get_contents($file), true);
    if (is_array($data) && !empty($data['access_token'])) {
        return $data;
    }
    return null;
}

function iusasol_write_cache($data)
{
    $ok = @file_put_contents(iusasol_cache_file(), json_encode($data), LOCK_EX);
    if ($ok === false) {
        error_log('[IUSASOL] No se pudo escribir token.cache.json (directorio no escribible).');
    }
}

/**
 * Devuelve el token a usar:
 * cache OAuth2 -> refresh OAuth2 -> token estatico -> variable de entorno.
 */
function iusasol_resolve_token()
{
    $c = iusasol_config();

    if (iusasol_oauth_configured()) {
        $cached = iusasol_read_cache();
        if ($cached !== null && (int) (isset($cached['expires_at']) ? $cached['expires_at'] : 0) > time() + 60) {
            return (string) $cached['access_token'];
        }
        $fresh = iusasol_refresh_token();
        if ($fresh !== null) {
            return $fresh;
        }
        // Fallback: si el flujo OAuth2 falla, se usa el token estatico.
    }

    if (!empty($c['access_token'])) {
        return (string) $c['access_token'];
    }

    $env = getenv('IUSASOL_TOKEN');
    return is_string($env) ? $env : '';
}

/**
 * POST a /OAuth2/Token. Guarda el resultado en cache y lo devuelve, o null si falla.
 */
function iusasol_refresh_token()
{
    if (!iusasol_oauth_configured()) {
        return null;
    }
    if (!function_exists('curl_init')) {
        return null;
    }

    $c = iusasol_config();
    $fields = array(
        'client_id' => (string) $c['client_id'],
        'client_secret' => (string) $c['client_secret'],
        'company_key' => (string) $c['company_key'],
    );

    $cached = iusasol_read_cache();
    $refresh = '';
    if (is_array($cached) && !empty($cached['refresh_token'])) {
        $refresh = (string) $cached['refresh_token'];
    } elseif (!empty($c['refresh_token'])) {
        $refresh = (string) $c['refresh_token'];
    }
    if ($refresh !== '') {
        $fields['grant_type'] = 'refresh_token';
        $fields['refresh_token'] = $refresh;
    }

    $ch = curl_init('https://api.iusasol.mx/v2.1/api/OAuth2/Token');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($fields));
    curl_setopt($ch, CURLOPT_TIMEOUT, 20);
    curl_setopt($ch, CURLOPT_HTTPHEADER, array('Accept: application/json'));
    $raw = curl_exec($ch);
    curl_close($ch);

    if (!is_string($raw) || $raw === '') {
        error_log('[IUSASOL] OAuth2/Token sin respuesta.');
        return null;
    }

    $resp = json_decode($raw, true);
    if (!is_array($resp) || empty($resp['access_token'])) {
        error_log('[IUSASOL] OAuth2/Token rechazado: ' . substr($raw, 0, 300));
        return null;
    }

    $expiresIn = isset($resp['expires_in']) ? (int) $resp['expires_in'] : 518400; // 6 dias
    iusasol_write_cache(array(
        'access_token' => (string) $resp['access_token'],
        'refresh_token' => (string) (isset($resp['refresh_token']) ? $resp['refresh_token'] : $refresh),
        'expires_at' => time() + max(60, $expiresIn),
    ));

    return (string) $resp['access_token'];
}

/**
 * GET a la API. Devuelve array(statusHttp, cuerpo).
 */
function iusasol_fetch($url, $token)
{
    $headers = array('Authorization: Bearer ' . $token, 'Accept: application/json');

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 60);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($body === false) {
            return iusasol_network_error($err !== '' ? $err : 'error de red');
        }
        return array($status, (string) $body);
    }

    // Respaldo sin curl.
    $ctx = stream_context_create(array(
        'http' => array(
            'method' => 'GET',
            'header' => implode("\r\n", $headers),
            'timeout' => 60,
            'ignore_errors' => true,
        ),
    ));
    $body = @file_get_contents($url, false, $ctx);
    if ($body === false) {
        return iusasol_network_error('no se pudo conectar (revisa curl o allow_url_fopen)');
    }
    $status = 0;
    $rawHeaders = isset($http_response_header) ? $http_response_header : array();
    foreach ($rawHeaders as $line) {
        if (preg_match('#^HTTP/\S+\s+(\d{3})#', $line, $m)) {
            $status = (int) $m[1];
        }
    }
    return array($status, (string) $body);
}

function iusasol_network_error($detail)
{
    return array(502, json_encode(array(
        'response' => array(
            'code' => 502,
            'result' => 'error',
            'message' => 'Sin conexion con la API IUSASOL: ' . $detail,
        ),
    ), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
}

// ===========================================================================
// Flujo principal (con captura de errores para que NUNCA quede un 500 vacio)
// ===========================================================================

try {
    $method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';
    if ($method !== 'GET') {
        iusasol_error(405, 'Metodo no permitido.');
    }

    // Diagnostico: /api/proxy.php?diag=1
    if (isset($_GET['diag'])) {
        $tokenInfo = iusasol_resolve_token();
        $cfgFile = iusasol_config_file();
        iusasol_respond(200, array(
            'diag' => array(
                'php' => PHP_VERSION,
                'curl' => function_exists('curl_init'),
                'allow_url_fopen' => (bool) ini_get('allow_url_fopen'),
                'token_configurado' => ($tokenInfo !== ''),
                'token_longitud' => strlen($tokenInfo),
                'oauth_configurado' => iusasol_oauth_configured(),
                'proxy_bytes' => (int) @filesize(__FILE__),
                'config_existe' => is_file($cfgFile),
                'config_bytes' => is_file($cfgFile) ? (int) @filesize($cfgFile) : 0,
            ),
            'response' => array('code' => 200, 'result' => 'success'),
        ));
    }

    // --- Ruta solicitada (lista blanca) -------------------------------------
    $path = isset($_GET['path']) ? trim((string) $_GET['path']) : '';
    unset($_GET['path']);

    $allowedPrefixes = array('Reports/', 'Server/', 'Farms', 'Farm/', 'ISOL/', 'Porteo/');
    $valid = $path !== ''
        && strpos($path, '..') === false
        && strpos($path, '\\') === false
        && !preg_match('#^[a-z][a-z0-9+.\-]*://#i', $path);

    if ($valid) {
        $valid = false;
        foreach ($allowedPrefixes as $prefix) {
            if (stripos($path, $prefix) === 0) {
                $valid = true;
                break;
            }
        }
    }

    if (!$valid) {
        iusasol_error(400, 'Ruta no permitida.');
    }

    // --- Token -------------------------------------------------------------
    $token = iusasol_resolve_token();
    if ($token === '') {
        iusasol_error(500, 'Token no configurado en el servidor (falta public/api/token.config.php).');
    }

    // --- Reenvio a la API ---------------------------------------------------
    $query = http_build_query($_GET);
    $target = 'https://api.iusasol.mx/v2.1/api/' . $path . ($query !== '' ? '?' . $query : '');

    $resultado = iusasol_fetch($target, $token);
    $status = $resultado[0];
    $body = $resultado[1];

    // 401 con OAuth2 configurado: se intenta refrescar una vez y reintentar.
    if ($status === 401 && iusasol_oauth_configured()) {
        $fresh = iusasol_refresh_token();
        if ($fresh !== null && $fresh !== $token) {
            $resultado = iusasol_fetch($target, $fresh);
            $status = $resultado[0];
            $body = $resultado[1];
        }
    }

    if (!headers_sent()) {
        http_response_code($status);
    }
    echo $body;
    exit;
} catch (Exception $e) {
    error_log('[IUSASOL] Error en proxy.php: ' . $e->getMessage());
    iusasol_error(500, 'Error interno del proxy (PHP ' . PHP_VERSION . '): ' . $e->getMessage());
} catch (Error $e) {
    // Error fatal de PHP 7+ (TypeError, etc.)
    error_log('[IUSASOL] Error en proxy.php: ' . $e->getMessage());
    iusasol_error(500, 'Error interno del proxy (PHP ' . PHP_VERSION . '): ' . $e->getMessage());
}
