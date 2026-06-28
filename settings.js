/* ═══════════════════════════════════════════════
   Familien-Gesundheitsakte — settings.js
   ───────────────────────────────────────────────
   Einstellungen: Personen- und Checkup-Verwaltung inkl. Modals,
      Zeilen-Editoren, Loeschen/Zuruecksetzen.

   Teil eines klassischen Multi-Script-Setups (kein ES-Modul):
   alle Dateien teilen denselben globalen Scope. Reihenfolge der
   <script>-Tags siehe index.html.
   ═══════════════════════════════════════════════ */
'use strict';

// ═══════════════════════════════════════════════
// SETTINGS — Personen verwalten
// ═══════════════════════════════════════════════

// Persons live in DATA.persons (the loaded JSON database)
function savePersons(persons) {
  DATA.persons = persons;
  markUnsaved();
  if (!isDemoMode) updatePWAShortcuts();
}

function renderSettings() {
  const panel = document.getElementById('panel-settings');

  const persons = getPersonList();
  const personRows = persons.map((p, idx) => {
    const age = getAge(p.birthday);
    const color = personColor(p);
    const entryCnt = DATA.entries.filter(e => e.personId === p.id).length;
    const svgUp = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5"/></svg>`;
    const svgDown = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5"/></svg>`;
    const upBtn = idx > 0
      ? `<button class="person-order-btn" title="Nach oben" onclick="movePersonUp('${p.id}')">${svgUp}</button>`
      : `<span class="person-order-btn-placeholder"></span>`;
    const downBtn = idx < persons.length - 1
      ? `<button class="person-order-btn" title="Nach unten" onclick="movePersonDown('${p.id}')">${svgDown}</button>`
      : `<span class="person-order-btn-placeholder"></span>`;
    return `<div class="settings-person-row" id="srow-${p.id}" data-person-id="${p.id}">
      <div class="person-order-btns">${upBtn}${downBtn}</div>
      <div class="person-avatar" style="background:${color};width:36px;height:36px;font-size:.875rem;flex-shrink:0">${personAvatarContent(p)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:.9375rem">${esc(p.name)}</div>
        <div style="font-size:.8125rem;color:var(--text-muted)">${fmtDate(p.birthday)} · ${age}&nbsp;Jahre · ${genderLabel(p.gender)}${p.bloodType?' · '+esc(p.bloodType):''} · ${entryCnt}&nbsp;${entryCnt===1?'Eintrag':'Einträge'}</div>
      </div>
      <div style="display:flex;gap:.5rem;flex-shrink:0">
        <button class="btn btn-ghost btn-sm" onclick="openEditPerson('${p.id}')">Bearbeiten</button>
        <button class="btn btn-ghost btn-sm" style="color:var(--danger)"
          onclick="deletePerson('${p.id}')">Löschen</button>
      </div>
    </div>`;
  }).join('');

  // Checkup rows
  const checkupRows = getCheckups().map(c => {
    const every = c.intervalMonths >= 12
      ? `alle ${c.intervalMonths/12} J.`
      : `alle ${c.intervalMonths} M.`;
    const applies = [
      c.appliesTo?.gender === 'male' ? 'männl.' : c.appliesTo?.gender === 'female' ? 'weibl.' : null,
      c.appliesTo?.minAge != null ? `ab&nbsp;${c.appliesTo.minAge}` : null,
      c.appliesTo?.maxAge != null ? `bis&nbsp;${c.appliesTo.maxAge}` : null,
    ].filter(Boolean).join(', ') || 'Alle';
    const contactBits = [
      c.phone ? esc(c.phone) : null,
      c.url   ? 'Web-Link'   : null,
    ].filter(Boolean).join(' · ');
    return `<div class="settings-person-row">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:.9375rem">${esc(c.name)}</div>
        <div style="font-size:.8125rem;color:var(--text-muted)">${every} · ${applies}${contactBits ? ' · '+contactBits : ''}</div>
      </div>
      <div style="display:flex;gap:.5rem;flex-shrink:0">
        <button class="btn btn-ghost btn-sm" onclick="openEditCheckup('${c.id}')">Bearbeiten</button>
        <button class="btn btn-ghost btn-sm" style="color:var(--danger)"
          onclick="deleteCheckup('${c.id}')">Löschen</button>
      </div>
    </div>`;
  }).join('');

  panel.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Personen</span>
        <button class="btn btn-primary btn-sm" onclick="openAddPerson()">+ Person hinzufügen</button>
      </div>
      <div id="persons-list">${personRows || '<p class="settings-empty">Keine Personen vorhanden.</p>'}</div>
    </div>

    <div class="card" style="margin-top:1rem">
      <div class="card-header">
        <span class="card-title">Vorsorge-Checkups</span>
        <button class="btn btn-primary btn-sm" onclick="openEditCheckup(null)">+ Checkup hinzufügen</button>
      </div>
      ${checkupRows || '<p class="settings-empty">Keine Checkups definiert.</p>'}
    </div>

    <div class="card" style="margin-top:1rem">
      <div class="card-header"><span class="card-title">Datenbank</span></div>
      ${isDemoMode
        ? `<p class="settings-warning">Du bist im Demo-Modus. Lege eine eigene Datenbank an, um Daten dauerhaft zu speichern.</p>`
        : ''}
      <div class="settings-action-grid">
        <button class="btn btn-primary settings-action-btn" onclick="exportData()">Datenbank exportieren</button>
        <button class="btn btn-ghost settings-action-btn" onclick="backToLanding()">Andere Datenbank laden</button>
      </div>
      <p class="field-hint">
        Der Export erzeugt eine JSON-Datei mit Zeitstempel (z.B. gesundheitsakte-2026-06-22_14-30-45.json),
        die du beim nächsten Mal wieder laden kannst.
      </p>
      ${renderDatabaseStats()}
    </div>

    <div class="card" style="margin-top:1rem">
      <div class="card-header"><span class="card-title">Apple Health</span></div>
      <p class="settings-body">
        Importiere Messwerte (Gewicht, Blutdruck, Puls u.a.) aus einem Apple-Health-Export.
        Pro Tag wird der erste Wert übernommen; bereits importierte Tage werden übersprungen.
      </p>
      <div class="settings-action-grid">
        <button class="btn btn-primary settings-action-btn" onclick="triggerHealthImport()">Aus Apple Health importieren</button>
      </div>
      <p class="field-hint">
        In der Health-App: Profil → „Alle Gesundheitsdaten exportieren". Die erzeugte
        export.zip hier hochladen — sie wird lokal im Browser entpackt und verarbeitet,
        nichts wird hochgeladen.
      </p>
    </div>

    <div class="card" style="margin-top:1rem">
      <div class="card-header"><span class="card-title">Quellen &amp; Lizenzen</span></div>
      <p class="settings-intro">Diese App ist Open Source. Der Quellcode ist auf <a href="https://github.com/gesundheitsakte/gesundheitsakte.github.io" target="_blank" rel="noopener noreferrer">GitHub</a> einsehbar.</p>
      <div class="attribution-list">
        <div class="attribution-item">
          <span class="attribution-name">Heroicons</span>
          <span class="attribution-desc">Icons von Tailwind Labs — MIT-Lizenz</span>
          <a class="attribution-link" href="https://heroicons.com" target="_blank" rel="noopener noreferrer">heroicons.com</a>
        </div>
        <div class="attribution-item">
          <span class="attribution-name">fflate</span>
          <span class="attribution-desc">ZIP/Deflate-Bibliothek von 101arrowz — MIT-Lizenz</span>
          <a class="attribution-link" href="https://github.com/101arrowz/fflate" target="_blank" rel="noopener noreferrer">github.com/101arrowz/fflate</a>
        </div>
        <div class="attribution-item">
          <span class="attribution-name">Inter</span>
          <span class="attribution-desc">Schriftart von Rasmus Andersson — SIL Open Font License</span>
          <a class="attribution-link" href="https://rsms.me/inter" target="_blank" rel="noopener noreferrer">rsms.me/inter</a>
        </div>
        <div class="attribution-item">
          <span class="attribution-name">JetBrains Mono</span>
          <span class="attribution-desc">Monospace-Schriftart von JetBrains — SIL Open Font License</span>
          <a class="attribution-link" href="https://www.jetbrains.com/lp/mono" target="_blank" rel="noopener noreferrer">jetbrains.com/lp/mono</a>
        </div>
      </div>
    </div>`;

}

function movePersonUp(id) {
  const persons = getPersonList();
  const idx = persons.findIndex(p => p.id === id);
  if (idx <= 0) return;
  persons.splice(idx - 1, 0, persons.splice(idx, 1)[0]);
  savePersons(persons);
  buildPersonSelector();
  renderSettings();
}

function movePersonDown(id) {
  const persons = getPersonList();
  const idx = persons.findIndex(p => p.id === id);
  if (idx < 0 || idx >= persons.length - 1) return;
  persons.splice(idx + 1, 0, persons.splice(idx, 1)[0]);
  savePersons(persons);
  buildPersonSelector();
  renderSettings();
}

// ── Checkup-Modal ─────────────────────────────
function openEditCheckup(id) {
  document.getElementById('checkup-modal')?.remove();
  const existing = id ? getCheckups().find(c => c.id === id) : null;
  const c = existing || { id: 'chk_'+Date.now(), name:'', intervalMonths:12, description:'', appliesTo:{} };

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'checkup-modal';
  modal.innerHTML = `
    <div class="modal" style="max-width:480px">
      <div class="modal-header">
        <h2>${existing ? 'Checkup bearbeiten' : 'Checkup hinzufügen'}</h2>
        <button class="modal-close" onclick="document.getElementById('checkup-modal').remove()">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="field-group full">
            <label for="chk-name">Name</label>
            <input type="text" id="chk-name" value="${escAttr(c.name)}" placeholder="z.B. Zahnarzt Kontrolle">
          </div>
          <div class="field-group">
            <label for="chk-interval">Intervall (Monate)</label>
            <input type="number" id="chk-interval" value="${c.intervalMonths}" min="1" max="240">
          </div>
          <div class="field-group">
            <label for="chk-desc">Beschreibung (optional)</label>
            <input type="text" id="chk-desc" value="${escAttr(c.description||'')}" placeholder="Kurzbeschreibung">
          </div>
          <div class="field-group">
            <label for="chk-phone">Telefon (optional)</label>
            <input type="tel" id="chk-phone" value="${escAttr(c.phone||'')}" placeholder="z.B. +43 1 234567" inputmode="tel">
          </div>
          <div class="field-group full">
            <label for="chk-url">Website / Termin-Link (optional)</label>
            <input type="url" id="chk-url" value="${escAttr(c.url||'')}" placeholder="https://…" inputmode="url">
          </div>
        </div>
        <div class="form-section-title" style="margin-top:1rem;margin-bottom:.75rem">Gilt für (optional)</div>
        <div class="form-grid">
          <div class="field-group">
            <label for="chk-gender">Geschlecht</label>
            <select id="chk-gender">
              <option value="">Alle</option>
              <option value="male"   ${c.appliesTo?.gender==='male'   ?'selected':''}>Männlich</option>
              <option value="female" ${c.appliesTo?.gender==='female' ?'selected':''}>Weiblich</option>
            </select>
          </div>
          <div class="field-group"></div>
          <div class="field-group">
            <label for="chk-minage">Mindestalter</label>
            <input type="number" id="chk-minage" value="${c.appliesTo?.minAge ?? ''}" min="0" max="120" placeholder="—">
          </div>
          <div class="field-group">
            <label for="chk-maxage">Höchstalter</label>
            <input type="number" id="chk-maxage" value="${c.appliesTo?.maxAge ?? ''}" min="0" max="120" placeholder="—">
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="document.getElementById('checkup-modal').remove()">Abbrechen</button>
        <button class="btn btn-primary" onclick="saveCheckupModal('${c.id}', ${!!existing})">Speichern</button>
      </div>
    </div>`;
  modal.addEventListener('click', e => { if (e.target===modal) modal.remove(); });
  document.body.appendChild(modal);
}

function saveCheckupModal(id, isEdit) {
  const name     = document.getElementById('chk-name')?.value.trim();
  const interval = parseInt(document.getElementById('chk-interval')?.value) || 12;
  const desc     = document.getElementById('chk-desc')?.value.trim();
  const phone    = document.getElementById('chk-phone')?.value.trim();
  let   url      = document.getElementById('chk-url')?.value.trim();
  const gender   = document.getElementById('chk-gender')?.value || null;
  const minAge   = document.getElementById('chk-minage')?.value.trim();
  const maxAge   = document.getElementById('chk-maxage')?.value.trim();
  if (!name) { showToast('Bitte einen Namen eingeben','error'); return; }

  // Fehlendes URL-Schema ergänzen, damit der Link funktioniert
  if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;

  const appliesTo = {};
  if (gender)         appliesTo.gender  = gender;
  if (minAge !== '')  appliesTo.minAge  = parseInt(minAge);
  if (maxAge !== '')  appliesTo.maxAge  = parseInt(maxAge);

  const updated = { id, name, intervalMonths: interval, description: desc||'', appliesTo };
  if (phone) updated.phone = phone;
  if (url)   updated.url   = url;
  let checkups = [...getCheckups()];
  if (isEdit) {
    const idx = checkups.findIndex(c => c.id === id);
    if (idx >= 0) checkups[idx] = updated; else checkups.push(updated);
  } else {
    checkups.push(updated);
  }
  saveCheckups(checkups);
  document.getElementById('checkup-modal')?.remove();
  renderSettings();
  showToast(isEdit ? 'Checkup aktualisiert ✓' : 'Checkup hinzugefügt ✓', 'success');
}

function deleteCheckup(id) {
  const c = getCheckups().find(c => c.id === id);
  if (!c || !confirm(`Checkup "${c.name}" löschen?`)) return;
  saveCheckups(getCheckups().filter(c => c.id !== id));
  renderSettings();
  showToast('Checkup gelöscht');
}

function openAddPerson() {
  openPersonModal(null);
}
function openEditPerson(id) {
  const p = getPersonList().find(p=>p.id===id);
  if (p) openPersonModal(p);
}

function openPersonModal(person) {
  // Remove any existing modal
  document.getElementById('person-modal')?.remove();

  const isEdit = !!person;
  const p = person || { id:'person_'+Date.now(), name:'', birthday:'', gender:'male', bloodType:'' };
  const avatarType = p.avatarType || 'icon';

  // Initialize counters above existing row count so new IDs never collide with rendered ones
  _condCount = (p.conditions    || []).length;
  _famCount  = (p.familyHistory || []).length;
  _medCount  = (p.medications   || []).length;
  _vacCount  = (p.vaccinations  || []).length;
  _algCount  = (p.allergies     || []).length;

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'person-modal';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2>${isEdit?'Person bearbeiten':'Person hinzufügen'}</h2>
        <button class="modal-close" onclick="closePersonModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="field-group full">
            <label for="pm-name">Name</label>
            <input type="text" id="pm-name" value="${escAttr(p.name)}" placeholder="Vorname Nachname">
          </div>
          <div class="field-group">
            <label for="pm-birthday">Geburtsdatum</label>
            <input type="date" id="pm-birthday" value="${escAttr(p.birthday)}">
          </div>
          <div class="field-group">
            <label for="pm-gender">Geschlecht</label>
            <select id="pm-gender">
              <option value="male"  ${p.gender==='male'  ?'selected':''}>Männlich</option>
              <option value="female"${p.gender==='female'?'selected':''}>Weiblich</option>
              <option value="other" ${p.gender==='other' ?'selected':''}>Divers</option>
            </select>
          </div>
          <div class="field-group">
            <label for="pm-blood">Blutgruppe</label>
            <select id="pm-blood">
              <option value="">— unbekannt —</option>
              ${['A+','A-','B+','B-','AB+','AB-','0+','0-'].map(bg=>
                `<option value="${bg}" ${p.bloodType===bg?'selected':''}>${bg}</option>`
              ).join('')}
            </select>
          </div>
          <div class="field-group">
            <label for="pm-svnr">Sozialversicherungsnummer</label>
            <input type="text" id="pm-svnr" value="${escAttr(p.socialSecurityNumber||'')}" placeholder="z.B. 1234 010190" inputmode="numeric">
          </div>
          <div class="field-group full">
            <label>Profilbild</label>
            <div class="avatar-type-picker">
              <button type="button" class="avatar-type-option${avatarType!=='initials'?' selected':''}"
                      onclick="selectAvatarType('icon')" data-type="icon">
                <div class="avatar-type-preview" style="background:${personColor(p)}">${PERSON_ICON_SVG}</div>
                <span>Symbol</span>
              </button>
              <button type="button" class="avatar-type-option${avatarType==='initials'?' selected':''}"
                      onclick="selectAvatarType('initials')" data-type="initials">
                <div class="avatar-type-preview" style="background:${personColor(p)}">${esc(initials(p.name||'?'))}</div>
                <span>Initialen</span>
              </button>
            </div>
            <input type="hidden" id="pm-avatar-type" value="${escAttr(avatarType)}">
          </div>
          <div class="field-group full">
            <label>Farbe</label>
            <div class="person-color-picker" id="pm-color-picker">
              ${AVATAR_COLORS.map(c => `
                <button type="button" class="person-color-swatch${(p.color||avatarColor(p.id))===c?' selected':''}"
                  style="background:${c}" data-color="${c}"
                  onclick="selectPersonColor('${c}')" title="${c}"></button>`).join('')}
            </div>
            <input type="hidden" id="pm-color" value="${escAttr(p.color||avatarColor(p.id))}">
          </div>
        </div>
        <div style="margin-top:1rem">
          <div class="form-section-title" style="margin-bottom:.75rem">Chronische Leiden</div>
          <div id="pm-conditions">
            ${(p.conditions||[]).map((c,i)=>conditionRow(i,c)).join('')}
          </div>
          <button class="btn btn-ghost btn-sm" style="margin-top:.5rem" onclick="addConditionRow()">+ Leiden hinzufügen</button>
        </div>
        <div style="margin-top:1rem">
          <div class="form-section-title" style="margin-bottom:.75rem">Familiengeschichte</div>
          <div id="pm-family">
            ${(p.familyHistory||[]).map((f,i)=>familyRow(i,f)).join('')}
          </div>
          <button class="btn btn-ghost btn-sm" style="margin-top:.5rem" onclick="addFamilyRow()">+ Eintrag hinzufügen</button>
        </div>
        <div style="margin-top:1rem">
          <div class="form-section-title" style="margin-bottom:.75rem">Medikamente</div>
          <div id="pm-medications">
            ${(p.medications||[]).map((m,i)=>medicationRow(i,m)).join('')}
          </div>
          <button class="btn btn-ghost btn-sm" style="margin-top:.5rem" onclick="addMedicationRow()">+ Medikament hinzufügen</button>
        </div>
        <div style="margin-top:1rem">
          <div class="form-section-title" style="margin-bottom:.75rem">Impfungen</div>
          <div id="pm-vaccinations">
            ${(p.vaccinations||[]).map((v,i)=>vaccinationRow(i,v)).join('')}
          </div>
          <button class="btn btn-ghost btn-sm" style="margin-top:.5rem" onclick="addVaccinationRow()">+ Impfung hinzufügen</button>
        </div>
        <div style="margin-top:1rem">
          <div class="form-section-title" style="margin-bottom:.75rem">Allergien</div>
          <div id="pm-allergies">
            ${(p.allergies||[]).map((a,i)=>allergyRow(i,a)).join('')}
          </div>
          <button class="btn btn-ghost btn-sm" style="margin-top:.5rem" onclick="addAllergyRow()">+ Allergie hinzufügen</button>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closePersonModal()">Abbrechen</button>
        <button class="btn btn-primary" onclick="savePersonModal('${p.id}', ${isEdit})">Speichern</button>
      </div>
    </div>`;

  document.body.appendChild(modal);
  // Close on backdrop click
  modal.addEventListener('click', e => { if (e.target===modal) closePersonModal(); });
}

