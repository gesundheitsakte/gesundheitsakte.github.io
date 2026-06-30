/* ═══════════════════════════════════════════════
   Familien-Gesundheitsakte — core.js
   ───────────────────────────────────────────────
   Fundament: globaler State, Helfer (esc/Datum/Alter), Daten-Zugriff,
      Metrik-Historie & Normbereiche, Checkup-/Target-Datenfunktionen.

   Teil eines klassischen Multi-Script-Setups (kein ES-Modul):
   alle Dateien teilen denselben globalen Scope. Reihenfolge der
   <script>-Tags siehe index.html.
   ═══════════════════════════════════════════════ */
'use strict';

// ── State ──────────────────────────────────────
let CONFIG          = null;   // aus config.js (Checkups + Standard-Metriken)
let DATA            = null;   // die geladene/erstellte Datenbank (persons, entries, customMetrics)
let currentPersonId = null;
let activeGraphKey   = null;
let activeGraphRange = 'all';

let appMode          = null;  // 'landing' | 'app'
let isDemoMode       = false; // true wenn Demo-Daten geladen
let hasUnsavedChanges = false; // für roten Punkt am Logo
let isEncrypted      = false; // true wenn die DB verschlüsselt gespeichert werden soll
                              // (Passwort liegt in crypto.js _sessionPassword)
let CHANGE_LOG       = [];    // [{ id, ts, description, before, after }] — nicht gespeicherte Änderungen

const AVATAR_COLORS = [
  '#1B3A5B','#2C6E8F','#2A9D8F','#E9A23B','#F2785C',
];


// ═══════════════════════════════════════════════
// COMBINED METRICS — Standard (config) + benutzerdefiniert (DATA)
// ═══════════════════════════════════════════════
function allMetrics() {
  const custom = (DATA?.customMetrics || []).map(m => ({ ...m, custom: true }));
  const all = [...CONFIG.metrics, ...custom];
  // Metriken mit appliesTo.gender nur für Personen des entsprechenden Geschlechts.
  const person = getPersonList().find(p => p.id === currentPersonId);
  if (!person) return all;
  return all.filter(m => {
    if (!m.appliesTo?.gender) return true;
    return m.appliesTo.gender === person.gender;
  });
}
function metricDef(key) {
  // metricDef sucht in allen Metriken (unabhängig von Person),
  // damit Werte alter Einträge immer korrekt beschriftet werden.
  const custom = (DATA?.customMetrics || []).map(m => ({ ...m, custom: true }));
  return [...CONFIG.metrics, ...custom].find(m => m.key === key);
}
// Personen kommen jetzt aus DATA statt CONFIG
function getPersonList() { return DATA?.persons || []; }
function getCheckups()    { return DATA?.checkups  || []; }

// ═══════════════════════════════════════════════
// DATEN — In-Memory + localStorage-Persistenz
// ═══════════════════════════════════════════════
function saveData() {
  DATA.lastModified = new Date().toISOString();
  markUnsaved();
}
function markUnsaved() {
  if (isDemoMode) return;
  hasUnsavedChanges = true;
  schedulePersist();
}
function markSaved() {
  // "Gespeichert" = als Datei exportiert. Der lokale Stand bleibt in
  // localStorage erhalten; nur der "ungesichert"-Indikator wird gelöscht.
  CHANGE_LOG = [];
  hasUnsavedChanges = false;
  updateUnsavedIndicator();
  if (typeof syncChangesTabVisibility === 'function') syncChangesTabVisibility();
  persistNow();
}

// ── Änderungs-Tracking ────────────────────────────
function _sortedJson(obj) {
  if (Array.isArray(obj)) return obj.map(_sortedJson);
  if (obj !== null && typeof obj === 'object')
    return Object.fromEntries(Object.keys(obj).sort().map(k => [k, _sortedJson(obj[k])]));
  return obj;
}
// Snapshot des DATA-Objekts ohne lastModified (ändert sich bei jeder saveData-Runde).
// Schlüssel werden sortiert, damit unterschiedliche Objektreihenfolgen keinen
// Scheinunterschied erzeugen.
function _dataSnapshot() {
  if (!DATA) return '';
  const { lastModified, ...rest } = DATA;
  return JSON.stringify(_sortedJson(rest));
}

