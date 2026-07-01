/* ═══════════════════════════════════════════════
   Familien-Gesundheitsakte — merge.js
   ───────────────────────────────────────────────
   Zusammenführen zweier Datenbanken (z.B. wenn zwei Personen
   ausgehend von einer Master-Datei unabhängig Änderungen gepflegt
   haben).

   Strategie:
     • Union  — alles was in mind. einer Datei existiert, bleibt
                erhalten (kein Datenverlust; Löschungen werden nicht
                propagiert).
     • Pro ID — Objekte werden über ihre stabile id verglichen.
     • Konflikt (gleiche id, abweichender Inhalt) → feldweise Auswahl
                durch den User im Modal.

   Teil des klassischen Multi-Script-Setups (gemeinsamer Scope).
   ═══════════════════════════════════════════════ */
'use strict';

// Kategorien, die per id zusammengeführt werden.
const MERGE_COLLECTIONS = ['persons', 'entries', 'checkups', 'customMetrics'];

// Menschliche Labels für die Konflikt-Anzeige.
const MERGE_LABELS = {
  persons:       'Person',
  entries:       'Eintrag',
  checkups:      'Checkup',
  customMetrics: 'Eigener Messwert',
  targets:       'Zielwert',
};

// Zwischenspeicher während eines laufenden Merge-Vorgangs.
let _mergePlan = null;

// ── Hilfen ────────────────────────────────────────
function stableStringify(v) {
  // Deterministisches JSON (Schlüssel sortiert) für inhaltlichen Vergleich.
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k)+':'+stableStringify(v[k])).join(',') + '}';
}
function deepEqual(a, b) { return stableStringify(a) === stableStringify(b); }

// Liefert ein lesbares "Label" für ein Objekt (für die Konflikt-Überschrift).
function mergeItemLabel(collection, obj, personsById) {
  if (collection === 'persons')       return obj.name || obj.id;
  if (collection === 'checkups')      return obj.name || obj.id;
  if (collection === 'customMetrics') return obj.label || obj.key || obj.id;
  if (collection === 'entries') {
    const who = personsById[obj.personId]?.name || obj.personId || '?';
    let what;
    if (obj.entryType === 'self') what = 'Eigene Messung';
    else if (obj.entryType === 'apple-health') what = 'Apple Health Import';
    else what = obj.doctor || 'Arztbesuch';
    return `${who} — ${what} (${obj.date || '?'})`;
  }
  return obj.id;
}

// id-Feld je Kategorie (customMetrics nutzt 'key', sonst 'id').
function idField(collection) { return collection === 'customMetrics' ? 'key' : 'id'; }

// ── Merge-Plan berechnen ──────────────────────────
// Gibt { merged, conflicts, stats } zurück, OHNE Konflikte aufzulösen.
// Konflikte werden mit beiden Versionen gesammelt und später vom User entschieden.
function computeMergePlan(a, b) {
  const merged = {
    version: a.version || '2.0',
    createdAt: a.createdAt || new Date().toISOString(),
    lastModified: new Date().toISOString(),
    targets: {},
    healthImports: mergeHealthImports(a.healthImports || {}, b.healthImports || {}),
    persons: [], entries: [], checkups: [], customMetrics: [],
  };
  const conflicts = [];
  const stats = { added: 0, identical: 0, conflicts: 0 };

  const personsById = {};
  [...(a.persons||[]), ...(b.persons||[])].forEach(p => { personsById[p.id] = p; });

  for (const coll of MERGE_COLLECTIONS) {
    const key = idField(coll);
    const listA = Array.isArray(a[coll]) ? a[coll] : [];
    const listB = Array.isArray(b[coll]) ? b[coll] : [];
    const mapA = new Map(listA.map(o => [o[key], o]));
    const mapB = new Map(listB.map(o => [o[key], o]));
    const allIds = new Set([...mapA.keys(), ...mapB.keys()]);

    for (const id of allIds) {
      const oa = mapA.get(id);
      const ob = mapB.get(id);

      if (oa && !ob)      { merged[coll].push(oa); stats.added++; }
      else if (!oa && ob) { merged[coll].push(ob); stats.added++; }
      else if (deepEqual(oa, ob)) { merged[coll].push(oa); stats.identical++; }
      else {
        // Konflikt: feldweise Differenz ermitteln
        const fields = diffFields(oa, ob);
        if (!fields.length) { merged[coll].push(oa); stats.identical++; continue; }
        // Platzhalter im merged einfügen; wird nach Auflösung ersetzt
        const placeholderIndex = merged[coll].push(oa) - 1;
        conflicts.push({
          collection: coll,
          id,
          label: mergeItemLabel(coll, oa, personsById),
          a: oa, b: ob,
          fields,                 // [{ path, valA, valB }]
          targetIndex: placeholderIndex,
        });
        stats.conflicts++;
      }
    }
  }

  // targets ist ein Objekt { personId: { metricKey: value } }, kein id-Array.
  mergeTargets(a.targets || {}, b.targets || {}, merged, conflicts, personsById, stats);

  return { merged, conflicts, stats };
}

