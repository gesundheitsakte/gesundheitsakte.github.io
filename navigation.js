/* ═══════════════════════════════════════════════
   Familien-Gesundheitsakte — navigation.js
   ───────────────────────────────────────────────
   App-Rahmen: init, Tabs, Personen-Auswahl, Theme (Dark Mode), Toast,
      App-Start/Banner, Tastatur-Navigation. Startet die App via DOMContentLoaded.

   Teil eines klassischen Multi-Script-Setups (kein ES-Modul):
   alle Dateien teilen denselben globalen Scope. Reihenfolge der
   <script>-Tags siehe index.html.
   ═══════════════════════════════════════════════ */
'use strict';

// ═══════════════════════════════════════════════
// INIT — zeigt zuerst die Landing-Page
// ═══════════════════════════════════════════════
function init() {
  if (typeof APP_CONFIG === 'undefined') {
    document.body.innerHTML = '<div style="padding:2rem;color:#e11d48;font-family:sans-serif">'
      + '<strong>Fehler:</strong> config.js konnte nicht geladen werden.</div>';
    return;
  }
  CONFIG = APP_CONFIG;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW:', e));
  }

  setupGlobalDropzone();
  initTheme();

  document.querySelector('.topbar-brand')?.addEventListener('click', () => {
    if (appMode === 'app') activateTab(hasUnsavedChanges ? 'changes' : 'dashboard');
  });

  // Keyboard navigation
  document.addEventListener('keydown', e => {
    const modals = document.querySelectorAll('.modal-overlay');
    const topModal = modals.length ? modals[modals.length - 1] : null;
    const focused = document.activeElement?.tagName;
    const inInput = focused === 'INPUT' || focused === 'TEXTAREA' || focused === 'SELECT';

    // Escape: closes topmost modal
    if (e.key === 'Escape' && topModal) {
      if (topModal.id === 'person-modal') closePersonModal();
      else topModal.remove();
      return;
    }

    // Enter: confirms topmost modal (clicks primary button)
    if (e.key === 'Enter' && topModal) {
      if (document.activeElement?.tagName === 'TEXTAREA') return;
      if (document.activeElement?.tagName === 'BUTTON') return;
      const primary = topModal.querySelector('.modal-footer .btn-primary');
      if (primary) { primary.click(); return; }
    }

    // Shortcuts nur im App-Modus, kein Modal offen, kein Input fokussiert
    if (appMode === 'app' && !topModal && !inInput) {

      // N — neuer Eintrag
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        activateTab('entry');
        return;
      }

      // Ctrl/Cmd + S — Datenbank exportieren
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        exportData();
        return;
      }

      // Ctrl/Cmd + P — Drucken
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        window.print();
        return;
      }

      // Ctrl/Cmd + 1–9 — Person wechseln
      if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '9') {
        const persons = getPersonList();
        const idx = parseInt(e.key, 10) - 1;
        if (idx < persons.length && persons[idx].id !== currentPersonId) {
          e.preventDefault();
          selectPerson(persons[idx].id);
        }
        return;
      }

      // Left/Right arrow keys: switch tabs
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const activeBtn = document.querySelector('.tab-btn.active');
        if (!activeBtn) return;
        const tabs = [...document.querySelectorAll('.tab-btn')].filter(b => b.style.display !== 'none');
        const idx = tabs.indexOf(activeBtn);
        const next = e.key === 'ArrowRight'
          ? tabs[Math.min(idx + 1, tabs.length - 1)]
          : tabs[Math.max(idx - 1, 0)];
        if (next && next !== activeBtn) next.click();
      }
    }
  });

  // Browser-Zurück/Vor: Tab aus dem History-State wiederherstellen.
  window.addEventListener('popstate', e => {
    const tab = e.state?.tab;
    if (!tab || appMode !== 'app') return;
    _historyNavigation = true;
    activateTab(tab);
    _historyNavigation = false;
  });

  history.replaceState(null, '', location.pathname + location.search);

  // Beim Start: vorhandene Daten aus localStorage laden (sofort, ohne Passwort,
  // da localStorage Klartext enthält). Sonst Landing zeigen.
  loadFromStorageOrLanding();
}

