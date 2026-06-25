# Familien-Gesundheitsakte

Eine privacy-first Web-App zur Verwaltung von Gesundheitsdaten für die ganze Familie — komplett lokal, ohne Server, ohne Konto.

---

## Datenschutz

**Alle Daten bleiben auf dem Gerät. Es werden keinerlei Daten an externe Server übertragen.**

- Keine Registrierung, kein Konto, kein Cloud-Sync
- Keine Tracker, keine Werbung, keine Analytics
- Keine Verbindung zu externen Diensten während der Nutzung
- Die Datenbank wird als JSON-Datei lokal gespeichert — vollständige Kontrolle
- Optional: **AES-256-Verschlüsselung** der exportierten Datei mit einem selbst gewählten Passwort (PBKDF2, 250.000 Iterationen)
- Daten werden zusätzlich im `localStorage` des Browsers gesichert, sodass sie nach einem Reload erhalten bleiben — diese Kopie verbleibt lokal auf dem Gerät

Die App funktioniert vollständig offline. Nach dem ersten Laden im Browser ist keine Internetverbindung erforderlich.

---

## Funktionsumfang

### Familienverwaltung

Mehrere Personen in einer Datenbank, mit individuellen Profilen:

- Name, Geburtsdatum, Geschlecht, Blutgruppe
- Erkrankungen und Diagnosen (mit Notizen und Zeitraum)
- Familienanamnese
- Medikamente (mit Dosierung)
- Impfungen (mit Datum und nächstem Fälligkeitsdatum)
- Allergien (mit Schweregrad)

### Gesundheitseinträge

Zwei Eintragstypen:

- **Arztbesuch** — Datum, Arzt, Grund, Diagnose, verknüpfter Checkup, Messwerte, Notizen
- **Selbstmessung** — Schnelle Erfassung beliebiger Messwerte zu Hause

### Messwerte

Vordefinierte Metriken mit Einheiten und klinischen Normwertbereichen (mit Quellenangaben):

| Gruppe | Metriken |
|---|---|
| Körper | Gewicht, Größe, BMI (berechnet), Blutdruck (sys/dia), Puls, Temperatur |
| Fitness | Taillenumfang, Hüftumfang, Taille-Hüft-Quotient (berechnet), Brustumfang, Oberarm, Oberschenkel, Wade, Körperfettanteil |
| Vitalwerte | Sauerstoffsättigung (SpO₂), HRV, Ruhepuls, Atemfrequenz |
| Blutbild | Hämoglobin, Ferritin, Vitamin D, Cholesterin (Gesamt / HDL / LDL), Triglyzeride, Blutzucker, TSH |
| Zyklus | Basaltemperatur, LH-Wert, Blutung, Zervixschleim |

Zusätzlich können **eigene Metriken** definiert werden (Bezeichnung, Einheit, Gruppe).

Zyklus-Metriken erscheinen nur bei Personen mit dem Geschlecht „weiblich".

### Vorsorge & Checkups

Anpassbare Vorsorge-Checkliste mit:

- Fälligkeitsintervall (in Monaten)
- Alters- und geschlechtsspezifischen Regeln (z.B. nur ab 18, nur für Frauen)
- Telefonnummer und Website der Praxis
- Farbkodiertem Status: fällig / bald fällig / ok
- **Kalender-Export** als `.ics`-Datei (kompatibel mit Apple Kalender, Google Kalender, Outlook) — mit Erinnerung 1 Tag vorher

### Diagramme

Interaktive Liniendiagramme für numerische Messwerte:

- Zeitraumfilter (1 Monat bis Gesamt)
- Normwertbereich als Hintergrundkorridor
- Zielwert setzbar (wird im Graph eingezeichnet)
- Trend-Indikatoren (steigend / fallend / stabil)
- Cross-Highlight: Hover auf Datenpunkt markiert die zugehörige Tabellenzeile

Für die Blutungs-Metrik: **Monatskalender-Ansicht** mit Pfeiltasten-Navigation (3 Monate pro Ansicht, unbegrenzt zurückblätterbar), farbliche Unterscheidung zwischen erfassten und nicht erfassten Tagen.

### Import & Export

- **Export** als `.json` (Klartext) oder `.health` (AES-256-verschlüsselt)
- **Import** erkennt automatisch Klartext vs. verschlüsselt; bei verschlüsselten Dateien Passwortabfrage mit Wiederholung
- **Datenbanken zusammenführen** (Merge): Zwei Dateien werden vereinigt, Konflikte werden einzeln aufgelöst
- **Apple Health Import**: Export-ZIP aus der iOS Health-App direkt in die App importieren — Werte werden gematcht, Duplikate vermieden

### Weitere Features

- Light / Dark Mode
- Vollständig auf Mobilgeräten bedienbar (PWA-fähig, Homescreen-Installation)
- Browser-Zurück-Taste / Swipe-Navigation zwischen Tabs
- Demo-Datenbank mit einer Musterfamilie (4 Personen, realistische Einträge)

---

## Technologie

**Reines Frontend** — kein Build-Step, kein Framework, kein Backend.

- Vanilla JavaScript (klassische `<script>`-Tags, kein Modul-System)
- CSS Custom Properties für Theming
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) für AES-GCM-Verschlüsselung (nativ im Browser)
- [fflate](https://github.com/101arrowz/fflate) für das Entpacken von Apple Health ZIP-Exporten (MIT)
- [Heroicons](https://heroicons.com) von Tailwind Labs (MIT)
- [Inter](https://rsms.me/inter) (SIL OFL) und [JetBrains Mono](https://www.jetbrains.com/lp/mono) (SIL OFL) als Schriftarten — lokal eingebunden, kein Google Fonts

---

## Dateistruktur

```
├── index.html
├── manifest.json
├── style.css
├── config.js          — Metriken, Normwerte, Apple-Health-Mapping
├── core.js            — Datenmodell, Persistenz, Hilfsfunktionen
├── crypto.js          — AES-GCM-Verschlüsselung (PBKDF2)
├── dashboard.js       — Dashboard, Kacheln, Checkup-Karten
├── data.js            — Import, Export, Onboarding, Landing
├── entry.js           — Eintrags-Formular (Arzt / Selbstmessung)
├── graphs.js          — Liniendiagramme, Kalender-Plot
├── health-import.js   — Apple Health ZIP-Import
├── history.js         — Verlaufs-Timeline
├── merge.js           — Datenbank-Merge
├── navigation.js      — Tab-Navigation, Theme, App-Init
├── settings.js        — Einstellungen, Checkup-Verwaltung, Personen
├── demo-data.json     — Demo-Datenbank
├── icons/             — App-Icons (SVG, PNG, ICO)
├── fonts/             — Schriftarten lokal (Inter, JetBrains Mono)
└── vendor/
    └── fflate.min.js  — ZIP-Bibliothek (lokal, kein CDN)
```

---

## Lizenz

MIT — siehe `LICENSE`.

Die eingebundenen Drittanbieter-Bibliotheken und Schriftarten unterliegen ihren eigenen Lizenzen (MIT bzw. SIL OFL), die in der App unter *Einstellungen → Quellen & Lizenzen* aufgeführt sind.
