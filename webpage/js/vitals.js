/**
 * vitals.js — Heart Rate, SpO₂, Temperature Display
 * ════════════════════════════════════════════════════
 * Renders numeric values, status labels, color states,
 * HR sparkline, SpO₂ arc gauge, and temperature bar.
 */

const VitalsRenderer = (() => {

  // ── HR history for sparkline ─────────────────────────
  const hrHistory = [];
  const HR_MAX_HIST = 30;

  // ════════════════════════════════════════════════════
  // HEART RATE
  // ════════════════════════════════════════════════════
  function updateHR(bpm) {
    const val    = document.getElementById('hr-value');
    const stat   = document.getElementById('hr-status');
    const panel  = document.getElementById('panel-hr');
    if (!val) return;

    val.textContent = bpm;
    hrHistory.push(bpm);
    if (hrHistory.length > HR_MAX_HIST) hrHistory.shift();
    _drawSparkline(hrHistory);

    const { level, label } = _hrState(bpm);
    _applyVitalState(val, stat, panel, level, label);
  }

  function _hrState(v) {
    if (v >= THRESHOLDS.hr.criticalHigh || v <= THRESHOLDS.hr.criticalLow)
      return { level: 'alert', label: v >= THRESHOLDS.hr.criticalHigh ? 'TACHYCARDIA' : 'BRADYCARDIA' };
    if (v > THRESHOLDS.hr.high)
      return { level: 'warn',  label: 'HIGH' };
    if (v < THRESHOLDS.hr.low)
      return { level: 'warn',  label: 'LOW' };
    return { level: 'ok', label: 'NORMAL' };
  }

  function _drawSparkline(data) {
    const c = document.getElementById('hr-sparkline');
    if (!c) return;
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    if (data.length < 2) return;

    const lo  = Math.min(...data) - 4;
    const hi  = Math.max(...data) + 4;
    const rng = hi - lo || 1;
    const tx  = i => (i / (data.length - 1)) * W;
    const ty  = v => H - ((v - lo) / rng) * H;

    // Area fill
    ctx.beginPath();
    ctx.moveTo(tx(0), ty(data[0]));
    data.forEach((v,i) => ctx.lineTo(tx(i), ty(v)));
    ctx.lineTo(W, H); ctx.lineTo(0, H);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(0,232,122,0.28)');
    g.addColorStop(1, 'rgba(0,232,122,0)');
    ctx.fillStyle = g;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(tx(0), ty(data[0]));
    data.forEach((v,i) => ctx.lineTo(tx(i), ty(v)));
    ctx.strokeStyle = '#00e87a';
    ctx.lineWidth   = 1.8;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    ctx.stroke();
  }

  // ════════════════════════════════════════════════════
  // SPO2
  // ════════════════════════════════════════════════════
  function updateSpO2(pct) {
    const val   = document.getElementById('spo2-value');
    const stat  = document.getElementById('spo2-status');
    const panel = document.getElementById('panel-spo2');
    if (!val) return;

    val.textContent = pct;
    _drawArc(pct);

    const { level, label } = _spo2State(pct);
    _applyVitalState(val, stat, panel, level, label);
  }

  function _spo2State(v) {
    if (v <= THRESHOLDS.spo2.critical) return { level: 'alert', label: 'CRITICAL' };
    if (v <= THRESHOLDS.spo2.warning)  return { level: 'warn',  label: 'LOW O₂' };
    return { level: 'ok', label: 'NORMAL' };
  }

  function _drawArc(pct) {
    const c = document.getElementById('spo2-arc');
    if (!c) return;
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);

    const cx = W / 2, cy = H + 4, r = H - 8;
    const START = Math.PI, END = 2 * Math.PI;
    const fill  = START + (Math.min(100, Math.max(0, pct)) / 100) * Math.PI;
    const color = pct <= THRESHOLDS.spo2.critical ? '#ff3d5a'
                : pct <= THRESHOLDS.spo2.warning  ? '#ffaa30'
                : '#00e87a';

    // Track
    ctx.beginPath();
    ctx.arc(cx, cy, r, START, END);
    ctx.strokeStyle = '#182430';
    ctx.lineWidth   = 9;
    ctx.lineCap     = 'butt';
    ctx.stroke();

    // Fill arc
    ctx.beginPath();
    ctx.arc(cx, cy, r, START, fill);
    ctx.strokeStyle = color;
    ctx.lineWidth   = 9;
    ctx.lineCap     = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur  = 10;
    ctx.stroke();
    ctx.shadowBlur  = 0;

    // Percentage label inside arc
    ctx.fillStyle   = color;
    ctx.font        = `bold 11px 'Share Tech Mono', monospace`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(pct + '%', cx, cy - 4);
  }

  // ════════════════════════════════════════════════════
  // TEMPERATURE
  // ════════════════════════════════════════════════════
  function updateTemp(degC) {
    const val   = document.getElementById('temp-value');
    const stat  = document.getElementById('temp-status');
    const bar   = document.getElementById('temp-bar');
    const panel = document.getElementById('panel-temp');
    if (!val) return;

    val.textContent = degC.toFixed(1);

    // range is 25°–45°C (span of 20°)→ 0–100%
    const pct = Math.min(100, Math.max(0, ((degC - 25) / 20) * 100));
    if (bar) bar.style.width = pct + '%';

    const { level, label } = _tempState(degC);
    _applyVitalState(val, stat, panel, level, label);
  }

  function _tempState(v) {
    if (v >= THRESHOLDS.temp.criticalHigh || v < THRESHOLDS.temp.criticalLow)
      return { level: 'alert', label: v >= THRESHOLDS.temp.criticalHigh ? 'HIGH FEVER' : 'HYPOTHERMIA' };
    if (v > THRESHOLDS.temp.high || v < THRESHOLDS.temp.low)
      return { level: 'warn', label: v > THRESHOLDS.temp.high ? 'ELEVATED' : 'SUBNORMAL' };
    return { level: 'ok', label: 'NORMAL' };
  }

  // ════════════════════════════════════════════════════
  // SHARED STATE HELPER
  // ════════════════════════════════════════════════════
  function _applyVitalState(valEl, statEl, panelEl, level, label) {
    // Clear previous classes
    valEl.classList.remove('v-warn', 'v-alert');
    if (statEl) statEl.classList.remove('s-warn', 's-alert');
    if (panelEl) panelEl.classList.remove('panel-alert');

    if (level === 'alert') {
      valEl.classList.add('v-alert');
      if (statEl) statEl.classList.add('s-alert');
      if (panelEl) panelEl.classList.add('panel-alert');
    } else if (level === 'warn') {
      valEl.classList.add('v-warn');
      if (statEl) statEl.classList.add('s-warn');
    }

    if (statEl) statEl.textContent = label;
  }

  return { updateHR, updateSpO2, updateTemp };
})();