// Lädt persistierte Daten aus localStorage oder zeigt die Startseite.
function loadFromStorageOrLanding() {
  const snap = readPersistedData();
  if (!snap || !snap.data) { showLanding(); return; }
  try {
    DATA = normalizeDatabase(snap.data);
    CHANGE_LOG = Array.isArray(snap.changeLog)
      ? snap.changeLog.map(c => c.diff ? c : {
          id: c.id, ts: c.ts, description: c.description,
          diff: (c.before && c.after) ? _computeLineDiff(c.before, c.after) : [],
        })
      : [];
    _originalSnapshot = snap.originalSnapshot || null;
    isDemoMode = false;
    isEncrypted = !!snap.isEncrypted;
    hasUnsavedChanges = CHANGE_LOG.length > 0;
    currentPersonId = getPersonList()[0]?.id || null;
    document.getElementById('landing').style.display = 'none';
    document.getElementById('onboarding').style.display = 'none';
    startApp();
    updateUnsavedIndicator();
  } catch (e) {
    console.warn('Konnte gespeicherte Daten nicht laden:', e);
    showLanding();
  }
}


// ═══════════════════════════════════════════════
// PERSON SELECTOR
// ═══════════════════════════════════════════════
// ── Custom person dropdown ────────────────────
let _pdOpen = false;

function buildPersonSelector() {
  renderPersonDropdown();

  // Close on outside click
  document.addEventListener('click', e => {
    if (!document.getElementById('person-selector')?.contains(e.target)) {
      closePersonDropdown();
    }
  });
}

function renderPersonDropdown() {
  const menu  = document.getElementById('pd-menu');
  const label = document.getElementById('pd-label');
  if (!menu) return;

  menu.innerHTML = getPersonList().map(p => `
    <div class="pd-item${p.id === currentPersonId ? ' active' : ''}"
         onclick="selectPerson('${escAttr(p.id)}');closePersonDropdown()">
      <span class="pd-item-initials" style="background:${personColor(p)}">${personAvatarContent(p)}</span>
      <span class="pd-item-name">${esc(p.name)}</span>
      ${p.id === currentPersonId ? '<span class="pd-item-check">✓</span>' : ''}
    </div>`).join('');

  // Update trigger label
  const current = getPersonList().find(p => p.id === currentPersonId);
  if (label && current) label.textContent = current.name;
}

function togglePersonDropdown() {
  _pdOpen ? closePersonDropdown() : openPersonDropdown();
}

function openPersonDropdown() {
  _pdOpen = true;
  document.getElementById('pd-menu')?.classList.add('open');
  document.getElementById('pd-trigger')?.classList.add('open');
  document.getElementById('pd-trigger')?.setAttribute('aria-expanded','true');
  document.getElementById('pd-chevron')?.classList.add('open');
}

function closePersonDropdown() {
  _pdOpen = false;
  document.getElementById('pd-menu')?.classList.remove('open');
  document.getElementById('pd-trigger')?.classList.remove('open');
  document.getElementById('pd-trigger')?.setAttribute('aria-expanded','false');
  document.getElementById('pd-chevron')?.classList.remove('open');
}

function selectPerson(id) {
  currentPersonId = id;
  localStorage.setItem('selected-person-id', id);
  const p = getPersonList().find(p=>p.id===id);

  // Update label + checkmark without re-opening menu
  const label = document.getElementById('pd-label');
  if (label && p) label.textContent = p.name;
  renderPersonDropdown();
  applyPersonAccent();

  const active = document.querySelector('.panel.active');
  if (active) {
    active.style.animation = 'none';
    void active.offsetWidth;
    active.style.animation = '';
    renderPanel(active.id.replace('panel-',''));
  }
}

// ═══════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════
const TABS = [
  { id:'dashboard',  label:'Dashboard'       },
  { id:'allmetrics', label:'Alle Werte'      },
  { id:'graphs',     label:'Diagramme'       },
  { id:'history',    label:'Verlauf'         },
  { id:'entry',      label:'Neuer Eintrag'   },
  { id:'settings',   label:'Einstellungen'   },
  { id:'changes',    label:'Änderungen', conditional: true },
];