function conditionRow(i, c={}) {
  return `<div class="inline-row" id="crow-${i}">
    <input type="text" placeholder="Leiden" value="${escAttr(c.name||'')}" data-ci="${i}" data-field="name" oninput="syncConditionRow(this)">
    <input type="text" placeholder="Seit (Jahr)" style="max-width:110px" value="${escAttr(c.since||'')}" data-ci="${i}" data-field="since" oninput="syncConditionRow(this)">
    <input type="text" placeholder="Notizen" value="${escAttr(c.notes||'')}" data-ci="${i}" data-field="notes" oninput="syncConditionRow(this)">
    <button class="btn btn-ghost btn-sm" style="color:var(--danger);flex-shrink:0" onclick="removeRow('crow-${i}')">✕</button>
  </div>`;
}
function familyRow(i, f={}) {
  return `<div class="inline-row" id="frow-${i}">
    <input type="text" placeholder="Erkrankung" value="${escAttr(f.condition||'')}" data-fi="${i}" data-field="condition" oninput="syncFamilyRow(this)">
    <input type="text" placeholder="Verwandtschaft" style="max-width:130px" value="${escAttr(f.relation||'')}" data-fi="${i}" data-field="relation" oninput="syncFamilyRow(this)">
    <input type="text" placeholder="Notizen" value="${escAttr(f.notes||'')}" data-fi="${i}" data-field="notes" oninput="syncFamilyRow(this)">
    <button class="btn btn-ghost btn-sm" style="color:var(--danger);flex-shrink:0" onclick="removeRow('frow-${i}')">✕</button>
  </div>`;
}

