<?php
/**
 * Gesundheitsakte — Sync-Endpunkt
 *
 * Auf dem Webserver ablegen (z.B. public_html/healthsync/sync.php).
 * Daneben ein Verzeichnis "data/" mit einer .htaccess-Datei anlegen,
 * die direkten Zugriff sperrt ("Deny from all").
 *
 * Authentifizierung über URL-Parameter ?token=... (kein Authorization-Header,
 * damit der Browser keinen CORS-Preflight sendet).
 *
 * Konfiguration: nur SYNC_TOKEN anpassen.
 */

const SYNC_TOKEN     = 'CHANGE_ME_REPLACE_WITH_LONG_RANDOM_STRING';
const DATA_FILE      = __DIR__ . '/data/gesundheitsakte.json';
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

// CORS — damit JS die Antwort lesen darf (kein Preflight nötig bei GET/POST ohne custom Header)
header('Access-Control-Allow-Origin: *');
header('Access-Control-Expose-Headers: ETag');

// Token prüfen
$token = $_GET['token'] ?? '';
if ($token === '' || $token !== SYNC_TOKEN) {
    http_response_code(401);
    exit;
}

function etag(): ?string {
    $f = DATA_FILE;
    return file_exists($f) ? '"' . md5(filemtime($f) . '.' . filesize($f)) . '"' : null;
}

$method = $_SERVER['REQUEST_METHOD'];
$etag   = etag();

switch ($method) {

    case 'HEAD':
    case 'GET':
        if (!file_exists(DATA_FILE)) { http_response_code(404); exit; }
        header('Content-Type: application/json; charset=utf-8');
        header('Content-Length: ' . filesize(DATA_FILE));
        if ($etag) header('ETag: ' . $etag);
        if ($method === 'HEAD') exit;
        readfile(DATA_FILE);
        break;

    case 'POST':
        // Konflikt-Prüfung: erwarteter ETag als Query-Parameter ?ifmatch=...
        $ifMatch = $_GET['ifmatch'] ?? null;
        if ($ifMatch !== null && $etag !== null && $ifMatch !== $etag) {
            http_response_code(412); // Precondition Failed
            exit;
        }

        $body = file_get_contents('php://input');

        if ($body === false || strlen($body) === 0) { http_response_code(400); exit; }
        if (strlen($body) > MAX_SIZE_BYTES)         { http_response_code(413); exit; }

        json_decode($body);
        if (json_last_error() !== JSON_ERROR_NONE)  { http_response_code(422); exit; }

        $dir = dirname(DATA_FILE);
        if (!is_dir($dir) && !mkdir($dir, 0750, true)) { http_response_code(500); exit; }
        if (file_put_contents(DATA_FILE, $body, LOCK_EX) === false) { http_response_code(500); exit; }

        if (($newEtag = etag())) header('ETag: ' . $newEtag);
        http_response_code(204);
        break;

    default:
        http_response_code(405);
        header('Allow: GET, HEAD, POST');
        break;
}