function buildTabs() {
  const nav = document.getElementById('subnav');
  nav.innerHTML = '';

  // Sliding indicator
  const indicator = document.createElement('div');
  indicator.className = 'subnav-indicator';
  indicator.id = 'subnav-indicator';
  nav.appendChild(indicator);

  TABS.forEach(t => {
    const b = document.createElement('button');
    b.className='tab-btn'; b.id=`tab-${t.id}`; b.textContent=t.label;
    b.setAttribute('role','tab');
    b.setAttribute('aria-controls',`panel-${t.id}`);
    b.setAttribute('aria-selected','false');
    if (t.conditional) b.style.display = 'none';
    b.addEventListener('click',()=>activateTab(t.id));
    nav.appendChild(b);
  });

  // Overflow indicator — update on scroll and resize
  const updateScrollFade = () => {
    const wrapper = document.getElementById('subnav-wrapper');
    if (!wrapper) return;
    const canScrollRight = nav.scrollLeft < (nav.scrollWidth - nav.clientWidth - 2);
    const canScrollLeft  = nav.scrollLeft > 2;
    wrapper.classList.toggle('can-scroll-right', canScrollRight);
    wrapper.classList.toggle('can-scroll-left',  canScrollLeft);
  };
  nav.addEventListener('scroll', updateScrollFade, { passive: true });
  window.addEventListener('resize', updateScrollFade, { passive: true });

  const updateStickyOffset = () => {
    const wrapper = document.getElementById('subnav-wrapper');
    if (wrapper) document.documentElement.style.setProperty('--subnav-bottom', (60 + wrapper.offsetHeight) + 'px');
  };
  window.addEventListener('resize', updateStickyOffset, { passive: true });
  // Initial check after DOM settles
  requestAnimationFrame(() => { updateScrollFade(); updateStickyOffset(); });
}

function moveIndicator(tabId) {
  const btn = document.getElementById(`tab-${tabId}`);
  const ind = document.getElementById('subnav-indicator');
  const nav = document.getElementById('subnav');
  if (!btn || !ind || !nav) return;
  const navRect = nav.getBoundingClientRect();
  const btnRect = btn.getBoundingClientRect();
  ind.style.left  = (btnRect.left - navRect.left + nav.scrollLeft) + 'px';
  ind.style.width = btnRect.width + 'px';

  // Aktiven Button in die Mitte des sichtbaren Bereichs scrollen
  const btnCenter  = btnRect.left - navRect.left + nav.scrollLeft + btnRect.width / 2;
  const targetLeft = btnCenter - nav.clientWidth / 2;
  nav.scrollTo({ left: targetLeft, behavior: 'smooth' });
}
// Internes Flag: verhindert dass ein popstate-Event einen neuen pushState auslöst.
let _historyNavigation = false;

function activateTab(id) {
  document.querySelectorAll('.tab-btn').forEach(b=>{
    const on = b.id === `tab-${id}`;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.getElementById(`panel-${id}`)?.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'instant' });
  requestAnimationFrame(()=>moveIndicator(id));
  renderPanel(id);

  // History: Tab in Browser-History eintragenagen — aber nicht wenn wir
  // selbst auf popstate reagieren (sonst Endlosschleife).
  if (!_historyNavigation) {
    const state = { tab: id };
    const url   = `#${id}`;
    // Erstes Tab beim App-Start ersetzt den aktuellen Eintrag, alle weiteren
    // werden aufgestapelt — so bleibt die History sauber.
    if (history.state?.tab) {
      history.pushState(state, '', url);
    } else {
      history.replaceState(state, '', url);
    }
  }
}
function renderPanel(id) {
  if (id==='dashboard')  renderDashboard();
  if (id==='allmetrics') renderAllMetrics();
  if (id==='graphs')     renderGraphs();
  if (id==='history')    renderHistory();
  if (id==='entry')      renderEntryForm();
  if (id==='settings')   renderSettings();
  if (id==='changes')    renderChanges();
}


