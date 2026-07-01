/* ═══════════════════════════════════════════════
   Familien-Gesundheitsakte — dashboard.js
   ───────────────────────────────────────────────
   Dashboard & "Alle Werte": Personen-Hero, Quick-Stats, Info-Karten
      (Leiden/Familie/Medikamente/Impfungen/Allergien), Trend-Pfeile, Checkups.

   Teil eines klassischen Multi-Script-Setups (kein ES-Modul):
   alle Dateien teilen denselben globalen Scope. Reihenfolge der
   <script>-Tags siehe index.html.
   ═══════════════════════════════════════════════ */
'use strict';

// ═══════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════
function renderDashboard() {
  const panel  = document.getElementById('panel-dashboard');
  const person = getPersonList().find(p=>p.id===currentPersonId);
  if (!person) return;

  const age   = getAge(person.birthday);
  const color = personColor(person);

  const myCheckups = getCheckups().filter(c=>checkupApplies(c,person));
  const statuses   = myCheckups.map(c=>({checkup:c,...checkupStatus(c,currentPersonId)}));
  const alerts     = statuses.filter(s=>s.status!=='ok');

  // Quick-stat tiles: Favoriten zuerst, danach zuletzt aktualisierte (ohne Duplikate)
  const favKeys = person.favoriteMetrics || [];
  const favTiles = favKeys.map(key => {
    const m = metricDef(key);
    if (!m) return null;
    return { m, last: lastMetricValue(currentPersonId, key) };
  }).filter(Boolean);

  const recentlyUpdated = allMetrics()
    .filter(m => !favKeys.includes(m.key))
    .map(m => ({ m, last: lastMetricValue(currentPersonId, m.key) }))
    .filter(({ last }) => last !== null)
    .sort((a, b) => new Date(b.last.date) - new Date(a.last.date));

  const hasAnyEntries = DATA.entries.some(e => e.personId === currentPersonId);

  // Immer genau 4 Tiles — fehlende mit Platzhaltern auffüllen
  const tileData = [...favTiles, ...recentlyUpdated].slice(0, 4);
  while (tileData.length < 4) tileData.push(null);
  const tiles = tileData.map(item => {
    if (!item) return statTile('—', '—', '', 'Noch kein Wert');
    const pinned = favKeys.includes(item.m.key);
    if (!item.last) return statTile(item.m.label, '—', '', 'Noch kein Wert', item.m.key, '', pinned);
    const isCat = item.m.type === 'boolean' || item.m.type === 'select';
    const arrow = isCat ? '' : trendArrow(currentPersonId, item.m.key);
    return statTile(item.m.label, formatMetricValue(item.m.key, item.last.value), isCat ? '' : item.m.unit, `Zuletzt ${fmtDate(item.last.date)}`, item.m.key, arrow, pinned);
  }).join('');

  panel.innerHTML = `
    <div class="person-hero">
      <div class="person-hero-avatar" style="background:${color}">${personAvatarContent(person)}</div>
      <div class="person-hero-info">
        <h2>${esc(person.name)}</h2>
        <div class="person-hero-meta">
          <span class="meta-item">${fmtDate(person.birthday)} (${age}&nbsp;Jahre)</span>
          ${person.bloodType ? `<span class="meta-item">Blut: ${esc(person.bloodType)}</span>` : ''}
          ${person.socialSecurityNumber ? `<span class="meta-item">SV-Nr.: ${esc(person.socialSecurityNumber)}</span>` : ''}
        </div>
      </div>
    </div>

    <div class="grid-4" style="margin-bottom:1rem">${tiles}</div>
    ${!hasAnyEntries ? `
    <div class="dashboard-empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 9v6m0 0v0m-4.5-3h9M3.75 6.75h16.5M3.75 17.25h16.5M4.5 21h15a.75.75 0 0 0 .75-.75V3.75a.75.75 0 0 0-.75-.75h-15a.75.75 0 0 0-.75.75v16.5c0 .414.336.75.75.75Z"/>
      </svg>
      <p>Noch keine Einträge für ${esc(person.name)}.</p>
      <button class="btn btn-primary" onclick="activateTab('entry')">Ersten Eintrag anlegen →</button>
    </div>` : ''}

    <div class="dashboard-cards-grid">
      ${renderConditionsCard(person)}
      ${renderFamilyHistoryCard(person)}
      ${renderMedicationsCard(person)}
      ${renderVaccinationsCard(person)}
      ${renderAllergiesCard(person)}
      ${renderOperationsCard(person)}
    </div>

    <div class="card" style="margin-top:1rem">
      <div class="card-header">
        <span class="card-title">Vorsorge & Checkups</span>
        ${myCheckups.length > 0 ? `
        <button class="btn btn-ghost btn-sm" onclick="exportCheckupCalendar()"
                title="Termine als Kalenderdatei (.ics) exportieren">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="margin-right:.35rem">
            <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
          </svg>Kalender
        </button>` : ''}
      </div>
      ${myCheckups.length===0
        ? '<div class="empty-state"><p>Keine Checkups definiert.</p></div>'
        : statuses.map(renderCheckupItem).join('')}
    </div>`;
}