// Führt eine Datenmutation durch und erfasst sie in CHANGE_LOG, wenn sie
// den JSON-Inhalt tatsächlich verändert. So werden rein formale Aufrufe
// (Zielwert auf gleichen Wert setzen etc.) nicht geloggt.
function trackChange(description, mutate) {
  const before = _dataSnapshot();
  mutate();
  const after = _dataSnapshot();
  if (before === after) return;
  CHANGE_LOG.push({ id: genId(), ts: new Date().toISOString(), description, before, after });
  hasUnsavedChanges = true;
  updateUnsavedIndicator();
  if (typeof syncChangesTabVisibility === 'function') syncChangesTabVisibility();
  schedulePersist();
}

// ── localStorage-Persistenz ───────────────────────
// Gesundheitsdaten werden als KLARTEXT in localStorage gehalten, damit die
// App nach einem Reload sofort (ohne Passwort) weiterarbeiten kann. Die
// Verschlüsselung greift bewusst nur beim Datei-Export. Auf einem geteilten
// Gerät bedeutet das: lokale Daten ruhen unverschlüsselt — bewusster
// Trade-off zugunsten der Bequemlichkeit (vom Nutzer so gewählt).
const STORAGE_KEY = 'health-db-v1';
let _persistTimer = null;

function schedulePersist() {
  if (_persistTimer) return;
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    persistNow();
  }, 600);
}

function persistNow() {
  if (_persistTimer) { clearTimeout(_persistTimer); _persistTimer = null; }
  if (isDemoMode || !DATA) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      savedAt: new Date().toISOString(),
      isEncrypted,
      hasUnsavedChanges,
      changeLog: CHANGE_LOG,
      data: DATA,
    }));
  } catch (e) {
    console.warn('Speichern in localStorage fehlgeschlagen:', e);
  }
}

