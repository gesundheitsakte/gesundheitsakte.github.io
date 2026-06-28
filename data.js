/* ═══════════════════════════════════════════════
   Familien-Gesundheitsakte — data.js
   ───────────────────────────────────────────────
   Daten-Lebenszyklus: globale Dropzone, Arztbericht/Druck, JSON-Export,
      Validierung/Normalisierung, Landing-Page, Onboarding, Demo-Daten laden.

   Teil eines klassischen Multi-Script-Setups (kein ES-Modul):
   alle Dateien teilen denselben globalen Scope. Reihenfolge der
   <script>-Tags siehe index.html.
   ═══════════════════════════════════════════════ */
'use strict';

// ═══════════════════════════════════════════════
// GLOBALE DROPZONE — JSON jederzeit ins Fenster ziehen
// ═══════════════════════════════════════════════
let _dragDepth = 0;

function setupGlobalDropzone() {
  const overlay = document.getElementById('drop-overlay');

  window.addEventListener('dragenter', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    _dragDepth++;
    if (overlay) overlay.classList.add('active');
  });

  window.addEventListener('dragover', e => {
    if (hasFiles(e)) e.preventDefault();
  });

  window.addEventListener('dragleave', e => {
    if (!hasFiles(e)) return;
    _dragDepth--;
    if (_dragDepth <= 0) {
      _dragDepth = 0;
      if (overlay) overlay.classList.remove('active');
    }
  });

  window.addEventListener('drop', e => {
    e.preventDefault();
    _dragDepth = 0;
    if (overlay) overlay.classList.remove('active');

    const file = [...(e.dataTransfer?.files || [])]
      .find(f => f.name.toLowerCase().endsWith('.json'));
    if (!file) {
      // Nur warnen wenn überhaupt Dateien gedroppt wurden
      if (e.dataTransfer?.files?.length) {
        showToast('Bitte eine JSON-Datei ablegen', 'error');
      }
      return;
    }
    confirmOpenDroppedFile(file);
  });
}

function hasFiles(e) {
  return e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
}

function confirmOpenDroppedFile(file) {
  // Bestehendes Modal entfernen
  document.getElementById('drop-confirm-modal')?.remove();

  const warnUnsaved = (hasUnsavedChanges && !isDemoMode)
    ? '<p style="color:var(--danger);font-size:.875rem;margin-top:.5rem">'
      + '⚠️ Du hast ungespeicherte Änderungen, die dabei verloren gehen.</p>'
    : '';

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'drop-confirm-modal';
  modal.innerHTML = `
    <div class="modal" style="max-width:420px">
      <div class="modal-header">
        <h2>Datenbank öffnen?</h2>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
      </div>
      <div class="modal-body">
        <p style="font-size:.9375rem">
          Möchtest du <strong>${esc(file.name)}</strong> öffnen?
        </p>
        ${warnUnsaved}
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">Abbrechen</button>
        <button class="btn btn-primary" id="drop-confirm-ok">Öffnen</button>
      </div>
    </div>`;
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);

  document.getElementById('drop-confirm-ok').addEventListener('click', async () => {
    modal.remove();
    await openDroppedFile(file);
  });
}

async function openDroppedFile(file) {
  const text = await file.text().catch(() => null);
  if (text === null) { showToast('Die Datei konnte nicht gelesen werden', 'error'); return; }

  const result = await parseImportedFile(text, file.name);
  if (!result) return;   // Abbruch oder Fehler (Toast bereits gezeigt)

  const errors = validateDatabase(result.db);
  if (errors.length) {
    showToast('Die Datei ist keine gültige Gesundheitsakte', 'error');
    return;
  }
  DATA = normalizeDatabase(result.db);
  isDemoMode = false;
  hasUnsavedChanges = false;
  isEncrypted = result.encrypted;
  if (result.encrypted) setSessionPassword(result.password);
  else clearSessionPassword();
  clearPersistedData();
  startApp();
  persistNow();
  showToast(`${DATA.persons.length} Personen, ${DATA.entries.length} Einträge geladen ✓`, 'success');
}


// ═══════════════════════════════════════════════
// ARZTBERICHT — Druckansicht
// ═══════════════════════════════════════════════

function openPrintReport() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'report-modal';

  const person = getPersonList().find(p => p.id === currentPersonId);
  if (!person) { showToast('Keine Person ausgewählt','error'); return; }

  // Optionen
  modal.innerHTML = `
    <div class="modal" style="max-width:420px">
      <div class="modal-header">
        <h2>Arztbericht erstellen</h2>
        <button class="modal-close" onclick="document.getElementById('report-modal').remove()">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="field-group full">
            <label for="rpt-person">Person</label>
            <select id="rpt-person">
              ${getPersonList().map(p =>
                `<option value="${p.id}" ${p.id===currentPersonId?'selected':''}>${esc(p.name)}</option>`
              ).join('')}
            </select>
          </div>
          <div class="field-group full">
            <label for="rpt-range">Zeitraum</label>
            <select id="rpt-range">
              <option value="12">Letzte 12 Monate</option>
              <option value="24">Letzte 2 Jahre</option>
              <option value="60">Letzte 5 Jahre</option>
              <option value="0">Gesamter Zeitraum</option>
            </select>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="document.getElementById('report-modal').remove()">Abbrechen</button>
        <button class="btn btn-primary" onclick="generateAndPrint()">Drucken</button>
      </div>
    </div>`;

  modal.addEventListener('click', e => { if(e.target===modal) modal.remove(); });
  document.body.appendChild(modal);
}

