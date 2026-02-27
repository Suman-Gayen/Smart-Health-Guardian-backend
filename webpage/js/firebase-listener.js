/**
 * firebase-listener.js — Cloud Firestore Real-Time Listener
 * ════════════════════════════════════════════════════════════
 *
 * Listens to the entire FS_COLLECTION ordered by timestamp DESC.
 * Every new document your ESP32 POSTs triggers a dashboard update.
 *
 * YOUR HARDWARE CONTEXT (from PDF_Genration.ino):
 *   • Patient ID is randomly generated every loop() — use FS_PATIENT_ID=null
 *   • ECG field arrives as a JSON STRING: "[0,966,4095,503,...]"
 *     (ad8232.cpp builds it with sprintf into ecgJsonData char array)
 *   • heartrate / spo2 / temperature arrive as numbers (or null if invalid)
 *   • POST_INTERVAL=2000ms but loop takes ~2250ms → doc every ~2.25 s
 */

let _db          = null;
let _unsubscribe = null;
let _demoTimer   = null;
let _demoEcgIdx  = 0;

// ── Bootstrap ───────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  if (FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY') {
    console.info('[VitalWatch] Firebase not configured → Demo Mode');
    UI.setStatus('demo');
    _startDemo();
  } else {
    _initFirestore();
  }
});

// ── Init Firestore ──────────────────────────────────────────────────────────
function _initFirestore() {
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    _db = firebase.firestore();
    UI.setStatus('connecting');
    _listenLatest();
  } catch (err) {
    console.error('[Firestore] Init failed:', err);
    UI.setStatus('error');
    _startDemo();
  }
}

// ── Core listener ───────────────────────────────────────────────────────────
function _listenLatest() {
  let query = _db.collection(FS_COLLECTION);

  if (typeof FS_PATIENT_ID !== 'undefined' && FS_PATIENT_ID) {
    query = query.where('patient_id', '==', FS_PATIENT_ID);
  }

  // Always get the single most-recently-written document.
  // Fires immediately on load, then again on every new write.
  query = query.orderBy('timestamp', 'desc').limit(1);

  _unsubscribe = query.onSnapshot(
    snapshot => {
      if (snapshot.empty) {
        console.warn('[Firestore] No documents in:', FS_COLLECTION);
        UI.setStatus('error');
        return;
      }
      const doc  = snapshot.docs[0];
      console.log('[Firestore] New doc:', doc.id, doc.data());
      _handleData(doc.data());
      UI.setStatus('live');
    },
    err => {
      console.error('[Firestore] Error:', err.code, err.message);
      if (err.code === 'failed-precondition') {
        console.error('[Firestore] Missing index — Firestore will print a link above to create it.');
      }
      UI.setStatus('error');
      _startDemo();
    }
  );
}

// ── Handle incoming document ────────────────────────────────────────────────
function _handleData(d) {
  console.log('[Firestore] Document data:', d);

  // ════════════════════════════════════════════════════════
  // ECG FIELD
  // ════════════════════════════════════════════════════════
  // Your ad8232.cpp writes ecgJsonData as a C string, so your
  // Flask backend stores it in Firestore as a STRING field.
  //
  // Possible values:
  //   "!leads_off"        → electrodes not connected (digitalRead check)
  //   "!flatline"         → signal stuck at 0 or 4095 (allSame check)
  //   ""                  → empty (sent when ad8232_RawData.valid is false)
  //   "[0,966,4095,...]"  → valid ECG — a JSON array encoded as a string
  //
  // IF your Flask backend parses the ECG string and stores it as a
  // Firestore array instead of a string, the Array.isArray() branch
  // below handles that automatically.
  // ════════════════════════════════════════════════════════

  const ecgRaw = d.ecg;

  if (ecgRaw === '!leads_off') {
    ECGRenderer.setLeadsOff();
    console.warn('[ECG] Leads off');

  } else if (ecgRaw === '!flatline' || ecgRaw === '') {
    ECGRenderer.clearLeadsOff();
    // Keep scrolling — ecg.js will draw holdover flat line
    console.warn('[ECG] Flatline or empty ECG field');

  } 
  else if (typeof ecgRaw === 'string' && ecgRaw.startsWith('[')) {
    // ── Your ad8232.cpp format: JSON array as string ──────
    try {
      const samples = JSON.parse(ecgRaw);
      if (Array.isArray(samples) && samples.length > 0) {
        ECGRenderer.clearLeadsOff();
        ECGRenderer.pushSamples(samples);
        ECGRenderer.checkQRS(samples);
      }
    } catch(e) {
      console.error('[ECG] JSON parse failed:', e.message, '| Raw:', ecgRaw.slice(0,60));
    }

  } else if (Array.isArray(ecgRaw) && ecgRaw.length > 0) {
    // ── If Flask stored ECG as a Firestore array (not string) ─
    ECGRenderer.clearLeadsOff();
    ECGRenderer.pushSamples(ecgRaw);
    ECGRenderer.checkQRS(ecgRaw);

  } else if (ecgRaw !== undefined) {
    console.warn('[ECG] Unexpected ecg field type:', typeof ecgRaw, '| Value:', String(ecgRaw).slice(0,60));
  }

  // ── Heart Rate ────────────────────────────────────────────────
  // Your .ino sends null when max30102 finger not detected.
  // Firestore stores null as null — typeof null === 'object', not 'number'.
  // So the typeof check naturally skips null values.
  if (typeof d.heartrate === 'number') VitalsRenderer.updateHR(d.heartrate);

  // ── SpO2 ──────────────────────────────────────────────────────
  if (typeof d.spo2 === 'number') VitalsRenderer.updateSpO2(d.spo2);

  // ── Temperature ───────────────────────────────────────────────
  if (typeof d.temperature === 'number') VitalsRenderer.updateTemp(d.temperature);

  // ── Patient ID ────────────────────────────────────────────────
  // Your .ino generates a random ID each loop() call.
  const pidEl = document.getElementById('patient-id');
  if (pidEl && d.patient_id) pidEl.textContent = d.patient_id;

  // ── Timestamp ─────────────────────────────────────────────────
  const tsEl = document.getElementById('last-update');
  if (tsEl && d.timestamp) {
    const t = d.timestamp?.toDate ? d.timestamp.toDate() : new Date(d.timestamp);
    tsEl.textContent = isNaN(t) ? '—' : t.toLocaleTimeString();
  }

  _buildAlerts(d);
}

