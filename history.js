/* ═══════════════════════════════════════════════
   Familien-Gesundheitsakte — history.js
   ───────────────────────────────────────────────
   Verlauf-Tab: Filterleiste (Text/Datum/Typ/Arzt), Timeline, Loeschen.

   Teil eines klassischen Multi-Script-Setups (kein ES-Modul):
   alle Dateien teilen denselben globalen Scope. Reihenfolge der
   <script>-Tags siehe index.html.
   ═══════════════════════════════════════════════ */
'use strict';

// ═══════════════════════════════════════════════
// VERLAUF
// ═══════════════════════════════════════════════
// ── History filter state ─────────────────────
let historyFilter = { text: '', type: 'all', doctor: '', dateFrom: '', dateTo: '' };

function renderHistory() {
  // Measure exact subnav bottom so sticky year headers sit flush beneath it
  const subnav = document.getElementById('subnav-wrapper');
  if (subnav) {
    document.documentElement.style.setProperty('--timeline-year-top', (60 + subnav.offsetHeight) + 'px');
  }

  const panel   = document.getElementById('panel-history');
  const allEntries = DATA.entries
    .filter(e => e.personId === currentPersonId)
    .sort((a,b) => new Date(b.date) - new Date(a.date));

  if (!allEntries.length) {
    panel.innerHTML = `<div class="empty-state"><div class="empty-icon"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H6.911a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661Z"/></svg></div>
      <p>Noch keine Einträge.</p></div>`;
    return;
  }

  // Collect unique doctors for filter pills
  const doctors = [...new Set(
    allEntries
      .filter(e => e.entryType === 'doctor' && e.doctor?.trim())
      .map(e => e.doctor.trim())
  )].sort();

  const hasHealth = allEntries.some(_isAppleHealth);

  const typeBtns = [
    { key: 'all',    label: 'Alle'             },
    { key: 'doctor', label: 'Arztbesuch'        },
    { key: 'self',   label: 'Eigene Messung'    },
    ...(hasHealth ? [{ key: 'health', label: 'Apple Health' }] : []),
  ].map(t => `
    <button class="hf-type-btn${historyFilter.type===t.key?' active':''}"
            onclick="setHistoryType('${t.key}')">${t.label}</button>`).join('');

  const doctorPills = historyFilter.type === 'doctor' && doctors.length > 1
    ? `<div class="hf-doctor-row">
        ${doctors.map(d => `
          <button class="hf-doctor-btn${historyFilter.doctor===d?' active':''}"
                  data-doctor="${escAttr(d)}"
                  onclick="setHistoryDoctor(this.dataset.doctor)">
            ${esc(d)}
          </button>`).join('')}
       </div>`
    : '';

  panel.innerHTML = `
    <div class="hf-bar">
      <div class="hf-search-wrap">
        <svg class="hf-search-icon" viewBox="0 0 16 16" fill="none">
          <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" stroke-width="1.5"/>
          <path d="M10.5 10.5l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <input class="hf-search" id="hf-search" type="text"
               aria-label="Einträge durchsuchen"
               placeholder="Einträge durchsuchen…"
               value="${escAttr(historyFilter.text)}"
               oninput="setHistoryText(this.value)">
        ${historyFilter.text
          ? `<button class="hf-clear" aria-label="Suche löschen" onclick="setHistoryText('')">✕</button>`
          : ''}
      </div>
      <div class="hf-date-row">
        <div class="hf-date-wrap">
          <label class="hf-date-label" for="hf-date-from">Von</label>
          <input type="date" class="hf-date" id="hf-date-from"
                 value="${historyFilter.dateFrom}"
                 onchange="setHistoryDate('from', this.value)">
        </div>
        <div class="hf-date-sep">–</div>
        <div class="hf-date-wrap">
          <label class="hf-date-label" for="hf-date-to">Bis</label>
          <input type="date" class="hf-date" id="hf-date-to"
                 value="${historyFilter.dateTo}"
                 onchange="setHistoryDate('to', this.value)">
        </div>
        ${historyFilter.dateFrom || historyFilter.dateTo
          ? `<button class="hf-clear" aria-label="Datumsfilter löschen" style="position:static;margin-left:.25rem"
                     onclick="clearHistoryDates()">✕</button>`
          : ''}
      </div>
      <div class="hf-type-row">${typeBtns}</div>
      ${doctorPills}
    </div>
    <ul class="timeline" id="history-list"></ul>
    <div id="history-empty" class="empty-state" style="display:none">
      <div class="empty-icon"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"/></svg></div><p>Keine Einträge gefunden.</p>
    </div>`;

  applyHistoryFilter(allEntries);
}