function clearPersistedData() {
  if (_persistTimer) { clearTimeout(_persistTimer); _persistTimer = null; }
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

function readPersistedData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// ═══════════════════════════════════════════════
// HELFER
// ═══════════════════════════════════════════════
// HTML-Escaping — verhindert dass Namen/Notizen mit < > & " ' das
// Layout oder value="…"-Attribute zerschießen. Überall verwenden, wo
// Nutzerdaten in innerHTML / Attribute interpoliert werden.
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
const escAttr = esc; // identisch — nur als lesbarer Hinweis an value="…"

// Geschlecht menschenlesbar — 'other'/Divers wird nicht mehr fälschlich
// als "weiblich" angezeigt.
function genderLabel(g) {
  return g === 'male' ? 'männlich' : g === 'female' ? 'weiblich' : 'divers';
}

function getAge(bd) {
  const b = new Date(bd), n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() - b.getMonth() < 0 ||
     (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a;
}
function fmtDate(s) {
  if (!s) return '—';
  return new Date(s + 'T00:00:00').toLocaleDateString('de-AT',
    { day:'2-digit', month:'2-digit', year:'numeric' });
}
function fmtShort(s) {
  if (!s) return '';
  return new Date(s + 'T00:00:00').toLocaleDateString('de-AT',
    { day:'2-digit', month:'2-digit', year:'2-digit' });
}
function initials(name) { return name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2); }
function avatarColor(pid) {
  let h = 0;
  for (let i = 0; i < pid.length; i++) h = (h * 31 + pid.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function personColor(p) {
  return p.color || avatarColor(p.id);
}
const PERSON_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width:100%;height:100%;display:block;fill:var(--avatar-icon-color,var(--bg))"><path fill-rule="evenodd" d="M18.685 19.097A9.723 9.723 0 0 0 21.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 0 0 3.065 7.097A9.716 9.716 0 0 0 12 21.75a9.716 9.716 0 0 0 6.685-2.653Zm-12.54-1.285A7.486 7.486 0 0 1 12 15a7.486 7.486 0 0 1 5.855 2.812A8.224 8.224 0 0 1 12 20.25a8.224 8.224 0 0 1-5.855-2.438ZM15.75 9a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" clip-rule="evenodd"/></svg>`;
const PERSON_SMILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:100%;height:100%;display:block;color:var(--avatar-icon-color,var(--bg))"><path stroke-linecap="round" stroke-linejoin="round" d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z"/></svg>`;
const PERSON_FEMALE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width:100%;height:100%;display:block;fill:var(--avatar-icon-color,var(--bg))"><path fill-rule="evenodd" d="M18.685 19.097A9.723 9.723 0 0 0 21.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 0 0 3.065 7.097A9.716 9.716 0 0 0 12 21.75a9.716 9.716 0 0 0 6.685-2.653Zm-12.54-1.285A7.486 7.486 0 0 1 12 15a7.486 7.486 0 0 1 5.855 2.812A8.224 8.224 0 0 1 12 20.25a8.224 8.224 0 0 1-5.855-2.438ZM17 9C17 3 7 3 7 9C6.5 12 6.5 14.5 7 16.5C9 15.5 10.5 14.5 12 14.5C13.5 14.5 15 15.5 17 16.5C17.5 14.5 17.5 12 17 9Z" clip-rule="evenodd"/></svg>`;
function personAvatarContent(p) {
  if (p.avatarType === 'initials') return esc(initials(p.name));
  if (p.avatarType === 'smile')    return PERSON_SMILE_SVG;
  if (p.avatarType === 'icon-f')   return PERSON_FEMALE_SVG;
  return PERSON_ICON_SVG;
}
// Returns the AVATAR_COLORS entry with the maximum RGB distance from hex — used
// to pick a second graph line colour that contrasts well with the accent.
function pickContrastColor(hex) {
  if (!hex || hex.length < 7) return AVATAR_COLORS[AVATAR_COLORS.length - 1];
  const ar = parseInt(hex.slice(1,3), 16);
  const ag = parseInt(hex.slice(3,5), 16);
  const ab = parseInt(hex.slice(5,7), 16);
  let best = null, bestDist = -1;
  for (const c of AVATAR_COLORS) {
    if (c.toLowerCase() === hex.toLowerCase()) continue;
    const r = parseInt(c.slice(1,3), 16);
    const g = parseInt(c.slice(3,5), 16);
    const b = parseInt(c.slice(5,7), 16);
    const dist = (r-ar)**2 + (g-ag)**2 + (b-ab)**2;
    if (dist > bestDist) { bestDist = dist; best = c; }
  }
  return best ?? AVATAR_COLORS[0];
}
function genId() { return 'e_'+Date.now()+'_'+Math.random().toString(36).slice(2,6); }

function checkupApplies(c, person) {
  const r = c.appliesTo || {}, a = getAge(person.birthday);
  if (r.minAge !== undefined && a < r.minAge) return false;
  if (r.maxAge !== undefined && a > r.maxAge) return false;
  if (r.gender  !== undefined && person.gender !== r.gender) return false;
  return true;
}
function lastCheckupEntry(pid, cid) {
  return DATA.entries
    .filter(e => e.personId===pid && e.checkupId===cid)
    .sort((a,b)=>new Date(b.date)-new Date(a.date))[0] || null;
}
function checkupStatus(checkup, pid) {
  const last = lastCheckupEntry(pid, checkup.id);
  if (!last) return { status:'overdue', label:'Noch nie', dueDate: todayISO() };
  const due = new Date(last.date+'T00:00:00');
  due.setMonth(due.getMonth() + checkup.intervalMonths);
  const dueISO = due.toISOString().slice(0,10);
  const diff = Math.round((due - new Date()) / 86400000);
  if (diff < 0)  return { status:'overdue', label:`${Math.abs(diff)} Tage überfällig`, lastDate:last.date, dueDate: dueISO };
  if (diff <= 30) return { status:'warning', label:`In ${diff} Tagen fällig`,           lastDate:last.date, dueDate: dueISO };
  return               { status:'ok',      label:`Bis ${fmtShort(dueISO)}`,              lastDate:last.date, dueDate: dueISO };
}

// Heutiges Datum als YYYY-MM-DD (lokale Zeit).
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Alle Metric-Werte einer Person über alle Einträge, chronologisch.
// Sucht sowohl in e.metrics (Standard) als auch in e.customMetrics (eigene Metriken).
function metricHistory(pid, key) {
  const def = metricDef(key);
  const isBool   = def?.type === 'boolean';
  const isSelect = def?.type === 'select';

  function validValue(v) {
    if (v === undefined || v === null || v === '') return false;
    if (isBool)   return v === true || v === 'true' || v === false || v === 'false';
    if (isSelect) return typeof v === 'string' && v.length > 0;
    return !isNaN(parseFloat(v));
  }
  function parseValue(v) {
    if (isBool)   return v === true || v === 'true';
    if (isSelect) return String(v);
    return parseFloat(v);
  }

  return DATA.entries
    .filter(e => {
      if (e.personId !== pid) return false;
      const v  = e.metrics?.[key];
      if (validValue(v)) return true;
      const cv = e.customMetrics?.[key]?.value;
      return validValue(cv);
    })
    .sort((a,b)=>new Date(a.date)-new Date(b.date))
    .map(e => {
      const v  = e.metrics?.[key];
      const cv = e.customMetrics?.[key]?.value;
      const raw = validValue(v) ? v : cv;
      return { date: e.date, value: parseValue(raw) };
    });
}

// Letzter bekannter Wert eines Metrics
function lastMetricValue(pid, key) {
  const h = metricHistoryResolved(pid, key);
  return h.length ? h[h.length-1] : null;
}

// ── Berechnete Metriken ───────────────────────
// Gibt für einen computed-Metric die synthetische Zeitreihe zurück.
// Aktuell: BMI aus Gewicht + Größe.
function computedMetricHistory(pid, key) {
  if (key === 'bmi') {
    const weights = metricHistory(pid, 'weight');
    const heights = metricHistory(pid, 'height');
    if (!weights.length || !heights.length) return [];
    const allDates = [...new Set([...weights.map(d=>d.date),...heights.map(d=>d.date)])].sort();
    function lastBefore(series, date) { const f=series.filter(d=>d.date<=date); return f.length?f[f.length-1].value:null; }
    const points = [];
    for (const date of allDates) {
      const w = lastBefore(weights, date), h = lastBefore(heights, date);
      if (w && h && h > 0) { const hm=h/100; points.push({ date, value: parseFloat((w/(hm*hm)).toFixed(1)) }); }
    }
    return points;
  }

  if (key === 'whr') {
    const waists = metricHistory(pid, 'waist_circumference');
    const hips   = metricHistory(pid, 'hip_circumference');
    if (!waists.length || !hips.length) return [];
    const allDates = [...new Set([...waists.map(d=>d.date),...hips.map(d=>d.date)])].sort();
    function lastBefore(series, date) { const f=series.filter(d=>d.date<=date); return f.length?f[f.length-1].value:null; }
    const points = [];
    for (const date of allDates) {
      const w = lastBefore(waists, date), h = lastBefore(hips, date);
      if (w && h && h > 0) { points.push({ date, value: parseFloat((w/h).toFixed(2)) }); }
    }
    return points;
  }

  return [];
}

// ── Einheitlicher Zugangspunkt für Metric-History ─
// Leitet computed-Metriken an computedMetricHistory weiter.
function metricHistoryResolved(pid, key) {
  const def = metricDef(key);
  if (def?.computed) return computedMetricHistory(pid, key);
  return metricHistory(pid, key);
}

// ── Normalbereich für eine Person ermitteln ───
// Wählt die spezifischste passende Regel:
// Geschlecht+Alter > nur Alter > nur Geschlecht > catch-all
function resolveNormalRange(metricKey, personId) {
  const def = metricDef(metricKey);
  if (!def?.normalRanges?.length) return null;
  const person = getPersonList().find(p => p.id === personId);
  if (!person) return null;
  const age = getAge(person.birthday);

  // Spezifizitäts-Score: gender(+2) + minAge(+1) + maxAge(+1)
  function specificity(r) {
    const a = r.appliesTo || {};
    return (a.gender ? 2 : 0) + (a.minAge != null ? 1 : 0) + (a.maxAge != null ? 1 : 0);
  }
  function matches(r) {
    const a = r.appliesTo || {};
    if (a.gender  && a.gender !== person.gender) return false;
    if (a.minAge != null && age < a.minAge)      return false;
    if (a.maxAge != null && age > a.maxAge)      return false;
    return true;
  }
  const candidates = def.normalRanges.filter(matches);
  if (!candidates.length) return null;
  candidates.sort((a,b) => specificity(b) - specificity(a));
  return candidates[0];
}


// ═══════════════════════════════════════════════
// CHECKUPS — aus DATA.checkups
// ═══════════════════════════════════════════════

function saveCheckups(checkups) {
  DATA.checkups = checkups;
  markUnsaved();
}

// ── Zielwerte: DATA.targets = { "personId__metricKey": number } ──────────
function getTargets() { return DATA.targets || {}; }
function getTarget(pid, key) { return getTargets()[`${pid}__${key}`] ?? null; }
function setTarget(pid, key, value) {
  const normalized = typeof value === 'string' ? value.replace(',', '.') : value;
  const removing   = normalized === null || normalized === '' || isNaN(normalized);
  const label      = metricDef(key)?.label ?? key;
  const desc       = removing ? `Zielwert von "${label}" entfernt` : `Zielwert von "${label}" gesetzt`;
  trackChange(desc, () => {
    if (!DATA.targets) DATA.targets = {};
    if (removing) {
      delete DATA.targets[`${pid}__${key}`];
    } else {
      DATA.targets[`${pid}__${key}`] = parseFloat(normalized);
    }
  });
}