// Vergleicht zwei Objekte feldweise (eine Ebene tief + verschachtelt via JSON).
function diffFields(oa, ob) {
  const keys = new Set([...Object.keys(oa||{}), ...Object.keys(ob||{})]);
  const out = [];
  for (const k of keys) {
    if (!deepEqual(oa?.[k], ob?.[k])) {
      out.push({ path: k, valA: oa?.[k], valB: ob?.[k] });
    }
  }
  return out;
}

// Import-Marker beider Dateien vereinen (Union, kein Konflikt nötig).
function mergeHealthImports(ha, hb) {
  const out = {};
  const persons = new Set([...Object.keys(ha), ...Object.keys(hb)]);
  for (const pid of persons) {
    out[pid] = { ...(ha[pid] || {}), ...(hb[pid] || {}) };
  }
  return out;
}

// targets: flaches Format { "personId__metricKey": value }
// Konflikt nur wenn beide denselben Key haben und Werte abweichen.
function mergeTargets(ta, tb, merged, conflicts, personsById, stats) {
  const allKeys = new Set([...Object.keys(ta), ...Object.keys(tb)]);
  for (const flatKey of allKeys) {
    const va = ta[flatKey], vb = tb[flatKey];
    if (va !== undefined && vb === undefined)      { merged.targets[flatKey] = va; stats.added++; }
    else if (va === undefined && vb !== undefined) { merged.targets[flatKey] = vb; stats.added++; }
    else if (va === vb)                            { merged.targets[flatKey] = va; stats.identical++; }
    else {
      merged.targets[flatKey] = va; // Platzhalter = A
      const sep = flatKey.indexOf('__');
      const pid = flatKey.slice(0, sep);
      const mk  = flatKey.slice(sep + 2);
      conflicts.push({
        collection: 'targets',
        id: flatKey,
        label: `${personsById[pid]?.name || pid} — Zielwert ${metricDef(mk)?.label || mk}`,
        fields: [{ path: mk, valA: va, valB: vb }],
        targetFlatKey: flatKey,
      });
      stats.conflicts++;
    }
  }
}

// Zwischenspeicher der beiden gewählten Dateien im Picker-Modal.
let _mergePick = { a: null, b: null };

// ── Einstieg ──────────────────────────────────────
// Von der Landing-Page: noch nichts geladen → beide Dateien im Modal wählen.
function startMergeFromLanding() {
  openMergePicker(null);
}

