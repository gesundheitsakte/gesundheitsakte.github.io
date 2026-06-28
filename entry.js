/* ═══════════════════════════════════════════════
   Familien-Gesundheitsakte — entry.js
   ───────────────────────────────────────────────
   Eintrag erfassen/bearbeiten: Modus-Wahl, Messwert-Picker, eigene
      Messwerte, Speichern; plus Zielwert-Dialog.

   Teil eines klassischen Multi-Script-Setups (kein ES-Modul):
   alle Dateien teilen denselben globalen Scope. Reihenfolge der
   <script>-Tags siehe index.html.
   ═══════════════════════════════════════════════ */
'use strict';

// ═══════════════════════════════════════════════
// EINTRAG ERFASSEN
// ═══════════════════════════════════════════════
let activeFormMetrics = new Set();  // keys of selected predefined metrics
let customMetrics     = [];         // [{key, label, unit}] user-defined this session
let entryMode         = 'doctor';   // 'doctor' | 'self'
let editingEntryId    = null;       // gesetzt wenn ein Eintrag bearbeitet wird
let _entryAbort       = null;       // AbortController for the panel keyboard listener

function _entryKeyHandler(e) {
  if (document.querySelector('.tab-btn.active')?.id !== 'tab-entry') return;
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    saveEntry();
  } else if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    if (editingEntryId) cancelEditEntry(); else renderEntryForm();
  }
}

