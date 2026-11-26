<?php
/**
 * Proxy de la API IUSASOL v2.1 — PUNTO ÚNICO DEL TOKEN.
 *
 * El JavaScript nunca ve el token: el navegador llama a /api/proxy.php?path=...
 * y este archivo agrega el encabezado Authorization antes de reenviar a
 * https://api.iusasol.mx/v2.1/api/.
 *
 * Token: lee token.config.php (mismo directorio). Si ese archivo define
 * client_id/client_secret/company_key se usa el flujo OAuth2 con
 * refresh_token (se cachea en token.cache.json); si falla, se regresa al
 * token estático de access_token (fallback).
 *
 * Seguridad: solo se permiten rutas de la lista blanca (anti-SSRF) y solo GET.
 */

declare(strict_types=1);

// Algunos hosts cortan a los 30s; las 21 megas se piden en paralelo.
// (Guardados por si el host los tiene deshabilitados: llamarlos asi seria fatal.)
if (function_exists('set_time_limit')) {
    @set_time_limit(120);
}
if (function_exists('ini_set')) {
    @ini_set('max_execution_time', '120');
}

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

function iusasol_respond(int $code, array $body): void
{
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    iusasol_respond(405, ['response' => ['code' => 405, 'result' => 'error', 'message' => 'Metodo no permitido.']]);
}

// --- Ruta solicitada (lista blanca) ---------------------------------------
$path = trim((string) ($_GET['path'] ?? ''));
unset($_GET['path']);

$allowedPrefixes = ['Reports/', 'Server/', 'Farms', 'Farm/', 'ISOL/', 'Porteo/'];
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
    iusasol_respond(400, ['response' => ['code' => 400, 'result' => 'error', 'message' => 'Ruta no permitida.']]);
}

// --- Token -----------------------------------------------------------------
$token = iusasol_resolve_token();
if ($token === '') {
    iusasol_respond(500, [
        'response' => [
            'code' => 500,
            'result' => 'error',
            'message' => 'Token no configurado en el servidor (falta public/api/token.config.php).',
        ],
    ]);
}

// --- Reenvio a la API ------------------------------------------------------
$query = http_build_query($_GET);
$target = 'https://api.iusasol.mx/v2.1/api/' . $path . ($query !== '' ? '?' . $query : '');

list($status, $body) = iusasol_fetch($target, $token);

// 401 con OAuth2 configurado: se intenta refrescar una vez y reintentar.
if ($status === 401 && iusasol_oauth_configured()) {
    $fresh = iusasol_refresh_token();
    if ($fresh !== null && $fresh !== $token) {
        list($status, $body) = iusasol_fetch($target, $fresh);
    }
}

http_response_code($status);
echo $body;
exit;

// ===========================================================================
// Auxiliares
// ===========================================================================

function iusasol_config_file(): string
{
    return __DIR__ . '/token.config.php';
}

function iusasol_cache_file(): string
{
    return __DIR__ . '/token.cache.json';
}

function iusasol_config(): array
{
    $file = iusasol_config_file();
    if (is_file($file)) {
        $config = require $file;
        if (is_array($config)) {
            return $config;
        }
    }
    return [];
}

function iusasol_oauth_configured(): bool
{
    $c = iusasol_config();
    return !empty($c['client_id']) && !empty($c['client_secret']) && !empty($c['company_key']);
}

function iusasol_read_cache(): ?array
{
    $file = iusasol_cache_file();
    if (!is_file($file)) {
        return null;
    }
    $data = json_decode((string) file_get_contents($file), true);
    return is_array($data) && !empty($data['access_token']) ? $data : null;
}

function iusasol_write_cache(array $data): void
{
    $ok = @file_put_contents(iusasol_cache_file(), json_encode($data), LOCK_EX);
    if ($ok === false) {
        error_log('[IUSASOL] No se pudo escribir token.cache.json (directorio no escribible).');
    }
}

/**
 * Devuelve el token a usar: caché OAuth2 -> refresh OAuth2 -> token estatico -> variable de entorno.
 */
function iusasol_resolve_token(): string
{
    $c = iusasol_config();

    if (iusasol_oauth_configured()) {
        $cached = iusasol_read_cache();
        if ($cached !== null && (int) ($cached['expires_at'] ?? 0) > time() + 60) {
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
function iusasol_refresh_token(): ?string
{
    $c = iusasol_config();
    if (iusasol_oauth_configured() === false) {
        return null;
    }

    $fields = [
        'client_id' => (string) $c['client_id'],
        'client_secret' => (string) $c['client_secret'],
        'company_key' => (string) $c['company_key'],
    ];

    $cached = iusasol_read_cache();
    $refresh = (string) ($cached['refresh_token'] ?? ($c['refresh_token'] ?? ''));
    if ($refresh !== '') {
        $fields['grant_type'] = 'refresh_token';
        $fields['refresh_token'] = $refresh;
    }

    $ch = curl_init('https://api.iusasol.mx/v2.1/api/OAuth2/Token');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query($fields),
        CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
    ]);
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

    $expiresIn = (int) ($resp['expires_in'] ?? 518400); // por defecto 6 dias
    iusasol_write_cache([
        'access_token' => (string) $resp['access_token'],
        'refresh_token' => (string) ($resp['refresh_token'] ?? $refresh),
        'expires_at' => time() + max(60, $expiresIn),
    ]);

    return (string) $resp['access_token'];
}

/**
 * GET a la API. Devuelve [statusHttp, cuerpo].
 */
function iusasol_fetch(string $url, string $token): array
{
    $headers = ['Authorization: Bearer ' . $token, 'Accept: application/json'];

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 60,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_FOLLOWLOCATION => false,
        ]);
        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($body === false) {
            return iusasol_network_error($err !== '' ? $err : 'error de red');
        }
        return [$status, (string) $body];
    }

    // Respaldo sin curl.
    $ctx = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => implode("\r\n", $headers),
            'timeout' => 60,
            'ignore_errors' => true,
        ],
    ]);
    $body = @file_get_contents($url, false, $ctx);
    if ($body === false) {
        return iusasol_network_error('no se pudo conectar');
    }
    $status = 0;
    foreach ($http_response_header ?? [] as $line) {
        if (preg_match('#^HTTP/\S+\s+(\d{3})#', $line, $m)) {
            $status = (int) $m[1];
        }
    }
    return [$status, (string) $body];
}

function iusasol_network_error(string $detail): array
{
    return [502, json_encode([
        'response' => [
            'code' => 502,
            'result' => 'error',
            'message' => 'Sin conexion con la API IUSASOL: ' . $detail,
        ],
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)];
}