// Picker-Modal: ein oder zwei sichtbare Dateifelder.
// base !== null → nur Datei B wird gebraucht (laufender Betrieb).
function openMergePicker(base) {
  document.getElementById('merge-picker')?.remove();
  _mergePick = { a: base ? { db: base, name: '(aktuell geladen)', encrypted: isEncrypted, password: getSessionPassword() } : null, b: null };

  const slotA = base
    ? `<div class="merge-pick-slot is-fixed">
         <div class="merge-pick-label">Datei A</div>
         <div class="merge-pick-name">${esc('Aktuell geladene Datenbank')}</div>
       </div>`
    : `<div class="merge-pick-slot" id="merge-slot-a">
         <div class="merge-pick-label">Datei A</div>
         <label class="merge-pick-drop">
           <input type="file" accept=".json,application/json"
                  onchange="onMergeFilePicked('a', this)">
           <span class="merge-pick-cta">Erste Datei wählen…</span>
         </label>
         <div class="merge-pick-name" id="merge-name-a"></div>
       </div>`;

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'merge-picker';
  modal.innerHTML = `
    <div class="modal" style="max-width:520px">
      <div class="modal-header">
        <h2>Datenbanken zusammenführen</h2>
        <button class="modal-close" onclick="closeMergePicker()">✕</button>
      </div>
      <div class="modal-body">
        <p class="field-hint" style="margin-bottom:1rem">
          Wähle ${base ? 'die zweite Datei' : 'die beiden Dateien'}, die zusammengeführt werden sollen.
          Anschließend kannst du eventuelle Konflikte auflösen.
        </p>
        <div class="merge-pick-grid">
          ${slotA}
          <div class="merge-pick-slot" id="merge-slot-b">
            <div class="merge-pick-label">Datei B</div>
            <label class="merge-pick-drop">
              <input type="file" accept=".json,application/json"
                     onchange="onMergeFilePicked('b', this)">
              <span class="merge-pick-cta">${base ? 'Datei wählen…' : 'Zweite Datei wählen…'}</span>
            </label>
            <div class="merge-pick-name" id="merge-name-b"></div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeMergePicker()">Abbrechen</button>
        <button class="btn btn-primary" id="merge-compare-btn" disabled
                onclick="comparePickedFiles()">Vergleichen</button>
      </div>
    </div>`;
  modal.addEventListener('click', e => { if (e.target === modal) closeMergePicker(); });
  document.body.appendChild(modal);
  updateMergeCompareBtn();
}

// Datei in einem Slot ausgewählt → einlesen, validieren, Status anzeigen.
async function onMergeFilePicked(slot, inputEl) {
  const file = inputEl.files?.[0];
  const nameEl = document.getElementById(`merge-name-${slot}`);
  const slotEl = document.getElementById(`merge-slot-${slot}`);
  if (!file) { _mergePick[slot] = null; updateMergeCompareBtn(); return; }

  const fail = (msg) => {
    _mergePick[slot] = null;
    slotEl?.classList.add('is-error');
    slotEl?.classList.remove('is-ok');
    if (nameEl) nameEl.textContent = msg;
    updateMergeCompareBtn();
  };

  const text = await file.text().catch(() => null);
  if (text === null) return fail('Datei nicht lesbar');

  // parseImportedFile erkennt Klartext/verschlüsselt und fragt ggf. das Passwort ab
  const result = await parseImportedFile(text, file.name);
  if (!result) return fail('Abgebrochen oder falsches Passwort');

  const errors = validateDatabase(result.db);
  if (errors.length) return fail('Keine gültige Gesundheitsakte');

  _mergePick[slot] = {
    db: normalizeDatabase(result.db),
    name: file.name,
    encrypted: result.encrypted,
    password: result.password,
  };
  slotEl?.classList.add('is-ok');
  slotEl?.classList.remove('is-error');
  if (nameEl) nameEl.textContent = result.encrypted ? `🔒 ${file.name}` : file.name;
  updateMergeCompareBtn();
}

function updateMergeCompareBtn() {
  const btn = document.getElementById('merge-compare-btn');
  if (btn) btn.disabled = !(_mergePick.a && _mergePick.b);
}

