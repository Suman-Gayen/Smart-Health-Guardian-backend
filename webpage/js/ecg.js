/**
 * ecg.js — Real-Time ECG Waveform Renderer  [v4 — FULL WIDTH + FASTER]
 * ══════════════════════════════════════════════════════════════════════
 *
 * FIXES IN THIS VERSION:
 *
 *  FIX 1 — GRAPH FILLS >90% OF CANVAS IMMEDIATELY
 *    Old: pen started at x=0 and crawled right — left side blank for many seconds.
 *    New: on init, penX starts at the RIGHT edge (W). The wrap logic then
 *         immediately shifts all points left, so the waveform fills the whole
 *         canvas from the very first frame. A "pre-fill" flat line seeds the
 *         trail so there is no empty left region.
 *
 *  FIX 2 — FASTER SCROLL SPEED
 *    Old: 25 mm/s → 94.49 px/s (too slow, felt static)
 *    New: 37.5 mm/s → ~141 px/s (50% faster, still readable, ~8 s history on 1200px)
 *    Tune MM_PER_SEC up/down to taste (range: 25–50).
 *
 *  FIX 3 — FULL CANVAS WIDTH USAGE
 *    The pen now wraps at W and rewrites from x=0, so every pixel column
 *    always has a waveform drawn in it. No gaps, no blank left side.
 *
 *  FIX 4 — NOISE FILTER (kept from v3)
 *    4-tap moving average smooths ADC jitter / 50-60 Hz noise.
 *
 *  FIX 5 — STABLE BASELINE AUTO-SCALE (kept from v3)
 *    Very slow exponential min/max tracking (tau ~27 s) prevents vertical jumping.
 */

