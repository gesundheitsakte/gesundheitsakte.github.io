/* ═══════════════════════════════════════════════
   config.js — Universelle Konfiguration
   ───────────────────────────────────────────────
   Diese Datei enthält NUR app-weite Einstellungen,
   die für alle Nutzer gleich sind:
     • Checkup-Regeln (Vorsorge-Intervalle)
     • Standard-Messwerte (mit Einheit & Gruppe)

   Persönliche Daten (Personen, Einträge, eigene
   Messwerte) liegen ausschließlich in der
   JSON-Datenbank des Nutzers.
   ═══════════════════════════════════════════════ */

const APP_CONFIG = {
  "app": {
    "title": "Familien-Gesundheitsakte",
    "language": "de"
  },

  /* ── Standard-Messwerte ───────────────────────
     Universelle Liste. Nutzer können in der App
     eigene Messwerte ergänzen (→ DATA.customMetrics).
     group     : Gruppierung im Formular & in "Alle Werte"
     unit      : Einheit (Anzeige & Y-Achse im Diagramm)
     graphable : true = im Diagramme-Tab auswählbar
     computed  : true = automatisch berechnet (z.B. BMI)
     ─────────────────────────────────────────── */
  /* ── Normal-Bereiche (normalRanges) ──────────────
     Jede Regel gilt wenn alle angegebenen Felder passen.
     Spezifischste Regel gewinnt (gender+age > age > catch-all).
     source: URL zur Quelle des Referenzwerts.
     ─────────────────────────────────────────── */
  "metrics": [
    { "key": "weight",             "label": "Gewicht",            "unit": "kg",      "group": "Körper",    "graphable": true },
    { "key": "height",             "label": "Größe",              "unit": "cm",      "group": "Körper",    "graphable": true },
    { "key": "bmi",                "label": "BMI",                "unit": "",        "group": "Körper",    "graphable": true, "computed": true,
      "normalRanges": [
        { "min": 18.5, "max": 24.9, "appliesTo": {}, "label": "Normalgewicht (Erwachsene)",
          "source": "https://flexikon.doccheck.com/de/Body_Mass_Index" }
      ]
    },
    { "key": "blood_pressure_sys", "label": "Blutdruck (sys)",    "unit": "mmHg",    "group": "Körper",    "graphable": true,
      "normalRanges": [
        { "min": 0,   "max": 120, "appliesTo": {},               "label": "Optimaler Bereich",
          "source": "https://flexikon.doccheck.com/de/Blutdruck" }
      ]
    },
    { "key": "blood_pressure_dia", "label": "Blutdruck (dia)",    "unit": "mmHg",    "group": "Körper",    "graphable": true,
      "normalRanges": [
        { "min": 0,   "max": 80,  "appliesTo": {},               "label": "Optimaler Bereich",
          "source": "https://flexikon.doccheck.com/de/Blutdruck" }
      ]
    },
    { "key": "pulse",              "label": "Puls",               "unit": "bpm",     "group": "Körper",    "graphable": true },
    { "key": "temperature",        "label": "Temperatur",         "unit": "°C",      "group": "Körper",    "graphable": true },

    /* ── Fitness ──────────────────────────────── */
    { "key": "waist_circumference",  "label": "Taillenumfang",        "unit": "cm",      "group": "Fitness",   "graphable": true },
    { "key": "hip_circumference",    "label": "Hüftumfang",           "unit": "cm",      "group": "Fitness",   "graphable": true },
    { "key": "whr",                  "label": "Taille-Hüft-Quotient", "unit": "",        "group": "Fitness",   "graphable": true, "computed": true  },
    { "key": "chest_circumference",  "label": "Brustumfang",          "unit": "cm",      "group": "Fitness",   "graphable": true },
    { "key": "upper_arm",            "label": "Oberarm",              "unit": "cm",      "group": "Fitness",   "graphable": true },
    { "key": "thigh",                "label": "Oberschenkel",         "unit": "cm",      "group": "Fitness",   "graphable": true },
    { "key": "calf",                 "label": "Wade",                 "unit": "cm",      "group": "Fitness",   "graphable": true },
    { "key": "body_fat",             "label": "Körperfettanteil",     "unit": "%",       "group": "Fitness",   "graphable": true },

    /* ── Vitalwerte ───────────────────────────── */
    { "key": "oxygen_saturation",    "label": "Sauerstoffsättigung",  "unit": "%",       "group": "Vitalwerte","graphable": true },
    { "key": "hrv",                  "label": "HRV",                  "unit": "ms",      "group": "Vitalwerte","graphable": true },
    { "key": "resting_pulse",        "label": "Ruhepuls",             "unit": "bpm",     "group": "Vitalwerte","graphable": true },
    { "key": "respiratory_rate",     "label": "Atemfrequenz",         "unit": "/min",    "group": "Vitalwerte","graphable": true },

    { "key": "cholesterol_total",  "label": "Cholesterin (ges.)", "unit": "mg/dL",   "group": "Blutbild",  "graphable": true },
    { "key": "cholesterol_hdl",    "label": "HDL-Cholesterin",    "unit": "mg/dL",   "group": "Blutbild",  "graphable": true },
    { "key": "cholesterol_ldl",    "label": "LDL-Cholesterin",    "unit": "mg/dL",   "group": "Blutbild",  "graphable": true },
    { "key": "triglycerides",      "label": "Triglyzeride",       "unit": "mg/dL",   "group": "Blutbild",  "graphable": true },
    { "key": "glucose",            "label": "Blutzucker",         "unit": "mg/dL",   "group": "Blutbild",  "graphable": true },
    { "key": "hemoglobin",         "label": "Hämoglobin",         "unit": "g/dL",    "group": "Blutbild",  "graphable": true },
    { "key": "leukocytes",         "label": "Leukozyten",         "unit": "10³/µL",  "group": "Blutbild",  "graphable": true },
    { "key": "thrombocytes",       "label": "Thrombozyten",       "unit": "10³/µL",  "group": "Blutbild",  "graphable": true },
    { "key": "tsh",                "label": "TSH",                "unit": "mU/L",    "group": "Blutbild",  "graphable": true },
    { "key": "creatinine",         "label": "Kreatinin",          "unit": "mg/dL",   "group": "Blutbild",  "graphable": true },
    { "key": "ferritin",           "label": "Ferritin",           "unit": "ng/mL",   "group": "Blutbild",  "graphable": true },
    { "key": "vitamin_d",          "label": "Vitamin D (25-OH)",  "unit": "ng/mL",   "group": "Blutbild",  "graphable": true },

    /* ── Zyklus-Metriken (nur bei gender: "female" anzeigen) ── */
    { "key": "basal_temp",
      "label": "Basaltemperatur",
      "unit": "°C",
      "group": "Zyklus",
      "graphable": true,
      "appliesTo": { "gender": "female" }
    },
    { "key": "lh_value",
      "label": "LH-Wert",
      "unit": "IU/L",
      "group": "Zyklus",
      "graphable": true,
      "appliesTo": { "gender": "female" }
    },
    { "key": "menstruation",
      "label": "Blutung",
      "unit": "",
      "group": "Zyklus",
      "graphable": true,
      "type": "select",
      "options": ["Stark", "Schwach"],
      "appliesTo": { "gender": "female" }
    },
    { "key": "cervical_mucus",
      "label": "Zervixschleim",
      "unit": "",
      "group": "Zyklus",
      "graphable": false,
      "type": "select",
      "options": ["trocken", "cremig", "wässrig", "glasig-dehnbar (spinnbar)"],
      "appliesTo": { "gender": "female" }
    }
  ]
};