let _condCount=0,_famCount=0,_medCount=0,_vacCount=0,_algCount=0;
function addConditionRow() { const c=document.getElementById('pm-conditions'); c.insertAdjacentHTML('beforeend',conditionRow(_condCount++)); }
function addFamilyRow()    { const c=document.getElementById('pm-family');     c.insertAdjacentHTML('beforeend',familyRow(_famCount++)); }
function addMedicationRow(){ const c=document.getElementById('pm-medications');c.insertAdjacentHTML('beforeend',medicationRow(_medCount++)); }
function addVaccinationRow(){ const c=document.getElementById('pm-vaccinations');c.insertAdjacentHTML('beforeend',vaccinationRow(_vacCount++)); }
function addAllergyRow()   { const c=document.getElementById('pm-allergies');  c.insertAdjacentHTML('beforeend',allergyRow(_algCount++)); }
function removeRow(id) { document.getElementById(id)?.remove(); }

function medicationRow(i, m={}) {
  return `<div class="inline-row" id="mrow-${i}">
    <input type="text" placeholder="Medikament" value="${escAttr(m.name||'')}">
    <input type="text" placeholder="Dosierung" style="max-width:100px" value="${escAttr(m.dosage||'')}">
    <input type="text" placeholder="Seit (Jahr)" style="max-width:90px" value="${escAttr(m.since||'')}">
    <input type="text" placeholder="Notizen" value="${escAttr(m.notes||'')}">
    <button class="btn btn-ghost btn-sm" style="color:var(--danger);flex-shrink:0" onclick="removeRow('mrow-${i}')">✕</button>
  </div>`;
}
function vaccinationRow(i, v={}) {
  return `<div class="inline-row" id="vrow-${i}">
    <input type="text" placeholder="Impfstoff / Krankheit" value="${escAttr(v.name||'')}">
    <input type="date" style="max-width:140px" value="${escAttr(v.date||'')}" title="Impfdatum">
    <input type="text" placeholder="Auffrischung" style="max-width:120px" value="${escAttr(v.nextDue||'')}">
    <input type="text" placeholder="Notizen" value="${escAttr(v.notes||'')}">
    <button class="btn btn-ghost btn-sm" style="color:var(--danger);flex-shrink:0" onclick="removeRow('vrow-${i}')">✕</button>
  </div>`;
}
function allergyRow(i, a={}) {
  return `<div class="inline-row" id="arow-${i}">
    <input type="text" placeholder="Allergie" value="${escAttr(a.name||'')}">
    <input type="text" placeholder="Schweregrad" style="max-width:120px" value="${escAttr(a.severity||'')}">
    <input type="text" placeholder="Notizen" value="${escAttr(a.notes||'')}">
    <button class="btn btn-ghost btn-sm" style="color:var(--danger);flex-shrink:0" onclick="removeRow('arow-${i}')">✕</button>
  </div>`;
}

