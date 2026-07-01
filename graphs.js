/* ═══════════════════════════════════════════════
   Familien-Gesundheitsakte — graphs.js
   ───────────────────────────────────────────────
   Diagramme-Tab: Messwert-Auswahl, SVG-Liniendiagramm, Animation,
      Tooltip, Messwert-Tabelle, Normbereich-Karte.

   Teil eines klassischen Multi-Script-Setups (kein ES-Modul):
   alle Dateien teilen denselben globalen Scope. Reihenfolge der
   <script>-Tags siehe index.html.
   ═══════════════════════════════════════════════ */
'use strict';

// ═══════════════════════════════════════════════
// GRAPH-TAB
// ═══════════════════════════════════════════════
const GRAPH_RANGES = [
  { key:'1m',  label:'1 M'   },
  { key:'6m',  label:'6 M'   },
  { key:'1y',  label:'1 J'   },
  { key:'5y',  label:'5 J'   },
  { key:'all', label:'Gesamt'},
];

// Für Boolean-Kalender: Startmonat-Offset (0 = aktuelle 3 Monate, -1 = 3 Monate zurück, …)
let _boolCalOffset = 0;

// Für Zyklus-Übersicht: sentinel key und Zyklusindex-Offset (0 = aktuellster Zyklus)
const ZYKLUS_KEY = '__zyklus__';
let _zyklusOffset = 0;

// Zweite Metrik für Vergleichs-Diagramm (null = Einzel-Modus)
let activeGraphKey2 = null;

// Metriken die als Kalender (statt Liniendiagramm) angezeigt werden:
// boolean ODER select mit genau zwei Optionen (ja/nein-Charakter).
function isCalendarMetric(def) {
  if (!def) return false;
  if (def.type === 'boolean') return true;
  if (def.type === 'select' && def.graphable) return true;
  return false;
}

function renderGraphs() {
  const panel = document.getElementById('panel-graphs');

  // Alle graphable-Metriken anzeigen — auch ohne ausreichend Daten
  const graphableMetrics = allMetrics().filter(m => m.graphable);

  // activeGraphKey: ungültig → bevorzugt erste Metrik mit ≥2 Punkten, sonst einfach erste
  // Non-graphable metrics (e.g. cervical_mucus) are also valid keys — they show table-only view.
  const keyStillValid = activeGraphKey === ZYKLUS_KEY ||
    (activeGraphKey && allMetrics().find(m => m.key === activeGraphKey));
  if (!keyStillValid) {
    const withData = graphableMetrics.find(m =>
      metricHistoryResolved(currentPersonId, m.key).length >= 2
    );
    activeGraphKey = (withData ?? graphableMetrics[0])?.key ?? null;
  }

  // Zyklus-Übersicht ist nicht mit Dual-Modus kompatibel
  if (activeGraphKey === ZYKLUS_KEY) activeGraphKey2 = null;

  // Validate activeGraphKey2: must be a graphable non-calendar metric different from primary
  if (activeGraphKey2) {
    const d2 = metricDef(activeGraphKey2);
    if (!d2 || !d2.graphable || isCalendarMetric(d2) || activeGraphKey2 === activeGraphKey)
      activeGraphKey2 = null;
  }

  if (graphableMetrics.length === 0) {
    panel.innerHTML = `<div class="empty-state" style="padding-top:4rem">
      <div class="empty-icon">📈</div>
      <p>Keine Messwerte konfiguriert.</p>
    </div>`;
    return;
  }

  const allM   = allMetrics();
  const groups = [...new Set(allM.map(m=>m.group))];
  const metricButtons = groups.map(g=>`
    <div class="metric-group-label">${esc(g)}</div>
    <div class="metric-btn-row">
      ${g === 'Zyklus' ? `<button class="metric-btn${activeGraphKey===ZYKLUS_KEY?' active':''}" data-key="${ZYKLUS_KEY}" onclick="selectGraphMetric('${ZYKLUS_KEY}')">Zyklus</button>` : ''}
      ${allM.filter(m=>m.group===g).map(m=>{
        const pts    = metricHistoryResolved(currentPersonId, m.key).length;
        const minPts = m.graphable ? 2 : 1;
        const dim    = pts < minPts ? ' metric-btn--no-data' : '';
        const sec    = m.key === activeGraphKey2 ? ' metric-btn--secondary' : '';
        return `<button class="metric-btn${activeGraphKey===m.key?' active':''}${sec}${dim}"
                data-key="${m.key}"
                onclick="selectGraphMetric('${m.key}')">${esc(m.label)}</button>`;
      }).join('')}
    </div>`).join('');

  // Compare section — only line-chart-capable metrics are eligible as second metric
  const eligibleForCompare = allM.filter(m =>
    m.graphable && !isCalendarMetric(m) && m.key !== activeGraphKey
  );
  const compareColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-2').trim() || '#E9A23B';
  const compareSection = `<div class="compare-section">
    ${activeGraphKey2
      ? `<div class="compare-active">
          <span class="compare-dot" style="background:${compareColor}"></span>
          <span>${esc(metricDef(activeGraphKey2)?.label ?? activeGraphKey2)}</span>
          <button class="compare-remove" onclick="setSecondMetric(null)" title="Vergleich entfernen">×</button>
        </div>`
      : `<select class="compare-select" onchange="if(this.value){setSecondMetric(this.value);this.value=''}">
          <option value="">＋ Vergleich hinzufügen</option>
          ${eligibleForCompare.map(m=>`<option value="${escAttr(m.key)}">${esc(m.label)}</option>`).join('')}
        </select>`
    }
  </div>`;

  const rangeBtns = GRAPH_RANGES.map(r=>`
    <button class="range-btn${activeGraphRange===r.key?' active':''}"
            data-range="${r.key}"
            onclick="selectGraphRange('${r.key}')">${r.label}</button>`).join('');

  panel.innerHTML = `
    <div class="card collapsible-card" id="metric-selector-card" onclick="toggleMetricSelector()">
      <button class="card-header collapsible-header" aria-expanded="false" aria-controls="metric-selector" tabindex="-1">
        <span class="card-title">Messwert auswählen</span>
        <svg class="collapse-chevron" viewBox="0 0 12 8" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M1 1l5 5 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
      <div id="metric-selector" class="collapsible-body" hidden onclick="event.stopPropagation()">${metricButtons}${compareSection}</div>
    </div>
    <div id="norm-range-card" style="display:none;margin-top:1rem"></div>
    <div class="card" style="margin-top:1rem">
      <div class="graph-card-header">
        <div class="graph-card-title" id="graph-header">
          <span class="card-title"></span>
        </div>
        <div style="display:flex;align-items:center;gap:.75rem;flex-shrink:0">
          <button class="btn btn-ghost btn-sm" id="graph-target-btn"
                  onclick="openTargetDialog(activeGraphKey)"
                  title="Zielwert setzen / ändern"
                  ${activeGraphKey2 ? 'style="display:none"' : ''}>◎ Zielwert</button>
          <div class="range-btn-group" id="range-btn-group">${rangeBtns}</div>
          <div class="bcal-nav" id="bcal-nav" style="display:none">
            <button class="btn btn-ghost btn-sm" id="bcal-nav-today" onclick="jumpBoolCalToday()" style="display:none">Heute</button>
            <button class="btn btn-ghost btn-sm bcal-nav-btn" onclick="shiftBoolCal(-1)" aria-label="Zurück">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M10 3L5 8l5 5"/></svg>
            </button>
            <span class="bcal-nav-label" id="bcal-nav-label"></span>
            <button class="btn btn-ghost btn-sm bcal-nav-btn" id="bcal-nav-fwd" onclick="shiftBoolCal(1)" aria-label="Vor">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M6 3l5 5-5 5"/></svg>
            </button>
          </div>
          <div class="bcal-nav" id="zyklus-nav" style="display:none">
            <button class="btn btn-ghost btn-sm bcal-nav-btn" id="zyklus-nav-prev" onclick="shiftZyklus(-1)" aria-label="Vorheriger Zyklus">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M10 3L5 8l5 5"/></svg>
            </button>
            <span class="bcal-nav-label" id="zyklus-nav-label" style="min-width:18ch"></span>
            <button class="btn btn-ghost btn-sm bcal-nav-btn" id="zyklus-nav-next" onclick="shiftZyklus(1)" aria-label="Nächster Zyklus">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M6 3l5 5-5 5"/></svg>
            </button>
          </div>
        </div>
      </div>
      <div id="graph-area" style="margin-top:.75rem"></div>
    </div>`;

  // Navigator vs. Range-Buttons für den initialen Key korrekt setzen,
  // da drawGraph() direkt aufgerufen wird (nicht über selectGraphMetric).
  const initIsZyklus  = activeGraphKey === ZYKLUS_KEY;
  const initDef       = metricDef(activeGraphKey);
  const initBool      = isCalendarMetric(initDef);
  const initTableOnly = initDef && !initDef.graphable;
  const rgEl     = document.getElementById('range-btn-group');
  const navEl    = document.getElementById('bcal-nav');
  const zNavEl   = document.getElementById('zyklus-nav');
  const targetBtnEl = document.getElementById('graph-target-btn');
  if (rgEl)     rgEl.style.display     = (initBool || initTableOnly || initIsZyklus) ? 'none' : '';
  if (navEl)    navEl.style.display    = initBool ? '' : 'none';
  if (zNavEl)   zNavEl.style.display   = initIsZyklus ? '' : 'none';
  if (targetBtnEl && initIsZyklus) targetBtnEl.style.display = 'none';

  drawGraph(activeGraphKey);
}