// ═══════════════════════════════════════════════
// ALLE WERTE
// ═══════════════════════════════════════════════
function renderAllMetrics() {
  const panel = document.getElementById('panel-allmetrics');

  // Group metrics by their group label
  const groups = [...new Set(allMetrics().map(m => m.group))];

  const sections = groups.map(g => {
    const metricsInGroup = allMetrics().filter(m => m.group === g);

    const tiles = metricsInGroup.map(m => {
      const last = lastMetricValue(currentPersonId, m.key);
      const sub  = last
        ? (m.computed ? `Berechnet ${fmtDate(last.date)}` : `Zuletzt ${fmtDate(last.date)}`)
        : (m.computed ? 'Wird berechnet' : 'Noch nicht erfasst');
      const isCat = m.type === 'boolean' || m.type === 'select';
      const arrow = (last && !isCat) ? trendArrow(currentPersonId, m.key) : '';
      return last
        ? statTile(m.label, formatMetricValue(m.key, last.value), isCat ? '' : m.unit, sub, m.key, arrow)
        : statTile(m.label, '—', m.unit, sub, m.computed ? undefined : m.key);
    }).join('');

    return `
      <div class="allmetrics-group">
        <h3 class="allmetrics-group-title">${esc(g)}</h3>
        <div class="allmetrics-tiles">${tiles}</div>
      </div>`;
  }).join('');

  // Hinweis: Eigene Messwerte werden bereits über allMetrics() (DATA.customMetrics)
  // in ihrer eigenen Gruppe gerendert. Eine separate customSection würde sie ein
  // zweites Mal anzeigen → bewusst entfernt.
  panel.innerHTML = sections ||
    `<div class="empty-state"><div class="empty-icon"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605"/></svg></div><p>Noch keine Messwerte erfasst.</p></div>`;
}

function openPersonEdit(pid, section) {
  activateTab('settings');
  const p = getPersonList().find(p => p.id === pid);
  if (p) openPersonModal(p, section);
}

function cardEditBtn(pid, section) {
  return `<button class="item-menu-btn" title="Aktionen"
    onclick="openActionMenu(this,[{label:'Bearbeiten',fn:()=>openPersonEdit('${escAttr(pid)}','${escAttr(section)}')}])">⋮</button>`;
}

function renderConditionsCard(person) {
  const conds = person.conditions || [];
  return `<div class="card">
    <div class="card-header">
      <span class="card-title">Chronische Leiden</span>
      ${cardEditBtn(person.id, 'conditions')}
    </div>
    ${conds.length===0
      ? '<p style="color:var(--text-muted);font-size:.875rem">Keine eingetragen.</p>'
      : conds.map(c=>`
        <div class="condition-item">
          <div class="condition-name">${esc(c.name)}</div>
          <div class="condition-meta">
            ${c.since ? `seit ${esc(c.since)}` : ''}
            ${c.notes ? ` · ${esc(c.notes)}` : ''}
          </div>
        </div>`).join('')}
  </div>`;
}

function renderFamilyHistoryCard(person) {
  const fh = person.familyHistory || [];
  return `<div class="card">
    <div class="card-header">
      <span class="card-title">Familiengeschichte</span>
      ${cardEditBtn(person.id, 'family')}
    </div>
    ${fh.length===0
      ? '<p style="color:var(--text-muted);font-size:.875rem">Keine eingetragen.</p>'
      : fh.map(f=>`
        <div class="condition-item">
          <div class="condition-name">${esc(f.condition)}</div>
          <div class="condition-meta">
            ${esc(f.relation)}${f.notes ? ` · ${esc(f.notes)}` : ''}
          </div>
        </div>`).join('')}
  </div>`;
}

// ── Trend-Pfeil (Alle Werte) ──────────────────
// Gibt '↗' / '↘' / '→' zurück je nach Änderung zwischen letzten zwei Punkten.
// SVG-Pfeil-Icons: alle 16×16, stroke-width 2, identische optische Größe
const TREND_SVG = {
  up:   `<svg class="trend-arrow" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
           <line x1="3" y1="13" x2="13" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
           <polyline points="7,3 13,3 13,9" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
         </svg>`,
  down: `<svg class="trend-arrow" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
           <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
           <polyline points="7,13 13,13 13,7" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
         </svg>`,
  flat: `<svg class="trend-arrow" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
           <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
           <polyline points="9,4 14,8 9,12" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
         </svg>`,
};