// These are unused (oninput is just for future extension); reading from DOM on save is enough
function syncConditionRow(){}
function syncFamilyRow(){}

function selectAvatarType(type) {
  document.getElementById('pm-avatar-type').value = type;
  document.querySelectorAll('.avatar-type-option').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.type === type);
  });
}

function selectPersonColor(color) {
  document.getElementById('pm-color').value = color;
  document.querySelectorAll('#pm-color-picker .person-color-swatch').forEach(s => {
    s.classList.toggle('selected', s.dataset.color === color);
  });
}

function readConditions() {
  return [...document.querySelectorAll('#pm-conditions .inline-row')].map(row => ({
    name:  row.querySelector('[data-field="name"]')?.value.trim()  || '',
    since: row.querySelector('[data-field="since"]')?.value.trim() || '',
    notes: row.querySelector('[data-field="notes"]')?.value.trim() || '',
  })).filter(c=>c.name);
}
function readFamilyHistory() {
  return [...document.querySelectorAll('#pm-family .inline-row')].map(row => ({
    condition: row.querySelector('[data-field="condition"]')?.value.trim() || '',
    relation:  row.querySelector('[data-field="relation"]')?.value.trim()  || '',
    notes:     row.querySelector('[data-field="notes"]')?.value.trim()     || '',
  })).filter(f=>f.condition);
}
function readMedications() {
  return [...document.querySelectorAll('#pm-medications .inline-row')].map(row => {
    const inputs = row.querySelectorAll('input');
    return { name: inputs[0]?.value.trim()||'', dosage: inputs[1]?.value.trim()||'',
             since: inputs[2]?.value.trim()||'', notes: inputs[3]?.value.trim()||'' };
  }).filter(m=>m.name);
}
function readVaccinations() {
  return [...document.querySelectorAll('#pm-vaccinations .inline-row')].map(row => {
    const inputs = row.querySelectorAll('input');
    return { name: inputs[0]?.value.trim()||'', date: inputs[1]?.value||'',
             nextDue: inputs[2]?.value.trim()||'', notes: inputs[3]?.value.trim()||'' };
  }).filter(v=>v.name);
}
function readAllergies() {
  return [...document.querySelectorAll('#pm-allergies .inline-row')].map(row => {
    const inputs = row.querySelectorAll('input');
    return { name: inputs[0]?.value.trim()||'', severity: inputs[1]?.value.trim()||'',
             notes: inputs[2]?.value.trim()||'' };
  }).filter(a=>a.name);
}