function toggleMetricSelector() {
  const body = document.getElementById('metric-selector');
  const btn  = document.querySelector('.collapsible-header');
  if (!body || !btn) return;
  const isOpen = !body.hidden;
  body.hidden = isOpen;
  btn.setAttribute('aria-expanded', String(!isOpen));
  btn.classList.toggle('is-open', !isOpen);
}

function selectGraphRange(range) {
  activeGraphRange = range;
  // Update button states without full re-render — match by data-range, nicht textContent
  document.querySelectorAll('.range-btn').forEach(b=>{
    b.classList.toggle('active', b.dataset.range===range);
  });
  drawGraph(activeGraphKey);
}

function setSecondMetric(key) {
  activeGraphKey2 = (key && key !== activeGraphKey) ? key : null;
  renderGraphs(); // full re-render: updates selector, compare section, target btn
}

function selectGraphMetric(key) {
  if (key === ZYKLUS_KEY) {
    activeGraphKey  = ZYKLUS_KEY;
    activeGraphKey2 = null;
    _zyklusOffset   = 0;
    document.querySelectorAll('.metric-btn').forEach(b=>{
      b.classList.toggle('active', b.dataset.key === ZYKLUS_KEY);
      b.classList.remove('metric-btn--secondary');
    });
    document.getElementById('range-btn-group').style.display = 'none';
    document.getElementById('bcal-nav').style.display        = 'none';
    document.getElementById('zyklus-nav').style.display      = '';
    const targetBtn = document.getElementById('graph-target-btn');
    if (targetBtn) targetBtn.style.display = 'none';
    _refreshCompareSection(ZYKLUS_KEY);
    drawGraph(ZYKLUS_KEY);
    return;
  }

  const prevKey2 = activeGraphKey2;
  // Clicking the secondary metric button makes it primary-only (remove it as secondary)
  if (activeGraphKey2 === key) activeGraphKey2 = null;
  activeGraphKey = key;
  document.querySelectorAll('.metric-btn').forEach(b=>{
    b.classList.toggle('active',    b.dataset.key === key);
    b.classList.toggle('metric-btn--secondary', b.dataset.key === activeGraphKey2);
  });
  const def = metricDef(key);
  const isBool      = isCalendarMetric(def);
  const isTableOnly = def && !def.graphable;
  // Calendar/table-only views are incompatible with dual mode
  if (isBool || isTableOnly) activeGraphKey2 = null;
  // Range-Buttons vs. Kalender-Navigator vs. Zyklus-Navigator
  document.getElementById('range-btn-group').style.display = (isBool || isTableOnly) ? 'none' : '';
  const nav = document.getElementById('bcal-nav');
  if (nav) nav.style.display = isBool ? '' : 'none';
  document.getElementById('zyklus-nav').style.display = 'none';
  if (isBool) _boolCalOffset = 0;
  // Keep target button hidden/shown in sync with dual mode
  const targetBtn = document.getElementById('graph-target-btn');
  if (targetBtn) targetBtn.style.display = activeGraphKey2 ? 'none' : '';
  // If key2 was cleared, update compare section to show the select dropdown again
  if (prevKey2 && !activeGraphKey2) _refreshCompareSection(key);
  drawGraph(key);
}

function _refreshCompareSection(primaryKey) {
  const sec = document.querySelector('.compare-section');
  if (!sec) return;
  const eligible = allMetrics().filter(m => m.graphable && !isCalendarMetric(m) && m.key !== primaryKey);
  sec.innerHTML = `<select class="compare-select" onchange="if(this.value){setSecondMetric(this.value);this.value=''}">
    <option value="">＋ Vergleich hinzufügen</option>
    ${eligible.map(m=>`<option value="${escAttr(m.key)}">${esc(m.label)}</option>`).join('')}
  </select>`;
}

// ── Filter data by selected time range ───────
function filterByRange(data) {
  if (activeGraphRange === 'all') return data;
  const now = new Date();
  const cutoff = new Date(now);
  if      (activeGraphRange === '1m') cutoff.setMonth(now.getMonth() - 1);
  else if (activeGraphRange === '6m') cutoff.setMonth(now.getMonth() - 6);
  else if (activeGraphRange === '1y') cutoff.setFullYear(now.getFullYear() - 1);
  else if (activeGraphRange === '5y') cutoff.setFullYear(now.getFullYear() - 5);
  return data.filter(d => new Date(d.date + 'T00:00:00') >= cutoff);
}

