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
// Einfacher LCS-basierter Zeilendiff zweier JSON-Strings.
function _computeLineDiff(beforeJson, afterJson) {
  const fmt  = j => JSON.stringify(JSON.parse(j), null, 2);
  const aLines = fmt(beforeJson).split('\n');
  const bLines = fmt(afterJson).split('\n');
  const m = aLines.length, n = bLines.length;

  // Größenbeschränkung (O(m*n))
  if (m * n > 600000) return [{ type: 'info', line: '(Diff zu groß für Inline-Anzeige)' }];

  const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = aLines[i-1] === bLines[j-1]
        ? dp[i-1][j-1] + 1
        : Math.max(dp[i-1][j], dp[i][j-1]);
    }
  }

  const result = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && aLines[i-1] === bLines[j-1]) {
      result.unshift({ type: 'ctx', line: aLines[i-1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
      result.unshift({ type: 'add', line: bLines[j-1] });
      j--;
    } else {
      result.unshift({ type: 'del', line: aLines[i-1] });
      i--;
    }
  }
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