function savePersonModal(id, isEdit) {
  const name     = document.getElementById('pm-name')?.value.trim();
  const birthday = document.getElementById('pm-birthday')?.value;
  const gender   = document.getElementById('pm-gender')?.value;
  const blood    = document.getElementById('pm-blood')?.value;
  const svnr     = document.getElementById('pm-svnr')?.value.trim();
  const color      = document.getElementById('pm-color')?.value || null;
  const avatarType = document.getElementById('pm-avatar-type')?.value || 'icon';

  if (!name)     { showToast('Bitte einen Namen eingeben','error'); return; }
  if (!birthday) { showToast('Bitte ein Geburtsdatum eingeben','error'); return; }
  if (birthday > todayISO()) {
    showToast('Das Geburtsdatum darf nicht in der Zukunft liegen','error'); return;
  }

  const updated = {
    id, name, birthday, gender,
    bloodType: blood || null,
    socialSecurityNumber: svnr || null,
    color: color || null,
    avatarType: avatarType === 'initials' ? 'initials' : null,
    conditions:    readConditions(),
    familyHistory: readFamilyHistory(),
    medications:   readMedications(),
    vaccinations:  readVaccinations(),
    allergies:     readAllergies(),
  };

  let persons = [...getPersonList()];
  if (isEdit) {
    const idx = persons.findIndex(p=>p.id===id);
    if (idx>=0) persons[idx] = updated; else persons.push(updated);
  } else {
    persons.push(updated);
  }

  savePersons(persons);
  buildPersonSelector();
  // Keep same selection if editing, else select new person
  if (!isEdit) selectPerson(id);
  else if (id === currentPersonId) applyPersonAccent();
  closePersonModal();
  renderSettings();
  showToast(isEdit?'Person aktualisiert ✓':'Person hinzugefügt ✓','success');
}