function drawGraph(key) {
  const hdr  = document.getElementById('graph-header');
  const area = document.getElementById('graph-area');
  if (!hdr || !area) return;

  if (key === ZYKLUS_KEY) {
    hdr.innerHTML = `<span class="card-title">Zyklus</span>`;
    const normCardEl = document.getElementById('norm-range-card');
    if (normCardEl) normCardEl.style.display = 'none';
    const targetBtn = document.getElementById('graph-target-btn');
    if (targetBtn) targetBtn.style.display = 'none';
    drawZyklusGraph(area);
    return;
  }

  const def      = metricDef(key);
  const allData  = metricHistoryResolved(currentPersonId, key);
  const data     = filterByRange(allData);

  hdr.innerHTML = `<span class="card-title">${esc(def?.label ?? key)}</span>
    ${def?.unit?`<span style="font-size:.8125rem;color:var(--text-muted)">${esc(def.unit)}</span>`:''}`;
  updateGraphTargetBtn(key);

  // Normalbereich-Infokarte (wird ÜBER dem Graph eingefügt)
  const normCardEl = document.getElementById('norm-range-card');
  const normRangeForCard = resolveNormalRange(key, currentPersonId);
  if (normRangeForCard && normCardEl) {
    const person = getPersonList().find(p => p.id === currentPersonId);
    const age = getAge(person?.birthday || '');
    const nMin = normRangeForCard.min === 0 ? '—' : normRangeForCard.min;
    const nMax = normRangeForCard.max >= 900 ? '—' : normRangeForCard.max;
    const nUnit = def?.unit ? ' '+esc(def.unit) : '';
    normCardEl.style.display = '';
    normCardEl.innerHTML = `
      <div class="norm-range-card">
        <div class="norm-range-header">
          <span class="norm-range-dot"></span>
          <span class="norm-range-title">Referenzbereich: ${esc(normRangeForCard.label)}</span>
        </div>
        <div class="norm-range-values">
          <span>Min: <strong>${nMin}${nUnit}</strong></span>
          <span style="margin:0 .5rem">·</span>
          <span>Max: <strong>${nMax}${nUnit}</strong></span>
          ${normRangeForCard.appliesTo?.gender || normRangeForCard.appliesTo?.minAge != null
            ? `<span style="margin:0 .5rem">·</span><span style="color:var(--text-muted)">Gilt für: ${[
                normRangeForCard.appliesTo.gender === 'male' ? 'Männer' : normRangeForCard.appliesTo.gender === 'female' ? 'Frauen' : null,
                normRangeForCard.appliesTo.minAge != null ? 'ab ' + normRangeForCard.appliesTo.minAge + ' J.' : null,
                normRangeForCard.appliesTo.maxAge != null ? 'bis ' + normRangeForCard.appliesTo.maxAge + ' J.' : null,
              ].filter(Boolean).join(', ')}</span>`
            : ''}
        </div>
        <p class="norm-range-hint">Die Grenzwerte sind im Diagramm als grüne gestrichelte Linien eingezeichnet.</p>
        ${normRangeForCard.source
          ? `<a href="${normRangeForCard.source}" target="_blank" rel="noopener" class="norm-range-source">${
               (() => { const l = sourceLabelForUrl(normRangeForCard.source); return l ? 'Quelle: ' + l : 'Quelle'; })()
             } ↗</a>`
          : ''}
      </div>`;
  } else if (normCardEl) {
    normCardEl.style.display = 'none';
  }

  // ── Dual-Modus: zwei Linien im selben Diagramm ──
  if (activeGraphKey2) {
    const normCardEl = document.getElementById('norm-range-card');
    if (normCardEl) normCardEl.style.display = 'none';
    document.getElementById('graph-target-btn')?.style.setProperty('display', 'none');
    drawDualGraph(key, activeGraphKey2, area);
    return;
  }

  // ── Nicht-graphbare Metriken (z. B. Zervixschleim): nur Datentabelle ──
  if (def && !def.graphable) {
    area.innerHTML = allData.length
      ? renderMetricTable(allData, def)
      : '<div class="empty-state"><div class="empty-icon"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605"/></svg></div><p>Noch keine Messwerte erfasst.</p></div>';
    return;
  }

  if (data.length < 2) {
    const reason = allData.length === 0
      ? 'Noch keine Messwerte erfasst.'
      : data.length === 0
        ? 'Keine Messwerte im gewählten Zeitraum.'
        : 'Mindestens 2 Messpunkte für einen Graphen nötig.';
    area.innerHTML = `<div class="empty-state">
      <div class="empty-icon"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605"/></svg></div><p>${reason}</p>
    </div>`;
    return;
  }

  // ── Kalender-Metriken (boolean oder select+graphable): Monatskalender + Datentabelle ──
  if (isCalendarMetric(def)) {
    drawBooleanGraph(key, def, allData, area);
    const tableHtml = renderMetricTable(allData, def);
    if (tableHtml) area.innerHTML += `<div style="margin-top:1.5rem">${tableHtml}</div>`;
    return;
  }
  // Taller viewBox → chart grows vertically on mobile (SVG scales with width:100%)
  const W=680, H=260, PAD={top:20,right:20,bottom:48,left:52};
  const iW = W - PAD.left - PAD.right;
  const iH = H - PAD.top  - PAD.bottom;

  const vals = data.map(d=>d.value);
  const dataMin = Math.min(...vals);
  const dataMax = Math.max(...vals);

  // Normalbereich für diese Person ermitteln
  const normRange = resolveNormalRange(key, currentPersonId);
  const normMin   = normRange ? normRange.min : null;
  const normMax   = normRange ? normRange.max : null;

  // Target value for this person + metric
  const targetVal = getTarget(currentPersonId, key);

  // Y-Range: mindestens normMin*0.9 bis normMax*1.1, immer aber alle Datenpunkte + target sichtbar
  let minV, maxV;
  if (normMin !== null && normMax !== null) {
    const nLo = normMin * 0.9;
    const nHi = normMax * 1.1;
    minV = Math.min(dataMin, nLo);
    maxV = Math.max(dataMax, nHi);
  } else {
    minV = dataMin;
    maxV = dataMax;
  }
  if (targetVal !== null) {
    minV = Math.min(minV, targetVal * 0.98);
    maxV = Math.max(maxV, targetVal * 1.02);
  }
  const rangeV = maxV - minV || 1;

  // Datumsstempel für X-Achse
  const dates = data.map(d=>new Date(d.date+'T00:00:00').getTime());
  const minT  = Math.min(...dates);
  const maxT  = Math.max(...dates);
  const rangeT = maxT - minT || 1;

  function xPos(t)  { return PAD.left + ((t-minT)/rangeT)*iW; }
  function yPos(v)  { return PAD.top  + (1-(v-minV)/rangeV)*iH; }

  // Punkte für Pfad
  const pts = data.map(d=>({
    x: xPos(new Date(d.date+'T00:00:00').getTime()),
    y: yPos(d.value),
    date: d.date,
    value: d.value
  }));

  // ── Catmull-Rom → kubische Bézier ─────────────
  // Jedes Segment P1→P2 bekommt Kontrollpunkte aus den Nachbarn P0 und P3.
  // alpha=0.5 (centripetal) verhindert Overshoot und Schleifen.
  // Einfacher linearer Pfad — M zum ersten Punkt, dann L zu jedem weiteren.
  // Punkte liegen exakt auf der Linie, keine Versatz-Probleme.
  function linearPath(points) {
    if (points.length < 2) return '';
    return `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`
      + points.slice(1).map(p => ` L${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('');
  }

  const linePath = linearPath(pts);
  const areaPath = linePath
    + ` L${pts[pts.length-1].x.toFixed(2)},${(PAD.top+iH).toFixed(2)}`
    + ` L${pts[0].x.toFixed(2)},${(PAD.top+iH).toFixed(2)} Z`;

  // Y-Achsen-Ticks — "nice" runde Zahlen
  const yTicks = (() => {
    const rawStep = rangeV / 4;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep || 1)));
    const normalized = rawStep / magnitude;
    const niceStep = normalized <= 1 ? magnitude
                   : normalized <= 2 ? 2 * magnitude
                   : normalized <= 5 ? 5 * magnitude
                   : 10 * magnitude;
    const firstTick = Math.ceil(minV / niceStep) * niceStep;
    const decimals = niceStep < 1 ? Math.max(0, -Math.floor(Math.log10(niceStep))) : 0;
    const ticks = [];
    for (let v = firstTick; v <= maxV + niceStep * 0.01; v = Math.round((v + niceStep) * 1e9) / 1e9) {
      ticks.push({ v: v.toFixed(decimals), y: yPos(v) });
      if (ticks.length >= 8) break;
    }
    return ticks;
  })();

  // X-Achsen-Ticks:
  // - Immer: erster und letzter Punkt
  // - Nur wenn ≥4 Datenpunkte und genug horizontaler Platz: bis zu 4 Zwischenticks
  const xTickIndices = (() => {
    const n = data.length;
    if (n <= 1) return [0];
    const indices = new Set([0, n-1]);
    if (n >= 4) {
      const slots = Math.min(4, n - 2);
      for (let s = 1; s <= slots; s++) {
        indices.add(Math.round(s * (n-1) / (slots+1)));
      }
    }
    return [...indices].sort((a,b)=>a-b);
  })();

  // X-Ticks auf Mindestabstand filtern — verhindert Überlappung bei eng
  // liegenden Datenpunkten. Erster und letzter Tick bleiben immer erhalten.
  const MIN_TICK_PX = 48;
  const xTicks = (() => {
    const all = xTickIndices.map(i => ({
      label:  fmtShort(data[i].date),
      x:      xPos(new Date(data[i].date+'T00:00:00').getTime()),
      isEdge: i === 0 || i === data.length - 1,
    }));
    const kept = [all[0]];
    for (let i = 1; i < all.length - 1; i++) {
      const prev = kept[kept.length - 1];
      if (all[i].x - prev.x >= MIN_TICK_PX) kept.push(all[i]);
    }
    // Letzten immer hinzufügen, wenn er weit genug vom Vorletzten entfernt ist
    if (all.length > 1) {
      const last = all[all.length - 1];
      if (last.x - kept[kept.length - 1].x >= MIN_TICK_PX / 2) kept.push(last);
    }
    return kept;
  })();

  // ── "Flat" start paths — alle Punkte auf der Baseline ────
  // Selbe X-Positionen, aber Y immer auf PAD.top+iH (unterste Linie).
  // Davon animieren wir zum echten Zielwert.
  const ptsFlat = pts.map(p => ({ ...p, y: PAD.top + iH }));
  const linePathFlat = linearPath(ptsFlat);
  const areaPathFlat = linePathFlat
    + ` L${ptsFlat[ptsFlat.length-1].x.toFixed(2)},${(PAD.top+iH).toFixed(2)}`
    + ` L${ptsFlat[0].x.toFixed(2)},${(PAD.top+iH).toFixed(2)} Z`;

  // Normalbereich-Band im SVG
  const normBand = (normMin !== null && normMax !== null) ? (() => {
    const yHi = yPos(normMax);
    const yLo = yPos(normMin);
    return `<line x1="${PAD.left}" y1="${yHi.toFixed(2)}" x2="${PAD.left+iW}" y2="${yHi.toFixed(2)}"
              stroke="#059669" stroke-width="1.5" stroke-dasharray="4,4" opacity=".6"/>
            <line x1="${PAD.left}" y1="${yLo.toFixed(2)}" x2="${PAD.left+iW}" y2="${yLo.toFixed(2)}"
              stroke="#059669" stroke-width="1.5" stroke-dasharray="4,4" opacity=".6"/>`;
  })() : '';

  area.innerHTML = `
    <div style="position:relative;overflow:visible">
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;overflow:visible" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="ggrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--accent)" stop-opacity=".18"/>
            <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <!-- Zielwert-Linie -->
        ${targetVal !== null ? (() => {
          const ty = yPos(targetVal);
          return `<line x1="${PAD.left}" y1="${ty.toFixed(2)}"
                        x2="${PAD.left+iW}" y2="${ty.toFixed(2)}"
                        stroke="var(--warning)" stroke-width="1.5"
                        stroke-dasharray="6,3" opacity=".85"/>`;
        })() : ''}
        <!-- Grid lines -->
        ${yTicks.map(t=>`<line x1="${PAD.left}" y1="${t.y}" x2="${PAD.left+iW}" y2="${t.y}"
          stroke="var(--border)" stroke-width="1"/>`).join('')}
        <!-- Normbereich-Linien (im Vordergrund, über Grid) -->
        ${normBand}
        <!-- Area fill — starts flat, animates to real shape -->
        <path id="graph-area-path" d="${areaPathFlat}" fill="url(#ggrad)"/>
        <!-- Line — starts flat, animates to real shape -->
        <path id="graph-line-path" d="${linePathFlat}" fill="none" stroke="var(--accent)" stroke-width="2.5"
          stroke-linejoin="round" stroke-linecap="round"/>
        <!-- Y labels -->
        ${yTicks.map(t=>`<text x="${PAD.left-10}" y="${t.y+4}" text-anchor="end"
          class="graph-label graph-label-y" fill="var(--text-muted)" font-family="JetBrains Mono,monospace">${t.v}</text>`).join('')}
        <!-- X labels (edge ticks always shown; middle ticks shown when space allows) -->
        ${xTicks.map(t=>`<text x="${t.x}" y="${H-10}" text-anchor="middle"
          class="graph-label ${t.isEdge ? 'xtick-edge' : 'xtick-mid'}" fill="var(--text-muted)" font-family="sans-serif">${t.label}</text>`).join('')}
        <!-- Dots (on top, start at baseline) -->
        ${pts.map((p,i)=>`
          <circle class="graph-dot" id="gdot-${i}" data-index="${i}"
            cx="${p.x}" cy="${PAD.top+iH}" r="4"
            data-date="${fmtDate(p.date)}" data-val="${p.value}" data-key="${key}"
            onmouseenter="showGraphTip(event,this)" onmouseleave="hideGraphTip()"/>`).join('')}
      </svg>
      <div id="graph-tip" class="graph-tip" style="display:none"></div>
    </div>
    <div style="margin-top:1rem">
      ${renderMetricTable(data, def)}
    </div>`;

  // ── WAAPI-Animation: flat → real ─────────────
  // Wir interpolieren die Pfad-d-Attribute manuell über requestAnimationFrame,
  // weil SVG path `d` kein CSS-animierbares Property ist.
  animateGraph({
    linePath, linePathFlat, areaPath, areaPathFlat,
    pts, ptsFlat, duration: 420,
    easing: t => t < 0.5 ? 2*t*t : -1+(4-2*t)*t   // ease-in-out quad
  });
}

// ── Graph-Animation ───────────────────────────
function animateGraph({ linePath, linePathFlat, areaPath, areaPathFlat, pts, ptsFlat, duration, easing }) {
  const lineEl = document.getElementById('graph-line-path');
  const areaEl = document.getElementById('graph-area-path');
  if (!lineEl || !areaEl) return;

  // Interpoliere zwei SVG-Pfad-Strings punktweise.
  // Beide müssen die gleiche Anzahl numerischer Werte haben — das ist
  // garantiert weil flat und real aus denselben pts-Arrays stammen.
  function extractNumbers(pathStr) {
    return (pathStr.match(/-?[0-9]+\.?[0-9]*/g) ?? []).map(Number);
  }
  function interpolatePath(fromStr, toStr, progress) {
    const from = extractNumbers(fromStr);
    const to   = extractNumbers(toStr);
    // Ersetze alle Zahlen im from-String mit interpolierten Werten
    let i = 0;
    return fromStr.replace(/-?[0-9]+\.?[0-9]*/g, () => {
      const val = from[i] + (to[i] - from[i]) * progress;
      i++;
      return val.toFixed(2);
    });
  }

  const start = performance.now();

  function frame(now) {
    const raw      = Math.min((now - start) / duration, 1);
    const progress = easing(raw);

    lineEl.setAttribute('d', interpolatePath(linePathFlat, linePath, progress));
    areaEl.setAttribute('d', interpolatePath(areaPathFlat, areaPath, progress));

    // Animate each dot's cy
    pts.forEach((p, i) => {
      const dot = document.getElementById(`gdot-${i}`);
      if (dot) {
        const cy = ptsFlat[i].y + (p.y - ptsFlat[i].y) * progress;
        dot.setAttribute('cy', cy.toFixed(2));
      }
    });

    if (raw < 1) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

// ── Dual-Metrik-Graph ─────────────────────────
function drawDualGraph(key1, key2, area) {
  const def1  = metricDef(key1);
  const def2  = metricDef(key2);
  const data1 = filterByRange(metricHistoryResolved(currentPersonId, key1));
  const data2 = filterByRange(metricHistoryResolved(currentPersonId, key2));

  if (data1.length < 2 || data2.length < 2) {
    const which = data1.length < 2 ? (def1?.label ?? key1) : (def2?.label ?? key2);
    area.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📈</div>
      <p>Nicht genug Messwerte für „${esc(which)}" (mind. 2 Punkte nötig).</p>
    </div>`;
    return;
  }

  const style = getComputedStyle(document.documentElement);
  const color1 = style.getPropertyValue('--accent').trim()   || '#2C6E8F';
  const color2 = style.getPropertyValue('--accent-2').trim() || '#E9A23B';

  const W = 680, H = 260, PAD = { top: 20, right: 56, bottom: 48, left: 52 };
  const iW = W - PAD.left - PAD.right;
  const iH = H - PAD.top  - PAD.bottom;

  // Shared X-axis spans both datasets
  const allTs  = [...data1, ...data2].map(d => new Date(d.date + 'T00:00:00').getTime());
  const minT   = Math.min(...allTs);
  const maxT   = Math.max(...allTs);
  const rangeT = maxT - minT || 1;
  function xPos(t) { return PAD.left + ((t - minT) / rangeT) * iW; }

  // Independent Y-scale with 8 % padding
  function makeYScale(data) {
    const vals = data.map(d => d.value);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    const pad = (hi - lo || 1) * 0.08;
    lo -= pad; hi += pad;
    const range = hi - lo;
    return { lo, hi, range, pos: v => PAD.top + (1 - (v - lo) / range) * iH };
  }

  const sc1 = makeYScale(data1);
  const sc2 = makeYScale(data2);

  function niceTicks(sc) {
    const rawStep   = sc.range / 4;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep || 1)));
    const norm      = rawStep / magnitude;
    const step      = norm <= 1 ? magnitude : norm <= 2 ? 2*magnitude : norm <= 5 ? 5*magnitude : 10*magnitude;
    const first     = Math.ceil(sc.lo / step) * step;
    const decimals  = step < 1 ? Math.max(0, -Math.floor(Math.log10(step))) : 0;
    const ticks = [];
    for (let v = first; v <= sc.hi + step * 0.01; v = Math.round((v + step) * 1e9) / 1e9) {
      const y = sc.pos(v);
      if (y >= PAD.top - 2 && y <= PAD.top + iH + 2) ticks.push({ v: v.toFixed(decimals), y });
      if (ticks.length >= 6) break;
    }
    return ticks;
  }

  const ticks1 = niceTicks(sc1);
  const ticks2 = niceTicks(sc2);

  // X-ticks from union of both date sets
  const uniqDates = [...new Set([...data1, ...data2].map(d => d.date))].sort();
  const n = uniqDates.length;
  const xIdxSet = new Set([0, n - 1]);
  if (n >= 4) { const slots = Math.min(4, n - 2); for (let s = 1; s <= slots; s++) xIdxSet.add(Math.round(s*(n-1)/(slots+1))); }
  const MIN_TICK_PX = 48;
  const xTicks = (() => {
    const all  = [...xIdxSet].sort((a,b)=>a-b).map(i => ({ label: fmtShort(uniqDates[i]), x: xPos(new Date(uniqDates[i]+'T00:00:00').getTime()) }));
    const kept = [all[0]];
    for (let i = 1; i < all.length - 1; i++) { if (all[i].x - kept[kept.length-1].x >= MIN_TICK_PX) kept.push(all[i]); }
    if (all.length > 1) { const last = all[all.length-1]; if (last.x - kept[kept.length-1].x >= MIN_TICK_PX/2) kept.push(last); }
    return kept;
  })();

  function linearPath(pts) {
    if (pts.length < 2) return '';
    return `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}` + pts.slice(1).map(p => ` L${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('');
  }

  const pts1 = data1.map((d,i) => ({ x: xPos(new Date(d.date+'T00:00:00').getTime()), y: sc1.pos(d.value), date: d.date, value: d.value, i }));
  const pts2 = data2.map((d,i) => ({ x: xPos(new Date(d.date+'T00:00:00').getTime()), y: sc2.pos(d.value), date: d.date, value: d.value, i }));

  const hdr = document.getElementById('graph-header');
  if (hdr) {
    hdr.innerHTML = `<span class="card-title">${esc(def1?.label ?? key1)}</span>
      <span style="color:var(--text-muted);margin:0 .35rem;font-weight:400;font-size:.8125rem">&amp;</span>
      <span class="card-title">${esc(def2?.label ?? key2)}</span>`;
  }

  area.innerHTML = `
    <div style="position:relative;overflow:visible">
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;overflow:visible" xmlns="http://www.w3.org/2000/svg">
        ${ticks1.map(t=>`<line x1="${PAD.left}" y1="${t.y.toFixed(2)}" x2="${PAD.left+iW}" y2="${t.y.toFixed(2)}" stroke="var(--border)" stroke-width="1"/>`).join('')}
        <path d="${linearPath(pts1)}" fill="none" stroke="${color1}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
        <path d="${linearPath(pts2)}" fill="none" stroke="${color2}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
        ${ticks1.map(t=>`<text x="${PAD.left-8}" y="${t.y.toFixed(2)}" dy="4" text-anchor="end"
          class="graph-label graph-label-y" fill="${color1}" font-family="JetBrains Mono,monospace">${t.v}</text>`).join('')}
        ${ticks2.map(t=>`<text x="${PAD.left+iW+8}" y="${t.y.toFixed(2)}" dy="4" text-anchor="start"
          class="graph-label graph-label-y" fill="${color2}" font-family="JetBrains Mono,monospace">${t.v}</text>`).join('')}
        ${def1?.unit?`<text x="${PAD.left}" y="${PAD.top-6}" text-anchor="start" class="graph-label" fill="${color1}" font-family="sans-serif" font-size="10">${esc(def1.unit)}</text>`:''}
        ${def2?.unit?`<text x="${PAD.left+iW}" y="${PAD.top-6}" text-anchor="end" class="graph-label" fill="${color2}" font-family="sans-serif" font-size="10">${esc(def2.unit)}</text>`:''}
        ${xTicks.map(t=>`<text x="${t.x.toFixed(2)}" y="${H-10}" text-anchor="middle"
          class="graph-label xtick-edge" fill="var(--text-muted)" font-family="sans-serif">${t.label}</text>`).join('')}
        ${pts1.map((p,i)=>`<circle class="graph-dot" id="gdot1-${i}" data-index="${i}"
          cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="4" style="fill:${color1}"
          data-date="${fmtDate(p.date)}" data-val="${p.value}" data-key="${key1}"
          onmouseenter="showGraphTip(event,this)" onmouseleave="hideGraphTip()"/>`).join('')}
        ${pts2.map((p,i)=>`<circle class="graph-dot" id="gdot2-${i}" data-index="${i}"
          cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="4" style="fill:${color2}"
          data-date="${fmtDate(p.date)}" data-val="${p.value}" data-key="${key2}"
          onmouseenter="showGraphTip(event,this)" onmouseleave="hideGraphTip()"/>`).join('')}
      </svg>
      <div id="graph-tip" class="graph-tip" style="display:none"></div>
    </div>
    <div class="dual-legend">
      <div class="legend-item">
        <svg width="24" height="4" viewBox="0 0 24 4"><line x1="0" y1="2" x2="24" y2="2" stroke="${color1}" stroke-width="2.5" stroke-linecap="round"/></svg>
        <span>${esc(def1?.label ?? key1)}</span>
      </div>
      <div class="legend-item">
        <svg width="24" height="4" viewBox="0 0 24 4"><line x1="0" y1="2" x2="24" y2="2" stroke="${color2}" stroke-width="2.5" stroke-linecap="round"/></svg>
        <span>${esc(def2?.label ?? key2)}</span>
      </div>
    </div>`;
}

function showGraphTip(event, el) {
  const tip = document.getElementById('graph-tip');
  if (!tip) return;
  const tipKey = el.dataset.key || activeGraphKey;
  const tipUnit = metricDef(tipKey)?.unit ?? '';
  tip.textContent = `${el.dataset.date}: ${el.dataset.val}${tipUnit ? ' '+tipUnit : ''}`;
  // Position before revealing so offsetWidth is correct
  tip.style.visibility = 'hidden';
  tip.style.opacity    = '0';
  tip.style.display    = 'block';
  const svgEl  = el.closest('svg');
  const svgRect = svgEl.getBoundingClientRect();
  const scaleX  = svgRect.width / 680;
  const scaleY  = svgRect.height / 260;
  const cx = parseFloat(el.getAttribute('cx')) * scaleX;
  const cy = parseFloat(el.getAttribute('cy')) * scaleY;
  tip.style.left = (cx - tip.offsetWidth / 2) + 'px';
  tip.style.top  = (cy - 36) + 'px';
  // Trigger fade-in after positioning
  tip.style.visibility = '';
  requestAnimationFrame(() => { tip.style.opacity = '1'; });

  // Tabellen-Row mithervorheben
  highlightRow(el.dataset.index);
}

function hideGraphTip() {
  const t = document.getElementById('graph-tip');
  if (!t) return;
  t.style.opacity = '0';
  // Hide after transition completes
  t.addEventListener('transitionend', () => { t.style.display = 'none'; }, { once: true });

  // Tabellen-Highlight entfernen
  clearRowHighlight();
}

// ── Bidirektionales Cross-Highlight ──────────────
// dotIndex: Position im chronologisch sortierten data-Array (0 = ältester Punkt).
// Die Tabelle ist umgekehrt (data.reverse()), daher:
//   row-data-index = data.length - 1 - dotIndex
// Wir speichern den dot-Index direkt im Row-Attribut (siehe renderMetricTable),
// sodass kein Umrechnen hier nötig ist.
function highlightRow(dotIndex) {
  clearRowHighlight();
  const row = document.querySelector(`.metric-table tr[data-dot="${dotIndex}"]`);
  if (row) row.classList.add('row--highlight');
}

function clearRowHighlight() {
  document.querySelector('.metric-table tr.row--highlight')?.classList.remove('row--highlight');
}

function highlightDot(dotIndex) {
  clearDotHighlight();
  const dot = document.getElementById(`gdot-${dotIndex}`);
  if (dot) dot.classList.add('graph-dot--highlight');
}

function clearDotHighlight() {
  document.querySelector('.graph-dot--highlight')?.classList.remove('graph-dot--highlight');
}

// Monats-Navigator für Boolean-Kalender
function shiftBoolCal(dir) {
  _boolCalOffset += dir * 3;
  if (_boolCalOffset > 0) _boolCalOffset = 0;
  drawGraph(activeGraphKey);
}

function jumpBoolCalToday() {
  _boolCalOffset = 0;
  drawGraph(activeGraphKey);
}

// ── Boolean-Graph: Kalenderraster ──────────────
function drawBooleanGraph(key, def, allData, area) {
  // Anzeigebereich: 3 Monate ab Offset (0 = aktuelle 3 Monate)
  const now = new Date();
  // Startmonat berechnen
  const startMonth = new Date(now.getFullYear(), now.getMonth() + _boolCalOffset - 2, 1);
  const endMonth   = new Date(now.getFullYear(), now.getMonth() + _boolCalOffset, 1);

  // Navigator-Label und Vorwärts-Button
  const monthNames = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  const labelEl = document.getElementById('bcal-nav-label');
  const fwdBtn  = document.getElementById('bcal-nav-fwd');
  if (labelEl) {
    const sLabel = `${monthNames[startMonth.getMonth()]} ${startMonth.getFullYear()}`;
    const eLabel = `${monthNames[endMonth.getMonth()]} ${endMonth.getFullYear()}`;
    labelEl.textContent = sLabel === eLabel ? sLabel : `${sLabel} – ${eLabel}`;
  }
  if (fwdBtn) fwdBtn.disabled = _boolCalOffset >= 0;
  const todayBtn = document.getElementById('bcal-nav-today');
  if (todayBtn) todayBtn.style.display = _boolCalOffset !== 0 ? '' : 'none';

  // Nur Daten im angezeigten Bereich
  const endOfEndMonth = new Date(endMonth.getFullYear(), endMonth.getMonth() + 1, 0);
  const isoStart = startMonth.toISOString().slice(0,10);
  const isoEnd   = endOfEndMonth.toISOString().slice(0,10);
  const data = allData.filter(d => d.date >= isoStart && d.date <= isoEnd);

  // Aktive Tage: bei boolean = true, bei select = erster Optionswert ("ja")
  const activeValue = def?.type === 'select'
    ? (def.options?.[0] ?? 'ja')
    : true;
  const trueSet = new Set(
    allData.filter(d => d.value === activeValue || d.value === true || d.value === 'true').map(d => d.date)
  );
  // Tage mit einem anderen Wert (erfasst, aber nicht aktiv) — z.B. "nein"
  const trackedSet = new Set(allData.map(d => d.date));

  // Monate rendern
  const months = [];
  const cur = new Date(startMonth);
  while (cur <= endMonth) {
    months.push(new Date(cur));
    cur.setMonth(cur.getMonth() + 1);
  }

  const DAYS = ['Mo','Di','Mi','Do','Fr','Sa','So'];
  const monthNamesLong = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

  const calendars = months.map(m => {
    const year = m.getFullYear(), month = m.getMonth();
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push('<span class="bcal-empty"></span>');
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const active  = trueSet.has(iso);
      const tracked = !active && trackedSet.has(iso);
      const cls = active ? ' bcal-day--active' : tracked ? ' bcal-day--tracked' : '';
      cells.push(`<span class="bcal-day${cls}" title="${iso}">${d}</span>`);
    }
    return `<div class="bcal-month">
      <div class="bcal-month-title">${monthNamesLong[month]} ${year}</div>
      <div class="bcal-grid">
        ${DAYS.map(d=>`<span class="bcal-hdr">${d}</span>`).join('')}
        ${cells.join('')}
      </div>
    </div>`;
  }).join('');

  const noData = data.length === 0
    ? '<p style="color:var(--text-muted);font-size:.875rem;margin-top:.5rem">Keine Einträge im angezeigten Zeitraum.</p>'
    : '';

  area.innerHTML = `<div class="bcal-wrap">${calendars}</div>${noData}`;
}

function renderMetricTable(data, def) {
  if (!data.length) return '';
  const sorted = [...data].reverse();
  const norm = resolveNormalRange(def?.key ?? '', currentPersonId);
  const isNumeric = def?.type !== 'boolean' && def?.type !== 'select';
  const valStyle  = isNumeric ? ' style="font-family:var(--font-mono);text-align:right"' : '';

  // Global min/max for (min)/(max) labels — only meaningful with 2+ distinct values
  let globalMin = null, globalMax = null;
  if (isNumeric && data.length > 1) {
    const vals = data.map(d => d.value);
    globalMin = Math.min(...vals);
    globalMax = Math.max(...vals);
    if (globalMin === globalMax) { globalMin = null; globalMax = null; }
  }

  const rows = sorted.map((d, sortedIdx) => {
    // sortedIdx 0 = neuester Eintrag = data[data.length-1] = letzter Dot
    const dotIndex = data.length - 1 - sortedIdx;
    let indicator = '';
    if (norm && isNumeric) {
      const effectiveMin = norm.min === 0 ? -Infinity : norm.min;
      const effectiveMax = norm.max >= 900 ?  Infinity : norm.max;
      if (d.value > effectiveMax)
        indicator = '<span class="range-arrow range-arrow-high" title="Über dem Normwert">↑</span> ';
      else if (d.value < effectiveMin)
        indicator = '<span class="range-arrow range-arrow-low"  title="Unter dem Normwert">↓</span> ';
    }
    const extremeTag = isNumeric
      ? (d.value === globalMax ? '<span class="extreme-tag extreme-tag-max">(max)</span> '
       : d.value === globalMin ? '<span class="extreme-tag extreme-tag-min">(min)</span> '
       : '')
      : '';
    return `<tr data-dot="${dotIndex}"
               onmouseenter="highlightDot(${dotIndex})"
               onmouseleave="clearDotHighlight()">
      <td>${fmtDate(d.date)}</td>
      <td${valStyle}>${extremeTag}${indicator}${esc(String(d.value))}</td>
      ${isNumeric ? `<td class="metric-table-unit">${esc(def?.unit??'')}</td>` : ''}
    </tr>`;
  }).join('');
  const unitHead = isNumeric ? '<th class="metric-table-unit">Einheit</th>' : '';
  return `<table class="metric-table">
    <thead><tr><th>Datum</th><th${isNumeric ? ' style="text-align:right"' : ''}>Wert</th>${unitHead}</tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ══════════════════════════════════════════════════════════════
// ZYKLUS-ÜBERSICHT — kombiniertes Diagramm
// ══════════════════════════════════════════════════════════════

function detectCycles(pid) {
  const mensDates = new Set();
  DATA.entries.forEach(e => {
    if (e.personId !== pid) return;
    const v = e.metrics?.menstruation;
    if (v === 'Stark' || v === 'Schwach') mensDates.add(e.date);
  });
  if (!mensDates.size) return [];

  const sorted = [...mensDates].sort();
  const cycleStarts = [];
  for (const d of sorted) {
    const prev = new Date(d + 'T00:00:00');
    prev.setDate(prev.getDate() - 1);
    if (!mensDates.has(prev.toISOString().slice(0, 10))) cycleStarts.push(d);
  }

  const todayISO = new Date().toISOString().slice(0, 10);
  return cycleStarts.map((start, i) => {
    let end;
    if (i + 1 < cycleStarts.length) {
      const d = new Date(cycleStarts[i + 1] + 'T00:00:00');
      d.setDate(d.getDate() - 1);
      end = d.toISOString().slice(0, 10);
    } else {
      end = todayISO;
    }
    return { start, end };
  });
}

function shiftZyklus(dir) {
  _zyklusOffset += dir;
  const area = document.getElementById('graph-area');
  if (area) drawZyklusGraph(area);
}

function drawZyklusGraph(area) {
  const cycles = detectCycles(currentPersonId);

  if (!cycles.length) {
    const prev = document.getElementById('zyklus-nav-prev');
    const next = document.getElementById('zyklus-nav-next');
    const lbl  = document.getElementById('zyklus-nav-label');
    if (prev) prev.disabled = true;
    if (next) next.disabled = true;
    if (lbl)  lbl.textContent = '—';
    area.innerHTML = `<div class="empty-state">
      <div class="empty-icon"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/></svg></div>
      <p>Keine Zyklusdaten vorhanden.<br>Trage zuerst Blutungstage ein.</p>
    </div>`;
    return;
  }

  // Clamp offset to valid range
  const minOffset = -(cycles.length - 1);
  if (_zyklusOffset < minOffset) _zyklusOffset = minOffset;
  if (_zyklusOffset > 0) _zyklusOffset = 0;

  const cycleIdx = cycles.length - 1 + _zyklusOffset;
  const cycle    = cycles[cycleIdx];

  // Update navigation
  const MN = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  const sd = new Date(cycle.start + 'T00:00:00');
  const ed = new Date(cycle.end   + 'T00:00:00');
  const label = `Zyklus ${cycleIdx + 1} · ${sd.getDate()}. ${MN[sd.getMonth()]} – ${ed.getDate()}. ${MN[ed.getMonth()]} ${ed.getFullYear()}`;
  const prevBtn = document.getElementById('zyklus-nav-prev');
  const nextBtn = document.getElementById('zyklus-nav-next');
  const lblEl   = document.getElementById('zyklus-nav-label');
  if (prevBtn) prevBtn.disabled = cycleIdx <= 0;
  if (nextBtn) nextBtn.disabled = cycleIdx >= cycles.length - 1;
  if (lblEl)   lblEl.textContent = label;

  // Build day list
  const days = [];
  for (let d = new Date(sd); d <= ed; d.setDate(d.getDate() + 1))
    days.push(d.toISOString().slice(0, 10));
  const N = days.length;

  // Collect per-day metric data from entries
  const MKEYS = ['lh_value', 'menstruation', 'cervical_mucus', 'sex'];
  const dayData = {};
  DATA.entries
    .filter(e => e.personId === currentPersonId && e.date >= cycle.start && e.date <= cycle.end)
    .forEach(e => {
      if (!dayData[e.date]) dayData[e.date] = {};
      MKEYS.forEach(k => {
        const v = e.metrics?.[k];
        if (v !== undefined && v !== null && v !== '') dayData[e.date][k] = v;
      });
      const bt = e.metrics?.basal_temp;
      if (bt !== undefined && bt !== null && bt !== '') dayData[e.date].basal_temp = parseFloat(bt);
    });

  // SVG layout constants
  const W = 680, PL = 52, PR = 20, iW = W - PL - PR;
  const BOX_H = 18, ROW_SP = 23, ROWS_TOP = 8;
  const DIVIDER_Y = ROWS_TOP + 4 * ROW_SP + 4;
  const CHART_TOP = DIVIDER_Y + 8;
  const CHART_H   = 140;
  const CHART_BOT = CHART_TOP + CHART_H;
  const DAY_Y     = CHART_BOT + 20;
  const H         = DAY_Y + 8;

  const dayW  = iW / N;
  const bxL   = (i) => PL + i * dayW + 0.5;
  const bW    = Math.max(dayW - 1, 1);
  const cxOf  = (i) => PL + (i + 0.5) * dayW;

  // ── Box rows ──────────────────────────────────
  const ROWS = [
    { key: 'menstruation',   label: 'Blutung' },
    { key: 'lh_value',       label: 'LH' },
    { key: 'cervical_mucus', label: 'Zervix' },
    { key: 'sex',            label: 'Sex' },
  ];
  const ZABBR = { trocken: 'T', cremig: 'C', 'wässrig': 'W', 'glasig-dehnbar (spinnbar)': 'G' };

  let svgBoxes = '';
  ROWS.forEach(({ key, label }, ri) => {
    const rowY  = ROWS_TOP + ri * ROW_SP;
    const textY = (rowY + BOX_H / 2 + 3.5).toFixed(1);

    svgBoxes += `<text x="${PL - 5}" y="${textY}" text-anchor="end" font-size="10" fill="var(--text-muted)">${esc(label)}</text>`;

    days.forEach((date, di) => {
      const dd  = dayData[date];
      const val = dd?.[key];          // undefined = not recorded
      const hasData = val !== undefined;

      let fill = 'var(--border)';     // default: greyed (no data)
      let text = '';
      let tc   = '#fff';

      if (hasData) {
        if (key === 'lh_value') {
          if (val === true || val === 'true') {
            fill = 'var(--accent)'; text = '+';
          } else {
            fill = 'var(--bg-subtle)'; text = '−'; tc = 'var(--text-muted)';
          }
        } else if (key === 'menstruation') {
          fill = 'var(--danger)';
          text = val === 'Stark' ? '●' : '◒';
        } else if (key === 'cervical_mucus') {
          fill = 'var(--success)';
          text = ZABBR[val] ?? val.charAt(0).toUpperCase();
        } else if (key === 'sex') {
          if (val === true || val === 'true') {
            fill = 'var(--accent-2)'; text = '♥';
          } else {
            fill = 'var(--bg-subtle)';
          }
        }
      }

      const bx = bxL(di).toFixed(1);
      svgBoxes += `<rect x="${bx}" y="${rowY}" width="${bW.toFixed(1)}" height="${BOX_H}" rx="2" fill="${fill}"/>`;
      if (text) {
        const fs = text.length > 1 ? 8 : 10;
        svgBoxes += `<text x="${cxOf(di).toFixed(1)}" y="${textY}" text-anchor="middle" font-size="${fs}" font-weight="600" fill="${tc}">${esc(text)}</text>`;
      }
    });
  });

  // ── Basaltemperatur line chart ────────────────
  const basalPts = days
    .map((date, i) => ({ i, v: dayData[date]?.basal_temp }))
    .filter(p => p.v !== undefined);

  let svgChart = `<line x1="${PL}" y1="${DIVIDER_Y}" x2="${PL + iW}" y2="${DIVIDER_Y}" stroke="var(--border)" stroke-width="1"/>`;

  if (basalPts.length > 0) {
    const vals = basalPts.map(p => p.v);
    let yMin = Math.min(...vals), yMax = Math.max(...vals);
    const pad = Math.max((yMax - yMin) * 0.2, 0.15);
    yMin -= pad; yMax += pad;
    const yR  = yMax - yMin;
    const yP  = (v) => CHART_TOP + CHART_H * (1 - (v - yMin) / yR);
    const xP  = (i) => cxOf(i);

    // Y ticks
    const rawStep = yR / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(rawStep) || 0.1)));
    const nr  = rawStep / mag;
    const ns  = nr <= 1 ? mag : nr <= 2 ? 2*mag : nr <= 5 ? 5*mag : 10*mag;
    const ft  = Math.ceil(yMin / ns) * ns;
    const dec = ns < 1 ? Math.max(0, -Math.floor(Math.log10(ns))) : 0;
    const yTicks = [];
    for (let v = ft; v <= yMax + ns*0.01; v = Math.round((v + ns)*1e9)/1e9) {
      const y = yP(v);
      if (y >= CHART_TOP - 1 && y <= CHART_BOT + 1) yTicks.push({ lbl: v.toFixed(dec), y });
      if (yTicks.length >= 7) break;
    }
    svgChart += yTicks.map(t =>
      `<line x1="${PL}" y1="${t.y.toFixed(1)}" x2="${PL+iW}" y2="${t.y.toFixed(1)}" stroke="var(--border)" stroke-width="1"/>` +
      `<text x="${PL-6}" y="${(t.y+3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--text-muted)" font-family="var(--font-mono)">${t.lbl}</text>`
    ).join('');

    // Line segments (consecutive days only)
    for (let k = 0; k < basalPts.length - 1; k++) {
      if (basalPts[k+1].i === basalPts[k].i + 1) {
        svgChart += `<line x1="${xP(basalPts[k].i).toFixed(1)}" y1="${yP(basalPts[k].v).toFixed(1)}" x2="${xP(basalPts[k+1].i).toFixed(1)}" y2="${yP(basalPts[k+1].v).toFixed(1)}" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
    }
    svgChart += basalPts.map(p =>
      `<circle cx="${xP(p.i).toFixed(1)}" cy="${yP(p.v).toFixed(1)}" r="3.5" fill="var(--accent)"/>`
    ).join('');
  } else {
    svgChart += `<text x="${(PL + iW/2).toFixed(1)}" y="${((CHART_TOP+CHART_BOT)/2).toFixed(1)}" text-anchor="middle" font-size="12" fill="var(--text-muted)">Keine Basaltemperatur-Daten in diesem Zyklus</text>`;
  }

  // ── Day-number labels ─────────────────────────
  const labelSet = new Set([0]);
  for (let i = 6; i < N; i += 7) labelSet.add(i);
  if (N > 1) labelSet.add(N - 1);
  let svgDayLabels = '';
  days.forEach((_, di) => {
    if (labelSet.has(di))
      svgDayLabels += `<text x="${cxOf(di).toFixed(1)}" y="${DAY_Y}" text-anchor="middle" font-size="10" fill="var(--text-muted)">${di + 1}</text>`;
  });

  area.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;overflow:visible" xmlns="http://www.w3.org/2000/svg">
    ${svgBoxes}${svgChart}${svgDayLabels}
  </svg>`;
}
