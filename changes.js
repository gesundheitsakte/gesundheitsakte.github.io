/* ═══════════════════════════════════════════════
   Familien-Gesundheitsakte — changes.js
   ───────────────────────────────────────────────
   Tab "Änderungen": Anzeige und Verwaltung des
   CHANGE_LOG (nicht gespeicherte Änderungen).

   Teil eines klassischen Multi-Script-Setups (kein ES-Modul):
   alle Dateien teilen denselben globalen Scope. Reihenfolge der
   <script>-Tags siehe index.html.
   ═══════════════════════════════════════════════ */
'use strict';

// ── Diff-Berechnung ─────────────────────────────
// Zwei-Zeiger-Ansatz: O(m+n) statt O(m*n). Funktioniert perfekt für
// typische Einzel-Feld-Änderungen (Name, Farbe, Zielwert …), da diese
// genau einen zusammenhängenden geänderten Block erzeugen.
function _computeLineDiff(beforeJson, afterJson) {
  const fmt = j => JSON.stringify(JSON.parse(j), null, 2);
  const a = fmt(beforeJson).split('\n');
  const b = fmt(afterJson).split('\n');

  // Gemeinsames Präfix
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;

  // Gemeinsames Suffix (rückwärts, nicht ins Präfix laufen)
  let endA = a.length - 1, endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) { endA--; endB--; }

  const result = [];
  for (let i = 0; i < start; i++)          result.push({ type: 'ctx', line: a[i] });
  for (let i = start; i <= endA; i++)       result.push({ type: 'del', line: a[i] });
  for (let i = start; i <= endB; i++)       result.push({ type: 'add', line: b[i] });
  for (let i = endA + 1; i < a.length; i++) result.push({ type: 'ctx', line: a[i] });
  return result;
}

function _renderDiffHtml(diff) {
  if (!diff.length) return '<span class="diff-ctx">(keine Unterschiede)</span>';
  if (diff[0].type === 'info') return `<span class="diff-info">${esc(diff[0].line)}</span>`;

  const CONTEXT = 2;
  const changed = new Set();
  diff.forEach((l, i) => { if (l.type !== 'ctx') changed.add(i); });

  const visible = new Set();
  changed.forEach(i => {
    for (let k = Math.max(0, i - CONTEXT); k <= Math.min(diff.length - 1, i + CONTEXT); k++) {
      visible.add(k);
    }
  });

  let html = '';
  let lastVisible = -1;
  diff.forEach((l, i) => {
    if (!visible.has(i)) return;
    if (lastVisible >= 0 && i > lastVisible + 1) {
      html += `<span class="diff-ellipsis">···</span>\n`;
    }
    const cls    = l.type === 'add' ? 'diff-add' : l.type === 'del' ? 'diff-del' : 'diff-ctx';
    const prefix = l.type === 'add' ? '+' : l.type === 'del' ? '-' : ' ';
    html += `<span class="${cls}">${prefix}${esc(l.line)}</span>\n`;
    lastVisible = i;
  });
  return html;
}

// ── Änderung rückgängig machen ──────────────────
function revertToChange(changeId) {
  const idx = CHANGE_LOG.findIndex(c => c.id === changeId);
  if (idx < 0) return;

  const count = CHANGE_LOG.length - idx;
  const plural = count === 1 ? 'diese Änderung' : `diese und ${count - 1} nachfolgende Änderung${count > 2 ? 'en' : ''}`;
  if (!confirm(`${plural} rückgängig machen?`)) return;

  const snap = JSON.parse(CHANGE_LOG[idx].before);
  DATA = { ...snap, lastModified: new Date().toISOString() };

  // Ungültige Person abfangen
  if (!getPersonList().find(p => p.id === currentPersonId)) {
    currentPersonId = getPersonList()[0]?.id || null;
  }

  CHANGE_LOG.splice(idx);
  hasUnsavedChanges = CHANGE_LOG.length > 0;

  updateUnsavedIndicator();
  syncChangesTabVisibility();
  persistNow();
  buildPersonSelector();
  applyPersonAccent();
  renderChanges();
}

// ── Tab rendern ──────────────────────────────────
function renderChanges() {
  const panel = document.getElementById('panel-changes');
  if (!panel) return;

  if (!CHANGE_LOG.length) {
    panel.innerHTML = `<div class="empty-state" style="padding:3rem 1rem;text-align:center;color:var(--text-muted)">
      Keine nicht gespeicherten Änderungen vorhanden.
    </div>`;
    return;
  }

  const exportHint = `<div class="changes-export-bar">
    <button class="btn btn-primary" onclick="exportData()">Exportieren ↓</button>
    <span class="changes-export-hint">Strg+S exportiert ebenfalls</span>
  </div>`;

  const entries = [...CHANGE_LOG].reverse().map((c, revIdx) => {
    const origIdx = CHANGE_LOG.length - 1 - revIdx;
    const ts  = new Date(c.ts).toLocaleString('de-AT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    const diffId = `diff-${c.id}`;
    return `<div class="change-entry" id="ce-${c.id}">
      <div class="change-header">
        <div class="change-meta">
          <span class="change-dot"></span>
          <span class="change-title">${esc(c.description)}</span>
          <span class="change-ts">${ts}</span>
        </div>
        <div class="change-actions">
          <button class="btn btn-ghost btn-sm change-diff-toggle"
                  onclick="toggleChangeDiff('${diffId}')"
                  aria-expanded="false" aria-controls="${diffId}">Diff ▼</button>
          <button class="btn btn-ghost btn-sm" style="color:var(--danger)"
                  onclick="revertToChange('${c.id}')"
                  title="Diese${origIdx < CHANGE_LOG.length - 1 ? ' und nachfolgende Änderungen' : ' Änderung'} rückgängig machen">↩</button>
        </div>
      </div>
      <div class="change-diff" id="${diffId}" style="display:none">
        <pre class="diff-block"><code>${_renderDiffHtml(_computeLineDiff(c.before, c.after))}</code></pre>
      </div>
    </div>`;
  }).join('');

  panel.innerHTML = exportHint + `<div class="change-list">${entries}</div>`;
}

function toggleChangeDiff(diffId) {
  const el  = document.getElementById(diffId);
  const btn = el?.previousElementSibling?.querySelector('.change-diff-toggle');
  if (!el) return;
  const open = el.style.display === 'none';
  el.style.display = open ? '' : 'none';
  if (btn) {
    btn.textContent = open ? 'Diff ▲' : 'Diff ▼';
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
}