function setHistoryText(val) {
  historyFilter.text = val;
  // Clear-Button (✕) ein-/ausblenden, OHNE die ganze Filterleiste neu zu bauen,
  // damit der Cursor im Suchfeld nicht springt und die Datumsfelder erhalten bleiben.
  const wrap = document.querySelector('.hf-search-wrap');
  let clearBtn = wrap?.querySelector('.hf-clear');
  if (val && !clearBtn && wrap) {
    clearBtn = document.createElement('button');
    clearBtn.className = 'hf-clear';
    clearBtn.textContent = '✕';
    clearBtn.addEventListener('click', () => {
      const inp = document.getElementById('hf-search');
      if (inp) inp.value = '';
      setHistoryText('');
    });
    wrap.appendChild(clearBtn);
  } else if (!val && clearBtn) {
    clearBtn.remove();
  }
  // Nur die Ergebnisliste neu filtern
  const allEntries = DATA.entries
    .filter(e => e.personId === currentPersonId)
    .sort((a,b) => new Date(b.date) - new Date(a.date));
  applyHistoryFilter(allEntries);
}

function setHistoryType(type) {
  historyFilter.type   = type;
  historyFilter.doctor = ''; // reset doctor filter on type change
  renderHistory();
}

function setHistoryDoctor(doctor) {
  historyFilter.doctor = historyFilter.doctor === doctor ? '' : doctor;
  renderHistory();
}

function setHistoryDate(which, val) {
  if (which === 'from') historyFilter.dateFrom = val;
  else                  historyFilter.dateTo   = val;
  const allEntries = DATA.entries
    .filter(e => e.personId === currentPersonId)
    .sort((a,b) => new Date(b.date) - new Date(a.date));
  applyHistoryFilter(allEntries);
}

function clearHistoryDates() {
  historyFilter.dateFrom = '';
  historyFilter.dateTo   = '';
  renderHistory();
}

function _isAppleHealth(e) {
  return e.entryType === 'apple-health'
    || (e.entryType === 'self' && e.notes === 'Importiert aus Apple Health');
}