// Beide Dateien da → Merge-Plan berechnen und Konflikt-Modal öffnen.
function comparePickedFiles() {
  if (!_mergePick.a || !_mergePick.b) return;
  const bName = _mergePick.b.name;
  _mergePlan = computeMergePlan(_mergePick.a.db, _mergePick.b.db);
  // Verschlüsselungsinfo vor dem Zurücksetzen von _mergePick sichern
  _mergePlan.encryptionInfo = {
    encA: _mergePick.a.encrypted,
    encB: _mergePick.b.encrypted,
    pwA:  _mergePick.a.password,
    pwB:  _mergePick.b.password,
  };
  closeMergePicker();                        // setzt _mergePick = {a:null,b:null}
  openMergeModal(bName);
}

function closeMergePicker() {
  _mergePick = { a: null, b: null };
  document.getElementById('merge-picker')?.remove();
}

// ── Konflikt-Modal ────────────────────────────────
function openMergeModal(filename) {
  document.getElementById('merge-modal')?.remove();
  const { conflicts, stats } = _mergePlan;

  const summary = `
    <div class="merge-summary">
      <span class="merge-stat"><strong>${stats.added}</strong> übernommen</span>
      <span class="merge-stat"><strong>${stats.identical}</strong> identisch</span>
      <span class="merge-stat merge-stat--conflict"><strong>${stats.conflicts}</strong> Konflikt${stats.conflicts!==1?'e':''}</span>
    </div>`;

  const body = conflicts.length === 0
    ? `<p style="color:var(--text-secondary);line-height:1.6">
         Keine Konflikte gefunden — alle Änderungen lassen sich automatisch zusammenführen.
       </p>`
    : conflicts.map((c, ci) => renderConflict(c, ci)).join('');

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'merge-modal';
  modal.innerHTML = `
    <div class="modal" style="max-width:640px">
      <div class="modal-header">
        <h2>Zusammenführen mit ${esc(filename)}</h2>
        <button class="modal-close" onclick="cancelMerge()">✕</button>
      </div>
      <div class="modal-body">
        ${summary}
        ${conflicts.length ? `<p class="field-hint" style="margin:.5rem 0 1rem">
          Bei jedem Konflikt: links deine aktuelle Version (A), rechts die geladene Datei (B).
          Wähle pro Feld, welcher Wert bleiben soll.
        </p>` : ''}
        <div class="merge-conflicts">${body}</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="cancelMerge()">Abbrechen</button>
        <button class="btn btn-primary" onclick="applyMerge()">Zusammenführen</button>
      </div>
    </div>`;
  modal.addEventListener('click', e => { if (e.target === modal) cancelMerge(); });
  document.body.appendChild(modal);
}

function renderConflict(c, ci) {
  const label = MERGE_LABELS[c.collection] || c.collection;
  const rows = c.fields.map((f, fi) => `
    <div class="merge-field">
      <div class="merge-field-name">${esc(fieldLabel(f.path))}</div>
      <div class="merge-options">
        <label class="merge-opt">
          <input type="radio" name="cf-${ci}-${fi}" value="a" checked
                 onchange="markConflictChoice(${ci},${fi},'a')">
          <span class="merge-opt-val">${esc(fmtVal(f.valA))}</span>
          <span class="merge-opt-tag">A · deine</span>
        </label>
        <label class="merge-opt">
          <input type="radio" name="cf-${ci}-${fi}" value="b"
                 onchange="markConflictChoice(${ci},${fi},'b')">
          <span class="merge-opt-val">${esc(fmtVal(f.valB))}</span>
          <span class="merge-opt-tag">B · Datei</span>
        </label>
      </div>
    </div>`).join('');
  return `
    <div class="merge-conflict">
      <div class="merge-conflict-head">
        <span class="merge-conflict-type">${esc(label)}</span>
        <span class="merge-conflict-label">${esc(c.label)}</span>
      </div>
      ${rows}
    </div>`;
}

