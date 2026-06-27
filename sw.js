'use strict';

/* ═══════════════════════════════════════════════
   Familien-Gesundheitsakte — Service Worker
   ─────────────────────────────────────────────
   Einziger Zweck: /manifest.json dynamisch mit
   Personen-Shortcuts anreichern, damit iOS-PWA-
   Langdruck-Menü die Familienmitglieder anzeigt.

   Keine Offline-Caches, kein Asset-Caching.
   ═══════════════════════════════════════════════ */

const SHORTCUTS_CACHE = 'gesundheitsakte-shortcuts-v1';

// Spiegelt manifest.json — Shortcuts werden dynamisch ergänzt.
const BASE_MANIFEST = {
  name:             'Familien-Gesundheitsakte',
  short_name:       'Gesundheitsakte',
  description:      'Persönliche Gesundheitsdaten für die ganze Familie – lokal, privat, ohne Server.',
  lang:             'de',
  start_url:        './index.html',
  display:          'standalone',
  orientation:      'portrait-primary',
  background_color: '#ffffff',
  theme_color:      '#0891b2',
  icons: [
    { src: 'icons/icon-64.png',    sizes: '64x64',    type: 'image/png',    purpose: 'any' },
    { src: 'icons/icon-192.png',   sizes: '192x192',  type: 'image/png',    purpose: 'any' },
    { src: 'icons/icon-512.png',   sizes: '512x512',  type: 'image/png',    purpose: 'any' },
    { src: 'icons/icon-1024.png',  sizes: '1024x1024',type: 'image/png',    purpose: 'any' },
    { src: 'icons/icon.svg',       sizes: 'any',       type: 'image/svg+xml',purpose: 'any' },
  ],
};

// SW sofort aktivieren, ohne auf Tab-Schließen zu warten.
self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', e  => e.waitUntil(self.clients.claim()));

// ── Personen-Liste aus der App empfangen und cachen ──
self.addEventListener('message', event => {
  if (event.data?.type === 'UPDATE_SHORTCUTS') {
    event.waitUntil(storePersons(event.data.persons));
  }
});

async function storePersons(persons) {
  const cache = await caches.open(SHORTCUTS_CACHE);
  await cache.put('persons', new Response(JSON.stringify(persons), {
    headers: { 'Content-Type': 'application/json' },
  }));
}

// ── Manifest-Request abfangen und mit Shortcuts anreichern ──
self.addEventListener('fetch', event => {
  const { pathname } = new URL(event.request.url);
  if (pathname.split('/').pop() === 'manifest.json') {
    event.respondWith(buildManifest());
  }
});

async function buildManifest() {
  let persons = [];
  try {
    const cache = await caches.open(SHORTCUTS_CACHE);
    const resp  = await cache.match('persons');
    if (resp) persons = await resp.json();
  } catch (_) { /* Cache leer oder nicht lesbar — kein Problem */ }

  const manifest = { ...BASE_MANIFEST };
  if (persons.length > 0) {
    manifest.shortcuts = persons.map(p => ({
      name:  p.name,
      url:   `./index.html?person=${encodeURIComponent(p.id)}`,
      icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    }));
  }

  return new Response(JSON.stringify(manifest), {
    headers: { 'Content-Type': 'application/manifest+json' },
  });
}
