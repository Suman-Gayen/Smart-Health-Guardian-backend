/**
 * config.js — Firebase Configuration & App Settings
 * ════════════════════════════════════════════════════
 *
 * STEP 1 ► Replace all "YOUR_*" values with your Firebase project credentials.
 *
 * Find them at:
 *   Firebase Console → Project Settings → General → Your Apps → SDK setup & configuration
 *
 * ┌──────────────────────────────────────────────────────────┐
 * │  YOU ARE USING CLOUD FIRESTORE (not Realtime Database)   │
 * │  → databaseURL is NOT required and should NOT be added.  │
 * │  → Only projectId is needed to locate your Firestore.    │
 * └──────────────────────────────────────────────────────────┘
 *
 * Firestore document shape your device should write:
 * Collection: "patients"  →  Document: "latest"  (or patient ID)
 * {
 *   ecg:         [0, 966, 4095, 503, 0, ...],   // number[] — 12-bit ADC
 *   heartrate:   124,                            // number   — bpm
 *   spo2:        98,                             // number   — %
 *   temperature: 36.8,                           // number   — °C
 *   patient_id:  "P14709",                       // string
 *   timestamp:   <Firestore serverTimestamp()>   // Timestamp
 * }
 */

// ── Firebase project credentials ───────────────────────────────────────────
// NOTE: No databaseURL needed for Firestore.
// const FIREBASE_CONFIG = {
//   apiKey:            "YOUR_API_KEY",
//   authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
//   projectId:         "YOUR_PROJECT_ID",       // ← this alone locates Firestore
//   storageBucket:     "YOUR_PROJECT_ID.appspot.com",
//   messagingSenderId: "YOUR_SENDER_ID",
//   appId:             "YOUR_APP_ID"
// };
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCMALTReUqNOeNEt72rMls2p5sUHN1qfSM",
  authDomain: "demofirebase-f3437.firebaseapp.com",
  projectId: "demofirebase-f3437",
  storageBucket: "demofirebase-f3437.firebasestorage.app",
  messagingSenderId: "890458084034",
  appId: "1:890458084034:web:1fa3ce3a2a1b877e69e15b",
  // measurementId: "G-K68N92X5Z2"
};

/**
 * Firestore path = collection / document
 *
 * Examples:
 *   FS_COLLECTION = "patients",  FS_DOCUMENT = "latest"     → patients/latest
 *   FS_COLLECTION = "patients",  FS_DOCUMENT = "P14709"     → patients/P14709
 *   FS_COLLECTION = "vitals",    FS_DOCUMENT = "current"    → vitals/current
 *
 * Your ESP32 / backend must write to the same collection+document.
 */
const FS_COLLECTION = "health_data";   // Firestore collection name
// const FS_DOCUMENT   = "cg4ZPVSatigGcCzR5g0B";     // Firestore particular one data access document ID
const FS_PATIENT_ID = null;

// ── Clinical alert thresholds ───────────────────────────────────────────────
const THRESHOLDS = {
  hr: {
    criticalLow:  30,    // bpm — extreme bradycardia
    low:          50,    // bpm — bradycardia
    high:        100,    // bpm — tachycardia
    criticalHigh:130     // bpm — critical tachycardia
  },
  spo2: {
    warning:  94,        // %   — hypoxia warning
    critical: 90         // %   — critical hypoxia
  },
  temp: {
    criticalLow:  25.0,  // °C  — hypothermia
    low:          31.1,  // °C  — subnormal
    high:         37.5,  // °C  — mild fever
    criticalHigh: 38.5   // °C  — high fever / hyperthermia
  }
};

// ── ECG renderer settings ───────────────────────────────────────────────────
const ECG_CONFIG = {
  color:       "#00e87a",              // phosphor green trace color
  glowColor:   "rgba(0,232,122,0.45)", // glow around latest point
  lineWidth:   2,                      // stroke width in px
  // scrollSpeed: 2.78,                      // pixels advanced per animation frame
  maxADC:      4095                    // 12-bit ADC max value (your sensor ceiling)
};