// Lesbarer Feldname.
function fieldLabel(path) {
  const map = {
    name:'Name', birthday:'Geburtsdatum', gender:'Geschlecht', bloodType:'Blutgruppe',
    date:'Datum', doctor:'Arzt', reason:'Grund', diagnosis:'Diagnose', notes:'Notizen',
    checkupId:'Checkup', metrics:'Messwerte', customMetrics:'Eigene Messwerte',
    conditions:'Leiden', familyHistory:'Familienanamnese', medications:'Medikamente',
    vaccinations:'Impfungen', allergies:'Allergien', operations:'Operationen',
    entryType:'Eintragstyp', intervalMonths:'Intervall (Monate)',
    description:'Beschreibung', appliesTo:'Gilt für',
    phone:'Telefon', url:'Website', label:'Bezeichnung', unit:'Einheit', group:'Gruppe',
    socialSecurityNumber:'Sozialversicherungsnummer', color:'Farbe',
    favoriteMetrics:'Favoriten', hiddenSections:'Ausgeblendete Abschnitte',
    avatarType:'Profilbild', personId:'Person', id:'ID',
  };
  return map[path] || path;
}

// Wert lesbar darstellen (Objekte/Arrays kompakt).
function fmtVal(v) {
  if (v === undefined || v === null || v === '') return '— leer —';
  if (typeof v === 'object') {
    if (Array.isArray(v)) return v.length ? `${v.length} Einträge` : '— leer —';
    const keys = Object.keys(v);
    return keys.length ? keys.map(k => `${fieldLabel(k)}: ${fmtValShort(v[k])}`).join(', ') : '— leer —';
  }
  return String(v);
}
function fmtValShort(v) {
  if (v === undefined || v === null || v === '') return '–';
  if (typeof v === 'object') return Array.isArray(v) ? `[${v.length}]` : '{…}';
  return String(v);
}

// ── Auswahl speichern ─────────────────────────────
// Default ist 'a' (checked). Wir vermerken nur Abweichungen.
function markConflictChoice(ci, fi, choice) {
  const c = _mergePlan.conflicts[ci];
  if (!c._choices) c._choices = {};
  c._choices[fi] = choice;
}

// ── Anwenden ──────────────────────────────────────
function applyMerge() {
  const { merged, conflicts } = _mergePlan;
  const encInfo = _mergePlan.encryptionInfo || {};

  for (const c of conflicts) {
    const choices = c._choices || {};
    if (c.collection === 'targets') {
      const chosen = (choices[0] === 'b') ? c.fields[0].valB : c.fields[0].valA;
      merged.targets[c.targetFlatKey] = chosen;
      continue;
    }
    // Objekt-Konflikt: mit A starten, gewählte B-Felder überschreiben
    const resolved = { ...c.a };
    c.fields.forEach((f, fi) => {
      resolved[f.path] = (choices[fi] === 'b') ? f.valB : f.valA;
    });
    merged[c.collection][c.targetIndex] = resolved;
  }

  DATA = normalizeDatabase(merged);
  _mergePlan = null;
  document.getElementById('merge-modal')?.remove();

  isDemoMode = false;
  // Verschlüsselung: wenn eine der Quelldateien verschlüsselt war, bleibt
  // das Ergebnis verschlüsselt. Passwort aus der verschlüsselten Quelle
  // übernehmen (A bevorzugt).
  const { encA, encB, pwA, pwB } = encInfo;
  if (encA || encB) {
    isEncrypted = true;
    setSessionPassword(pwA || pwB || null);
  } else {
    isEncrypted = false;
    clearSessionPassword();
  }

  currentPersonId = getPersonList()[0]?.id || null;
  document.getElementById('landing').style.display = 'none';
  document.getElementById('onboarding').style.display = 'none';
  startApp();
  markUnsaved();   // Ergebnis ist ungesichert bis zum Export
  showToast('Datenbanken zusammengeführt — bitte exportieren ✓', 'success');
}

function cancelMerge() {
  _mergePlan = null;
  document.getElementById('merge-modal')?.remove();
}
