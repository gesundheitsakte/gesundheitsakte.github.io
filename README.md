# Familien-Gesundheitsakte

<img src="icons/icon-180.png" width="90" alt="App Icon">

Eine privacy-first Web-App zur Verwaltung von Gesundheitsdaten für die ganze Familie — komplett lokal, ohne Server, ohne Konto.

---

## Datenschutz

**Alle Daten bleiben auf dem Gerät. Es werden keinerlei Daten übertragen.**

- Keine Registrierung, kein Cloud-Sync, keine Tracker, keine Analytics
- Datenbank als JSON-Datei lokal exportierbar — vollständige Kontrolle
- Optional: **AES-256-Verschlüsselung** des Exports mit eigenem Passwort (PBKDF2, 250.000 Iterationen) — in den Einstellungen jederzeit aktivier- oder deaktivierbar
- `localStorage` als automatische lokale Sicherungskopie zwischen Exporten
- Vollständig offline nutzbar nach dem ersten Laden

---

## Funktionsumfang

### Personen & Profile

Mehrere Personen in einer Datenbank, mit individuellen Profilen:

- Name, Geburtsdatum, Geschlecht, Blutgruppe
- Chronische Erkrankungen, Medikamente, Impfungen, Allergien
- Familienanamnese
- **Operationen & Eingriffe** (mit Datum und Klinik)

### Gesundheitseinträge

Drei Eintragstypen im Erfassungs-Tab:

- **Arztbesuch** — Datum, Arzt, Grund, Diagnose, verknüpfter Checkup, Messwerte, Notizen
- **Selbstmessung** — Schnelle Erfassung beliebiger Messwerte
- **Apple Health Import** — Export-ZIP aus der iOS Health-App direkt importieren; Werte werden gematcht, ein Eintrag pro Tag, Duplikate vermieden

### Messwerte

Vordefinierte Metriken mit Einheiten und klinischen Normwertbereichen (mit Quellenangaben):

| Gruppe | Metriken |
|---|---|
| Körper | Gewicht, Größe, BMI (berechnet), Blutdruck (sys/dia), Puls, Temperatur |
| Fitness | Taillenumfang, Hüftumfang, Taille-Hüft-Quotient (berechnet), Brustumfang, Oberarm, Oberschenkel, Wade, Körperfettanteil |
| Vitalwerte | Sauerstoffsättigung (SpO₂), HRV, Ruhepuls, Atemfrequenz |
| Blutbild | Hämoglobin, Ferritin, Vitamin D, Cholesterin (Gesamt / HDL / LDL), Triglyzeride, Blutzucker, TSH, Kreatinin, Leukozyten, Thrombozyten |
| Zyklus | Basaltemperatur, LH-Wert, Blutung, Zervixschleim (nur bei Geschlecht „weiblich") |

Zusätzlich können **eigene Metriken** definiert werden. Bis zu 4 Messwerte können als **Favoriten** oben im Dashboard angeheftet werden.

### Dashboard

- Übersicht aller Messwerte als Kacheln, gruppiert nach Kategorie
- Angeheftete Favoriten-Messwerte ganz oben
- Checkup-Status mit farbkodierter Ampel (fällig / bald fällig / ok)
- Schnellzugriff auf Detailbearbeitung per Bearbeiten-Button

### Vorsorge & Checkups

Anpassbare Vorsorge-Checkliste mit Fälligkeitsintervall, alters- und geschlechtsspezifischen Regeln, Praxis-Kontaktdaten sowie **Kalender-Export** als `.ics`-Datei (Apple Kalender, Google Kalender, Outlook).

### Diagramme

Interaktive Liniendiagramme für numerische Messwerte mit Zeitraumfilter, Normwertbereich, Zielwert, Trend-Indikatoren und Cross-Highlight. Für Blutungs-Daten: **Monatskalender-Ansicht** mit Heute-Schaltfläche und unbegrenzter Navigation.

### Verlauf

Chronologische Timeline aller Einträge mit **Jahres-Trennzeilen** (sticky beim Scrollen). Filterbar nach Typ (Arztbesuch / Selbstmessung / Apple Health), Arzt, Datum und Freitext.

### Import & Export

- Export als `.json` (Klartext oder verschlüsselt)
- Import erkennt automatisch Klartext vs. verschlüsselt
- **Datenbanken zusammenführen**: Zwei Dateien vereinigen, Konflikte einzeln auflösen

### Weitere Features

- Light / Dark Mode, anpassbare Akzentfarbe
- PWA — auf dem Homescreen installierbar, offline nutzbar
- Browser-Zurück-Taste / Swipe-Navigation zwischen Tabs
- **Arztbericht** als Druckansicht (Profil, Messwerte, Operationen, Medikamente u. a.)
- Demo-Datenbank mit einer Musterfamilie

---

## Technologie

Reines Frontend — kein Build-Step, kein Framework, kein Backend.

- Vanilla JavaScript (`<script>`-Tags, kein Modul-System), CSS Custom Properties
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) für AES-GCM (nativ im Browser)
- [fflate](https://github.com/101arrowz/fflate) — ZIP-Entpacken für Apple Health (MIT)
- [Heroicons](https://heroicons.com) von Tailwind Labs (MIT)
- [Inter](https://rsms.me/inter) & [JetBrains Mono](https://www.jetbrains.com/lp/mono) — lokal eingebunden (SIL OFL)

---

## Lizenz

MIT — siehe `LICENSE`.

Drittanbieter-Bibliotheken und Schriftarten unterliegen ihren eigenen Lizenzen (MIT bzw. SIL OFL), aufgeführt unter *Einstellungen → Quellen & Lizenzen*.
