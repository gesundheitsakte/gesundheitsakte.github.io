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
  saveData();
  if (!isDemoMode) updatePWAShortcuts();
}

const _SVG_UP   = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5"/></svg>`;
const _SVG_DOWN = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5"/></svg>`;

function renderSettings() {
  const panel = document.getElementById('panel-settings');

  const persons = getPersonList();
  const personRows = persons.map((p, idx) => {
    const age = getAge(p.birthday);
    const color = personColor(p);
    const entryCnt = DATA.entries.filter(e => e.personId === p.id).length;
    const upBtn = idx > 0
      ? `<button class="person-order-btn" title="Nach oben" onclick="movePersonUp('${p.id}')">${_SVG_UP}</button>`
      : `<span class="person-order-btn-placeholder"></span>`;
    const downBtn = idx < persons.length - 1
      ? `<button class="person-order-btn" title="Nach unten" onclick="movePersonDown('${p.id}')">${_SVG_DOWN}</button>`
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
    const every = c.intervalMonths % 12 === 0 && c.intervalMonths > 12
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

    ${renderEncryptionCard()}

    ${renderSyncCard()}

    <div class="card" style="margin-top:1rem">
      <div class="card-header"><span class="card-title">Darstellung</span></div>
      <div class="settings-theme-row">
        ${(() => {
          const isDark = document.documentElement.classList.contains('dark');
          return `
            <button class="settings-theme-btn${!isDark?' active':''}"
                    aria-pressed="${!isDark}"
                    onclick="applyDark(false,true); renderSettings()">
              ${SVG_SUN}<span>Hell</span>
            </button>
            <button class="settings-theme-btn${isDark?' active':''}"
                    aria-pressed="${isDark}"
                    onclick="applyDark(true,true); renderSettings()">
              ${SVG_MOON}<span>Dunkel</span>
            </button>`;
        })()}
      </div>
    </div>

    ${renderChangelogCard()}

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

function movePersonUp(id)   { _swapPersonRows(id, -1); }
function movePersonDown(id) { _swapPersonRows(id,  1); }

function _swapPersonRows(id, delta) {
  const persons = getPersonList();
  const idx = persons.findIndex(p => p.id === id);
  const newIdx = idx + delta;
  if (idx < 0 || newIdx < 0 || newIdx >= persons.length) return;

  const rowA = document.getElementById(`srow-${id}`);
  const rowB = document.getElementById(`srow-${persons[newIdx].id}`);
  const container = document.getElementById('persons-list');

  const movingName = persons[idx].name;
  const dir = delta < 0 ? 'nach oben' : 'nach unten';

  if (!rowA || !rowB || !container) {
    trackChange(`"${movingName}" ${dir} verschoben`, () => {
      persons.splice(newIdx, 0, persons.splice(idx, 1)[0]);
      savePersons(persons);
    });
    buildPersonSelector();
    renderSettings();
    return;
  }

  // Persist new order
  trackChange(`"${movingName}" ${dir} verschoben`, () => {
    persons.splice(newIdx, 0, persons.splice(idx, 1)[0]);
    savePersons(persons);
  });
  buildPersonSelector();

  // FLIP — record positions before DOM change
  const rectA = rowA.getBoundingClientRect();
  const rectB = rowB.getBoundingClientRect();

  // Swap DOM nodes
  if (delta < 0) container.insertBefore(rowA, rowB);
  else           container.insertBefore(rowB, rowA);

  // Rebuild order buttons only on the two affected rows
  const rows  = [...container.querySelectorAll('.settings-person-row')];
  const total = rows.length;
  [rowA, rowB].forEach(row => {
    const i   = rows.indexOf(row);
    const pid = row.dataset.personId;
    const b   = row.querySelector('.person-order-btns');
    if (!b) return;
    const up   = i > 0         ? `<button class="person-order-btn" title="Nach oben"   onclick="movePersonUp('${pid}')"  >${_SVG_UP}  </button>` : `<span class="person-order-btn-placeholder"></span>`;
    const down = i < total - 1 ? `<button class="person-order-btn" title="Nach unten"  onclick="movePersonDown('${pid}')">${_SVG_DOWN}</button>` : `<span class="person-order-btn-placeholder"></span>`;
    b.innerHTML = up + down;
  });

  // FLIP — invert: push elements back to their visual starting positions
  const newRectA = rowA.getBoundingClientRect();
  const newRectB = rowB.getBoundingClientRect();
  rowA.style.transition = 'none';
  rowB.style.transition = 'none';
  rowA.style.transform  = `translateY(${rectA.top - newRectA.top}px)`;
  rowB.style.transform  = `translateY(${rectB.top - newRectB.top}px)`;

  // Force reflow so the browser sees the starting state before playing
  rowA.getBoundingClientRect();

  // Play: animate to natural (post-swap) positions
  rowA.style.transition = 'transform .22s ease';
  rowB.style.transition = 'transform .22s ease';
  rowA.style.transform  = '';
  rowB.style.transform  = '';

  rowA.addEventListener('transitionend', () => {
    rowA.style.transition = '';
    rowB.style.transition = '';
  }, { once: true });
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
        <button class="modal-close" aria-label="Schließen" onclick="document.getElementById('checkup-modal').remove()">✕</button>
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
          <div class="field-group full">
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
  const changeDesc = isEdit ? `Checkup "${name}" aktualisiert` : `Checkup "${name}" hinzugefügt`;
  trackChange(changeDesc, () => {
    let checkups = [...getCheckups()];
    if (isEdit) {
      const idx = checkups.findIndex(c => c.id === id);
      if (idx >= 0) checkups[idx] = updated; else checkups.push(updated);
    } else {
      checkups.push(updated);
    }
    saveCheckups(checkups);
  });
  document.getElementById('checkup-modal')?.remove();
  renderSettings();
  showToast(isEdit ? 'Checkup aktualisiert ✓' : 'Checkup hinzugefügt ✓', 'success');
}

function deleteCheckup(id) {
  const c = getCheckups().find(c => c.id === id);
  if (!c || !confirm(`Checkup "${c.name}" löschen?`)) return;
  trackChange(`Checkup "${c.name}" gelöscht`, () => {
    saveCheckups(getCheckups().filter(x => x.id !== id));
  });
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

function openPersonModal(person, scrollTo) {
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
  _opCount   = (p.operations    || []).length;
  const hidden = p.hiddenSections || [];

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'person-modal';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2>${isEdit?'Person bearbeiten':'Person hinzufügen'}</h2>
        <button class="modal-close" aria-label="Schließen" onclick="closePersonModal()">✕</button>
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
              <button type="button" class="avatar-type-option${avatarType==='icon'||!avatarType?' selected':''}"
                      onclick="selectAvatarType('icon')" data-type="icon">
                <div class="avatar-type-preview" style="background:${personColor(p)}">${PERSON_ICON_SVG}</div>
                <span>Symbol</span>
              </button>
              <button type="button" class="avatar-type-option${avatarType==='smile'?' selected':''}"
                      onclick="selectAvatarType('smile')" data-type="smile">
                <div class="avatar-type-preview" style="background:${personColor(p)}">${PERSON_SMILE_SVG}</div>
                <span>Smiley</span>
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
        <div id="pm-section-favorites" style="margin-top:1rem">
          <div class="form-section-title" style="margin-bottom:.25rem">Favoriten</div>
          <p class="fav-metric-label-hint" style="margin:0 0 .75rem">Bis zu 4 Messwerte werden immer oben im Dashboard angezeigt.</p>
          <div class="fav-metric-picker" id="pm-fav-picker">
            ${(()=>{
              const favs = p.favoriteMetrics || [];
              const groups = [...new Set(allMetrics().map(m => m.group))];
              return groups.map(g => {
                const chips = allMetrics().filter(m => m.group === g).map(m =>
                  `<button type="button" class="fav-metric-chip${favs.includes(m.key)?' selected':''}"
                           onclick="toggleFavMetric('${escAttr(m.key)}')" data-key="${escAttr(m.key)}">${esc(m.label)}</button>`
                ).join('');
                return `<div class="fav-metric-group"><span class="fav-metric-group-label">${esc(g)}</span><div class="fav-metric-chips">${chips}</div></div>`;
              }).join('');
            })()}
          </div>
          <input type="hidden" id="pm-fav-metrics" value="${escAttr(JSON.stringify(p.favoriteMetrics || []))}">
        </div>
        <div id="pm-section-conditions" style="margin-top:1rem">
          <div class="form-section-header">
            <span class="form-section-title">Chronische Leiden</span>
            <label class="section-vis-toggle" title="Im Dashboard anzeigen">
              <input type="checkbox" id="pm-show-conditions" aria-label="Chronische Leiden im Dashboard anzeigen" ${!hidden.includes('conditions')?'checked':''}>
              <span class="toggle-track"></span>
            </label>
          </div>
          <div id="pm-conditions">
            ${(p.conditions||[]).map((c,i)=>conditionRow(i,c)).join('')}
          </div>
          <button class="btn btn-ghost btn-sm" style="margin-top:.5rem" onclick="addConditionRow()">+ Leiden hinzufügen</button>
        </div>
        <div id="pm-section-family" style="margin-top:1rem">
          <div class="form-section-header">
            <span class="form-section-title">Familiengeschichte</span>
            <label class="section-vis-toggle" title="Im Dashboard anzeigen">
              <input type="checkbox" id="pm-show-family" aria-label="Familiengeschichte im Dashboard anzeigen" ${!hidden.includes('family')?'checked':''}>
              <span class="toggle-track"></span>
            </label>
          </div>
          <div id="pm-family">
            ${(p.familyHistory||[]).map((f,i)=>familyRow(i,f)).join('')}
          </div>
          <button class="btn btn-ghost btn-sm" style="margin-top:.5rem" onclick="addFamilyRow()">+ Eintrag hinzufügen</button>
        </div>
        <div id="pm-section-medications" style="margin-top:1rem">
          <div class="form-section-header">
            <span class="form-section-title">Medikamente</span>
            <label class="section-vis-toggle" title="Im Dashboard anzeigen">
              <input type="checkbox" id="pm-show-medications" aria-label="Medikamente im Dashboard anzeigen" ${!hidden.includes('medications')?'checked':''}>
              <span class="toggle-track"></span>
            </label>
          </div>
          <div id="pm-medications">
            ${(p.medications||[]).map((m,i)=>medicationRow(i,m)).join('')}
          </div>
          <button class="btn btn-ghost btn-sm" style="margin-top:.5rem" onclick="addMedicationRow()">+ Medikament hinzufügen</button>
        </div>
        <div id="pm-section-vaccinations" style="margin-top:1rem">
          <div class="form-section-header">
            <span class="form-section-title">Impfungen</span>
            <label class="section-vis-toggle" title="Im Dashboard anzeigen">
              <input type="checkbox" id="pm-show-vaccinations" aria-label="Impfungen im Dashboard anzeigen" ${!hidden.includes('vaccinations')?'checked':''}>
              <span class="toggle-track"></span>
            </label>
          </div>
          <div id="pm-vaccinations">
            ${(p.vaccinations||[]).map((v,i)=>vaccinationRow(i,v)).join('')}
          </div>
          <button class="btn btn-ghost btn-sm" style="margin-top:.5rem" onclick="addVaccinationRow()">+ Impfung hinzufügen</button>
        </div>
        <div id="pm-section-allergies" style="margin-top:1rem">
          <div class="form-section-header">
            <span class="form-section-title">Allergien</span>
            <label class="section-vis-toggle" title="Im Dashboard anzeigen">
              <input type="checkbox" id="pm-show-allergies" aria-label="Allergien im Dashboard anzeigen" ${!hidden.includes('allergies')?'checked':''}>
              <span class="toggle-track"></span>
            </label>
          </div>
          <div id="pm-allergies">
            ${(p.allergies||[]).map((a,i)=>allergyRow(i,a)).join('')}
          </div>
          <button class="btn btn-ghost btn-sm" style="margin-top:.5rem" onclick="addAllergyRow()">+ Allergie hinzufügen</button>
        </div>
        <div id="pm-section-operations" style="margin-top:1rem">
          <div class="form-section-header">
            <span class="form-section-title">Operationen &amp; Eingriffe</span>
            <label class="section-vis-toggle" title="Im Dashboard anzeigen">
              <input type="checkbox" id="pm-show-operations" aria-label="Operationen &amp; Eingriffe im Dashboard anzeigen" ${!hidden.includes('operations')?'checked':''}>
              <span class="toggle-track"></span>
            </label>
          </div>
          <div id="pm-operations">
            ${(p.operations||[]).map((o,i)=>operationRow(i,o)).join('')}
          </div>
          <button class="btn btn-ghost btn-sm" style="margin-top:.5rem" onclick="addOperationRow()">+ Operation hinzufügen</button>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closePersonModal()">Abbrechen</button>
        <button class="btn btn-primary" onclick="savePersonModal('${p.id}', ${isEdit})">Speichern</button>
      </div>
    </div>`;

  document.body.appendChild(modal);
  openModalAccessible(modal);
  if (scrollTo) {
    const sectionMap = {
      conditions:  'pm-section-conditions',
      family:      'pm-section-family',
      medications: 'pm-section-medications',
      vaccinations:'pm-section-vaccinations',
      allergies:   'pm-section-allergies',
      operations:  'pm-section-operations',
    };
    const targetId = sectionMap[scrollTo];
    if (targetId) requestAnimationFrame(() => {
      const scrollBox = modal.querySelector('.modal');
      const target = document.getElementById(targetId);
      const header = scrollBox?.querySelector('.modal-header');
      if (scrollBox && target) {
        const targetTop = target.getBoundingClientRect().top - scrollBox.getBoundingClientRect().top + scrollBox.scrollTop;
        scrollBox.scrollTop = targetTop - (header?.offsetHeight ?? 0) - 8;
        target.classList.add('section-glow');
        target.addEventListener('animationend', () => target.classList.remove('section-glow'), { once: true });
      }
    });
  }
  // Close on backdrop click
  modal.addEventListener('click', e => { if (e.target===modal) closePersonModal(); });
}

function conditionRow(i, c={}) {
  return `<div class="inline-row" id="crow-${i}">
    <input type="text" placeholder="Leiden" value="${escAttr(c.name||'')}" data-ci="${i}" data-field="name" oninput="syncConditionRow(this)">
    <input type="text" placeholder="Seit (Jahr)" value="${escAttr(c.since||'')}" data-ci="${i}" data-field="since" oninput="syncConditionRow(this)">
    <div class="inline-row-last">
      <input type="text" placeholder="Notizen" value="${escAttr(c.notes||'')}" data-ci="${i}" data-field="notes" oninput="syncConditionRow(this)">
      <button class="btn btn-ghost btn-sm" style="color:var(--danger);flex-shrink:0" onclick="removeRow('crow-${i}')">✕</button>
    </div>
  </div>`;
}
function familyRow(i, f={}) {
  return `<div class="inline-row" id="frow-${i}">
    <input type="text" placeholder="Erkrankung" value="${escAttr(f.condition||'')}" data-fi="${i}" data-field="condition" oninput="syncFamilyRow(this)">
    <input type="text" placeholder="Verwandtschaft" value="${escAttr(f.relation||'')}" data-fi="${i}" data-field="relation" oninput="syncFamilyRow(this)">
    <div class="inline-row-last">
      <input type="text" placeholder="Notizen" value="${escAttr(f.notes||'')}" data-fi="${i}" data-field="notes" oninput="syncFamilyRow(this)">
      <button class="btn btn-ghost btn-sm" style="color:var(--danger);flex-shrink:0" onclick="removeRow('frow-${i}')">✕</button>
    </div>
  </div>`;
}

let _condCount=0,_famCount=0,_medCount=0,_vacCount=0,_algCount=0,_opCount=0;
function addConditionRow()  { const c=document.getElementById('pm-conditions');  c.insertAdjacentHTML('beforeend',conditionRow(_condCount++)); }
function addFamilyRow()     { const c=document.getElementById('pm-family');      c.insertAdjacentHTML('beforeend',familyRow(_famCount++)); }
function addMedicationRow() { const c=document.getElementById('pm-medications'); c.insertAdjacentHTML('beforeend',medicationRow(_medCount++)); }
function addVaccinationRow(){ const c=document.getElementById('pm-vaccinations');c.insertAdjacentHTML('beforeend',vaccinationRow(_vacCount++)); }
function addAllergyRow()    { const c=document.getElementById('pm-allergies');   c.insertAdjacentHTML('beforeend',allergyRow(_algCount++)); }
function addOperationRow()  { const c=document.getElementById('pm-operations');  c.insertAdjacentHTML('beforeend',operationRow(_opCount++)); }
function removeRow(id) { document.getElementById(id)?.remove(); }

function medicationRow(i, m={}) {
  return `<div class="inline-row" id="mrow-${i}">
    <input type="text" placeholder="Medikament" value="${escAttr(m.name||'')}">
    <input type="text" placeholder="Dosierung" value="${escAttr(m.dosage||'')}">
    <input type="text" placeholder="Seit (Jahr)" value="${escAttr(m.since||'')}">
    <div class="inline-row-last">
      <input type="text" placeholder="Notizen" value="${escAttr(m.notes||'')}">
      <button class="btn btn-ghost btn-sm" style="color:var(--danger);flex-shrink:0" onclick="removeRow('mrow-${i}')">✕</button>
    </div>
  </div>`;
}
function vaccinationRow(i, v={}) {
  return `<div class="inline-row" id="vrow-${i}">
    <input type="text" placeholder="Impfstoff / Krankheit" value="${escAttr(v.name||'')}">
    <input type="date" value="${escAttr(v.date||'')}" title="Impfdatum">
    <input type="text" placeholder="Auffrischung" value="${escAttr(v.nextDue||'')}">
    <div class="inline-row-last">
      <input type="text" placeholder="Notizen" value="${escAttr(v.notes||'')}">
      <button class="btn btn-ghost btn-sm" style="color:var(--danger);flex-shrink:0" onclick="removeRow('vrow-${i}')">✕</button>
    </div>
  </div>`;
}
function allergyRow(i, a={}) {
  return `<div class="inline-row" id="arow-${i}">
    <input type="text" placeholder="Allergie" value="${escAttr(a.name||'')}">
    <input type="text" placeholder="Schweregrad" value="${escAttr(a.severity||'')}">
    <div class="inline-row-last">
      <input type="text" placeholder="Notizen" value="${escAttr(a.notes||'')}">
      <button class="btn btn-ghost btn-sm" style="color:var(--danger);flex-shrink:0" onclick="removeRow('arow-${i}')">✕</button>
    </div>
  </div>`;
}

function operationRow(i, o={}) {
  return `<div class="inline-row" id="oprow-${i}">
    <input type="text" placeholder="Eingriff / Operation" value="${escAttr(o.name||'')}">
    <input type="text" placeholder="Jahr / Datum" value="${escAttr(o.date||'')}">
    <input type="text" placeholder="Krankenhaus / Arzt" value="${escAttr(o.hospital||'')}">
    <div class="inline-row-last">
      <input type="text" placeholder="Notizen" value="${escAttr(o.notes||'')}">
      <button class="btn btn-ghost btn-sm" style="color:var(--danger);flex-shrink:0" onclick="removeRow('oprow-${i}')">✕</button>
    </div>
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

function toggleFavMetric(key) {
  const input = document.getElementById('pm-fav-metrics');
  let favs = JSON.parse(input.value || '[]');
  if (favs.includes(key)) {
    favs = favs.filter(k => k !== key);
  } else {
    if (favs.length >= 4) { showToast('Maximal 4 Favoriten möglich', 'info'); return; }
    favs.push(key);
  }
  input.value = JSON.stringify(favs);
  document.querySelectorAll('#pm-fav-picker .fav-metric-chip').forEach(btn => {
    btn.classList.toggle('selected', favs.includes(btn.dataset.key));
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
function readOperations() {
  return [...document.querySelectorAll('#pm-operations .inline-row')].map(row => {
    const inputs = row.querySelectorAll('input');
    return { name: inputs[0]?.value.trim()||'', date: inputs[1]?.value.trim()||'',
             hospital: inputs[2]?.value.trim()||'', notes: inputs[3]?.value.trim()||'' };
  }).filter(o=>o.name);
}

function savePersonModal(id, isEdit) {
  const name     = document.getElementById('pm-name')?.value.trim();
  const birthday = document.getElementById('pm-birthday')?.value;
  const gender   = document.getElementById('pm-gender')?.value;
  const blood    = document.getElementById('pm-blood')?.value;
  const svnr     = document.getElementById('pm-svnr')?.value.trim();
  const color      = document.getElementById('pm-color')?.value || null;
  const avatarType = document.getElementById('pm-avatar-type')?.value || 'icon';
  const favMetrics = JSON.parse(document.getElementById('pm-fav-metrics')?.value || '[]');
  const hiddenSections = ['conditions','family','medications','vaccinations','allergies','operations']
    .filter(s => !document.getElementById(`pm-show-${s}`)?.checked);

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
    avatarType: ['initials', 'smile'].includes(avatarType) ? avatarType : null,
    favoriteMetrics:  favMetrics.length ? favMetrics : null,
    hiddenSections:   hiddenSections.length ? hiddenSections : null,
    conditions:    readConditions(),
    familyHistory: readFamilyHistory(),
    medications:   readMedications(),
    vaccinations:  readVaccinations(),
    allergies:     readAllergies(),
    operations:    readOperations(),
  };

  const desc = isEdit ? `Person "${name}" aktualisiert` : `Person "${name}" hinzugefügt`;
  trackChange(desc, () => {
    let persons = [...getPersonList()];
    if (isEdit) {
      const idx = persons.findIndex(p=>p.id===id);
      if (idx>=0) persons[idx] = updated; else persons.push(updated);
    } else {
      persons.push(updated);
    }
    savePersons(persons);
  });

  buildPersonSelector();
  if (!isEdit) selectPerson(id);
  else if (id === currentPersonId) applyPersonAccent();
  closePersonModal();
  renderSettings();
  showToast(isEdit?'Person aktualisiert ✓':'Person hinzugefügt ✓','success');
}

function closePersonModal() {
  document.getElementById('person-modal')?.remove();
  _condCount=0; _famCount=0; _medCount=0; _vacCount=0; _algCount=0; _opCount=0;
  closeModalAccessible();
}

function deletePerson(id) {
  const p = getPersonList().find(p=>p.id===id);
  if (!p) return;
  const entryCount = DATA.entries.filter(e=>e.personId===id).length;
  const warn = entryCount>0 ? `\n⚠ Diese Person hat ${entryCount} Einträge, die ebenfalls gelöscht werden.` : '';
  if (!confirm(`"${p.name}" wirklich löschen?${warn}`)) return;

  trackChange(`Person "${p.name}" gelöscht`, () => {
    const persons = getPersonList().filter(q=>q.id!==id);
    DATA.entries  = DATA.entries.filter(e=>e.personId!==id);
    Object.keys(DATA.targets).forEach(k => { if (k.startsWith(id + '__')) delete DATA.targets[k]; });
    savePersons(persons);
  });

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

// ── Verschlüsselung ───────────────────────────
const _SVG_LOCK = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:1.125rem;height:1.125rem;flex-shrink:0"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"/></svg>`;
const _SVG_LOCK_OPEN = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:1.125rem;height:1.125rem;flex-shrink:0"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"/></svg>`;

function renderEncryptionCard() {
  if (isDemoMode) return '';

  if (isEncrypted) {
    return `
    <div class="card" style="margin-top:1rem" id="encryption-card">
      <div class="card-header"><span class="card-title">Verschlüsselung</span></div>
      <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.625rem;color:var(--success)">
        ${_SVG_LOCK}
        <span style="font-weight:600">Verschlüsselt (AES-256-GCM)</span>
      </div>
      <p class="field-hint">Alle Exporte werden mit deinem Passwort verschlüsselt. Ohne Passwort sind die Daten nicht lesbar.</p>
      <div class="field-group" style="margin-top:.875rem">
        <label for="enc-pw-current">Aktuelles Passwort bestätigen</label>
        <input type="password" id="enc-pw-current" autocomplete="current-password" placeholder="Passwort eingeben"
               onkeydown="if(event.key==='Enter')disableEncryption()">
      </div>
      <p id="enc-error" style="color:var(--danger);font-size:.8125rem;margin:.375rem 0 0;display:none"></p>
      <div style="margin-top:.875rem">
        <button class="btn btn-ghost settings-action-btn" style="color:var(--danger)" onclick="disableEncryption()">Verschlüsselung deaktivieren</button>
      </div>
    </div>`;
  }

  return `
    <div class="card" style="margin-top:1rem" id="encryption-card">
      <div class="card-header"><span class="card-title">Verschlüsselung</span></div>
      <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.625rem;color:var(--text-muted)">
        ${_SVG_LOCK_OPEN}
        <span style="font-weight:600">Nicht verschlüsselt</span>
      </div>
      <p class="field-hint">Exporte werden als lesbares JSON gespeichert. Mit einem Passwort kannst du Exporte mit AES-256-GCM verschlüsseln.</p>
      <div class="field-group" style="margin-top:.875rem">
        <label for="enc-pw-new">Neues Passwort</label>
        <input type="password" id="enc-pw-new" autocomplete="new-password" placeholder="Mindestens 4 Zeichen"
               oninput="checkPwMatch()" onkeydown="if(event.key==='Enter')enableEncryption()">
      </div>
      <div class="field-group" style="margin-top:.625rem">
        <label for="enc-pw-confirm">Passwort bestätigen</label>
        <input type="password" id="enc-pw-confirm" autocomplete="new-password" placeholder="Passwort wiederholen"
               oninput="checkPwMatch()" onkeydown="if(event.key==='Enter')enableEncryption()">
      </div>
      <p id="enc-error" style="color:var(--danger);font-size:.8125rem;margin:.375rem 0 0;display:none"></p>
      <div style="margin-top:.875rem">
        <button class="btn btn-primary settings-action-btn" onclick="enableEncryption()">Verschlüsselung aktivieren</button>
      </div>
    </div>`;
}

function checkPwMatch() {
  const pw1  = document.getElementById('enc-pw-new')?.value || '';
  const pw2  = document.getElementById('enc-pw-confirm')?.value || '';
  const inp1 = document.getElementById('enc-pw-new');
  const inp2 = document.getElementById('enc-pw-confirm');
  if (!inp1 || !inp2) return;
  const match = pw1.length >= 4 && pw2 && pw1 === pw2;
  [inp1, inp2].forEach(el => {
    el.style.borderColor = match ? 'var(--success)' : '';
    el.style.boxShadow   = match ? '0 0 0 3px var(--success-light)' : '';
  });
}

function enableEncryption() {
  const pw1   = document.getElementById('enc-pw-new')?.value || '';
  const pw2   = document.getElementById('enc-pw-confirm')?.value || '';
  const errEl = document.getElementById('enc-error');
  const showErr = msg => { if (errEl) { errEl.textContent = msg; errEl.style.display = ''; } };

  if (!pw1)            return showErr('Bitte ein Passwort eingeben.');
  if (pw1.length < 4)  return showErr('Das Passwort muss mindestens 4 Zeichen lang sein.');
  if (pw1 !== pw2)     return showErr('Die Passwörter stimmen nicht überein.');

  isEncrypted = true;
  setSessionPassword(pw1);
  showToast('Verschlüsselung aktiviert — nächster Export wird verschlüsselt ✓', 'success');
  renderSettings();
}

function _changelogBody() {
  const pad = n => String(n).padStart(2, '0');
  const fmtTs = iso => {
    const d = new Date(iso);
    return `${pad(d.getDate())}.${pad(d.getMonth()+1)}. ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const recent = RECENT_CHANGES.slice(0, 10);
  return recent.length === 0
    ? `<p class="settings-empty">Noch keine Änderungen aufgezeichnet.</p>`
    : `<ul class="settings-changelog">${recent.map(c => `
        <li class="settings-changelog-item">
          <span class="settings-changelog-desc">${esc(c.description)}</span>
          <span class="settings-changelog-ts">${esc(fmtTs(c.ts))}</span>
        </li>`).join('')}</ul>`;
}

function renderChangelogCard() {
  return `
    <div class="card" style="margin-top:1rem">
      <div class="card-header"><span class="card-title">Letzte Änderungen</span></div>
      <div id="settings-changelog-body">${_changelogBody()}</div>
    </div>`;
}

function refreshChangelogCard() {
  const el = document.getElementById('settings-changelog-body');
  if (el) el.innerHTML = _changelogBody();
}

function disableEncryption() {
  const pw    = document.getElementById('enc-pw-current')?.value || '';
  const errEl = document.getElementById('enc-error');
  const showErr = msg => { if (errEl) { errEl.textContent = msg; errEl.style.display = ''; } };

  if (!pw) return showErr('Bitte das aktuelle Passwort eingeben.');

  const sessionPw = getSessionPassword();
  if (!sessionPw) return showErr('Kein aktives Passwort in dieser Sitzung. Bitte importiere zuerst die verschlüsselte Datei, um dich zu authentifizieren.');
  if (pw !== sessionPw) return showErr('Das Passwort ist nicht korrekt.');

  isEncrypted = false;
  clearSessionPassword();
  showToast('Verschlüsselung deaktiviert — Exporte werden als Klartext gespeichert', 'success');
  renderSettings();
}