// ═══════════════════════════════════════════════
// APP STARTEN (nach Laden/Erstellen/Demo)
// ═══════════════════════════════════════════════
function startApp() {
  appMode = 'app';
  document.getElementById('landing').style.display = 'none';
  document.getElementById('onboarding').style.display = 'none';
  document.getElementById('app-shell').style.display = '';

  // Demo-Banner
  document.getElementById('demo-banner').style.display = isDemoMode ? '' : 'none';
  // Print button only visible when app is running
  document.getElementById('topbar-print-btn').style.display = '';

  currentPersonId = null;
  activeGraphKey = null;
  buildPersonSelector();
  buildTabs();

  // Deep link: ?person=ID (aus PWA-Shortcut) öffnet direkt bei dieser Person
  const urlPid      = new URLSearchParams(window.location.search).get('person');
  const savedPid    = localStorage.getItem('selected-person-id');
  const startPerson = (urlPid    && getPersonList().find(p => p.id === urlPid))
                   || (savedPid  && getPersonList().find(p => p.id === savedPid))
                   || getPersonList()[0];
  if (startPerson) selectPerson(startPerson.id);
  if (urlPid) history.replaceState(null, '', window.location.pathname);

  document.getElementById('tab-dashboard').click();

  if (!isDemoMode) updatePWAShortcuts();
  updateUnsavedIndicator();
  syncChangesTabVisibility();
}

// ── Ungesichert-Indikator: dezenter roter Punkt am Logo ──
// Erscheint nur wenn CHANGE_LOG Einträge hat (= getrackte Datenänderungen seit letztem Export).
function updateUnsavedIndicator() {
  const dot = document.getElementById('unsaved-dot');
  if (!dot) return;
  dot.style.display = (CHANGE_LOG.length > 0 && !isDemoMode) ? '' : 'none';
}

// ── Änderungen-Tab ein-/ausblenden ────────────────
function syncChangesTabVisibility() {
  const btn = document.getElementById('tab-changes');
  if (!btn) return;
  const hasChanges = CHANGE_LOG.length > 0;
  btn.style.display = hasChanges ? '' : 'none';

  // Falls gerade der Changes-Tab aktiv ist und keine Änderungen mehr → Dashboard
  if (!hasChanges) {
    const active = document.querySelector('.tab-btn.active')?.id?.replace('tab-', '');
    if (active === 'changes') activateTab('dashboard');
  }

  // Indikator neu positionieren (Breite des sichtbaren Bereichs hat sich geändert)
  const active = document.querySelector('.tab-btn.active')?.id?.replace('tab-', '');
  if (active) requestAnimationFrame(() => moveIndicator(active));
}

// ── Zurück zur Startseite ─────────────────────
function backToLanding() {
  DATA = null;
  CHANGE_LOG = [];
  _originalSnapshot = null;
  isDemoMode = false;
  hasUnsavedChanges = false;
  clearSessionPassword();
  history.replaceState(null, '', location.pathname + location.search);
  showLanding();
}

// ═══════════════════════════════════════════════
// AKTIONS-MENÜ (⋮)
// ═══════════════════════════════════════════════
// Gemeinsam von Dashboard-Karten und Verlauf-Einträgen genutzt.
// items: [{ label, fn, danger? }]

function _actionMenuClickClose() { closeActionMenu(); }

function openActionMenu(btn, items) {
  const wasOpen = !!document.getElementById('action-menu');
  closeActionMenu();
  if (wasOpen) return; // zweiter Klick auf ⋮ schließt das Menü wieder

  const menu = document.createElement('div');
  menu.id = 'action-menu';
  menu.className = 'action-menu';
  menu.setAttribute('role', 'menu');

  items.forEach(({ label, fn, danger }) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'action-menu-item' + (danger ? ' action-menu-item--danger' : '');
    el.setAttribute('role', 'menuitem');
    el.textContent = label;
    el.onclick = e => { e.stopPropagation(); closeActionMenu(); fn(); };
    menu.appendChild(el);
  });

  document.body.appendChild(menu);

  // Position: unterhalb des Buttons, rechtsbündig
  const br  = btn.getBoundingClientRect();
  const mr  = menu.getBoundingClientRect();
  let top   = br.bottom + 4;
  let left  = br.right - mr.width;
  if (left < 8) left = 8;
  if (top + mr.height > window.innerHeight - 8) top = br.top - mr.height - 4;
  menu.style.top  = top  + 'px';
  menu.style.left = left + 'px';

  setTimeout(() => {
    document.addEventListener('click',   _actionMenuClickClose, { once: true });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeActionMenu(); }, { once: true });
  }, 0);
}