/* ═══════════════════════════════════════════════
   Apple-Health-Import — Mapping
   ───────────────────────────────────────────────
   Ordnet Apple-HealthKit-Identifier (type="…" in der export.xml)
   den App-internen Metrik-Keys zu.

     metric    : Ziel-Key in der App (siehe APP_CONFIG.metrics)
     appleUnit : Einheit, in der die App den Wert erwartet. Weicht die
                 Einheit im Export davon ab, wird über convert() umgerechnet.
     convert   : optionale Funktion (value, sourceUnit) → Zahl in appleUnit.

   Apple exportiert Werte in der Einheit, die im Attribut unit="…" steht
   (abhängig von den Regionseinstellungen des Geräts). Deshalb prüfen wir
   die Quell-Einheit und rechnen bei Bedarf um.
   ═══════════════════════════════════════════════ */
const APPLE_HEALTH_MAP = {
  "HKQuantityTypeIdentifierBodyMass":              { metric: "weight",             appleUnit: "kg" },
  "HKQuantityTypeIdentifierHeight":                { metric: "height",             appleUnit: "cm" },
  "HKQuantityTypeIdentifierBloodPressureSystolic": { metric: "blood_pressure_sys", appleUnit: "mmHg" },
  "HKQuantityTypeIdentifierBloodPressureDiastolic":{ metric: "blood_pressure_dia", appleUnit: "mmHg" },
  "HKQuantityTypeIdentifierHeartRate":             { metric: "pulse",              appleUnit: "bpm" },
  "HKQuantityTypeIdentifierRestingHeartRate":      { metric: "pulse",              appleUnit: "bpm" },
  "HKQuantityTypeIdentifierBodyTemperature":       { metric: "temperature",        appleUnit: "°C" },
  "HKQuantityTypeIdentifierOxygenSaturation":      { metric: "oxygen_saturation",  appleUnit: "%" },
  "HKQuantityTypeIdentifierBloodGlucose":          { metric: "glucose",            appleUnit: "mg/dL" },
  "HKQuantityTypeIdentifierBodyMassIndex":         { metric: "bmi",                appleUnit: "" },
  "HKQuantityTypeIdentifierBodyFatPercentage":     { metric: "body_fat",           appleUnit: "%" }
};