function generateAndPrint() {
  const pid      = document.getElementById('rpt-person')?.value;
  const rangeVal = parseInt(document.getElementById('rpt-range')?.value ?? '12');
  document.getElementById('report-modal')?.remove();

  const person = getPersonList().find(p => p.id === pid);
  if (!person) return;

  // Cutoff-Datum
  const cutoff = rangeVal === 0 ? null : (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - rangeVal);
    return d.toISOString().slice(0,10);
  })();

  // Einträge im Zeitraum
  const entries = DATA.entries
    .filter(e => e.personId === pid && (!cutoff || e.date >= cutoff))
    .sort((a,b) => new Date(a.date) - new Date(b.date));

  // Messwert-Zeitverlauf: bis zu 4 Messpunkte pro Metrik
  const allM = allMetrics().filter(m => !m.computed);
  const measuredMetrics = allM.filter(m => {
    return entries.some(e =>
      (e.metrics?.[m.key] !== undefined && e.metrics?.[m.key] !== '') ||
      (e.customMetrics?.[m.key] !== undefined)
    );
  });

  // Für jede Metrik: die letzten ≤4 Einträge mit Wert, chronologisch
  function getPoints(m) {
    const pts = [];
    for (const e of entries) {
      let val = e.metrics?.[m.key];
      if (val === undefined || val === '') val = e.customMetrics?.[m.key]?.value;
      if (val !== undefined && val !== '') pts.push({ date: e.date, value: parseFloat(val) });
    }
    // letzten 4
    return pts.slice(-4);
  }

  // Alle Datum-Spalten ermitteln (bis zu 4 letzte Messdaten über alle Metriken)
  const allDateSet = new Set();
  measuredMetrics.forEach(m => getPoints(m).forEach(p => allDateSet.add(p.date)));
  const allDates = [...allDateSet].sort().slice(-4);

  // Arztbesuche (nur doctor-type, keine Selbstmessungen in diesem Abschnitt)
  const doctorVisits = entries
    .filter(e => e.entryType === 'doctor' && e.doctor)
    .slice(-5)
    .reverse();

  // Offene Checkups (nur überfällig oder bald fällig)
  const checkupAlerts = getCheckups()
    .filter(c => checkupApplies(c, person))
    .map(c => ({ c, ...checkupStatus(c, pid) }))
    .filter(s => s.status !== 'ok');

  // Normwert-Klammer für eine Metrik (personen-spezifisch)
  function normLabel(m) {
    const r = resolveNormalRange(m.key, pid);
    if (!r) return '';
    const lo = r.min === 0 ? '' : r.min;
    const hi = r.max >= 900 ? '' : r.max;
    if (!lo && !hi) return '';
    return `(${lo}–${hi})`;
  }

  // Metriken nach Gruppe sortieren, dann anzeigen
  const groups = [...new Set(measuredMetrics.map(m => m.group))];

  const metricsRows = groups.map(g => {
    const mInGroup = measuredMetrics.filter(m => m.group === g);
    const rows = mInGroup.map(m => {
      const pts = getPoints(m);
      const cells = allDates.map(date => {
        const pt = pts.find(p => p.date === date);
        return pt ? `<td class="rpt-val">${pt.value}</td>` : `<td class="rpt-empty">—</td>`;
      }).join('');
      const norm = normLabel(m);
      return `<tr>
        <td class="rpt-metric">${esc(m.label)}${norm ? '<span class="rpt-norm"> '+esc(norm)+'</span>' : ''}</td>
        <td class="rpt-unit">${esc(m.unit||'')}</td>
        ${cells}
      </tr>`;
    }).join('');
    return `<tr class="rpt-group-hdr"><td colspan="${2+allDates.length}">${esc(g)}</td></tr>${rows}`;
  }).join('');

  const dateHeaders = allDates.map(d => {
    const dt = new Date(d+'T00:00:00');
    return `<th>${dt.toLocaleDateString('de-AT',{month:'2-digit',year:'2-digit'})}</th>`;
  }).join('');

  const conditionsList = (person.conditions||[]).map(c =>
    `<li>${esc(c.name)}${c.since?' (seit '+esc(c.since)+')':''}</li>`).join('');

  const familyList = (person.familyHistory||[]).map(f =>
    `<li>${esc(f.condition)}${f.relation?' ('+esc(f.relation)+')':''}</li>`).join('');

  const medicationsList = (person.medications||[]).map(m =>
    `<li>${esc(m.name)}${m.dosage?' — '+esc(m.dosage):''}${m.since?' (seit '+esc(m.since)+')':''}</li>`).join('');

  const vaccinationsList = (person.vaccinations||[]).map(v =>
    `<li>${esc(v.name)}${v.date?' ('+fmtDate(v.date)+')':''}${v.nextDue?' — Auffrischung: '+esc(v.nextDue):''}</li>`).join('');

  const allergiesList = (person.allergies||[]).map(a =>
    `<li>${esc(a.name)}${a.severity?' — '+esc(a.severity):''}</li>`).join('');

  const visitsHTML = doctorVisits.length ? doctorVisits.map(e => `
    <tr>
      <td>${fmtDate(e.date)}</td>
      <td>${esc(e.doctor)}</td>
      <td>${esc(e.reason||e.diagnosis||'')}</td>
    </tr>`).join('') : '<tr><td colspan="3" style="color:#888">Keine Arztbesuche im Zeitraum</td></tr>';

  const checkupHTML = checkupAlerts.length ? checkupAlerts.map(s => {
    return `<li><strong>${esc(s.c.name)}</strong> — ${esc(s.label)}</li>`;
  }).join('') : '<li style="color:#666">Alle Checkups aktuell</li>';

  const rangeLabel = rangeVal === 0 ? 'Gesamter Zeitraum'
    : rangeVal <= 12 ? 'Letzte 12 Monate'
    : rangeVal <= 24 ? 'Letzte 2 Jahre' : 'Letzte 5 Jahre';

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>Arztbericht — ${esc(person.name)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 10.5pt;
    color: #111;
    padding: 1.5cm 1.8cm;
    max-width: 21cm;
    margin: 0 auto;
  }
  h1 { font-size: 14pt; font-weight: 700; letter-spacing: -.01em; margin-bottom: .1cm; }
  h2 { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: .08em;
       color: #555; margin: .5cm 0 .2cm; border-bottom: 1px solid #ddd; padding-bottom: .15cm; }
  .meta { font-size: 9pt; color: #555; margin-bottom: .4cm; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: .5cm; margin-bottom: .2cm; }
  ul { list-style: none; padding: 0; }
  ul li { font-size: 9.5pt; padding: .1cm 0; border-bottom: 1px solid #eee; }
  ul li:last-child { border: none; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  th { font-weight: 600; text-align: center; padding: .15cm .2cm;
       background: #f4f4f4; border-bottom: 1.5px solid #bbb; }
  td { padding: .12cm .2cm; border-bottom: 1px solid #eee; vertical-align: middle; }
  .rpt-metric { font-weight: 500; min-width: 3.5cm; }
  .rpt-unit   { color: #777; font-size: 8.5pt; text-align: left; white-space: nowrap; }
  .rpt-val    { text-align: center; font-variant-numeric: tabular-nums; font-weight: 500; }
  .rpt-empty  { text-align: center; color: #bbb; }
.rpt-norm   { font-size: 7.5pt; color: #999; font-weight: 400; }
  .rpt-group-hdr td {
    font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: .07em;
    color: #0891b2; background: #f0faff; padding: .15cm .2cm;
  }
  .visit-date { white-space: nowrap; color: #555; width: 2.4cm; }
  .visit-doc  { font-weight: 500; width: 4cm; }
  .footer     { margin-top: .6cm; font-size: 8pt; color: #aaa; border-top: 1px solid #eee;
                padding-top: .25cm; display: flex; justify-content: space-between; }
  @media print {
    body { padding: 0; }
    @page { margin: 1.5cm 1.8cm; size: A4 portrait; }
  }
</style>
</head>
<body>

  <h1>${esc(person.name)}</h1>
  <p class="meta">
    Geb. ${fmtDate(person.birthday)} &nbsp;·&nbsp; ${getAge(person.birthday)}&nbsp;Jahre
    ${person.bloodType ? ' &nbsp;·&nbsp; Blutgruppe '+esc(person.bloodType) : ''}
    ${person.socialSecurityNumber ? ' &nbsp;·&nbsp; SV-Nr.: '+esc(person.socialSecurityNumber) : ''}
    &nbsp;·&nbsp; ${rangeLabel}
  </p>

  ${(conditionsList || familyList) ? `
  <div class="two-col">
    ${conditionsList ? `<div>
      <h2>Chronische Leiden</h2>
      <ul>${conditionsList}</ul>
    </div>` : '<div></div>'}
    ${familyList ? `<div>
      <h2>Familiengeschichte</h2>
      <ul>${familyList}</ul>
    </div>` : '<div></div>'}
  </div>` : ''}

  ${(medicationsList || vaccinationsList || allergiesList) ? `
  <div class="two-col">
    ${medicationsList ? `<div>
      <h2>Medikamente</h2>
      <ul>${medicationsList}</ul>
    </div>` : '<div></div>'}
    ${vaccinationsList ? `<div>
      <h2>Impfungen</h2>
      <ul>${vaccinationsList}</ul>
    </div>` : '<div></div>'}
  </div>
  ${allergiesList ? `
  <h2>Allergien</h2>
  <ul>${allergiesList}</ul>` : ''}` : ''}

  <h2>Messwerte — Zeitverlauf</h2>
  ${measuredMetrics.length ? `
  <table>
    <thead>
      <tr>
        <th style="text-align:left">Messwert</th>
        <th style="text-align:left">Einheit</th>
        ${dateHeaders}
      </tr>
    </thead>
    <tbody>${metricsRows}</tbody>
  </table>
  <p style="font-size:8pt;color:#aaa;margin-top:.2cm">Normwerte in Klammern sofern hinterlegt.</p>
  ` : '<p style="color:#888;font-size:9pt">Keine Messwerte im gewählten Zeitraum.</p>'}

  <h2>Arztbesuche</h2>
  <table>
    <thead>
      <tr><th style="text-align:left;width:2.4cm">Datum</th>
          <th style="text-align:left">Arzt</th>
          <th style="text-align:left">Anlass</th></tr>
    </thead>
    <tbody>${visitsHTML}</tbody>
  </table>

  <h2>Vorsorge &amp; Checkups</h2>
  <ul>${checkupHTML}</ul>

  <div class="footer">
    <span>Familien-Gesundheitsakte</span>
    <span>Erstellt am ${new Date().toLocaleDateString('de-AT',{day:'2-digit',month:'2-digit',year:'numeric'})}</span>
  </div>

</body>
</html>`;

  // In neuem Fenster öffnen und drucken
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) {
    showToast('Bitte Popups für diese Seite erlauben, um den Bericht zu drucken', 'error');
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  // setTimeout statt load-Event: nach document.write()/close() ist das
  // load-Event oft schon vorbei und würde nie feuern → Druckdialog bliebe aus.
  setTimeout(() => { try { w.print(); } catch {} }, 300);
}

// ═══════════════════════════════════════════════
// EXPORT — JSON mit Datum+Zeit-Stempel herunterladen
// ═══════════════════════════════════════════════
async function exportData() {
  // Demo-Flag beim Export entfernen, damit eine exportierte Datei
  // als echte Datenbank weiterverwendet werden kann
  const out = { ...DATA };
  delete out.isDemo;

  let fileContent, extension;
  if (isEncrypted) {
    // Passwort aus der Session holen — sollte vorhanden sein
    let pw = getSessionPassword();
    if (!pw) {
      pw = await promptPassword({
        title: 'Passwort zum Verschlüsseln',
        message: 'Gib das Passwort ein, mit dem die exportierte Datei verschlüsselt werden soll.',
        confirm: true,
      });
      if (pw === null) return;            // abgebrochen
      setSessionPassword(pw);
    }
    try {
      const envelope = await encryptDatabase(out, pw);
      fileContent = JSON.stringify(envelope, null, 2);
      extension = 'health';               // verschlüsselte Dateien → .health
    } catch (e) {
      console.error(e);
      showToast('Verschlüsselung fehlgeschlagen', 'error');
      return;
    }
  } else {
    fileContent = JSON.stringify(out, null, 2);
    extension = 'json';
  }

  const b = new Blob([fileContent], { type: 'application/json' });
  const u = URL.createObjectURL(b);
  const a = document.createElement('a');
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`
              + `_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  a.href = u;
  a.download = `health-data-${stamp}.${extension}`;
  a.click();
  URL.revokeObjectURL(u);

  markSaved();
  showToast(isEncrypted ? 'Verschlüsselt exportiert ✓' : 'Datenbank exportiert ✓', 'success');
}

// ═══════════════════════════════════════════════
// PASSWORT-DIALOG (Promise-basiert)
// ═══════════════════════════════════════════════
// Liefert das eingegebene Passwort oder null (Abbruch).
// opts: { title, message, confirm (bool: zweites Feld zur Bestätigung) }
function promptPassword(opts = {}) {
  return new Promise(resolve => {
    document.getElementById('password-modal')?.remove();
    const { title = 'Passwort', message = '', confirm = false } = opts;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'password-modal';
    modal.innerHTML = `
      <div class="modal" style="max-width:420px">
        <div class="modal-header"><h2>${esc(title)}</h2></div>
        <div class="modal-body">
          ${message ? `<p style="color:var(--text-secondary);font-size:.9375rem;line-height:1.55;margin-bottom:1rem">${esc(message)}</p>` : ''}
          <div class="field-group">
            <label for="pw-input-1">Passwort</label>
            <input type="password" id="pw-input-1" autocomplete="off">
          </div>
          ${confirm ? `
          <div class="field-group" style="margin-top:.75rem">
            <label for="pw-input-2">Passwort bestätigen</label>
            <input type="password" id="pw-input-2" autocomplete="off">
          </div>` : ''}
          <p id="pw-error" style="color:var(--danger);font-size:.8125rem;margin-top:.5rem;display:none"></p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="pw-cancel">Abbrechen</button>
          <button class="btn btn-primary" id="pw-ok">Bestätigen</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const in1 = modal.querySelector('#pw-input-1');
    const in2 = modal.querySelector('#pw-input-2');
    const err = modal.querySelector('#pw-error');
    const close = (val) => { modal.remove(); resolve(val); };

    const submit = () => {
      const v1 = in1.value;
      if (!v1) { err.textContent = 'Bitte ein Passwort eingeben.'; err.style.display = ''; return; }
      if (confirm) {
        if (v1.length < 4) { err.textContent = 'Mindestens 4 Zeichen.'; err.style.display = ''; return; }
        if (v1 !== in2.value) { err.textContent = 'Die Passwörter stimmen nicht überein.'; err.style.display = ''; return; }
      }
      close(v1);
    };

    modal.querySelector('#pw-ok').addEventListener('click', submit);
    modal.querySelector('#pw-cancel').addEventListener('click', () => close(null));
    modal.addEventListener('click', e => { if (e.target === modal) close(null); });
    in1.addEventListener('keydown', e => { if (e.key === 'Enter' && !confirm) submit(); });
    (confirm ? in2 : in1).addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    setTimeout(() => in1.focus(), 50);
  });
}

// Liest einen Dateitext und liefert das entschlüsselte DB-Objekt.
// Erkennt automatisch Plaintext vs. verschlüsselt. Bei verschlüsselten
// Dateien wird das Passwort abgefragt (mit Wiederholung bei Fehleingabe).
// Rückgabe: { db, encrypted, password } oder null (Abbruch/Fehler).
async function parseImportedFile(text, filename = '') {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    showToast('Die Datei ist kein gültiges JSON', 'error');
    return null;
  }

  if (!isEncryptedEnvelope(parsed)) {
    return { db: parsed, encrypted: false, password: null };
  }

  while (true) {
    const pw = await promptPassword({
      title: 'Verschlüsselte Datei',
      message: `Die Datei${filename ? ` „${filename}"` : ''} ist verschlüsselt. Bitte gib das Passwort ein.`,
    });
    if (pw === null) return null;
    try {
      const db = await decryptDatabase(parsed, pw);
      return { db, encrypted: true, password: pw };
    } catch (e) {
      showToast('Falsches Passwort — bitte erneut versuchen', 'error');
    }
  }
}

// ═══════════════════════════════════════════════
// CHECKUP-KALENDER-EXPORT (.ics)
// ═══════════════════════════════════════════════
// Exportiert die nächsten fälligen Checkup-Termine der aktuellen Person
// als iCalendar-Datei (Ganztags-Events mit Erinnerung 1 Tag vorher).

function exportCheckupCalendar() {
  const person = getPersonList().find(p => p.id === currentPersonId);
  if (!person) { showToast('Keine Person ausgewählt', 'error'); return; }

  const checkups = getCheckups().filter(c => checkupApplies(c, person));
  const events = checkups
    .map(c => ({ checkup: c, ...checkupStatus(c, currentPersonId) }))
    .filter(s => s.dueDate);

  if (!events.length) {
    showToast('Keine Vorsorgetermine für diese Person', 'error');
    return;
  }

  const ics = buildICS(events, person);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vorsorge-${slugify(person.name)}.ics`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`${events.length} Termin${events.length!==1?'e':''} als Kalenderdatei exportiert ✓`, 'success');
}

// Baut den vollständigen iCalendar-String (RFC 5545).
function buildICS(events, person) {
  const dtstamp = icsStamp(new Date());   // UTC-Zeitstempel der Erstellung
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Familien-Gesundheitsakte//Vorsorge//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const ev of events) {
    const c = ev.checkup;
    const dateCompact = ev.dueDate.replace(/-/g, '');           // YYYYMMDD
    const dtend = icsDatePlusOne(ev.dueDate);                    // Ganztags: DTEND = Folgetag
    const uid = `${c.id}-${dateCompact}-${slugify(person.name)}@gesundheitsakte`;

    const descParts = [];
    if (c.description) descParts.push(c.description);
    descParts.push(`Intervall: ${c.intervalMonths>=12
      ? (c.intervalMonths/12)+' Jahr'+(c.intervalMonths/12>1?'e':'')
      : c.intervalMonths+' Monate'}`);
    if (c.phone) descParts.push(`Telefon: ${c.phone}`);
    if (c.url)   descParts.push(`Web: ${c.url}`);

    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${dateCompact}`,
      `DTEND;VALUE=DATE:${dtend}`,
      `SUMMARY:${icsEscape(`${c.name} — ${person.name}`)}`,
    );
    // Jeden Teil einzeln escapen, dann mit literalem \n (iCal-Zeilenumbruch) verbinden,
    // damit das \n NICHT vom Escaping zu \\n verdoppelt wird.
    if (descParts.length) {
      lines.push(`DESCRIPTION:${descParts.map(icsEscape).join('\\n')}`);
    }
    if (c.url) lines.push(`URL:${icsEscape(c.url)}`);
    lines.push(
      'TRANSP:TRANSPARENT',
      // Erinnerung 1 Tag vorher um 09:00 (bei Ganztags-Events der saubere Weg)
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsEscape(`Erinnerung: ${c.name}`)}`,
      'TRIGGER;VALUE=DATE-TIME:' + icsAlarmTrigger(ev.dueDate),
      'END:VALARM',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  // RFC 5545 verlangt CRLF-Zeilenenden
  return lines.map(foldICSLine).join('\r\n') + '\r\n';
}

// ── iCalendar-Hilfsfunktionen ─────────────────────
// Erstellungs-Zeitstempel in UTC: 20260624T120000Z
function icsStamp(d) {
  const p = n => String(n).padStart(2,'0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth()+1)}${p(d.getUTCDate())}`
       + `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}
// Folgetag als YYYYMMDD (DTEND ist bei Ganztags-Events exklusiv).
function icsDatePlusOne(iso) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  const p = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}`;
}
// Alarm: Tag vorher, 09:00 lokale Zeit → als floating local time (ohne Z).
function icsAlarmTrigger(iso) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  const p = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}T090000`;
}
// Sonderzeichen in TEXT-Feldern escapen (RFC 5545 §3.3.11).
function icsEscape(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}
// Zeilen >75 Oktette müssen umgebrochen werden (Folding mit Leerzeichen).
function foldICSLine(line) {
  if (line.length <= 75) return line;
  let out = '';
  let cur = line;
  while (cur.length > 75) {
    out += cur.slice(0, 75) + '\r\n ';
    cur = cur.slice(75);
  }
  return out + cur;
}
function slugify(s) {
  return String(s).toLowerCase()
    .replace(/[äöü]/g, m => ({ä:'ae',ö:'oe',ü:'ue'}[m]))
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'person';
}

// ═══════════════════════════════════════════════
// JSON-VALIDIERUNG
// ═══════════════════════════════════════════════
function validateDatabase(obj) {
  const errors = [];
  if (typeof obj !== 'object' || obj === null) {
    return ['Die Datei enthält kein gültiges JSON-Objekt.'];
  }
  if (!Array.isArray(obj.persons)) errors.push('Feld "persons" fehlt oder ist kein Array.');
  if (!Array.isArray(obj.entries)) errors.push('Feld "entries" fehlt oder ist kein Array.');
  // customMetrics ist optional, aber wenn vorhanden muss es ein Array sein
  if (obj.customMetrics !== undefined && !Array.isArray(obj.customMetrics)) {
    errors.push('Feld "customMetrics" muss ein Array sein.');
  }
  // Personen-Grundstruktur stichprobenartig prüfen
  (obj.persons || []).forEach((p, i) => {
    if (!p.id)   errors.push(`Person #${i+1}: "id" fehlt.`);
    if (!p.name) errors.push(`Person #${i+1}: "name" fehlt.`);
  });
  return errors;
}

// Normalisiert eine geladene DB (füllt fehlende optionale Felder)
function normalizeDatabase(obj) {
  return {
    version:       obj.version || '2.0',
    createdAt:     obj.createdAt || new Date().toISOString(),
    checkups:      Array.isArray(obj.checkups)      ? obj.checkups      : [],
    targets:       (typeof obj.targets === 'object' && obj.targets) ? obj.targets : {},
    healthImports: (typeof obj.healthImports === 'object' && obj.healthImports) ? obj.healthImports : {},
    customMetrics: Array.isArray(obj.customMetrics)
      ? obj.customMetrics.map(m => ({ graphable: true, ...m }))
      : [],
    persons:       obj.persons.map(p => ({
      conditions: [], familyHistory: [], medications: [], vaccinations: [],
      allergies: [], bloodType: null, ...p
    })),
    entries:       obj.entries.map(e => ({
      entryType: e.entryType || 'doctor',
      doctor: '', reason: '', diagnosis: '', checkupId: '', notes: '',
      metrics: {}, customMetrics: {}, ...e
    })),
  };
}



// ═══════════════════════════════════════════════
// LANDING-PAGE & FLOWS
// ═══════════════════════════════════════════════
function showLanding() {
  appMode = 'landing';
  document.getElementById('app-shell').style.display = 'none';
  const dot = document.getElementById('unsaved-dot');
  if (dot) dot.style.display = 'none';
  const pb = document.getElementById('topbar-print-btn');
  if (pb) { pb.style.display = 'none'; pb.innerHTML = SVG_PRINT; }
  const landing = document.getElementById('landing');
  landing.style.display = 'flex';
  landing.innerHTML = `
    <div class="landing-inner">
      <div class="landing-brand">
        <img src="icons/icon-192.png" class="landing-logo" alt="">
        <h1>Familien-Gesundheitsakte</h1>
        <p class="landing-tagline">Behalte die Gesundheit deiner Familie im Blick — lokal, privat, ohne Cloud.</p>
      </div>

      <div class="landing-cards">
        <button class="landing-card" onclick="startOnboarding()">
          <span class="landing-card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
          </span>
          <span class="landing-card-title">Neue Datenbank anlegen</span>
          <span class="landing-card-desc">Lege Personen an und beginne mit dem Tracking</span>
        </button>

        <button class="landing-card" onclick="triggerLoadDatabase()">
          <span class="landing-card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
          </span>
          <span class="landing-card-title">Bestehende Datenbank laden</span>
          <span class="landing-card-desc">Öffne eine zuvor exportierte JSON-Datei</span>
        </button>

        <button class="landing-card" onclick="loadDemoData()">
          <span class="landing-card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>
            </svg>
          </span>
          <span class="landing-card-title">Beispiel-Datenbank ansehen</span>
          <span class="landing-card-desc">Erkunde die App mit Demo-Daten</span>
        </button>

        <button class="landing-card" onclick="startMergeFromLanding()">
          <span class="landing-card-icon">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
            </svg>
          </span>
          <span class="landing-card-title">Datenbanken zusammenführen</span>
          <span class="landing-card-desc">Zwei Dateien zu einer konsolidieren</span>
        </button>
      </div>

      <p class="landing-privacy">
        Alle Daten bleiben auf deinem Gerät. Es werden keine Daten an Server übertragen.
      </p>
    </div>
    <input type="file" id="landing-file-input" accept=".json,.health" style="display:none"
           onchange="handleDatabaseFile(this)">`;
}

// ── Bestehende DB laden ───────────────────────
function triggerLoadDatabase() {
  window.scrollTo({ top: 0, behavior: 'instant' });
  document.getElementById('landing-file-input')?.click();
}

async function handleDatabaseFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  const text = await file.text().catch(() => null);
  input.value = '';
  if (text === null) { showToast('Die Datei konnte nicht gelesen werden', 'error'); return; }

  const result = await parseImportedFile(text, file.name);
  if (!result) return;

  const errors = validateDatabase(result.db);
  if (errors.length) {
    showToast('Die Datei ist keine gültige Gesundheitsakte', 'error');
    return;
  }
  DATA = normalizeDatabase(result.db);
  isDemoMode = false;
  hasUnsavedChanges = false;
  isEncrypted = result.encrypted;
  if (result.encrypted) setSessionPassword(result.password);
  else clearSessionPassword();
  clearPersistedData();
  startApp();
  persistNow();
  showToast(`${DATA.persons.length} Personen, ${DATA.entries.length} Einträge geladen ✓`, 'success');
}