function closeActionMenu() {
  document.getElementById('action-menu')?.remove();
  document.removeEventListener('click', _actionMenuClickClose);
}

// ═══════════════════════════════════════════════
// DARK MODE
// ═══════════════════════════════════════════════
function initTheme() {
  const saved = localStorage.getItem('theme');
  // Set print icon (always the same)
  const pb = document.getElementById('topbar-print-btn');
  if (pb) pb.innerHTML = SVG_PRINT;
  // Apply saved theme (also sets moon/sun icon)
  applyDark(saved === 'dark', false);

  // Theme-Button: touchend statt click, damit blur() auf iOS Safari
  // zuverlässig vor dem Fokus-Ring feuert. Für Desktop bleibt click als Fallback.
  const tb = document.getElementById('theme-toggle-btn');
  if (!tb) return;
  let _touchFired = false;
  tb.addEventListener('touchend', e => {
    e.preventDefault();          // verhindert das nachfolgende click-Event
    _touchFired = true;
    tb.blur();
    toggleTheme();
  }, { passive: false });
  tb.addEventListener('click', () => {
    if (_touchFired) { _touchFired = false; return; } // bereits per touchend behandelt
    toggleTheme();
  });
}

function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  applyDark(!isDark, true);
  // Fokus nach Tap entfernen — verhindert den sichtbaren Fokus-Ring auf Touch-Geräten
  document.activeElement?.blur();
}

// SVG icon strings for header buttons (Heroicons)
const SVG_SUN = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
  <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
</svg>`;
const SVG_MOON = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
  <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
</svg>`;
const SVG_PRINT = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
  <path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z" />
</svg>`;

// ── PWA-Shortcuts für iOS-Langdruck-Menü aktualisieren ──
function updatePWAShortcuts() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready.then(reg => {
    const worker = navigator.serviceWorker.controller ?? reg.active;
    if (!worker) return;
    worker.postMessage({
      type:    'UPDATE_SHORTCUTS',
      persons: getPersonList().map(p => ({ id: p.id, name: p.name })),
    });
  }).catch(() => {});
}

function applyDark(dark, save) {
  document.documentElement.classList.toggle('dark', dark);
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.innerHTML = dark ? SVG_SUN : SVG_MOON;
  if (save) localStorage.setItem('theme', dark ? 'dark' : 'light');
  applyPersonAccent();
}

function applyPersonAccent() {
  const person = getPersonList().find(p => p.id === currentPersonId);
  const hex    = person ? personColor(person) : null;
  const root   = document.documentElement;
  const logoBg = document.getElementById('logo-bg');
  if (!hex || hex.length < 7) {
    root.style.removeProperty('--accent');
    root.style.removeProperty('--accent-light');
    root.style.removeProperty('--accent-2');
    if (logoBg) logoBg.setAttribute('fill', '#1B3A5B');
    return;
  }
  if (logoBg) logoBg.setAttribute('fill', hex);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const isDark = root.classList.contains('dark');
  const lift  = c => Math.min(255, Math.round(c + (255 - c) * 0.45));
  const toHex = c => c.toString(16).padStart(2, '0');
  const darkAdj = h => {
    const rr=parseInt(h.slice(1,3),16), gg=parseInt(h.slice(3,5),16), bb=parseInt(h.slice(5,7),16);
    return `#${toHex(lift(rr))}${toHex(lift(gg))}${toHex(lift(bb))}`;
  };
  root.style.setProperty('--accent',       isDark ? darkAdj(hex) : hex);
  root.style.setProperty('--accent-light', `rgba(${r},${g},${b},.12)`);
  root.style.setProperty('--accent-2',     isDark ? darkAdj(pickContrastColor(hex)) : pickContrastColor(hex));
}

// ═══════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════
function showToast(msg,type='') {
  const c=document.getElementById('toast-container');
  const t=document.createElement('div');
  t.className=`toast${type?` toast-${type}`:''}`;
  t.textContent=msg; c.appendChild(t);
  setTimeout(()=>t.remove(),3000);
}

// ── START ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
