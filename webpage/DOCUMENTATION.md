# VitalWatch — Full Code Documentation
## How Every File Works, Line by Line

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [File Execution Order](#2-file-execution-order)
3. [index.html — Structure & Layout](#3-indexhtml)
4. [css/style.css — Visual Design System](#4-cssstylecss)
5. [js/config.js — Configuration & Constants](#5-jsconfigjs)
6. [js/ecg.js — ECG Waveform Renderer](#6-jsecgjs)
7. [js/vitals.js — Vital Signs Display](#7-jsvitalsjs)
8. [js/firebase-listener.js — Firestore Connection](#8-jsfirebase-listenerjs)
9. [js/ui.js — UI Utilities & App Init](#9-jsuijs)
10. [Data Flow: Device → Firestore → Screen](#10-data-flow)
11. [Alert System Logic](#11-alert-system-logic)
12. [Demo Mode Explained](#12-demo-mode-explained)
13. [Common Customisations](#13-common-customisations)

---

## 1. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Your Hardware (ESP32 / Raspberry Pi / Backend server)          │
│  Reads: ECG sensor, pulse oximeter, thermometer                 │
│  Writes every N seconds to → Firestore document                 │
└───────────────────────────────┬─────────────────────────────────┘
                                │  HTTPS (Firebase SDK)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  Google Cloud Firestore                                         │
│  Collection: "patients"  →  Document: "latest"                  │
│  Fields: ecg[], heartrate, spo2, temperature, patient_id, ts    │
└───────────────────────────────┬─────────────────────────────────┘
                                │  onSnapshot() — fires on every write
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  VitalWatch Browser Dashboard                                   │
│                                                                 │
│  firebase-listener.js  ←── receives raw Firestore document      │
│          │                                                      │
│          ├──► ECGRenderer.pushSamples()  → ecg.js canvas loop   │
│          ├──► VitalsRenderer.updateHR()  → vitals.js            │
│          ├──► VitalsRenderer.updateSpO2()→ vitals.js            │
│          └──► VitalsRenderer.updateTemp()→ vitals.js            │
│                                                                 │
│  ui.js — clock, connection dot, downloadReport()                │
└─────────────────────────────────────────────────────────────────┘
```

**Key principle:** The dashboard is purely a *display client*. It never writes to Firestore. All data originates from your hardware/backend. The browser just listens and renders.

---

## 2. File Execution Order

The browser loads scripts in this order (as declared in `index.html`):

```
1. firebase-app-compat.js       (Google CDN — Firebase core)
2. firebase-firestore-compat.js (Google CDN — Firestore SDK)
3. js/config.js                 (your constants — loaded first so all others can use them)
4. js/ecg.js                    (defines ECGRenderer object — no DOM access yet)
5. js/vitals.js                 (defines VitalsRenderer object — no DOM access yet)
6. js/firebase-listener.js      (defines _handleData etc. — registers DOMContentLoaded)
7. js/ui.js                     (registers DOMContentLoaded — calls ECGRenderer.init())
```

When the page finishes loading, `DOMContentLoaded` fires and two things happen simultaneously:
- `firebase-listener.js` → connects to Firestore (or starts demo)
- `ui.js` → starts the clock and calls `ECGRenderer.init()`

---

## 3. index.html

The HTML file is pure structure — no logic, no inline styles, no inline scripts.

### Header (`<header class="header">`)
```
header
├── header-left
│   ├── .logo            — "✚ VitalWatch" brand mark
│   ├── .header-divider  — thin vertical separator bar
│   └── .facility-info   — "ICU Ward 3B / Critical Care Unit"
├── header-center
│   └── .system-status   — green dot + "Live" / "Demo Mode" / "Disconnected"
│       ├── #connection-dot    ← status-dot CSS class toggled by ui.js
│       └── #connection-label  ← text updated by UI.setStatus()
└── header-right
    └── .clock-block
        ├── #clock-time   ← updated every second by ui.js
        └── #clock-date   ← updated every second by ui.js
```

### Patient Banner (`<section class="patient-banner">`)
```
patient-banner
├── .patient-info
│   ├── .patient-avatar        — letter "P" circle
│   └── .patient-details
│       ├── #patient-id        ← filled by firebase-listener.js from d.patient_id
│       ├── #alert-badge       ← badge class + text set by _buildAlerts()
│       └── #last-update       ← filled with timestamp on each Firestore update
├── #alert-strip               ← dynamic alert badges injected by _buildAlerts()
└── #btn-download              — "Download Report" button → calls downloadReport()
```

### Dashboard Grid (`<main class="dashboard-grid">`)

Uses CSS Grid. ECG spans full width (`grid-column: 1 / -1`). The 3 vital cards sit below in a 3-column row.

```
panel-ecg (full width)
├── .panel-header           — title + "25mm/s", "Lead II" tags + pulse dot
├── .ecg-wrapper            — contains the <canvas id="ecg-canvas">
│   └── .ecg-grid-overlay   — purely visual CSS grid lines (no JS)
└── .ecg-footer             — scale bar label + "Continuous real-time trace"

panel-vital #panel-hr
├── .panel-header           — "Heart Rate" + "bpm"
├── .vital-body
│   ├── #hr-value           ← big number, updated by VitalsRenderer.updateHR()
│   └── #hr-sparkline       ← canvas, drawn by _drawSparkline() in vitals.js
└── .vital-footer
    ├── .range-values       — static "60 – 100 bpm"
    └── #hr-status          ← "NORMAL" / "HIGH" / "TACHYCARDIA" etc.

panel-vital #panel-spo2
├── #spo2-value             ← big number
├── #spo2-arc               ← canvas semicircle gauge
└── #spo2-status

panel-vital #panel-temp
├── #temp-value             ← big number (1 decimal place)
├── #temp-bar               ← coloured fill bar width animated by CSS transition
├── .temp-markers           — static reference lines at 36° and 38°
└── #temp-status
```

### Script Tags (bottom of `<body>`)
Scripts are at the bottom so the DOM exists before any JS runs.
Firebase CDN scripts must come before your own scripts.

---

## 4. css/style.css

### CSS Custom Properties (`:root`)
All colours and fonts are defined as variables so you can retheme the entire dashboard by editing just this block.

```css
--green       #00e87a   — primary data colour (ECG trace, normal vitals)
--red         #ff3d5a   — alert / critical state
--amber       #ffaa30   — warning state
--bg          #070c10   — page background
--bg-panel    #0b1318   — card background
--mono        'Share Tech Mono'  — used for all numbers and data
--sans        'DM Sans'          — used for labels and body text
```

### Key CSS Patterns

**Scanline overlay** — `body::after` creates a fixed full-screen overlay with a repeating gradient that looks like CRT scan lines. `pointer-events: none` means it never blocks clicks.

**Panel top accent** — every `.panel::before` draws a 1px horizontal green line at the top of each card using a linear-gradient, giving the appearance of a glowing edge.

**Alert state cascade** — when JavaScript adds `panel-alert` to a card:
```css
.panel.panel-alert {
  border-color: var(--red-dim);          /* card border turns red */
  box-shadow: 0 0 24px var(--red-glow); /* red outer glow */
}
.panel.panel-alert::before {
  background: red gradient;              /* top accent line turns red */
}
```
And `.vital-value.v-alert` makes the number red with a red glow.

**ECG grid overlay** — `.ecg-grid-overlay` uses 4 layered `background-image` gradients to draw the 10mm major grid and 2mm minor grid lines, exactly like real ECG paper. Pure CSS, no JavaScript.

**Temperature bar** — `.temp-fill` has `transition: width 1.2s cubic-bezier(...)` so the bar animates smoothly rather than jumping when a new value arrives.

---

## 5. js/config.js

This is the only file you need to edit for your project. It exports global constants used by every other module.

```js
FIREBASE_CONFIG   Object    Your Firebase credentials (no databaseURL for Firestore)
FS_COLLECTION     string    Firestore collection name  e.g. "patients"
FS_DOCUMENT       string    Firestore document ID      e.g. "latest" or "P14709"
THRESHOLDS        Object    Clinical alert limits for HR, SpO2, temperature
ECG_CONFIG        Object    Visual settings for the ECG canvas renderer
```

### Why no `databaseURL`?
`databaseURL` is only needed for **Firebase Realtime Database** (a separate product). Cloud Firestore is identified purely by `projectId`. When you call `firebase.firestore()`, the SDK automatically finds your Firestore database using the project ID.

### THRESHOLDS object
```js
THRESHOLDS.hr.criticalHigh = 130   // if HR ≥ 130 → red alert
THRESHOLDS.hr.high         = 100   // if HR > 100 → amber warning
THRESHOLDS.hr.low          =  50   // if HR < 50  → amber warning
THRESHOLDS.hr.criticalLow  =  30   // if HR ≤ 30  → red alert
```
Same pattern for `spo2` and `temp`. Change these numbers to adjust sensitivity.

---

## 6. js/ecg.js

The most complex module. Renders the scrolling ECG waveform on a `<canvas>` element using the HTML5 Canvas 2D API and `requestAnimationFrame`.

### Module Pattern
Uses an IIFE (Immediately Invoked Function Expression) that returns a public API object. This means internal variables (`canvas`, `ctx`, `penX`, etc.) are private — nothing outside can accidentally modify them.

```js
const ECGRenderer = (() => {
  // private variables
  let penX = 0;
  let sampleQueue = [];
  // ...
  return { init, pushSamples, checkQRS };  // only these are public
})();
```

### Internal Variables

| Variable | Type | Purpose |
|---|---|---|
| `canvas` | HTMLCanvasElement | The `<canvas id="ecg-canvas">` DOM element |
| `ctx` | CanvasRenderingContext2D | The drawing context |
| `W`, `H` | number | Canvas width and height in pixels |
| `sampleQueue` | number[] | Buffer of incoming ADC values waiting to be drawn |
| `trailPoints` | {x,y}[] | All points currently visible on the canvas |
| `penX` | number | Current horizontal drawing position |
| `TRAIL_MAX` | 2400 | Maximum stored trail points before oldest are discarded |

### `init()`
Called once by `ui.js` after the DOM is ready.
1. Gets the canvas element and 2D context.
2. Calls `resizeCanvas()` to set canvas pixel dimensions to match its CSS size.
3. Adds a `resize` listener so the canvas re-fits the window if resized.
4. Starts the `loop()` animation.

### `resizeCanvas()`
```js
W = wrapper.clientWidth;
H = wrapper.clientHeight;
canvas.width  = W;
canvas.height = H;
```
This is important: CSS sets the *display* size, but `canvas.width` / `canvas.height` set the *pixel buffer* size. If you don't set both, the canvas will look blurry or stretched.

### `loop()` — The Animation Heart
Runs 60 times per second via `requestAnimationFrame`.

Each frame:
1. **Advances the pen** by `ECG_CONFIG.scrollSpeed` pixels (default: 2).
2. **Consumes samples** from `sampleQueue` — converts each ADC value to a Y coordinate.
3. If no new samples are available, it repeats the last Y value (keeps the line moving as a flat trace).
4. **Appends** new `{x, y}` points to `trailPoints`.
5. **Trims** `trailPoints` to `TRAIL_MAX` (removes oldest points).
6. **Scroll check**: if `penX > W`, shifts all trail points left by the overflow amount, keeping the latest point at the right edge.
7. Calls `render()` to draw the frame.

### `sampleToY(v)` — ADC to Canvas Coordinate
```js
const norm   = 1 - (v / ECG_CONFIG.maxADC);  // 0=bottom of range, 1=top
const margin = H * 0.12;                       // 12% margin top and bottom
return margin + norm * (H - margin * 2);
```
ADC value 4095 (max) → top of canvas. ADC value 0 → bottom. The 12% margin prevents the waveform touching the very edge.

### `render()` — Drawing the Trace
1. **Clear** the entire canvas.
2. **Erase zone**: draw a black rectangle 22px wide ahead of `penX`. This creates the "sweep line" effect — the pen appears to eat through old signal.
3. **Cursor line**: faint vertical green line at `penX`.
4. **Trail loop**: for each segment from old→new:
   - Calculate `alpha` = `Math.pow(t, 1.6)` where `t` is 0 (oldest) to 1 (newest). This makes old parts fade out.
   - Set `shadowBlur = 9` only for the newest 20% of the trail, creating a glow only at the active pen tip.

### `checkQRS(samples)`
Scans the incoming sample batch for any value > 3600. If found, adds the `.on` CSS class to `#pulse-indicator` for 130ms. This makes the green dot in the ECG header flash with each heartbeat.

### `pushSamples(arr)`
Simply appends incoming ADC values to `sampleQueue`. The `loop()` drains this queue frame by frame, which naturally throttles the display speed regardless of how often Firestore updates arrive.

---

## 7. js/vitals.js

Handles the three vital sign cards. Uses the same IIFE module pattern as `ecg.js`.

### `updateHR(bpm)`
1. Sets `#hr-value` text content.
2. Appends `bpm` to `hrHistory[]` (max 30 values).
3. Calls `_drawSparkline(hrHistory)` to redraw the mini trend graph.
4. Calls `_hrState(bpm)` to determine level and label.
5. Calls `_applyVitalState()` to update CSS classes.

### `_drawSparkline(data)`
Draws on `<canvas id="hr-sparkline">` (130×50 px).
1. Finds `min` and `max` of data for Y scaling.
2. Maps each data point to an (x, y) coordinate.
3. Draws a gradient-filled area below the line (fills with a transparent green gradient).
4. Draws the line on top in solid green.

### `updateSpO2(pct)`
1. Sets `#spo2-value` text.
2. Calls `_drawArc(pct)` to redraw the semicircle gauge.
3. Applies state + classes.

### `_drawArc(pct)`
Draws on `<canvas id="spo2-arc">` (130×75 px).
- The arc is a **semicircle** (π to 2π radians = bottom half of a circle, displayed as top half because canvas Y is inverted).
- `cy` = `H + 4` places the circle center *below* the canvas bottom, so only the top arc is visible.
- Track arc: full grey semicircle.
- Fill arc: coloured arc from π to `π + (pct/100 × π)`.
- Colour: green (≥95%), amber (90–94%), red (<90%).
- `shadowBlur = 10` adds a glow matching the fill colour.
- A small `pct%` text label is drawn inside the arc.

### `updateTemp(degC)`
1. Sets `#temp-value` to `degC.toFixed(1)`.
2. Maps temperature 34°–41°C to 0–100% bar width:
   ```js
   pct = ((degC - 34) / 7) * 100
   ```
3. Sets `#temp-bar` width — CSS `transition` animates the change.

### `_applyVitalState(valEl, statEl, panelEl, level, label)`
Central function that applies the correct CSS classes depending on severity:

| `level` | Value CSS class | Status CSS class | Panel CSS class |
|---|---|---|---|
| `'ok'` | (none) | (none) | (none) |
| `'warn'` | `v-warn` | `s-warn` | (none) |
| `'alert'` | `v-alert` | `s-alert` | `panel-alert` |

This single function keeps all three cards consistent — changing thresholds in `config.js` automatically updates all visual states without touching any other code.

---

## 8. js/firebase-listener.js

The bridge between Firestore and the rendering modules.

### Initialisation Flow
```
DOMContentLoaded fires
    │
    ├─ apiKey === 'YOUR_API_KEY'?
    │       YES → _startDemo()
    │       NO  → _initFirestore()
    │                   │
    │              firebase.initializeApp(FIREBASE_CONFIG)
    │              _db = firebase.firestore()
    │              _listen()
    │                   │
    │              _db.collection(FS_COLLECTION).doc(FS_DOCUMENT)
    │              .onSnapshot(callback)
    │                   │
    │              callback fires on every Firestore write
    │              → _handleData(snap.data())
```

### `onSnapshot()` vs `.on('value')`
| | Firestore `onSnapshot()` | Realtime DB `.on('value')` |
|---|---|---|
| Fires on load? | Yes, immediately | Yes, immediately |
| Fires on update? | Yes | Yes |
| Returns | `DocumentSnapshot` | `DataSnapshot` |
| Get data | `snap.data()` | `snap.val()` |
| Cancel listener | call `_unsubscribe()` | call `ref.off()` |

### `_handleData(d)`
Called every time Firestore delivers a new document snapshot. Dispatches each field to the correct renderer:

```
d.ecg[]        → ECGRenderer.pushSamples() + ECGRenderer.checkQRS()
d.heartrate    → VitalsRenderer.updateHR()
d.spo2         → VitalsRenderer.updateSpO2()
d.temperature  → VitalsRenderer.updateTemp()
d.patient_id   → document.getElementById('patient-id').textContent
d.timestamp    → d.timestamp.toDate() → formatted time string
```

### Timestamp handling
Firestore `serverTimestamp()` returns a `Timestamp` object (not a plain string). It has a `.toDate()` method that converts it to a JavaScript `Date`. The code handles both:
```js
const t = d.timestamp?.toDate
  ? d.timestamp.toDate()     // Firestore Timestamp object
  : new Date(d.timestamp);   // fallback: plain ISO string
```

### `_buildAlerts(d)`
Called after every data update. Loops through HR, SpO₂, and temperature values, compares against `THRESHOLDS`, and builds an array of alert objects. Then:
1. Renders each alert as a `<span class="badge badge-alert">` or `badge-warn` inside `#alert-strip`.
2. Updates `#alert-badge` in the patient banner with the count and severity colour.

---

## 9. js/ui.js

Lightweight module — handles things that don't fit neatly into the other modules.

### `_startClock()`
Uses `setInterval(tick, 1000)` to update two elements every second:
- `#clock-time` → `HH:MM:SS` (24-hour format, `en-IN` locale)
- `#clock-date` → `DD MMM YYYY` (e.g. `12 FEB 2026`)

### `UI.setStatus(state)`
Accepts: `'connecting'` | `'live'` | `'demo'` | `'error'`

Updates two DOM elements:
- `#connection-dot` — removes all classes, then adds `'live'` or `'error'` class which CSS turns green (pulsing) or red.
- `#connection-label` — sets text to "Live", "Demo Mode", etc.

### `DOMContentLoaded` handler
```js
document.addEventListener('DOMContentLoaded', () => {
  _startClock();
  ECGRenderer.init();    // starts the canvas animation loop
});
```
`ECGRenderer.init()` must run here (not at parse time) because the `<canvas>` element doesn't exist until the DOM is ready.

### `downloadReport()` (global function)
Defined outside the module so `onclick="downloadReport()"` in HTML can call it.

```js
function downloadReport() {
  const patientId = document.getElementById('patient-id').textContent.trim();
  // Guard: don't fire if no patient loaded yet
  if (!patientId || patientId === '---') { alert(...); return; }

  const url = `https://api-m32s.onrender.com/download/${patientId}`;

  // Create invisible <a>, set href, click it, remove it
  // This triggers browser download without navigating away
  const link = document.createElement('a');
  link.href   = url;
  link.target = '_blank';
  link.rel    = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Visual feedback: button shows "⏳ Requesting…" for 2 seconds
}
```

---

## 10. Data Flow

### Full journey from sensor to screen:

```
1. Your sensor reads ECG / HR / SpO2 / Temp
           │
2. Your device code (Python/C++/Node.js) calls:
   db.collection("patients").doc("latest").set({
     ecg:         [...],
     heartrate:   88,
     spo2:        97,
     temperature: 36.8,
     patient_id:  "P14709",
     timestamp:   firebase.firestore.FieldValue.serverTimestamp()
   })
           │
3. Firestore stores the document and notifies all listeners
           │
4. Browser receives snapshot via onSnapshot()
   → firebase-listener.js: _handleData(data)
           │
           ├── ECGRenderer.pushSamples(data.ecg)
           │        └── samples added to sampleQueue[]
           │                └── loop() drains queue each animation frame
           │                        └── renders on <canvas>
           │
           ├── VitalsRenderer.updateHR(88)
           │        ├── #hr-value.textContent = "88"
           │        ├── hrHistory.push(88) → _drawSparkline()
           │        └── _applyVitalState() → CSS classes (normal = green)
           │
           ├── VitalsRenderer.updateSpO2(97)
           │        ├── #spo2-value.textContent = "97"
           │        └── _drawArc(97) → green arc on canvas
           │
           └── VitalsRenderer.updateTemp(36.8)
                    ├── #temp-value.textContent = "36.8"
                    └── #temp-bar.style.width = "40%"
```

---

## 11. Alert System Logic

### Three severity levels:

```
ok    → green   — value within normal clinical range
warn  → amber   — value outside normal but not dangerous
alert → red     — value at critical threshold, needs attention
```

### How it propagates (example: HR = 135 bpm):

```
_hrState(135) returns { level: 'alert', label: 'TACHYCARDIA' }
         │
_applyVitalState(valEl, statEl, panelEl, 'alert', 'TACHYCARDIA')
         │
         ├── valEl.classList.add('v-alert')      → #hr-value turns red
         ├── statEl.classList.add('s-alert')     → status badge turns red
         ├── panelEl.classList.add('panel-alert') → card border + glow red
         └── statEl.textContent = 'TACHYCARDIA'
```

```
_buildAlerts(data) → alerts = [{ text: 'HR 135 bpm — TACHYCARDIA', level:'alert' }]
         │
         ├── #alert-strip innerHTML → red badge "HR 135 bpm — TACHYCARDIA"
         └── #alert-badge → class=badge-alert, text="⚠ 1 ALERT" (flashing)
```

---

## 12. Demo Mode Explained

When `FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY'`, the app skips Firebase entirely and calls `_startDemo()`.

Demo mode runs a `setInterval` at 40ms (25 fps) that:
1. Sends 6 ECG samples per tick from a hardcoded realistic PQRST waveform array (`_DEMO_ECG`).
2. Generates slowly oscillating HR (sine wave around 72 bpm).
3. Generates slowly oscillating SpO₂ (sine wave around 97%).
4. Generates slowly oscillating temperature (sine wave around 36.6°C).
5. Passes all this to `_handleData()` — exactly the same function that handles real Firestore data.

This means the entire rendering pipeline is exercised in demo mode, so you can visually verify the dashboard is working correctly before connecting real hardware.

The fake timestamp mimics the Firestore Timestamp shape:
```js
timestamp: { toDate: () => new Date() }
```
So `_handleData` can call `.toDate()` on it without crashing.

---

## 13. Common Customisations

### Change patient being monitored
```js
// config.js
const FS_DOCUMENT = "P14709";   // listen to this specific patient's document
```

### Change alert thresholds
```js
// config.js
THRESHOLDS.spo2.warning  = 92;   // warn earlier
THRESHOLDS.hr.criticalHigh = 120; // lower the critical threshold
```

### Change ECG scroll speed
```js
// config.js
ECG_CONFIG.scrollSpeed = 3;   // faster scroll (more ECG visible per second)
ECG_CONFIG.scrollSpeed = 1;   // slower
```

### Change ECG trace colour
```js
// config.js
ECG_CONFIG.color     = "#ffffff";              // white trace
ECG_CONFIG.glowColor = "rgba(255,255,255,0.4)";
```

### Add a second patient panel
Duplicate the `.panel-vital` HTML sections in `index.html` with different IDs, then call `VitalsRenderer.updateHR()` etc. targeting the new IDs.

### Listen to a subcollection / different path
```js
// firebase-listener.js — _listen()
// Change this line:
const docRef = _db.collection(FS_COLLECTION).doc(FS_DOCUMENT);
// To a subcollection, e.g. patients/P14709/readings/latest:
const docRef = _db.collection('patients').doc('P14709').collection('readings').doc('latest');
```

### Add Blood Pressure panel
1. Add HTML panel in `index.html` (copy a `.panel-vital` block, new IDs).
2. Add `updateBP(systolic, diastolic)` function in `vitals.js`.
3. Add `bp_systolic` and `bp_diastolic` fields to your Firestore document.
4. Call `VitalsRenderer.updateBP(d.bp_systolic, d.bp_diastolic)` in `firebase-listener.js`.

---

*VitalWatch — not a substitute for certified clinical equipment.*