function applyHistoryFilter(allEntries) {
  const { text, type, doctor } = historyFilter;
  const q = text.trim().toLowerCase();

  const filtered = allEntries.filter(e => {
    // Type filter
    if (type === 'doctor' && e.entryType !== 'doctor') return false;
    if (type === 'self'   && (e.entryType !== 'self' || _isAppleHealth(e))) return false;
    if (type === 'health' && !_isAppleHealth(e)) return false;
    // Doctor filter
    if (doctor && e.doctor?.trim() !== doctor) return false;
    // Date range filter
    const { dateFrom, dateTo } = historyFilter;
    if (dateFrom && e.date < dateFrom) return false;
    if (dateTo   && e.date > dateTo)   return false;
    // Text search across relevant fields
    if (q) {
      // Include metric labels (not just values) so "Chol" matches Cholesterin entries
      const metricLabelValues = Object.entries(e.metrics||{})
        .filter(([,v]) => v!==''&&v!==null&&v!==undefined)
        .map(([k,v]) => (metricDef(k)?.label ?? k) + ' ' + v);
      const hay = [
        e.doctor, e.reason, e.diagnosis, e.notes,
        e.date,
        getCheckups().find(c => c.id === e.checkupId)?.name,
        ...metricLabelValues,
        ...Object.values(e.customMetrics||{}).map(m=>m.label+' '+m.value),
      ].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const list  = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');
  if (!list) return;

  if (!filtered.length) {
    list.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  let _lastYear = null;
  const _parts = [];
  for (const e of filtered) {
    const _year = (e.date || '').slice(0, 4);
    if (_year && _year !== _lastYear) {
      _lastYear = _year;
      _parts.push(`<li class="timeline-year-header">${esc(_year)}</li>`);
    }
    const isHealth = _isAppleHealth(e);
    const isSelf   = e.entryType === 'self' && !isHealth;
    const icon = isHealth
      ? `<svg class="timeline-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`
      : isSelf
        ? `<svg class="timeline-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`
        : `<svg class="timeline-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`;
    const title = isHealth ? 'Apple Health' : isSelf ? 'Eigene Messung' : (e.doctor || 'Arztbesuch');

    const metricEntries = Object.entries(e.metrics||{})
      .filter(([,v])=>v!==''&&v!==null&&v!==undefined)
      .map(([k,v])=>{
        const def=metricDef(k);
        const display = def?.type==='boolean'
          ? (v===true||v==='true'?'Ja':'Nein')
          : def?.type==='select' ? esc(String(v)) : esc(v);
        return `<span class="field-item"><span class="field-key">${esc(def?.label??k)}:</span>${display}${def?.unit&&def.type!=='boolean'&&def.type!=='select'?' '+esc(def.unit):''}</span>`;
      }).join('');

    const customEntries = Object.values(e.customMetrics||{})
      .map(m=>`<span class="field-item"><span class="field-key">${esc(m.label)}:</span>${esc(m.value)}${m.unit?' '+esc(m.unit):''}</span>`)
      .join('');

    _parts.push(`<li class="timeline-item">
      <div class="timeline-date">${fmtShort(e.date)}</div>
      <div class="timeline-body">
        <div class="timeline-header">
          <span class="timeline-icon">${icon}</span>
          <span class="timeline-category">${esc(title)}</span>
          <button class="item-menu-btn" title="Aktionen" aria-label="Aktionen"
            onclick="openActionMenu(this,[{label:'Bearbeiten',fn:()=>editEntry('${e.id}')},{label:'Löschen',fn:()=>deleteEntry('${e.id}'),danger:true}])">⋮</button>
        </div>
        ${!isSelf && (e.reason||e.diagnosis) ? `<div style="font-size:.875rem;color:var(--text-secondary);margin:.35rem 0">
          ${e.reason?`<strong>${esc(e.reason)}</strong>`:''} ${e.diagnosis?`· ${esc(e.diagnosis)}`:''}
        </div>` : ''}
        ${(metricEntries||customEntries)?`<div class="timeline-fields">${metricEntries}${customEntries}</div>`:''}
        ${e.checkupId?(()=>{const c=getCheckups().find(c=>c.id===e.checkupId);return c?`<span class="checkup-badge badge-ok" style="margin-top:.4rem;display:inline-block">✓ ${esc(c.name)}</span>`:'';})():''}
        ${e.notes?`<div class="timeline-notes">${esc(e.notes)}</div>`:''}
      </div>
    </li>`);
  }
  list.innerHTML = _parts.join('');
}

function deleteEntry(id) {
  if (!confirm('Eintrag wirklich löschen?')) return;
  const entry  = DATA.entries.find(e => e.id === id);
  const person = getPersonList().find(p => p.id === entry?.personId);
  const who    = person ? ` (${person.name})` : '';
  trackChange(`Eintrag vom ${fmtDate(entry?.date || '')} gelöscht${who}`, () => {
    DATA.entries = DATA.entries.filter(e => e.id !== id);
    saveData();
  });
  showToast('Eintrag gelöscht');
  renderHistory();
}