// ── Demo-Daten laden ──────────────────────────
async function loadDemoData() {
  window.scrollTo({ top: 0, behavior: 'instant' });
  try {
    const res = await fetch('demo-data.json?v=' + Date.now());
    if (!res.ok) throw new Error();
    const obj = await res.json();
    DATA = normalizeDatabase(obj);
    isDemoMode = true;
    hasUnsavedChanges = false;
    clearPersistedData();
    startApp();
  } catch {
    // Fallback falls fetch unter file:// blockiert (manche Browser):
    alert('Demo-Daten konnten nicht geladen werden.\n\n'
        + 'Tipp: Manche Browser blockieren das Laden lokaler Dateien per file://. '
        + 'Starte die Seite über einen lokalen Server oder lade eine JSON-Datei manuell.');
  }
}

// ── Onboarding: neue DB ───────────────────────
let onboardingPersons = [];

function startOnboarding() {
  window.scrollTo({ top: 0, behavior: 'instant' });
  onboardingPersons = [];
  appMode = 'onboarding';
  document.getElementById('landing').style.display = 'none';
  const ob = document.getElementById('onboarding');
  ob.style.display = 'flex';
  renderOnboarding();
}

function renderOnboarding() {
  const ob = document.getElementById('onboarding');
  const encryptChecked = document.getElementById('ob-encrypt')?.checked ?? false;
  const list = onboardingPersons.map((p, i) => `
    <div class="ob-person-chip">
      <span class="ob-chip-avatar" style="background:${AVATAR_COLORS[i % AVATAR_COLORS.length]}">${esc(initials(p.name))}</span>
      <span class="ob-chip-name">${esc(p.name)}</span>
      <span class="ob-chip-meta">${fmtDate(p.birthday)}</span>
      <button class="ob-chip-remove" onclick="removeOnboardingPerson(${i})">✕</button>
    </div>`).join('');

  ob.innerHTML = `
    <div class="ob-inner">
      <div class="ob-header">
        <img src="icons/icon-192.png" class="ob-logo" alt="">
        <h1>Personen anlegen</h1>
        <p>Füge die Familienmitglieder hinzu, deren Gesundheit du verfolgen möchtest. Du kannst später jederzeit weitere ergänzen.</p>
      </div>

      <div class="ob-form card">
        <div class="form-grid">
          <div class="field-group full">
            <label for="ob-name">Name</label>
            <input type="text" id="ob-name" placeholder="Vorname Nachname"
                   onkeydown="if(event.key==='Enter')addOnboardingPerson()">
          </div>
          <div class="field-group">
            <label for="ob-birthday">Geburtsdatum</label>
            <input type="date" id="ob-birthday">
          </div>
          <div class="field-group">
            <label for="ob-gender">Geschlecht</label>
            <select id="ob-gender">
              <option value="male">Männlich</option>
              <option value="female">Weiblich</option>
              <option value="other">Divers</option>
            </select>
          </div>
        </div>
        <button class="btn btn-ghost" style="margin-top:.875rem" onclick="addOnboardingPerson()">
          + Person hinzufügen
        </button>
      </div>

      ${onboardingPersons.length ? `<div class="ob-person-list">${list}</div>` : ''}

      <div class="ob-encrypt-box">
        <label class="ob-encrypt-label">
          <input type="checkbox" id="ob-encrypt" class="boolean-check" onchange="toggleEncryptHint()">
          <span>Datenbank verschlüsseln</span>
        </label>
        <p class="ob-encrypt-hint" id="ob-encrypt-hint" style="display:none">
          Beim Exportieren wird die Datei mit einem Passwort verschlüsselt (AES-256).
          <strong>Wichtig:</strong> Ohne dieses Passwort sind die Daten unwiderruflich verloren —
          es gibt keine Wiederherstellung. Bewahre es sicher auf.<br><br>
	  Die Datenbank sollte verschlüsselt werden, wenn sie in der Cloud gespeichert werden soll.
        </p>
      </div>

      <div class="ob-actions">
        <button class="btn btn-ghost" onclick="showLanding()">Zurück</button>
        <button class="btn btn-primary" onclick="finishOnboarding()"
                ${onboardingPersons.length ? '' : 'disabled'}>
          Los geht's →
        </button>
      </div>
    </div>`;
  const encryptEl = document.getElementById('ob-encrypt');
  if (encryptEl) {
    encryptEl.checked = encryptChecked;
    toggleEncryptHint();
  }
  document.getElementById('ob-name')?.focus();
}

