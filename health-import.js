/* ═══════════════════════════════════════════════
   Familien-Gesundheitsakte — health-import.js
   ───────────────────────────────────────────────
   Import aus einem Apple-Health-Export (export.zip).

   Ablauf:
     1. Nutzer wählt das von Apple Health erzeugte export.zip
     2. fflate entpackt browserseitig nur die export.xml
     3. DOMParser liest die <Record>-Elemente
     4. Mapping (APPLE_HEALTH_MAP in config.js) filtert relevante Typen
     5. Pro Tag + Metrik wird nur der ERSTE Wert übernommen
     6. Bereits importierte Tage (Marker) und Tage mit bestehendem Wert
        werden übersprungen
     7. Vorschau-Modal: Person wählen, Metriken an/abwählen, importieren
     8. Werte landen als entryType:'self'-Einträge; importierte Tage
        werden pro Person als Marker gespeichert

   Import-Marker:
     DATA.healthImports = { personId: { "metric:YYYY-MM-DD": true, … } }
     → granular pro Tag+Metrik, robust auch bei nachträglich in Apple
       Health auftauchenden alten Werten.

   Teil des klassischen Multi-Script-Setups (gemeinsamer Scope).
   ═══════════════════════════════════════════════ */
'use strict';

// Zwischenspeicher des geparsten Imports zwischen Datei-Wahl und Bestätigung.
let _healthParsed = null;   // { byMetric: { metric: [{date,value}] }, total, range }

// ── Datei wählen & verarbeiten ────────────────────
function triggerHealthImport() {
  if (!DATA) { showToast('Bitte zuerst eine Datenbank laden', 'error'); return; }
  if (typeof fflate === 'undefined') {
    showToast('ZIP-Bibliothek nicht geladen', 'error');
    return;
  }
  const input = document.getElementById('health-import-input');
  if (input) { input.value = ''; input.click(); }
}

async function handleHealthFile(inputEl) {
  const file = inputEl.files?.[0];
  if (!file) return;
  showToast('Apple-Health-Export wird verarbeitet…');
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    const xml = extractHealthXml(buf);
    if (!xml) { showToast('Keine export.xml im ZIP gefunden', 'error'); return; }
    _healthParsed = parseHealthXml(xml);
    if (_healthParsed.total === 0) {
      showToast('Keine importierbaren Messwerte gefunden', 'error');
      return;
    }
    openHealthImportModal();
  } catch (e) {
    console.error(e);
    showToast('Die Datei konnte nicht gelesen werden', 'error');
  }
}

// Entpackt nur die export.xml aus dem ZIP (per Filter — spart Speicher).
function extractHealthXml(buf) {
  const out = fflate.unzipSync(buf, {
    filter: f => /(^|\/)export\.xml$/i.test(f.name),
  });
  const name = Object.keys(out).find(n => /export\.xml$/i.test(n));
  return name ? fflate.strFromU8(out[name]) : null;
}

// ── XML parsen ────────────────────────────────────
// Liefert { byMetric: { metricKey: [{date:'YYYY-MM-DD', value:Number}] (sortiert) },
//           total, range:{from,to} }
// "Erster Wert pro Tag": pro Metrik+Tag wird der früheste startDate-Eintrag genommen.
function parseHealthXml(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const records = doc.getElementsByTagName('Record');

  // pro Metrik: Map<date, {value, ts}>  (ts = Zeitstempel zum "erster Wert"-Vergleich)
  const acc = {};

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const type = r.getAttribute('type');
    const map = APPLE_HEALTH_MAP[type];
    if (!map) continue;

    const rawStart = r.getAttribute('startDate'); // z.B. "2025-01-10 08:00:00 +0100"
    const rawVal   = r.getAttribute('value');
    const unit     = r.getAttribute('unit') || '';
    if (!rawStart || rawVal == null) continue;

    const value = parseFloat(String(rawVal).replace(',', '.'));
    if (!isFinite(value)) continue;

    const date = rawStart.slice(0, 10);          // YYYY-MM-DD
    const ts   = appleDateToTs(rawStart);
    const conv = appleHealthConvert(map.metric, value, unit);
    const rounded = Math.round(conv * 100) / 100; // 2 Nachkommastellen

    if (!acc[map.metric]) acc[map.metric] = new Map();
    const cur = acc[map.metric].get(date);
    if (!cur || ts < cur.ts) {
      acc[map.metric].set(date, { value: rounded, ts });
    }
  }

  // In sortierte Arrays umwandeln + Gesamtzeitraum bestimmen
  const byMetric = {};
  let total = 0, minDate = null, maxDate = null;
  for (const metric of Object.keys(acc)) {
    const arr = [...acc[metric].entries()]
      .map(([date, o]) => ({ date, value: o.value }))
      .sort((a, b) => a.date.localeCompare(b.date));
    byMetric[metric] = arr;
    total += arr.length;
    if (arr.length) {
      if (!minDate || arr[0].date < minDate) minDate = arr[0].date;
      if (!maxDate || arr[arr.length-1].date > maxDate) maxDate = arr[arr.length-1].date;
    }
  }

  return { byMetric, total, range: { from: minDate, to: maxDate } };
}

