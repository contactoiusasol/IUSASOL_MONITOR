<?php
/**
 * Plantilla de configuracion del token. Copia este archivo como
 * token.config.php y coloca tus credenciales reales.
 * token.config.php esta excluido de git y se niega con 403 si se abre
 * directamente.
 */

// Se abre directamente (no via require desde proxy.php) -> 403.
if (
    isset($_SERVER['SCRIPT_FILENAME'])
    && realpath($_SERVER['SCRIPT_FILENAME']) !== false
    && realpath($_SERVER['SCRIPT_FILENAME']) === realpath(__FILE__)
) {
    http_response_code(403);
    exit;
}

return [
    'access_token' => 'PEGA_AQUI_TU_TOKEN_DE_IUSASOL',

    // OAuth2 (opcional, cuando AYAMS entregue credenciales):
    'client_id' => '',
    'client_secret' => '',
    'company_key' => '',
    'refresh_token' => '',
];