function toggleEncryptHint() {
  const cb = document.getElementById('ob-encrypt');
  const hint = document.getElementById('ob-encrypt-hint');
  if (hint) hint.style.display = cb?.checked ? '' : 'none';
}

function addOnboardingPerson() {
  const name     = document.getElementById('ob-name')?.value.trim();
  const birthday = document.getElementById('ob-birthday')?.value;
  const gender   = document.getElementById('ob-gender')?.value;
  if (!name)     { showToast('Bitte einen Namen eingeben', 'error'); return; }
  if (!birthday) { showToast('Bitte ein Geburtsdatum eingeben', 'error'); return; }
  if (birthday > todayISO()) {
    showToast('Das Geburtsdatum darf nicht in der Zukunft liegen', 'error'); return;
  }

  onboardingPersons.push({
    id: 'person_' + Date.now() + '_' + Math.random().toString(36).slice(2,5),
    name, birthday, gender,
    bloodType: null, conditions: [], familyHistory: [],
  });
  renderOnboarding();
}

function removeOnboardingPerson(i) {
  onboardingPersons.splice(i, 1);
  renderOnboarding();
}

async function finishOnboarding() {
  if (!onboardingPersons.length) return;

  const wantEncrypt = document.getElementById('ob-encrypt')?.checked;
  let password = null;
  if (wantEncrypt) {
    password = await promptPassword({
      title: 'Verschlüsselungs-Passwort wählen',
      message: 'Wähle ein Passwort. Die exportierte Datei wird damit verschlüsselt. '
             + 'Ohne dieses Passwort sind die Daten unwiederbringlich verloren — es gibt keine Wiederherstellung.',
      confirm: true,
    });
    if (password === null) return;   // abgebrochen → Onboarding bleibt offen
  }

  DATA = {
    version: '2.0',
    createdAt: new Date().toISOString(),
    checkups: [],
    customMetrics: [],
    targets: {},
    persons: onboardingPersons,
    entries: [],
  };
  isDemoMode = false;
  hasUnsavedChanges = true; // neue DB ist noch nicht exportiert
  isEncrypted = !!wantEncrypt;
  if (wantEncrypt) setSessionPassword(password);
  else clearSessionPassword();
  clearPersistedData();
  persistNow();
  document.getElementById('onboarding').style.display = 'none';
  startApp();
  showToast(isEncrypted
    ? 'Verschlüsselte Datenbank erstellt — Passwort sicher aufbewahren!'
    : 'Datenbank erstellt — vergiss nicht zu exportieren!', 'success');
}