// Apple-Datum "2025-01-10 08:00:00 +0100" → vergleichbarer Zeitstempel.
function appleDateToTs(s) {
  const t = Date.parse(s.replace(' ', 'T').replace(/ ([+-]\d{2})(\d{2})$/, '$1:$2'));
  return isNaN(t) ? 0 : t;
}

// ── Vorschau-Modal ────────────────────────────────
function openHealthImportModal() {
  document.getElementById('health-modal')?.remove();
  const persons = getPersonList();
  if (!persons.length) { showToast('Bitte zuerst eine Person anlegen', 'error'); return; }

  const personOpts = persons.map(p =>
    `<option value="${p.id}" ${p.id===currentPersonId?'selected':''}>${esc(p.name)}</option>`).join('');

  const metricRows = Object.keys(_healthParsed.byMetric).map(metric => {
    const def = metricDef(metric);
    const count = _healthParsed.byMetric[metric].length;
    return `<label class="health-metric-row">
      <input type="checkbox" class="health-metric-cb" value="${metric}" checked
             onchange="updateHealthImportSummary()">
      <span class="health-metric-name">${esc(def?.label || metric)}</span>
      <span class="health-metric-count" id="hcount-${metric}">${count} Tage</span>
    </label>`;
  }).join('');

  const range = _healthParsed.range;
  const rangeTxt = (range.from && range.to)
    ? `${fmtDate(range.from)} – ${fmtDate(range.to)}` : '—';

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'health-modal';
  modal.innerHTML = `
    <div class="modal" style="max-width:520px">
      <div class="modal-header">
        <h2>Apple Health importieren</h2>
        <button class="modal-close" onclick="closeHealthImport()">✕</button>
      </div>
      <div class="modal-body">
        <div class="field-group">
          <label for="health-person">Zuweisen an Person</label>
          <select id="health-person" onchange="updateHealthImportSummary()">${personOpts}</select>
        </div>
        <p class="field-hint" style="margin:.75rem 0 .25rem">
          Gefundener Zeitraum: <strong>${rangeTxt}</strong>.
          Pro Tag wird der erste Messwert übernommen.
        </p>
        <div class="form-section-title" style="margin:.75rem 0 .5rem">Messwerte</div>
        <div class="health-metric-list">${metricRows}</div>
        <div class="health-import-summary" id="health-summary"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeHealthImport()">Abbrechen</button>
        <button class="btn btn-primary" id="health-import-btn"
                onclick="confirmHealthImport()">Importieren</button>
      </div>
    </div>`;
  modal.addEventListener('click', e => { if (e.target===modal) closeHealthImport(); });
  document.body.appendChild(modal);
  updateHealthImportSummary();
}

// Berechnet — abhängig von Person & gewählten Metriken — wie viele Werte
// tatsächlich neu importiert würden (nach Abzug bereits importierter Tage
// und Tage mit bereits bestehendem Wert).
function computeHealthImportCounts(personId, metric) {
  const arr = _healthParsed.byMetric[metric] || [];
  const marker = DATA.healthImports?.[personId] || {};
  const existingDates = existingMetricDates(personId, metric);
  let neu = 0, skipped = 0;
  for (const { date } of arr) {
    const key = `${metric}:${date}`;
    if (marker[key] || existingDates.has(date)) skipped++;
    else neu++;
  }
  return { neu, skipped };
}