function renderEntryForm(editEntry = null) {
  const panel   = document.getElementById('panel-entry');
  const person  = getPersonList().find(p=>p.id===currentPersonId);
  const checkups = getCheckups().filter(c=>checkupApplies(c,person));
  activeFormMetrics = new Set();
  customMetrics     = [];

  const isEdit = !!editEntry;
  editingEntryId = isEdit ? editEntry.id : null;
  entryMode      = isEdit ? (editEntry.entryType || 'doctor') : 'doctor';

  // Beim Bearbeiten: vorhandene Messwerte als aktive Pills / Werte vormerken
  if (isEdit) {
    Object.keys(editEntry.metrics || {}).forEach(k => activeFormMetrics.add(k));
    Object.entries(editEntry.customMetrics || {}).forEach(([k, m]) => {
      customMetrics.push({ key: k, label: m.label, unit: m.unit, value: m.value });
    });
  }

  // Build metric picker (predefined) — pill toggles; exclude computed metrics
  const groups = [...new Set(allMetrics().filter(m=>!m.computed).map(m=>m.group))];
  const metricPicker = groups.map(g=>`
    <div class="metric-group-label">${esc(g)}</div>
    <div class="metric-btn-row">
      ${allMetrics().filter(m=>m.group===g&&!m.computed).map(m=>`
        <button type="button" class="metric-toggle-btn" data-key="${m.key}"
                onclick="toggleFormMetric('${m.key}')">
          ${esc(m.label)}${m.unit?` <small>${esc(m.unit)}</small>`:''}
        </button>`).join('')}
    </div>`).join('');

  // Build self-mode: all metric fields shown directly, grouped, no pill needed
  const selfMetricFields = groups.map(g=>`
    <div class="self-metric-group">
      <div class="metric-group-label">${esc(g)}</div>
      <div class="form-grid">
        ${allMetrics().filter(m=>m.group===g&&!m.computed).map(m=>{
          if (m.type === 'boolean') return `
          <div class="field-group field-group--boolean">
            <label class="boolean-label" for="self-${m.key}">
              <input type="checkbox" id="self-${m.key}" class="boolean-check">
              <span>${esc(m.label)}</span>
            </label>
          </div>`;
          if (m.type === 'select') return `
          <div class="field-group">
            <label for="self-${m.key}">${esc(m.label)}</label>
            <select id="self-${m.key}">
              <option value="">— nicht erfasst —</option>
              ${(m.options||[]).map(o=>`<option value="${escAttr(o)}">${esc(o)}</option>`).join('')}
            </select>
          </div>`;
          return `
          <div class="field-group">
            <label for="self-${m.key}">${esc(m.label)}${m.unit?` (${esc(m.unit)})`:''}</label>
            <input type="number" step="any" id="self-${m.key}" placeholder="—">
          </div>`;
        }).join('')}
      </div>
    </div>`).join('');

  panel.innerHTML = `
    <div class="card">
      <div class="card-header" style="margin-bottom:.75rem">
        <h2>${isEdit ? 'Eintrag bearbeiten' : 'Neuer Eintrag'}</h2>
      </div>

      <!-- ── Modus-Wahl ── -->
      <div class="form-section">
        <div class="entry-mode-toggle">
          <button class="mode-btn${entryMode==='doctor'?' active':''}" id="mode-btn-doctor" onclick="setEntryMode('doctor')">
            Arztbesuch
          </button>
          <button class="mode-btn${entryMode==='self'?' active':''}" id="mode-btn-self" onclick="setEntryMode('self')">
            Eigene Messung
          </button>
        </div>
      </div>

      <!-- ── Datum (immer sichtbar) ── -->
      <div class="form-section">
        <div class="form-section-title">Datum</div>
        <div class="form-grid">
          <div class="field-group">
            <label for="entry-date">Datum</label>
            <input type="date" id="entry-date"
                   max="${todayISO()}"
                   value="${isEdit ? editEntry.date : todayISO()}">
          </div>
        </div>
      </div>

      <!-- ── Arztbesuch-Felder (nur im doctor-Modus) ── -->
      <div id="doctor-fields" style="display:${entryMode==='doctor'?'':'none'}">
        <div class="form-section">
          <div class="form-section-title">Arztbesuch</div>
          <div class="form-grid">
            <div class="field-group">
              <label for="entry-doctor">Arzt / Facharzt</label>
              <input type="text" id="entry-doctor" list="doctor-suggestions" autocomplete="off" placeholder="z.B. Dr. Huber, Hausarzt" value="${isEdit?escAttr(editEntry.doctor||''):''}">
              <datalist id="doctor-suggestions">
                ${[...new Set(DATA.entries.filter(e=>e.doctor?.trim()).map(e=>e.doctor.trim()))].map(d=>`<option value="${escAttr(d)}">`).join('')}
              </datalist>
            </div>
            <div class="field-group">
              <label for="entry-reason">Grund des Besuchs</label>
              <input type="text" id="entry-reason" autocomplete="off" placeholder="z.B. Routinekontrolle" value="${isEdit?escAttr(editEntry.reason||''):''}">
            </div>
            <div class="field-group">
              <label for="entry-diagnosis">Diagnose / Befund</label>
              <input type="text" id="entry-diagnosis" autocomplete="off" placeholder="z.B. Kein Befund" value="${isEdit?escAttr(editEntry.diagnosis||''):''}">
            </div>
            <div class="field-group">
              <label for="entry-checkup">Checkup zuordnen</label>
              <select id="entry-checkup">
                <option value="">— Kein Checkup —</option>
                ${checkups.map(c=>`<option value="${c.id}" ${isEdit&&editEntry.checkupId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}
              </select>
            </div>
            <div class="field-group full">
              <label for="entry-notes">Notizen</label>
              <textarea id="entry-notes" autocomplete="off" placeholder="Weitere Notizen…">${isEdit?esc(editEntry.notes||''):''}</textarea>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Messwerte: Arztbesuch-Modus (Pill-Auswahl) ── -->
      <div class="form-section" id="metric-section-doctor" style="display:${entryMode==='doctor'?'':'none'}">
        <div class="form-section-title">Messwerte</div>
        <div id="metric-picker">${metricPicker}</div>
        <div id="custom-metric-list" style="margin-top:.75rem"></div>
        <button type="button" class="btn btn-ghost btn-sm" style="margin-top:.625rem"
                onclick="openAddCustomMetric()">+ Messwert hinzufügen</button>
      </div>
      <div id="active-metric-fields" style="display:${entryMode==='doctor'?'':'none'}"></div>

      <!-- ── Messwerte: Eigene Messung (alle Felder direkt) ── -->
      <div class="form-section" id="metric-section-self" style="display:${entryMode==='self'?'':'none'}">
        <div class="form-section-title">Messwerte</div>
        ${selfMetricFields}
        <div style="margin-top:.75rem">
          <div id="custom-metric-list-self"></div>
          <button type="button" class="btn btn-ghost btn-sm" style="margin-top:.5rem"
                  onclick="openAddCustomMetric()">+ Eigenen Messwert hinzufügen</button>
        </div>
      </div>

      <div style="margin-top:1.25rem;display:flex;gap:.75rem;justify-content:flex-end">
        ${isEdit
          ? `<button class="btn btn-ghost" onclick="cancelEditEntry()">Abbrechen</button>`
          : `<button class="btn btn-ghost" onclick="renderEntryForm()">Zurücksetzen</button>`}
        <button class="btn btn-primary" onclick="saveEntry()">${isEdit?'Änderungen speichern':'Speichern'}</button>
      </div>
    </div>`;

  // Keyboard shortcuts: Ctrl+Enter saves, Escape resets/cancels
  if (_entryAbort) _entryAbort.abort();
  _entryAbort = new AbortController();
  document.addEventListener('keydown', _entryKeyHandler, { signal: _entryAbort.signal });

  // Auto-focus first field
  requestAnimationFrame(() => document.getElementById('entry-date')?.focus());

  // Nach dem Rendern: beim Bearbeiten die Felder befüllen
  if (isEdit) {
    // Pills aktivieren + Felder bauen
    activeFormMetrics.forEach(key => {
      document.querySelector(`.metric-toggle-btn[data-key="${key}"]`)?.classList.add('active');
    });
    rebuildActiveFields();
    // Predefined-Werte eintragen (doctor-mode: mf-, self-mode: self-)
    Object.entries(editEntry.metrics || {}).forEach(([k, v]) => {
      const el = document.getElementById((entryMode==='self'?'self-':'mf-') + k);
      if (el) el.value = v;
    });
    renderCustomMetricList();
  }
}

// ── Modus umschalten ──────────────────────────
function setEntryMode(mode) {
  entryMode = mode;
  document.getElementById('mode-btn-doctor')?.classList.toggle('active', mode==='doctor');
  document.getElementById('mode-btn-self')?.classList.toggle('active',   mode==='self');
  // Doctor-Felder (Arzt, Grund, Diagnose…)
  const df = document.getElementById('doctor-fields');
  if (df) df.style.display = mode==='doctor' ? '' : 'none';
  // Messwert-Picker: Arztbesuch = Pill-Auswahl, Eigene Messung = alle Felder direkt
  const ms_doc  = document.getElementById('metric-section-doctor');
  const ms_self = document.getElementById('metric-section-self');
  const amf     = document.getElementById('active-metric-fields');
  if (ms_doc)  ms_doc.style.display  = mode==='doctor' ? '' : 'none';
  if (ms_self) ms_self.style.display = mode==='self'   ? '' : 'none';
  if (amf)     amf.style.display     = mode==='doctor' ? '' : 'none';
}

// ── Predefined metric toggle ──────────────────
function toggleFormMetric(key) {
  const btn = document.querySelector(`.metric-toggle-btn[data-key="${key}"]`);
  if (activeFormMetrics.has(key)) {
    activeFormMetrics.delete(key);
    btn?.classList.remove('active');
  } else {
    activeFormMetrics.add(key);
    btn?.classList.add('active');
  }
  rebuildActiveFields();
}

// ── Custom metric dialog ──────────────────────
function openAddCustomMetric() {
  // Remove existing popup if any
  document.getElementById('custom-metric-popup')?.remove();

  const popup = document.createElement('div');
  popup.id = 'custom-metric-popup';
  popup.className = 'modal-overlay';
  popup.innerHTML = `
    <div class="modal" style="max-width:380px">
      <div class="modal-header">
        <h2>Messwert hinzufügen</h2>
        <button class="modal-close" onclick="document.getElementById('custom-metric-popup').remove()">✕</button>
      </div>
      <div class="modal-body">
        <div class="stack">
          <div class="field-group">
            <label for="cm-label">Bezeichnung</label>
            <input type="text" id="cm-label" autocomplete="off" placeholder="z.B. Harnsäure">
          </div>
          <div class="field-group">
            <label for="cm-unit">Einheit</label>
            <input type="text" id="cm-unit" autocomplete="off" placeholder="z.B. mg/dL">
          </div>
          <div class="field-group">
            <label for="cm-value">Wert</label>
            <input type="number" step="any" id="cm-value" autocomplete="off" placeholder="Wert eingeben">
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="document.getElementById('custom-metric-popup').remove()">Abbrechen</button>
        <button class="btn btn-primary" onclick="confirmAddCustomMetric()">Hinzufügen</button>
      </div>
    </div>`;
  popup.addEventListener('click', e => { if (e.target===popup) popup.remove(); });
  document.body.appendChild(popup);
  document.getElementById('cm-label')?.focus();
}

function confirmAddCustomMetric() {
  const label = document.getElementById('cm-label')?.value.trim();
  const unit  = document.getElementById('cm-unit')?.value.trim();
  const value = document.getElementById('cm-value')?.value.trim();
  if (!label) { showToast('Bitte eine Bezeichnung eingeben','error'); return; }

  const key = 'custom_' + label.toLowerCase().replace(/[^a-z0-9]/g,'_') + '_' + Date.now();

  // Dauerhaft als eigene Metrik in DATA registrieren → Pill + Diagramm
  if (!DATA.customMetrics) DATA.customMetrics = [];
  DATA.customMetrics.push({ key, label, unit: unit||'', group: 'Eigene Messwerte', graphable: true });
  markUnsaved();

  // Im aktuellen Formular gleich mit Wert vormerken
  customMetrics.push({ key, label, unit: unit||'', value: value||'' });

  document.getElementById('custom-metric-popup')?.remove();
  renderCustomMetricList();
  showToast('Messwert "' + label + '" hinzugefügt ✓','success');
}

function removeCustomMetric(key) {
  customMetrics = customMetrics.filter(m=>m.key!==key);
  renderCustomMetricList();
}

function renderCustomMetricList() {
  // Beide Modi bedienen: Arztbesuch (#custom-metric-list) UND
  // Eigene Messung (#custom-metric-list-self). Vorher wurde nur der
  // Arzt-Container befüllt → im Self-Modus unsichtbar + NaN beim Speichern.
  const html = !customMetrics.length ? '' : customMetrics.map(m=>`
    <div class="custom-metric-row">
      <span class="custom-metric-label">${esc(m.label)}${m.unit?' ('+esc(m.unit)+')':''}</span>
      <input type="number" step="any" class="cmv-input" data-key="${m.key}"
             value="${escAttr(m.value ?? '')}" placeholder="Wert"
             style="width:110px;font-size:.875rem;padding:.375rem .5rem">
      <button class="btn btn-ghost btn-sm" style="color:var(--danger)"
              onclick="removeCustomMetric('${m.key}')">✕</button>
    </div>`).join('');
  ['custom-metric-list', 'custom-metric-list-self'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  });
}

// ── Rebuild active predefined fields ─────────
function rebuildActiveFields() {
  const container = document.getElementById('active-metric-fields');
  if (!container) return;

  const saved = {};
  activeFormMetrics.forEach(key => {
    const el = document.getElementById(`mf-${key}`);
    const def = metricDef(key);
    if (el) saved[key] = def?.type === 'boolean' ? el.checked : el.value;
  });

  if (!activeFormMetrics.size) { container.innerHTML=''; return; }

  const groups = [...new Set(allMetrics().filter(m=>activeFormMetrics.has(m.key)).map(m=>m.group))];
  const html = groups.map(g=>{
    const fields = allMetrics().filter(m=>m.group===g && activeFormMetrics.has(m.key)).map(m=>{
      if (m.type === 'boolean') return `
        <div class="field-group field-group--boolean">
          <label class="boolean-label" for="mf-${m.key}">
            <input type="checkbox" id="mf-${m.key}" class="boolean-check">
            <span>${esc(m.label)}</span>
          </label>
        </div>`;
      if (m.type === 'select') return `
        <div class="field-group">
          <label for="mf-${m.key}">${esc(m.label)}</label>
          <select id="mf-${m.key}">
            <option value="">— nicht erfasst —</option>
            ${(m.options||[]).map(o=>`<option value="${escAttr(o)}">${esc(o)}</option>`).join('')}
          </select>
        </div>`;
      return `
        <div class="field-group">
          <label for="mf-${m.key}">${esc(m.label)}${m.unit?` (${esc(m.unit)})`:''}</label>
          <input type="number" step="any" id="mf-${m.key}" placeholder="${escAttr(m.label)}…">
        </div>`;
    }).join('');
    return `<div class="form-section">
      <div class="form-section-title">📊 ${esc(g)}</div>
      <div class="form-grid">${fields}</div>
    </div>`;
  }).join('');

  container.innerHTML = html;

  Object.entries(saved).forEach(([key, val]) => {
    const el = document.getElementById(`mf-${key}`);
    const def = metricDef(key);
    if (!el || val === '' || val === undefined) return;
    if (def?.type === 'boolean') el.checked = val;
    else el.value = val;
  });
}



// ── Save entry ────────────────────────────────
function saveEntry() {
  const date = document.getElementById('entry-date')?.value;
  if (!date) { showToast('Bitte ein Datum angeben', 'error'); return; }
  if (date > todayISO()) {
    showToast('Das Datum darf nicht in der Zukunft liegen', 'error');
    document.getElementById('entry-date')?.focus();
    return;
  }

  // Predefined metrics
  const metrics = {};
  if (entryMode === 'doctor') {
    // Pill-selected fields (id="mf-${key}")
    activeFormMetrics.forEach(key=>{
      const el  = document.getElementById(`mf-${key}`);
      const def = metricDef(key);
      if (!el) return;
      if (def?.type === 'boolean') {
        if (el.checked) metrics[key] = true;
      } else if (def?.type === 'select') {
        if (el.value) metrics[key] = el.value;
      } else {
        const val = el?.value?.trim();
        if (val) metrics[key] = parseFloat(val);
      }
    });
  } else {
    // Self-mode: Felder nach Typ lesen
    allMetrics().filter(m => !m.computed && !m.custom).forEach(m=>{
      const el = document.getElementById(`self-${m.key}`);
      if (!el) return;
      if (m.type === 'boolean') {
        // Checkbox: nur speichern wenn angehakt
        if (el.checked) metrics[m.key] = true;
      } else if (m.type === 'select') {
        const val = el.value;
        if (val) metrics[m.key] = val;
      } else {
        const val = el.value?.trim();
        if (val) metrics[m.key] = parseFloat(val);
      }
    });
  }

  // Custom metrics — im aktiven Modus-Container per data-key lesen
  // (nicht per id, da der Input in beiden Containern existiert)
  const activeContainer = document.getElementById(
    entryMode === 'self' ? 'custom-metric-list-self' : 'custom-metric-list'
  );
  const customMetricValues = {};
  customMetrics.forEach(m=>{
    const el = activeContainer?.querySelector(`.cmv-input[data-key="${m.key}"]`);
    const val = el?.value.trim();
    if (val && val !== '') {
      customMetricValues[m.key] = {
        label: m.label,
        unit:  m.unit,
        value: parseFloat(val),
      };
    }
  });

  // Warn if any of these metrics already exist for this person on this date
  if (!editingEntryId) {
    const filledKeys = Object.keys(metrics).filter(k =>
      metrics[k] !== '' && metrics[k] !== null && metrics[k] !== undefined
    );
    if (filledKeys.length > 0) {
      const conflicts = filledKeys.filter(k =>
        DATA.entries.some(e =>
          e.personId === currentPersonId &&
          e.date === date &&
          e.metrics?.[k] !== undefined && e.metrics?.[k] !== null && e.metrics?.[k] !== ''
        )
      );
      if (conflicts.length > 0) {
        const names = conflicts.map(k => metricDef(k)?.label ?? k).join(', ');
        if (!confirm(`Für den ${fmtDate(date)} gibt es bereits Werte für: ${names}.\nTrotzdem speichern?`)) {
          return;
        }
      }
    }
  }

  const isDoctor = entryMode === 'doctor';

  const entryData = {
    personId:     currentPersonId,
    entryType:    entryMode,          // 'doctor' | 'self'
    date,
    doctor:       isDoctor ? (document.getElementById('entry-doctor')?.value.trim()    || '') : '',
    reason:       isDoctor ? (document.getElementById('entry-reason')?.value.trim()    || '') : '',
    diagnosis:    isDoctor ? (document.getElementById('entry-diagnosis')?.value.trim() || '') : '',
    checkupId:    isDoctor ? (document.getElementById('entry-checkup')?.value          || '') : '',
    notes:        (document.getElementById('entry-notes')?.value.trim() || ''),
    metrics,
    customMetrics: customMetricValues,
  };

  if (editingEntryId) {
    // Bestehenden Eintrag aktualisieren
    const idx = DATA.entries.findIndex(e => e.id === editingEntryId);
    if (idx >= 0) {
      DATA.entries[idx] = {
        ...DATA.entries[idx],
        ...entryData,
        updatedAt: new Date().toISOString(),
      };
    }
    editingEntryId = null;
    saveData();
    showToast('Änderungen gespeichert ✓','success');
    setTimeout(()=>activateTab('history'),400);
  } else {
    // Neuen Eintrag anlegen
    DATA.entries.push({
      id:        genId(),
      ...entryData,
      createdAt: new Date().toISOString(),
    });
    saveData();
    showToast('Eintrag gespeichert ✓','success');
    setTimeout(()=>activateTab('dashboard'),400);
  }
}

// ── Bearbeitung starten/abbrechen ─────────────
function editEntry(entryId) {
  const entry = DATA.entries.find(e => e.id === entryId);
  if (!entry) return;
  // sicherstellen dass die Person des Eintrags aktiv ist
  if (entry.personId !== currentPersonId) selectPerson(entry.personId);
  activateTab('entry');
  renderEntryForm(entry);
}

function cancelEditEntry() {
  editingEntryId = null;
  activateTab('history');
}



function openTargetDialog(metricKey) {
  document.getElementById('target-modal')?.remove();
  const def     = metricDef(metricKey);
  const current = getTarget(currentPersonId, metricKey);

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'target-modal';
  modal.innerHTML = `
    <div class="modal" style="max-width:360px">
      <div class="modal-header">
        <h2>Zielwert: ${esc(def?.label ?? metricKey)}</h2>
        <button class="modal-close" onclick="document.getElementById('target-modal').remove()">✕</button>
      </div>
      <div class="modal-body">
        <div class="field-group">
          <label for="target-input">Zielwert${def?.unit ? ' ('+esc(def.unit)+')' : ''}</label>
          <input type="text" inputmode="decimal" id="target-input"
                 value="${current ?? ''}"
                 placeholder="Leer lassen zum Entfernen"
                 oninput="this.value=this.value.replace(/[^0-9.,]/g,'').replace(/([.,].*)[.,]/g,'$1')">
        </div>
      </div>
      <div class="modal-footer">
        ${current !== null
          ? `<button class="btn btn-ghost" style="color:var(--danger);margin-right:auto"
                     onclick="setTarget('${currentPersonId}','${metricKey}',null);document.getElementById('target-modal').remove();refreshAfterTarget('${metricKey}')">
               Entfernen
             </button>`
          : ''}
        <button class="btn btn-primary" onclick="saveTargetDialog('${currentPersonId}','${metricKey}')">Speichern</button>
      </div>
    </div>`;
  modal.addEventListener('click', e => { if (e.target===modal) modal.remove(); });
  document.body.appendChild(modal);
  document.getElementById('target-input')?.focus();
}

function saveTargetDialog(pid, key) {
  const val = document.getElementById('target-input')?.value.trim();
  setTarget(pid, key, val === '' ? null : val);
  document.getElementById('target-modal')?.remove();
  refreshAfterTarget(key);
  showToast(val === '' ? 'Zielwert entfernt' : 'Zielwert gespeichert ✓', 'success');
}

function refreshAfterTarget(key) {
  // Aktualisiert Diagramm und Alle-Werte-Tab wenn offen
  const activeTab = document.querySelector('.tab-btn.active')?.id?.replace('tab-','');
  if (activeTab === 'graphs' && activeGraphKey === key) drawGraph(key);
  if (activeTab === 'allmetrics') renderAllMetrics();
  updateGraphTargetBtn(key);
}

function updateGraphTargetBtn(key) {
  const btn = document.getElementById('graph-target-btn');
  if (!btn) return;
  const def = metricDef(key);
  // Kein Zielwert für kategorische Metriken (boolean, select)
  if (def?.type === 'boolean' || def?.type === 'select') {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = '';
  const t = getTarget(currentPersonId, key);
  if (t !== null) {
    btn.textContent = `◉ Ziel: ${t}${def?.unit ? ' '+def.unit : ''}`;
    btn.style.color = 'var(--accent)';
  } else {
    btn.textContent = '◎ Zielwert';
    btn.style.color = '';
  }
}