// ── Alert strip ─────────────────────────────────────────────────────────────
function _buildAlerts(d) {
  const strip = document.getElementById('alert-strip');
  const badge = document.getElementById('alert-badge');
  if (!strip) return;

  const alerts = [];

  if (d.ecg === '!leads_off') alerts.push({ text: 'ECG LEADS OFF', level: 'alert' });
  if (d.ecg === '!flatline')  alerts.push({ text: 'ECG FLATLINE',  level: 'warn'  });

  if (typeof d.heartrate === 'number') {
    if (d.heartrate >= THRESHOLDS.hr.criticalHigh)
      alerts.push({ text: `HR ${d.heartrate} bpm — TACHYCARDIA`, level: 'alert' });
    else if (d.heartrate <= THRESHOLDS.hr.criticalLow)
      alerts.push({ text: `HR ${d.heartrate} bpm — BRADYCARDIA`, level: 'alert' });
    else if (d.heartrate > THRESHOLDS.hr.high || d.heartrate < THRESHOLDS.hr.low)
      alerts.push({ text: `HR ${d.heartrate} bpm — ABNORMAL`, level: 'warn' });
  }

  if (typeof d.spo2 === 'number') {
    if (d.spo2 <= THRESHOLDS.spo2.critical)
      alerts.push({ text: `SpO₂ ${d.spo2}% — CRITICAL HYPOXIA`, level: 'alert' });
    else if (d.spo2 <= THRESHOLDS.spo2.warning)
      alerts.push({ text: `SpO₂ ${d.spo2}% — LOW OXYGEN`, level: 'warn' });
  }

  if (typeof d.temperature === 'number') {
    if (d.temperature >= THRESHOLDS.temp.criticalHigh)
      alerts.push({ text: `TEMP ${d.temperature.toFixed(1)}°C — HIGH FEVER`, level: 'alert' });
    else if (d.temperature < THRESHOLDS.temp.criticalLow)
      alerts.push({ text: `TEMP ${d.temperature.toFixed(1)}°C — HYPOTHERMIA`, level: 'alert' });
  }

  strip.innerHTML = alerts
    .map(a => `<span class="badge badge-${a.level === 'alert' ? 'alert' : 'warn'}">${a.text}</span>`)
    .join('');

  if (badge) {
    const hasCritical = alerts.some(a => a.level === 'alert');
    badge.className   = `badge ${hasCritical ? 'badge-alert' : alerts.length ? 'badge-warn' : 'badge-ok'}`;
    badge.textContent = alerts.length
      ? `⚠ ${alerts.length} ALERT${alerts.length > 1 ? 'S' : ''}`
      : 'MONITORING ACTIVE';
  }
}

// ── Demo Mode ────────────────────────────────────────────────────────────────
// Simulates your hardware exactly: 250 samples per batch, ~2.25s interval.
const _DEMO_ECG = [
  0,0,0,0,30,80,180,350,600,950,1600,2700,4095,3400,1800,700,200,60,10,0,
  0,0,0,0,0,0,0,0,0,80,200,350,480,520,500,450,380,300,210,140,80,30,0,0,
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
];

function _startDemo() {
  if (_demoTimer) return;
  let tick = 0;
  _demoTimer = setInterval(() => {
    tick++;
    // Send 6 samples per 40ms tick → 150 samples/s in demo
    // (real hardware sends 250 samples every 2250ms = same visual rate)
    const batch = [];
    for (let i = 0; i < 6; i++) {
      batch.push(_DEMO_ECG[(_demoEcgIdx++) % _DEMO_ECG.length]);
    }
    _handleData({
      ecg:         batch,   // demo passes array directly (handled by Array.isArray branch)
      heartrate:   Math.max(55, Math.min(140, 72 + Math.round(Math.sin(tick*0.04)*12))),
      spo2:        Math.max(88, Math.min(100, 97 + Math.round(Math.sin(tick*0.025)*2))),
      temperature: +(36.6 + Math.sin(tick*0.015)*0.35).toFixed(2),
      patient_id:  'DEMO-001',
      timestamp:   { toDate: () => new Date() }
    });
  }, 40);
}
