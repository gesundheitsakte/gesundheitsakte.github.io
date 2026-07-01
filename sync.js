/* ═══════════════════════════════════════════════
   Familien-Gesundheitsakte — sync.js
   ───────────────────────────────────────────────
   Synchronisation mit einem selbst gehosteten PHP-Endpunkt.
   Authentifizierung via Token im URL-Parameter (kein Authorization-Header,
   damit der Browser keinen CORS-Preflight sendet).

   Teil eines klassischen Multi-Script-Setups (kein ES-Modul):
   alle Dateien teilen denselben globalen Scope. Reihenfolge der
   <script>-Tags siehe index.html.
   ═══════════════════════════════════════════════ */
'use strict';

const SYNC_CONFIG_KEY  = 'health-sync-config';
const SYNC_STATE_KEY   = 'health-sync-state';
const SYNC_BACKUPS_KEY = 'health-sync-backups';
const SYNC_MAX_BACKUPS = 10;

let _syncInProgress = false;

// ═══════════════════════════════════════════════
// KONFIGURATION — localStorage
// ═══════════════════════════════════════════════
function getSyncConfig() {
  try {
    const raw = localStorage.getItem(SYNC_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function hasSyncConfig() {
  const cfg = getSyncConfig();
  return !!(cfg && cfg.url && cfg.token);
}

function _saveSyncConfig(cfg) {
  try {
    if (cfg) localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(SYNC_CONFIG_KEY);
  } catch {}
}

// ── Sync-State (letzter ETag + Zeitstempel) ──
function getSyncState() {
  try {
    const raw = localStorage.getItem(SYNC_STATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function _saveSyncState(state) {
  try { localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(state)); } catch {}
}

// ═══════════════════════════════════════════════
// LOKALE BACKUPS — stiller Ring-Puffer (letzte 10)
// ═══════════════════════════════════════════════
function _pushBackup(jsonStr, etag) {
  try {
    const store   = JSON.parse(localStorage.getItem(SYNC_BACKUPS_KEY) || '{}');
    const backups = Array.isArray(store.backups) ? store.backups : [];
    backups.unshift({ savedAt: new Date().toISOString(), etag: etag || null, data: jsonStr });
    if (backups.length > SYNC_MAX_BACKUPS) backups.length = SYNC_MAX_BACKUPS;
    localStorage.setItem(SYNC_BACKUPS_KEY, JSON.stringify({ backups }));
  } catch {}
}

// ═══════════════════════════════════════════════
// HILFSFUNKTIONEN
// ═══════════════════════════════════════════════
function _syncUrl(cfg, extra = {}) {
  const params = new URLSearchParams({ token: cfg.token, ...extra });
  return cfg.url + '?' + params.toString();
}

function _setSyncSpinner(active) {
  const btn  = document.getElementById('topbar-sync-btn');
  const icon = btn?.querySelector('.sync-icon');
  if (icon) icon.classList.toggle('syncing', active);
  if (btn)  btn.disabled = active;
}

// ═══════════════════════════════════════════════
// DOWNLOAD — Serverdaten in die App laden
// ═══════════════════════════════════════════════
async function _applyDownload(serverText, serverETag) {
  const state = getSyncState();
  if (DATA) _pushBackup(JSON.stringify(DATA), state.lastETag);

  const result = await parseImportedFile(serverText, 'Server');
  if (!result) return false;

  const errors = validateDatabase(result.db);
  if (errors.length) { showToast('Serverdatei ist ungültig', 'error'); return false; }

  DATA = normalizeDatabase(result.db);
  CHANGE_LOG = [];
  _originalSnapshot = null;
  hasUnsavedChanges = false;
  isEncrypted = result.encrypted;
  if (result.encrypted) setSessionPassword(result.password);
  else clearSessionPassword();
  clearPersistedData();
  startApp();
  persistNow();

  _saveSyncState({ lastETag: serverETag, lastSyncAt: new Date().toISOString() });
  showToast('Datenbank vom Server aktualisiert ✓', 'success');
  return true;
}

// ═══════════════════════════════════════════════
// UPLOAD — lokale Daten zum Server schicken
// ═══════════════════════════════════════════════
async function _upload(cfg, currentETag, force = false, silent = false) {
  let body;
  if (isEncrypted) {
    let pw = getSessionPassword();
    if (!pw) {
      pw = await promptPassword({
        title:   'Passwort zum Verschlüsseln',
        message: 'Gib das Passwort ein, mit dem die Sync-Datei verschlüsselt werden soll.',
      });
      if (!pw) return false;
      setSessionPassword(pw);
    }
    try {
      const envelope = await encryptDatabase(DATA, pw);
      body = JSON.stringify(envelope);
    } catch { showToast('Verschlüsselung fehlgeschlagen', 'error'); return false; }
  } else {
    body = JSON.stringify(DATA);
  }

  const extra = {};
  if (currentETag && !force) extra.ifmatch = currentETag;

  let resp;
  try {
    // POST ohne expliziten Content-Type → Browser setzt text/plain → kein CORS-Preflight
    resp = await fetch(_syncUrl(cfg, extra), { method: 'POST', body });
  } catch { showToast('Sync fehlgeschlagen – Netzwerkfehler', 'error'); return false; }

  if (resp.status === 412) {
    showToast('Sync-Konflikt beim Hochladen – bitte erneut versuchen', 'error');
    return false;
  }
  if (resp.status !== 204 && !resp.ok) {
    showToast(`Hochladen fehlgeschlagen – Fehler ${resp.status}`, 'error');
    return false;
  }

  const newETag = resp.headers.get('ETag') || currentETag;
  _saveSyncState({ lastETag: newETag, lastSyncAt: new Date().toISOString() });
  if (!silent) showToast('Datenbank hochgeladen ✓', 'success');
  markSaved();
  return true;
}

// ═══════════════════════════════════════════════
// HAUPT-SYNC
// ═══════════════════════════════════════════════
async function syncData(opts = {}) {
  if (isDemoMode) return;

  const cfg = getSyncConfig();
  if (!cfg?.url || !cfg?.token) {
    if (!opts.silent) showToast('Kein Sync-Endpunkt konfiguriert', 'info');
    return;
  }
  if (_syncInProgress) return;

  _syncInProgress = true;
  _setSyncSpinner(true);

  try {
    const state = getSyncState();

    // 1. Serverdatei laden
    let serverResp;
    try {
      serverResp = await fetch(_syncUrl(cfg), { method: 'GET' });
    } catch {
      showToast('Sync fehlgeschlagen – Server nicht erreichbar', 'error');
      return;
    }

    if (serverResp.status === 401) { showToast('Sync fehlgeschlagen – Token ungültig', 'error'); return; }

    const serverETag = serverResp.headers.get('ETag');

    // 2. Erste Nutzung: noch keine Datei auf dem Server
    if (serverResp.status === 404) {
      await _upload(cfg, null);
      return;
    }

    if (!serverResp.ok) {
      showToast(`Sync fehlgeschlagen – Serverfehler ${serverResp.status}`, 'error');
      return;
    }

    let serverText;
    try {
      serverText = await serverResp.text();
    } catch {
      showToast('Sync fehlgeschlagen – Antwort konnte nicht gelesen werden', 'error');
      return;
    }

    // 3. Konflikt-Prüfung: ETag hat sich seit letztem Sync geändert → feldweiser Merge
    const storedETag = state.lastETag || null;
    if (storedETag && serverETag && serverETag !== storedETag) {
      const serverResult = await parseImportedFile(serverText, 'Server');
      if (!serverResult) return;

      const errors = validateDatabase(serverResult.db);
      if (errors.length) { showToast('Serverdatei ist ungültig', 'error'); return; }

      const serverDb = normalizeDatabase(serverResult.db);
      const capturedCfg        = cfg;
      const capturedServerETag = serverETag;
      const capturedStoredETag = storedETag;

      _mergePlan = computeMergePlan(DATA, serverDb);
      _mergePlan.encryptionInfo = {
        encA: isEncrypted,
        encB: serverResult.encrypted,
        pwA:  getSessionPassword(),
        pwB:  serverResult.password,
      };

      _mergeCallback = async (merged, encInfo) => {
        _syncInProgress = true;
        _setSyncSpinner(true);
        try {
          _pushBackup(JSON.stringify(DATA), capturedStoredETag);
          DATA = normalizeDatabase(merged);
          CHANGE_LOG = [];
          _originalSnapshot = null;
          hasUnsavedChanges = false;

          if (encInfo.encA || encInfo.encB) {
            isEncrypted = true;
            setSessionPassword(encInfo.pwA || encInfo.pwB || null);
          } else {
            isEncrypted = false;
            clearSessionPassword();
          }

          clearPersistedData();
          startApp();
          persistNow();

          await _upload(capturedCfg, capturedServerETag, true, true);
          showToast('Zusammengeführt und synchronisiert ✓', 'success');
        } finally {
          _syncInProgress = false;
          _setSyncSpinner(false);
        }
      };

      openMergeModal('dem Server');
      return;
    }

    // 4. Kein Konflikt: Zeitstempel vergleichen
    let serverLastModified = null;
    try {
      const parsed = JSON.parse(serverText);
      if (!parsed.encrypted) serverLastModified = parsed.lastModified || null;
    } catch {}

    const localTs  = DATA?.lastModified     ? new Date(DATA.lastModified)  : null;
    const serverTs = serverLastModified     ? new Date(serverLastModified) : null;

    if (serverTs && localTs && serverTs > localTs) {
      await _applyDownload(serverText, serverETag);
    } else if (localTs && serverTs && localTs > serverTs) {
      await _upload(cfg, storedETag);
    } else if (CHANGE_LOG.length > 0) {
      // Ausstehende lokale Änderungen — hochladen (auch wenn Timestamps nicht vergleichbar,
      // z.B. bei verschlüsselter Server-Datei)
      await _upload(cfg, storedETag);
    } else if (!storedETag) {
      // Noch nie auf diesem Gerät synchronisiert, keine lokalen Änderungen
      // → Server-Version übernehmen
      await _applyDownload(serverText, serverETag);
    } else {
      if (!opts.silent) showToast('Bereits synchron ✓', 'info');
    }

  } finally {
    _syncInProgress = false;
    _setSyncSpinner(false);
  }
}

// ═══════════════════════════════════════════════
// VERBINDUNGSTEST
// ═══════════════════════════════════════════════
async function testSyncConnection() {
  const cfg = getSyncConfig();
  if (!cfg?.url || !cfg?.token) {
    showToast('Bitte erst URL und Token speichern', 'info');
    return;
  }

  const btn  = document.getElementById('sync-test-btn');
  const orig = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = 'Teste…'; }

  try {
    const resp = await fetch(_syncUrl(cfg), { method: 'HEAD' });
    if (resp.status === 401) {
      showToast('Verbindung OK, aber Token falsch (401)', 'error');
    } else if (resp.status === 404 || resp.ok) {
      const hint = resp.status === 404 ? ' (noch keine Datei vorhanden)' : '';
      showToast(`Verbindung erfolgreich ✓${hint}`, 'success');
    } else {
      showToast(`Unerwarteter Status: ${resp.status}`, 'error');
    }
  } catch {
    showToast('Verbindung fehlgeschlagen – CORS oder Netzwerkfehler', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = orig; }
  }
}

// ═══════════════════════════════════════════════
// EINSTELLUNGEN — Speichern / Entfernen
// ═══════════════════════════════════════════════
function saveSyncSettings() {
  const url   = document.getElementById('sync-url')?.value.trim();
  const token = document.getElementById('sync-token')?.value.trim();
  if (!url)   { showToast('Bitte eine Endpunkt-URL eingeben', 'error'); return; }
  if (!token) { showToast('Bitte ein Token eingeben', 'error'); return; }
  _saveSyncConfig({ url, token });
  const syncBtn   = document.getElementById('topbar-sync-btn');
  const exportBtn = document.getElementById('topbar-export-btn');
  if (syncBtn)   syncBtn.style.display   = '';
  if (exportBtn) exportBtn.style.display = 'none';
  showToast('Sync-Einstellungen gespeichert ✓', 'success');
  renderSettings();
}

function removeSyncConfig() {
  if (!confirm('Sync-Konfiguration entfernen?')) return;
  _saveSyncConfig(null);
  _saveSyncState({});
  const syncBtn   = document.getElementById('topbar-sync-btn');
  const exportBtn = document.getElementById('topbar-export-btn');
  if (syncBtn)   syncBtn.style.display   = 'none';
  if (exportBtn) exportBtn.style.display = '';
  renderSettings();
  showToast('Sync-Konfiguration entfernt');
}

// ═══════════════════════════════════════════════
// SETTINGS-KARTE (wird von settings.js aufgerufen)
// ═══════════════════════════════════════════════
function renderSyncCard() {
  if (isDemoMode) return '';
  const cfg   = getSyncConfig();
  const state = getSyncState();
  const fmt   = iso => iso ? new Date(iso).toLocaleString('de-AT') : '—';

  const encBanner = isEncrypted
    ? `<div style="display:flex;align-items:center;gap:.5rem;color:var(--success);font-size:.875rem;margin-bottom:.75rem">
         ${_SVG_LOCK}<span style="font-weight:600">Datenbank verschlüsselt ✓</span>
       </div>`
    : `<div class="settings-warning" style="margin-bottom:.75rem">
         ⚠ Dringend empfohlen: Aktiviere zuerst die <strong>Verschlüsselung</strong>
         (Karte unten), damit deine Gesundheitsdaten nicht lesbar auf dem Server liegen.
       </div>`;

  return `
    <div class="card" style="margin-top:1rem">
      <div class="card-header"><span class="card-title">Synchronisation</span></div>
      ${encBanner}
      <div class="field-group">
        <label for="sync-url">Endpunkt-URL</label>
        <input type="url" id="sync-url" value="${escAttr(cfg?.url || '')}"
               placeholder="https://example.com/healthsync/sync.php" inputmode="url"
               onkeydown="if(event.key==='Enter')saveSyncSettings()">
      </div>
      <div class="field-group" style="margin-top:.625rem">
        <label for="sync-token">Token</label>
        <input type="password" id="sync-token" value="${escAttr(cfg?.token || '')}"
               placeholder="Geheimer Zugriffsschlüssel" autocomplete="off"
               onkeydown="if(event.key==='Enter')saveSyncSettings()">
        <p class="field-hint">Der Wert von <code>SYNC_TOKEN</code> in sync.php.</p>
      </div>
      <div style="display:flex;gap:.5rem;margin-top:.875rem;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="saveSyncSettings()">Speichern</button>
        <button class="btn btn-ghost" id="sync-test-btn" onclick="testSyncConnection()">Verbindung testen</button>
        ${cfg ? `<button class="btn btn-ghost" style="color:var(--danger)" onclick="removeSyncConfig()">Entfernen</button>` : ''}
      </div>
      ${state.lastSyncAt ? `
      <div class="db-stats" style="margin-top:1rem">
        <div class="db-stats-row">
          <span class="db-stats-label">Letzter Sync</span>
          <span class="db-stats-value">${esc(fmt(state.lastSyncAt))}</span>
        </div>
      </div>` : ''}
    </div>`;
}
