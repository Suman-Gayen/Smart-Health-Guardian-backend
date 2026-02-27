# VitalWatch — Medical Grade Real-Time Patient Monitor

A production-ready frontend dashboard for real-time ECG, Heart Rate, SpO₂,
and Body Temperature monitoring — powered by Firebase Realtime Database.

---

## 📁 File Structure

```
vitalwatch/
├── index.html                   ← Main HTML (entry point)
├── css/
│   └── style.css                ← All styles (clinical dark theme)
└── js/
    ├── config.js                ← ⚙️  Firebase config + alert thresholds  ← EDIT THIS FIRST
    ├── ecg.js                   ← ECG canvas renderer (scrolling waveform)
    ├── vitals.js                ← HR / SpO₂ / Temperature display logic
    ├── firebase-listener.js     ← Firebase Realtime DB listener + Demo Mode
    └── ui.js                    ← Clock, connection status, app init
```

---

## 🚀 Quick Start

### Step 1 — Configure Firebase

Open `js/config.js` and replace all `YOUR_*` placeholders:

```js
const FIREBASE_CONFIG = {
  apiKey:      "AIzaSy...",
  authDomain:  "my-project.firebaseapp.com",
  databaseURL: "https://my-project-default-rtdb.firebaseio.com",
  projectId:   "my-project",
  // ...
};

const DB_PATH = "patients/latest";  // path your device writes to
```

### Step 2 — Firebase Realtime DB Data Format

Your microcontroller / backend should write this JSON to `DB_PATH`:

```json
{
  "ecg":         [0, 966, 4095, 503, 0, 1130, 4095, 0],
  "heartrate":   88,
  "spo2":        97,
  "temperature": 36.8,
  "patient_id":  "P14709",
  "timestamp":   "2026-02-12T16:01:20.000Z"
}
```

| Field         | Type     | Unit  | Notes                              |
|---------------|----------|-------|------------------------------------|
| `ecg`         | number[] | ADC   | 12-bit values 0–4095               |
| `heartrate`   | number   | bpm   | integer                            |
| `spo2`        | number   | %     | integer 0–100                      |
| `temperature` | number   | °C    | float, optional                    |
| `patient_id`  | string   | —     | patient identifier                 |
| `timestamp`   | string   | —     | ISO 8601 or Firebase serverTimestamp|

### Step 3 — Run

Open `index.html` in any modern browser, or serve locally:

```bash
# Node.js
npx serve .

# Python
python3 -m http.server 8080
```

---

## 🎮 Demo Mode

If `apiKey` is left as `"YOUR_API_KEY"`, the dashboard **automatically runs in Demo Mode** with simulated ECG and vitals. No Firebase setup needed to preview the UI.

---

## 🔔 Alert Thresholds

Configurable in `js/config.js`:

| Vital       | Warning                    | Critical                        |
|-------------|----------------------------|---------------------------------|
| Heart Rate  | < 50 bpm or > 100 bpm      | < 30 bpm or ≥ 130 bpm           |
| SpO₂        | ≤ 94%                      | ≤ 90%                           |
| Temperature | < 36.1°C or > 37.5°C       | < 35°C or ≥ 38.5°C              |

When a critical threshold is crossed, the corresponding card border turns red,
the value flashes red, and an alert badge appears in the patient banner.

---

## 🔒 Firebase Security Rules (recommended)

```json
{
  "rules": {
    "patients": {
      ".read":  "auth != null",
      ".write": "auth != null"
    }
  }
}
```

For development/testing only (not for production):
```json
{ "rules": { ".read": true, ".write": true } }
```

---

## ⚠ Disclaimer

This software is a **monitoring display template only**.
It is not a certified medical device and must not be used as the sole
basis for clinical decisions.