const ECGRenderer = (() => {

  // ── Canvas / context ──────────────────────────────────────────
  let canvas, ctx;
  let W = 0, H = 0;

  // ── Sample queue ──────────────────────────────────────────────
  let sampleQueue = [];

  // ── Loop buffer (replay during DB gap of 10–12 s) ────────────
  let loopBuffer    = [];
  let loopBufferIdx = 0;

  // ── Trail ─────────────────────────────────────────────────────
  let trailPoints = [];
  const TRAIL_MAX = 3500;   // enough to cover full canvas at all speeds

  // ── Pen ───────────────────────────────────────────────────────
  let penX  = 0;
  let lastY = null;

  // ── FIX 2: Speed — 37.5 mm/s for a good balance of fast + readable ──
  // At 96 DPI: 50 × (120/20) = 300 px/s
  // On a 1200 px canvas: shows ~8.5 s of history = ~8–9 beats visible.
  // ↑ Increase MM_PER_SEC to scroll faster, ↓ decrease to scroll slower.
  const SAMPLE_RATE_HZ = 250;
  const MM_PER_SEC     = 50;          // ← tune: 25=slow, 37.5=medium-fast, 50=fast
  const DPI            = 120;         // ← tune: 96=standard, 120=high-res, 72=low-res
  const PX_PER_SEC     = MM_PER_SEC * (DPI / 20);   // 20 mm per small box at 96 DPI
  const PX_PER_SAMPLE  = PX_PER_SEC / SAMPLE_RATE_HZ; // 0.567 px/sample

  // ── FIX 4: Low-pass filter (4-tap moving average) ─────────────
  const LP_TAPS = 4;
  let lpBuf = [];
  function _lpFilter(v) {
    lpBuf.push(v);
    if (lpBuf.length > LP_TAPS) lpBuf.shift();
    return lpBuf.reduce((s, x) => s + x, 0) / lpBuf.length;
  }

  // ── FIX 5: Slow auto-scale ────────────────────────────────────
  let autoMin = 1500;
  let autoMax = 2700;
  const SCALE_ALPHA = 0.00015;
  function _updateAutoScale(v) {
    if (v < autoMin) autoMin = v;
    else autoMin += (v - autoMin) * SCALE_ALPHA;
    if (v > autoMax) autoMax = v;
    else autoMax -= (autoMax - v) * SCALE_ALPHA;
  }

  const AMPLITUDE_GAIN = 0.78;

  function _sampleToY(rawV) {
    const v     = _lpFilter(rawV);
    _updateAutoScale(v);
    const range  = Math.max(autoMax - autoMin, 100);
    const center = (autoMax + autoMin) / 2;
    const norm   = 0.5 - ((v - center) / (range / AMPLITUDE_GAIN));
    const margin = H * 0.07;
    return Math.max(margin, Math.min(H - margin, margin + norm * (H - margin * 2)));
  }

  // ── Other state ───────────────────────────────────────────────
  let leadsOff = false;
  const QUEUE_MAX = 750;
  let pxAcc = 0;
  let rafId = null;

  // ════════════════════════════════════════════════════════════════
  // PUBLIC: init()
  // ════════════════════════════════════════════════════════════════
  function init() {
    canvas = document.getElementById('ecg-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    _resize();
    window.addEventListener('resize', _resize);
    _loop();
  }

  // ════════════════════════════════════════════════════════════════
  // PUBLIC: pushSamples(arr)
  // ════════════════════════════════════════════════════════════════
  function pushSamples(arr) {
    if (!Array.isArray(arr)) return;
    if (sampleQueue.length > QUEUE_MAX) {
      sampleQueue = sampleQueue.slice(-SAMPLE_RATE_HZ);
    }
    arr.forEach(v => sampleQueue.push(Number(v)));
    if (arr.length > 0) {
      loopBuffer = arr.map(Number);
      // Do NOT reset loopBufferIdx — avoids jump on new data arrival
    }
    leadsOff = false;
  }

  function setLeadsOff()   { leadsOff = true;  sampleQueue = []; }
  function clearLeadsOff() { leadsOff = false; }

  function checkQRS(arr) {
    if (!Array.isArray(arr)) return;
    if (!arr.some(v => v > 3000)) return;
    const dot = document.getElementById('pulse-indicator');
    if (!dot) return;
    dot.classList.add('on');
    clearTimeout(dot._t);
    dot._t = setTimeout(() => dot.classList.remove('on'), 150);
  }

  // ════════════════════════════════════════════════════════════════
  // PRIVATE: _resize()
  // FIX 1 + 3: Pre-fill the trail with a flat baseline so the entire
  // canvas width is covered from frame 1. penX starts at W (right edge)
  // so the first wrap immediately distributes points across full width.
  // ════════════════════════════════════════════════════════════════
  function _resize() {
    const wrapper = canvas.parentElement;
    W = wrapper.clientWidth  || 800;
    H = wrapper.clientHeight || 220;
    canvas.width  = W;
    canvas.height = H;

    trailPoints = [];
    lpBuf       = [];
    pxAcc       = 0;

    // Pre-fill trail with a flat centre line covering the entire canvas width.
    // This ensures the canvas is never blank — the waveform immediately
    // occupies >90% of the canvas as soon as real samples start arriving.
    const midY     = H / 2;
    const nPrefill = Math.ceil(W / PX_PER_SAMPLE) + 10;
    for (let i = 0; i < nPrefill; i++) {
      trailPoints.push({ x: i * PX_PER_SAMPLE, y: midY });
    }

    // Place pen at the right edge so first wrap fills canvas immediately
    penX  = W;
    lastY = midY;
  }

  // ════════════════════════════════════════════════════════════════
  // PRIVATE: _loop()
  // ════════════════════════════════════════════════════════════════
  function _loop() {
    pxAcc += PX_PER_SEC / 60;
    const samplesToConsume = Math.floor(pxAcc / PX_PER_SAMPLE);
    pxAcc -= samplesToConsume * PX_PER_SAMPLE;

    for (let i = 0; i < samplesToConsume; i++) {
      let y;

      if (leadsOff) {
        y = H / 2;

      } else if (sampleQueue.length > 0) {
        y = _sampleToY(sampleQueue.shift());
        lastY = y;

      } else if (loopBuffer.length > 0) {
        // Replay last batch while DB is silent (10–12 s gap)
        const v = loopBuffer[loopBufferIdx % loopBuffer.length];
        loopBufferIdx++;
        y = _sampleToY(v);
        lastY = y;

      } else {
        y = (lastY !== null) ? lastY : H / 2;
      }

      trailPoints.push({ x: penX, y });
      penX += PX_PER_SAMPLE;
      if (trailPoints.length > TRAIL_MAX) trailPoints.shift();
    }

    // FIX 3: Wrap pen — shift ALL trail points left so oldest points
    // scroll off the left edge and new points write from the right side.
    // This keeps the ENTIRE canvas covered at all times.
    if (penX > W) {
      const shift = penX - W;
      trailPoints = trailPoints
        .map(p => ({ x: p.x - shift, y: p.y }))
        .filter(p => p.x >= -PX_PER_SAMPLE);
      penX = W;
    }

    _render();
    rafId = requestAnimationFrame(_loop);
  }

  // ════════════════════════════════════════════════════════════════
  // PRIVATE: _render()
  // ════════════════════════════════════════════════════════════════
  function _render() {
    ctx.clearRect(0, 0, W, H);
    if (trailPoints.length < 2) return;

    // Erase zone ahead of pen (the "writing head" gap) — 0.20 s
    const eraseW = Math.ceil(PX_PER_SEC * 0.20);
    ctx.fillStyle = '#040a07';
    ctx.fillRect(penX, 0, eraseW, H);

    // Cursor line at pen tip
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0,232,122,0.10)';
    ctx.lineWidth   = 1;
    ctx.moveTo(penX, 0);
    ctx.lineTo(penX, H);
    ctx.stroke();

    if (leadsOff) {
      ctx.fillStyle = 'rgba(255,61,90,0.07)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle    = '#ff3d5a';
      ctx.font         = 'bold 12px "Share Tech Mono",monospace';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚠  LEADS OFF — CHECK ELECTRODE CONNECTIONS', W / 2, H / 2);
      return;
    }

    // ── Phosphor trail ────────────────────────────────────────
    // Render as two passes:
    //   Pass 1 (dim tail): older 30% of trail — thin, fading alpha
    //   Pass 2 (bright head): newest 70% — thick, bright, glowing
    const len      = trailPoints.length;
    const splitIdx = Math.floor(len * 0.30);

    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';

    // — Pass 1: dim history tail —
    ctx.lineWidth = 1.5;
    for (let i = 1; i < splitIdx; i++) {
      const t     = i / splitIdx;
      const alpha = Math.pow(t, 2.2) * 0.42;
      ctx.beginPath();
      ctx.shadowBlur  = 0;
      ctx.strokeStyle = _hexAlpha('#00e87a', alpha);
      ctx.moveTo(trailPoints[i-1].x, trailPoints[i-1].y);
      ctx.lineTo(trailPoints[i].x,   trailPoints[i].y);
      ctx.stroke();
    }

    // — Pass 2: bright active head —
    ctx.lineWidth = 2.5;
    for (let i = Math.max(1, splitIdx); i < len; i++) {
      const t     = (i - splitIdx) / Math.max(len - splitIdx, 1);
      const alpha = 0.72 + t * 0.26;           // 0.72 → 0.98
      ctx.beginPath();
      ctx.strokeStyle = _hexAlpha('#00e87a', alpha);
      ctx.shadowColor = 'rgba(0,232,122,0.50)';
      ctx.shadowBlur  = 7 + t * 9;             // 7 → 16 at pen tip
      ctx.moveTo(trailPoints[i-1].x, trailPoints[i-1].y);
      ctx.lineTo(trailPoints[i].x,   trailPoints[i].y);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }

  // ── Utility ───────────────────────────────────────────────────
  function _hexAlpha(hex, a) {
    const r = parseInt(hex.slice(1,3), 16);
    const g = parseInt(hex.slice(3,5), 16);
    const b = parseInt(hex.slice(5,7), 16);
    return `rgba(${r},${g},${b},${a.toFixed(3)})`;
  }

  return { init, pushSamples, checkQRS, setLeadsOff, clearLeadsOff };

})();