// Tage (YYYY-MM-DD), an denen für diese Person+Metrik bereits ein Wert existiert.
function existingMetricDates(personId, metric) {
  const set = new Set();
  for (const e of DATA.entries) {
    if (e.personId !== personId) continue;
    const has = (e.metrics && e.metrics[metric] != null)
             || (e.customMetrics && e.customMetrics[metric] != null);
    if (has) set.add(e.date);
  }
  return set;
}

function updateHealthImportSummary() {
  const personId = document.getElementById('health-person')?.value;
  if (!personId) return;
  let totalNew = 0, totalSkip = 0;
  document.querySelectorAll('.health-metric-cb').forEach(cb => {
    const { neu, skipped } = computeHealthImportCounts(personId, cb.value);
    const cntEl = document.getElementById(`hcount-${cb.value}`);
    if (cntEl) cntEl.textContent = cb.checked ? `${neu} neu` + (skipped?`, ${skipped} schon da`:'') : '—';
    if (cb.checked) { totalNew += neu; totalSkip += skipped; }
  });
  const sum = document.getElementById('health-summary');
  if (sum) {
    sum.innerHTML = `<strong>${totalNew}</strong> neue Werte werden importiert`
      + (totalSkip ? ` · <span style="color:var(--text-muted)">${totalSkip} bereits vorhanden übersprungen</span>` : '');
  }
  const btn = document.getElementById('health-import-btn');
  if (btn) btn.disabled = totalNew === 0;
}

// ── Import durchführen ────────────────────────────
function confirmHealthImport() {
  const personId = document.getElementById('health-person')?.value;
  if (!personId) return;
  const metrics = [...document.querySelectorAll('.health-metric-cb:checked')].map(cb => cb.value);
  if (!metrics.length) return;

  if (!DATA.healthImports) DATA.healthImports = {};
  if (!DATA.healthImports[personId]) DATA.healthImports[personId] = {};
  const marker = DATA.healthImports[personId];

  // Werte pro Datum bündeln → ein self-Eintrag pro Tag (mehrere Metriken zusammen)
  const byDate = {};   // date → { metricKey: value }
  let imported = 0;

  for (const metric of metrics) {
    const existing = existingMetricDates(personId, metric);
    for (const { date, value } of (_healthParsed.byMetric[metric] || [])) {
      const key = `${metric}:${date}`;
      if (marker[key] || existing.has(date)) continue;
      if (!byDate[date]) byDate[date] = {};
      byDate[date][metric] = value;
      marker[key] = true;
      imported++;
    }
  }

  // Bestehende self-Einträge dieses Tages wiederverwenden, sonst neuen anlegen
  const selfByDate = {};
  for (const e of DATA.entries) {
    if (e.personId === personId && e.entryType === 'self') selfByDate[e.date] = e;
  }

  for (const date of Object.keys(byDate)) {
    const existing = selfByDate[date];
    if (existing) {
      existing.metrics = { ...existing.metrics, ...byDate[date] };
    } else {
      DATA.entries.push({
        id: genId(),
        personId,
        entryType: 'self',
        date,
        doctor: '', reason: '', diagnosis: '', checkupId: '',
        notes: 'Importiert aus Apple Health',
        metrics: byDate[date],
        customMetrics: {},
        attachment: null,
      });
    }
  }

  saveData();
  closeHealthImport();
  _healthParsed = null;
  // Falls die importierte Person die aktuelle ist, Ansicht aktualisieren
  if (personId === currentPersonId) {
    const active = document.querySelector('.tab-btn.active')?.id?.replace('tab-','');
    if (active) renderPanel(active);
  }
  renderSettings();
  showToast(`${imported} Werte aus Apple Health importiert ✓`, 'success');
}

function closeHealthImport() {
  _healthParsed = null;
  document.getElementById('health-modal')?.remove();
}
