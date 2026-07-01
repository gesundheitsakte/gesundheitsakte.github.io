/* ═══════════════════════════════════════════════
   Familien-Gesundheitsakte — crypto.js
   ───────────────────────────────────────────────
   Passwortbasierte Verschlüsselung der Datenbank-Datei.

   Verfahren:
     • Schlüsselableitung: PBKDF2 (SHA-256, 250.000 Iterationen)
     • Verschlüsselung:     AES-GCM 256 Bit (authentifiziert)

   AES-GCM ist authentifiziert — ein falsches Passwort oder eine
   manipulierte Datei führt zu einem Entschlüsselungsfehler statt zu
   stillem Datenmüll.

   Dateiformat (verschlüsselt):
     {
       "encrypted": true,
       "version": 1,
       "kdf": "PBKDF2",
       "hash": "SHA-256",
       "iterations": 250000,
       "salt": "<base64>",
       "iv":   "<base64>",
       "data": "<base64 ciphertext>"
     }

   Eine unverschlüsselte Datei hat KEIN "encrypted"-Feld → Klartext-Pfad.

   Das Session-Passwort wird im RAM gehalten (_sessionPassword) und
   für den automatischen Sync auch in localStorage persistiert.
   ═══════════════════════════════════════════════ */
'use strict';

const CRYPTO_CONFIG = {
  version: 1,
  iterations: 250000,
  hash: 'SHA-256',
  saltBytes: 16,
  ivBytes: 12,
  keyBits: 256,
};

// Passwort der aktuell geladenen verschlüsselten DB — im RAM und localStorage.
let _sessionPassword = null;
const SESSION_PW_KEY = 'health-session-pw';

function setSessionPassword(pw) {
  _sessionPassword = pw || null;
  try {
    if (_sessionPassword) localStorage.setItem(SESSION_PW_KEY, _sessionPassword);
    else                  localStorage.removeItem(SESSION_PW_KEY);
  } catch {}
}
function getSessionPassword() {
  if (_sessionPassword) return _sessionPassword;
  try {
    const stored = localStorage.getItem(SESSION_PW_KEY);
    if (stored) { _sessionPassword = stored; return stored; }
  } catch {}
  return null;
}
function clearSessionPassword() {
  _sessionPassword = null;
  try { localStorage.removeItem(SESSION_PW_KEY); } catch {}
}

// ── Base64 <-> ArrayBuffer ────────────────────────
function bufToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function base64ToBuf(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// ── Schlüsselableitung ────────────────────────────
async function deriveKey(password, salt, iterations = CRYPTO_CONFIG.iterations) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: CRYPTO_CONFIG.hash },
    baseKey,
    { name: 'AES-GCM', length: CRYPTO_CONFIG.keyBits },
    false,
    ['encrypt', 'decrypt']
  );
}

// ── Verschlüsseln ─────────────────────────────────
// Nimmt ein JS-Objekt, liefert das verschlüsselte Hüllobjekt (JSON-fähig).
async function encryptDatabase(obj, password) {
  const enc = new TextEncoder();
  const plaintext = enc.encode(JSON.stringify(obj));
  const salt = crypto.getRandomValues(new Uint8Array(CRYPTO_CONFIG.saltBytes));
  const iv   = crypto.getRandomValues(new Uint8Array(CRYPTO_CONFIG.ivBytes));
  const key  = await deriveKey(password, salt);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return {
    encrypted: true,
    version: CRYPTO_CONFIG.version,
    kdf: 'PBKDF2',
    hash: CRYPTO_CONFIG.hash,
    iterations: CRYPTO_CONFIG.iterations,
    salt: bufToBase64(salt),
    iv:   bufToBase64(iv),
    data: bufToBase64(cipher),
  };
}

// ── Entschlüsseln ─────────────────────────────────
// Nimmt das Hüllobjekt + Passwort, liefert das ursprüngliche JS-Objekt.
// Wirft bei falschem Passwort / manipulierter Datei.
async function decryptDatabase(envelope, password) {
  if (!envelope || !envelope.encrypted) {
    throw new Error('Keine verschlüsselte Datei');
  }
  const salt = new Uint8Array(base64ToBuf(envelope.salt));
  const iv   = new Uint8Array(base64ToBuf(envelope.iv));
  const data = base64ToBuf(envelope.data);
  const key  = await deriveKey(password, salt, envelope.iterations || CRYPTO_CONFIG.iterations);
  let plainBuf;
  try {
    plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  } catch (e) {
    // AES-GCM-Authentifizierung fehlgeschlagen → falsches Passwort o. Manipulation
    throw new Error('WRONG_PASSWORD');
  }
  const dec = new TextDecoder();
  return JSON.parse(dec.decode(plainBuf));
}

// Prüft, ob ein geparstes Objekt eine verschlüsselte Hülle ist.
function isEncryptedEnvelope(obj) {
  return !!(obj && obj.encrypted === true && obj.data && obj.salt && obj.iv);
}