function closePersonModal() {
  document.getElementById('person-modal')?.remove();
  _condCount=0; _famCount=0; _medCount=0; _vacCount=0; _algCount=0;
}

function deletePerson(id) {
  const p = getPersonList().find(p=>p.id===id);
  if (!p) return;
  const entryCount = DATA.entries.filter(e=>e.personId===id).length;
  const warn = entryCount>0 ? `\n⚠ Diese Person hat ${entryCount} Einträge, die ebenfalls gelöscht werden.` : '';
  if (!confirm(`"${p.name}" wirklich löschen?${warn}`)) return;

  const persons = getPersonList().filter(p=>p.id!==id);
  DATA.entries  = DATA.entries.filter(e=>e.personId!==id);
  savePersons(persons);
  saveData();

  // Switch to first remaining person
  if (currentPersonId===id) {
    const first = getPersonList()[0];
    if (first) selectPerson(first.id);
  }
  buildPersonSelector();
  renderSettings();
  showToast('Person gelöscht');
}

// ── Datenbankgröße ────────────────────────────
function renderDatabaseStats() {
  if (!DATA) return '';

  const fmtBytes = b => {
    if (b < 1024)       return b + ' B';
    if (b < 1024*1024)  return (b/1024).toFixed(1) + ' KB';
    return (b/1024/1024).toFixed(2) + ' MB';
  };

  // In-Memory-Größe (JSON-Serialisierung ohne Pretty-Print)
  const jsonStr   = JSON.stringify(DATA);
  const jsonBytes = new TextEncoder().encode(jsonStr).length;

  // localStorage-Größe (enthält zusätzlich Metadaten und Pretty-Print)
  let lsBytes = 0;
  try {
    const raw = localStorage.getItem('health-db-v1');
    if (raw) lsBytes = new TextEncoder().encode(raw).length;
  } catch {}

  const persons  = DATA.persons?.length  ?? 0;
  const entries  = DATA.entries?.length  ?? 0;
  const checkups = DATA.checkups?.length ?? 0;
  const custom   = DATA.customMetrics?.length ?? 0;

  // Ältester / neuester Eintrag
  const dates = (DATA.entries || []).map(e => e.date).filter(Boolean).sort();
  const dateRange = dates.length >= 2
    ? `${fmtDate(dates[0])} – ${fmtDate(dates[dates.length-1])}`
    : dates.length === 1 ? fmtDate(dates[0]) : '—';

  return `
    <div class="db-stats" style="margin-top:1.25rem">
      <div class="db-stats-row">
        <span class="db-stats-label">Personen</span>
        <span class="db-stats-value">${persons}</span>
      </div>
      <div class="db-stats-row">
        <span class="db-stats-label">Einträge</span>
        <span class="db-stats-value">${entries}</span>
      </div>
      <div class="db-stats-row">
        <span class="db-stats-label">Zeitraum</span>
        <span class="db-stats-value">${dateRange}</span>
      </div>
      ${checkups ? `
      <div class="db-stats-row">
        <span class="db-stats-label">Checkups</span>
        <span class="db-stats-value">${checkups}</span>
      </div>` : ''}
      ${custom ? `
      <div class="db-stats-row">
        <span class="db-stats-label">Eigene Metriken</span>
        <span class="db-stats-value">${custom}</span>
      </div>` : ''}
      <div class="db-stats-row db-stats-row--divider">
        <span class="db-stats-label">Größe (Arbeitsspeicher)</span>
        <span class="db-stats-value">${fmtBytes(jsonBytes)}</span>
      </div>
      ${lsBytes ? `
      <div class="db-stats-row">
        <span class="db-stats-label">Größe (localStorage)</span>
        <span class="db-stats-value">${fmtBytes(lsBytes)}</span>
      </div>` : ''}
    </div>`;
}