/* Einheiten-Konvertierung. Liefert den Wert in der von der App erwarteten
   Einheit (appleUnit oben). sourceUnit ist das, was Apple im Export angibt. */
function appleHealthConvert(metric, value, sourceUnit) {
  const u = (sourceUnit || "").trim().toLowerCase();

  // Gewicht: lb/lbs → kg
  if (metric === "weight" && (u === "lb" || u === "lbs")) return value * 0.45359237;
  // Größe: in → cm, m → cm
  if (metric === "height") {
    if (u === "in") return value * 2.54;
    if (u === "m")  return value * 100;
  }
  // Temperatur: °F → °C
  if (metric === "temperature" && (u === "degf" || u === "°f" || u === "f")) {
    return (value - 32) * 5 / 9;
  }
  // Sauerstoffsättigung: Apple speichert oft als Anteil (0–1) statt Prozent
  if (metric === "oxygen_saturation" && value <= 1) return value * 100;
  // Körperfettanteil: Apple speichert als Anteil (0–1), App erwartet Prozent
  if (metric === "body_fat" && value <= 1) return value * 100;
  // Blutzucker: mmol/L → mg/dL
  if (metric === "glucose" && (u === "mmol/l" || u === "mmol<l")) return value * 18.0182;

  return value; // bereits in erwarteter Einheit
}

/* ═══════════════════════════════════════════════
   Quellen-Labels für Normwert-Buttons
   ───────────────────────────────────────────────
   Ordnet URL-Muster einem lesbaren Quellennamen zu.
   Reihenfolge ist wichtig — der erste Match gewinnt.
   Neue Quellen einfach unten anfügen.
   ═══════════════════════════════════════════════ */
const SOURCE_LABELS = [
  { pattern: /doccheck\.com/,           label: 'DocCheck' },
];

// Gibt den Anzeigenamen für eine Quell-URL zurück,
// oder null wenn kein Eintrag passt.
function sourceLabelForUrl(url) {
  if (!url) return null;
  for (const { pattern, label } of SOURCE_LABELS) {
    if (pattern.test(url)) return label;
  }
  return null;
}
