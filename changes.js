/* ═══════════════════════════════════════════════
   Familien-Gesundheitsakte — changes.js
   ───────────────────────────────────────────────
   Tab "Änderungen": Anzeige des CHANGE_LOG
   (nicht gespeicherte Änderungen).

   Teil eines klassischen Multi-Script-Setups (kein ES-Modul):
   alle Dateien teilen denselben globalen Scope. Reihenfolge der
   <script>-Tags siehe index.html.
   ═══════════════════════════════════════════════ */
'use strict';

function _renderDiffHtml(diff) {
  if (!diff || !diff.length) return '<span class="diff-ctx">(keine Unterschiede)</span>';
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

  const entries = [...CHANGE_LOG].reverse().map(c => {
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
        </div>
      </div>
      <div class="change-diff" id="${diffId}" style="display:none">
        <pre class="diff-block"><code>${_renderDiffHtml(c.diff)}</code></pre>
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