function trendArrow(pid, key) {
  const h = metricHistoryResolved(pid, key);
  if (h.length < 2) return '';
  const prev = h[h.length - 2].value;
  const last = h[h.length - 1].value;
  if (prev === 0) return '';
  const pct = (last - prev) / Math.abs(prev) * 100;
  if (pct >  2) return TREND_SVG.up;
  if (pct < -2) return TREND_SVG.down;
  return TREND_SVG.flat;
}

function renderMedicationsCard(person) {
  const items = (person.medications || []);
  if (!items.length) return '';
  return `<div class="card">
    <div class="card-header"><span class="card-title">Medikamente</span>${cardEditBtn(person.id, 'medications')}</div>
    ${items.map(m=>`<div class="condition-item">
      <div class="condition-name">${esc(m.name)}${m.dosage?' — '+esc(m.dosage):''}</div>
      <div class="condition-meta">${m.since?'seit '+esc(m.since):''}${m.notes?' · '+esc(m.notes):''}</div>
    </div>`).join('')}
  </div>`;
}
function renderVaccinationsCard(person) {
  const items = (person.vaccinations || []);
  if (!items.length) return '';
  return `<div class="card">
    <div class="card-header"><span class="card-title">Impfungen</span>${cardEditBtn(person.id, 'vaccinations')}</div>
    ${items.map(v=>`<div class="condition-item">
      <div class="condition-name">${esc(v.name)}</div>
      <div class="condition-meta">${v.date?fmtDate(v.date):''}${v.nextDue?' · Auffrischung: '+esc(v.nextDue):''}${v.notes?' · '+esc(v.notes):''}</div>
    </div>`).join('')}
  </div>`;
}
function renderAllergiesCard(person) {
  const items = (person.allergies || []);
  if (!items.length) return '';
  return `<div class="card">
    <div class="card-header"><span class="card-title">Allergien</span>${cardEditBtn(person.id, 'allergies')}</div>
    ${items.map(a=>`<div class="condition-item">
      <div class="condition-name">${esc(a.name)}</div>
      <div class="condition-meta">${a.severity?esc(a.severity):''}${a.notes?' · '+esc(a.notes):''}</div>
    </div>`).join('')}
  </div>`;
}
function renderOperationsCard(person) {
  const items = (person.operations || []);
  if (!items.length) return '';
  return `<div class="card">
    <div class="card-header"><span class="card-title">Operationen &amp; Eingriffe</span>${cardEditBtn(person.id, 'operations')}</div>
    ${items.map(o=>`<div class="condition-item">
      <div class="condition-name">${esc(o.name)}</div>
      <div class="condition-meta">${o.date?esc(o.date):''}${o.hospital?' · '+esc(o.hospital):''}${o.notes?' · '+esc(o.notes):''}</div>
    </div>`).join('')}
  </div>`;
}

// Formatiert einen Messwert für die Anzeige (boolean, select, Zahl).
function formatMetricValue(key, value) {
  const def = metricDef(key);
  if (value === null || value === undefined || value === '') return '—';
  if (def?.type === 'boolean') return value === true || value === 'true' ? 'Ja' : 'Nein';
  if (def?.type === 'select') {
    // In Kacheln: kurzer Text. Für nicht-graphable select (Zervixschleim) Häkchen anzeigen.
    if (!def.graphable) return '✓';
    // Für graphable select (Blutung): Wert direkt anzeigen
    return String(value);
  }
  return value;
}

const _PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"/></svg>`;

function statTile(label, value, unit, sub, metricKey, arrow, pinned) {
  const clickable = metricKey && value !== '—';
  const empty     = value === '—';
  const cls = ['stat-tile'];
  if (clickable)  cls.push('stat-tile--clickable');
  if (empty)      cls.push('stat-tile--empty');
  if (pinned)     cls.push('stat-tile--pinned');
  const emptyAttrs = empty ? 'onclick="nudgeEmptyTile(this)" role="button" tabindex="0"' : '';
  const attrs = clickable
    ? `onclick="openMetricDiagram('${escAttr(metricKey)}')" class="${cls.join(' ')}"`
    : `class="${cls.join(' ')}" ${emptyAttrs}`;
  const targetVal = getTarget(currentPersonId, metricKey || '');
  const tUnit = metricDef(metricKey)?.unit ? ' '+metricDef(metricKey).unit : '';
  const def = metricDef(metricKey);
  const noTarget = def?.type === 'boolean' || def?.type === 'select';
  const targetBtn = (clickable && !empty && !noTarget)
    ? `<button class="target-btn${targetVal !== null ? ' has-target' : ''}"
              onclick="event.stopPropagation();openTargetDialog('${escAttr(metricKey)}')"
              title="${targetVal !== null ? esc('Ziel: '+targetVal+tUnit) : 'Zielwert setzen'}">${targetVal !== null ? '◉' : '◎'}</button>`
    : '';
  const addEntryBtn = (metricKey && !def?.computed)
    ? `<button class="add-entry-btn" onclick="event.stopPropagation();openEntryForMetric('${escAttr(metricKey)}')" title="Eintrag hinzufügen">+</button>`
    : '';
  const pinEl = pinned ? `<span class="pin-indicator" title="Favorit">${_PIN_SVG}</span>` : '';
  return `<div ${attrs} style="position:relative">
    ${pinEl}${targetBtn}${addEntryBtn}
    <div class="stat-label">${esc(label)}</div>
    <div class="stat-value">${esc(value)}${unit?`<span class="stat-unit">${esc(unit)}</span>`:''}${arrow||''}</div>
    <div class="stat-sub">${esc(sub)}</div>
  </div>`;
}

// Navigate to Diagramme tab and pre-select the given metric
function openMetricDiagram(key) {
  activeGraphKey   = key;
  activeGraphRange = 'all';
  activateTab('graphs');
}

// Kurzes visuelles Feedback für Kacheln ohne Daten:
// Warning-Tint + leichtes Wackeln via CSS-Animation.
// Die Klasse wird über animationend automatisch wieder entfernt.
function nudgeEmptyTile(el) {
  el.classList.remove('stat-tile--nudge'); // Reset falls noch eine läuft
  void el.offsetWidth;                     // Reflow erzwingen
  el.classList.add('stat-tile--nudge');
  el.addEventListener('animationend', () => el.classList.remove('stat-tile--nudge'), { once: true });
}
function renderCheckupItem({checkup,status,label,lastDate}) {
  const dc = {ok:'dot-ok',warning:'dot-warning',overdue:'dot-overdue'}[status]??'dot-na';
  const bc = {ok:'badge-ok',warning:'badge-warning',overdue:'badge-overdue'}[status]??'badge-na';
  const everyYears = checkup.intervalMonths % 12 === 0 && checkup.intervalMonths > 12;
  const every = everyYears
    ? `alle&nbsp;${checkup.intervalMonths/12}&nbsp;Jahr${checkup.intervalMonths/12>1?'e':''}`
    : `alle&nbsp;${checkup.intervalMonths}&nbsp;Monate`;
  const contact = [
    checkup.phone
      ? `<a class="checkup-contact" href="tel:${escAttr(checkup.phone.replace(/\s+/g,''))}" title="Anrufen: ${escAttr(checkup.phone)}" onclick="event.stopPropagation()" aria-label="Anrufen">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 3.75v4.5m0-4.5h-4.5m4.5 0-6 6m3 12c-8.284 0-15-6.716-15-15V4.5A2.25 2.25 0 0 1 4.5 2.25h1.372c.516 0 .966.351 1.091.852l1.106 4.423c.11.44-.054.902-.417 1.173l-1.293.97a1.062 1.062 0 0 0-.38 1.21 12.035 12.035 0 0 0 7.143 7.143c.441.162.928-.004 1.21-.38l.97-1.293a1.125 1.125 0 0 1 1.173-.417l4.423 1.106c.5.125.852.575.852 1.091V19.5a2.25 2.25 0 0 1-2.25 2.25h-2.25Z" /></svg>
        </a>`
      : '<span class="checkup-contact-placeholder"></span>',
    checkup.url
      ? `<a class="checkup-contact" href="${/^https?:\/\//i.test(checkup.url) ? escAttr(checkup.url) : ''}" target="_blank" rel="noopener noreferrer" title="Website öffnen" onclick="event.stopPropagation()" aria-label="Website öffnen">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" /></svg>
        </a>`
      : '<span class="checkup-contact-placeholder"></span>',
  ].join('');
  return `<div class="checkup-item">
    <div class="checkup-status-dot ${dc}"></div>
    <div class="checkup-info">
      <div class="checkup-name">${esc(checkup.name)}</div>
      <div class="checkup-detail">${every}${lastDate?` · Zuletzt ${fmtDate(lastDate)}`:' · Noch nie'}</div>
      <div class="checkup-row-mobile">
        <span class="checkup-badge ${bc}">${label}</span>
        <div class="checkup-contacts">${contact}</div>
      </div>
    </div>
    <span class="checkup-badge checkup-badge-desktop ${bc}">${label}</span>
    <div class="checkup-contacts checkup-contacts-desktop">${contact}</div>
  </div>`;
}
