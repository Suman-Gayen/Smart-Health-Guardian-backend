/**
 * ecg.js — Real-Time ECG Waveform Renderer
 *
 * ADC / display-scaling model
 * ────────────────────────────
 * • Firebase stores RAW 12-bit ADC samples: 0 … 4095.
 * • 0 … 4095 is the valid ADC domain.
 * • The renderer dynamically zooms the canvas around the recent ECG
 *   signal instead of assuming a fixed ADC range.
 * • Therefore the renderer works for ECG signals anywhere within
 *   the complete 12-bit ADC range.
 * • 4-tap moving-average filtering is retained.
 * • Full-width scrolling and phosphor/glow effect are retained.
 */

const ECGRenderer = (() => {

  // ── Canvas / context ──────────────────────────────────────────
  let canvas, ctx;
  let W = 0, H = 0;

  // ── Sample queue ──────────────────────────────────────────────
  let sampleQueue = [];

  // ── Loop buffer ──────────────────────────────────────────────
  let loopBuffer = [];
  let loopBufferIdx = 0;

  // ── Trail ─────────────────────────────────────────────────────
  let trailPoints = [];
  const TRAIL_MAX = 3500;

  // ── Pen ───────────────────────────────────────────────────────
  let penX = 0;
  let lastY = null;

  // ── Horizontal ECG speed ──────────────────────────────────────
  const SAMPLE_RATE_HZ = 250;

  const MM_PER_SEC = 50;
  const DPI = 120;

  const PX_PER_SEC =
    MM_PER_SEC * (DPI / 20);

  const PX_PER_SAMPLE =
    PX_PER_SEC / SAMPLE_RATE_HZ;


  // ══════════════════════════════════════════════════════════════
  // ADC DEFINITION
  // ══════════════════════════════════════════════════════════════

  // STM32/ESP32-style 12-bit ADC range
  //
  // Valid raw ADC data:
  //
  // 0 ───────────────────────────── 4095
  //
  const ADC_MIN = 0;
  const ADC_MAX = 4095;


  // ══════════════════════════════════════════════════════════════
  // LOW-PASS FILTER
  // ══════════════════════════════════════════════════════════════

  const LP_TAPS = 4;
  let lpBuf = [];

  function _lpFilter(value) {

    lpBuf.push(value);

    if (lpBuf.length > LP_TAPS) {
      lpBuf.shift();
    }

    return lpBuf.reduce(
      (sum, x) => sum + x,
      0
    ) / lpBuf.length;
  }


  // ══════════════════════════════════════════════════════════════
  // DYNAMIC VERTICAL SCALING
  // ══════════════════════════════════════════════════════════════
  //
  // IMPORTANT:
  //
  // ADC range is ALWAYS:
  //
  // 0 → 4095
  //
  // But we don't display the entire 0→4095 range because an ECG
  // waveform usually occupies only a small portion of it.
  //
  // Instead, we dynamically calculate a display window around the
  // recent ECG signal.
  //

  let autoMin = ADC_MIN;
  let autoMax = ADC_MAX;

  // Approximately 2 seconds of ECG data.
  const SCALE_WINDOW_SAMPLES =
    SAMPLE_RATE_HZ * 2;

  // Update display scaling every 25 samples.
  const SCALE_UPDATE_EVERY = 25;

  // Prevent excessive zooming into tiny ADC noise.
  const MIN_DISPLAY_RANGE = 10;

  // Extra vertical headroom around waveform.
  const DISPLAY_MARGIN = 0;

  // Quickly expand when ECG amplitude increases.
  const SCALE_ATTACK = 0.18;

  // Slowly contract when ECG amplitude decreases.
  const SCALE_RELEASE = 0.025;

  let scaleSamples = [];

  let scaleUpdateCounter = 0;

  let scaleInitialized = false;


  // ══════════════════════════════════════════════════════════════
  // ADC CLAMP
  // ══════════════════════════════════════════════════════════════

  function _clampADC(value) {

    const n = Number(value);

    if (!Number.isFinite(n)) {
      return null;
    }

    return Math.max(
      ADC_MIN,
      Math.min(ADC_MAX, n)
    );
  }


  // ══════════════════════════════════════════════════════════════
  // STORE RECENT SAMPLES FOR AUTO SCALING
  // ══════════════════════════════════════════════════════════════

  function _addScaleSamples(arr) {

    for (const value of arr) {

      const adc = _clampADC(value);

      if (adc === null) {
        continue;
      }

      scaleSamples.push(adc);
    }

    // Keep only the latest ~2 seconds.
    if (scaleSamples.length >
        SCALE_WINDOW_SAMPLES) {

      scaleSamples =
        scaleSamples.slice(
          -SCALE_WINDOW_SAMPLES
        );
    }
  }


  // ══════════════════════════════════════════════════════════════
  // CALCULATE TARGET DISPLAY RANGE
  // ══════════════════════════════════════════════════════════════

  function _calculateDisplayRange() {

    if (scaleSamples.length < 2) {
      return null;
    }

    let min = ADC_MAX;
    let max = ADC_MIN;

    for (const value of scaleSamples) {

      if (value < min) {
        min = value;
      }

      if (value > max) {
        max = value;
      }
    }

    let signalRange = max - min;

    // Don't zoom excessively into very small noise.
    signalRange =
      Math.max(
        signalRange,
        MIN_DISPLAY_RANGE
      );


    const center =
      (min + max) / 2;


    // Add headroom above and below waveform.
    const displayRange =
      Math.min(
        signalRange *
          (1 + DISPLAY_MARGIN * 2),

        ADC_MAX - ADC_MIN
      );


    let targetMin =
      center - displayRange / 2;

    let targetMax =
      center + displayRange / 2;


    // Keep display window inside ADC range.
    if (targetMin < ADC_MIN) {

      targetMax +=
        ADC_MIN - targetMin;

      targetMin = ADC_MIN;
    }


    if (targetMax > ADC_MAX) {

      targetMin -=
        targetMax - ADC_MAX;

      targetMax = ADC_MAX;
    }


    targetMin =
      Math.max(
        ADC_MIN,
        targetMin
      );

    targetMax =
      Math.min(
        ADC_MAX,
        targetMax
      );


    return {
      min: targetMin,
      max: targetMax
    };
  }


  // ══════════════════════════════════════════════════════════════
  // UPDATE DYNAMIC SCALE
  // ══════════════════════════════════════════════════════════════

  function _updateAutoScale(force = false) {

    if (
      !force &&
      ++scaleUpdateCounter <
      SCALE_UPDATE_EVERY
    ) {
      return;
    }

    scaleUpdateCounter = 0;


    const target =
      _calculateDisplayRange();


    if (!target) {
      return;
    }


    // First valid ECG data.
    if (
      !scaleInitialized ||
      force
    ) {

      autoMin = target.min;
      autoMax = target.max;

      scaleInitialized = true;

      return;
    }


    // Expand quickly if waveform amplitude increases.
    const minAlpha =
      target.min < autoMin
        ? SCALE_ATTACK
        : SCALE_RELEASE;


    const maxAlpha =
      target.max > autoMax
        ? SCALE_ATTACK
        : SCALE_RELEASE;


    autoMin +=
      (target.min - autoMin) *
      minAlpha;


    autoMax +=
      (target.max - autoMax) *
      maxAlpha;


    // Final safety clamp.
    autoMin =
      Math.max(
        ADC_MIN,
        Math.min(
          ADC_MAX,
          autoMin
        )
      );


    autoMax =
      Math.max(
        ADC_MIN,
        Math.min(
          ADC_MAX,
          autoMax
        )
      );


    // Never allow zero/very-small display range.
    if (
      autoMax - autoMin <
      MIN_DISPLAY_RANGE
    ) {

      const center =
        (autoMin + autoMax) / 2;


      autoMin =
        Math.max(
          ADC_MIN,
          center -
            MIN_DISPLAY_RANGE / 2
        );


      autoMax =
        Math.min(
          ADC_MAX,
          center +
            MIN_DISPLAY_RANGE / 2
        );
    }
  }


  // ══════════════════════════════════════════════════════════════
  // ADC → CANVAS Y
  // ══════════════════════════════════════════════════════════════

  const AMPLITUDE_GAIN = 1.2;


  function _sampleToY(rawADC) {

    const adc =
      _clampADC(rawADC);


    if (adc === null) {

      return lastY !== null
        ? lastY
        : H / 2;
    }


    // Smooth ADC noise.
    const value =
      _lpFilter(adc);


    // Update vertical display scale.
    _updateAutoScale();


    const range =
      Math.max(
        autoMax - autoMin,
        MIN_DISPLAY_RANGE
      );


    const center =
      (autoMax + autoMin) / 2;


    // Convert ADC value to normalized canvas position.
    const norm =
      0.5 -
      (
        (value - center) /
        (range / AMPLITUDE_GAIN)
      );


    const margin =
      H * 0.07;


    return Math.max(
      margin,

      Math.min(
        H - margin,

        margin +
        norm *
        (H - margin * 2)
      )
    );
  }


  // ══════════════════════════════════════════════════════════════
  // OTHER STATE
  // ══════════════════════════════════════════════════════════════

  let leadsOff = false;

  const QUEUE_MAX = 750;

  let pxAcc = 0;

  let rafId = null;


  // ══════════════════════════════════════════════════════════════
  // INIT
  // ══════════════════════════════════════════════════════════════

  function init() {

    canvas =
      document.getElementById(
        'ecg-canvas'
      );


    if (!canvas) {
      return;
    }


    ctx =
      canvas.getContext('2d');


    _resize();


    window.addEventListener(
      'resize',
      _resize
    );


    _loop();
  }


  // ══════════════════════════════════════════════════════════════
  // RECEIVE ECG SAMPLES
  // ══════════════════════════════════════════════════════════════

  function pushSamples(arr) {

    if (
      !Array.isArray(arr) ||
      arr.length === 0
    ) {
      return;
    }


    const clean = [];


    // Validate incoming ADC values.
    for (const value of arr) {

      const adc =
        _clampADC(value);


      if (adc === null) {
        continue;
      }


      clean.push(adc);
    }


    if (clean.length === 0) {
      return;
    }


    // Prevent queue from becoming excessively large.
    if (
      sampleQueue.length >
      QUEUE_MAX
    ) {

      sampleQueue =
        sampleQueue.slice(
          -SAMPLE_RATE_HZ
        );
    }


    // Add samples to rendering queue.
    clean.forEach(
      value =>
        sampleQueue.push(value)
    );


    // Save latest valid batch for temporary DB gaps.
    loopBuffer =
      clean.slice();


    // Add data to dynamic scaling window.
    _addScaleSamples(clean);


    // Establish first display scale immediately.
    if (!scaleInitialized) {

      _updateAutoScale(true);
    }


    // Pulse indicator.
    checkQRS(clean);


    leadsOff = false;
  }


  // ══════════════════════════════════════════════════════════════
  // LEADS OFF
  // ══════════════════════════════════════════════════════════════

  function setLeadsOff() {

    leadsOff = true;

    sampleQueue = [];
  }


  function clearLeadsOff() {

    leadsOff = false;
  }


  // ══════════════════════════════════════════════════════════════
  // QRS / PULSE INDICATOR
  // ══════════════════════════════════════════════════════════════
  //
  // IMPORTANT:
  //
  // We DO NOT use:
  //
  //     value > 3000
  //
  // because the ECG baseline can exist anywhere inside 0–4095.
  //
  // This is only a visual pulse indication.
  // It is NOT a clinical heart-rate detector.
  //

  let qrsLastTrigger = 0;

  const QRS_COOLDOWN_MS = 250;

  const QRS_MIN_EXCURSION = 35;


  function checkQRS(arr) {

    if (
      !Array.isArray(arr) ||
      arr.length < 3
    ) {
      return;
    }


    let min = ADC_MAX;
    let max = ADC_MIN;


    for (const value of arr) {

      const adc =
        _clampADC(value);


      if (adc === null) {
        continue;
      }


      if (adc < min) {
        min = adc;
      }


      if (adc > max) {
        max = adc;
      }
    }


    // Ignore tiny noise fluctuations.
    if (
      max - min <
      QRS_MIN_EXCURSION
    ) {
      return;
    }


    const now =
      performance.now();


    if (
      now - qrsLastTrigger <
      QRS_COOLDOWN_MS
    ) {
      return;
    }


    qrsLastTrigger = now;


    const dot =
      document.getElementById(
        'pulse-indicator'
      );


    if (!dot) {
      return;
    }


    dot.classList.add('on');


    clearTimeout(dot._t);


    dot._t =
      setTimeout(
        () =>
          dot.classList.remove('on'),
        150
      );
  }


  // ══════════════════════════════════════════════════════════════
  // RESIZE CANVAS
  // ══════════════════════════════════════════════════════════════

  function _resize() {

    const wrapper =
      canvas.parentElement;


    W =
      wrapper.clientWidth ||
      800;


    H =
      wrapper.clientHeight ||
      220;


    canvas.width = W;
    canvas.height = H;


    trailPoints = [];

    lpBuf = [];

    pxAcc = 0;


    // Keep current dynamic scale.
    const midY =
      H / 2;


    const nPrefill =
      Math.ceil(
        W / PX_PER_SAMPLE
      ) + 10;


    for (
      let i = 0;
      i < nPrefill;
      i++
    ) {

      trailPoints.push({
        x:
          i * PX_PER_SAMPLE,

        y:
          midY
      });
    }


    penX = W;

    lastY = midY;
  }


  // ══════════════════════════════════════════════════════════════
  // MAIN ECG LOOP
  // ══════════════════════════════════════════════════════════════

  function _loop() {

    pxAcc +=
      PX_PER_SEC / 60;


    const samplesToConsume =
      Math.floor(
        pxAcc /
        PX_PER_SAMPLE
      );


    pxAcc -=
      samplesToConsume *
      PX_PER_SAMPLE;


    for (
      let i = 0;
      i < samplesToConsume;
      i++
    ) {

      let y;


      // ─────────────────────────────────────
      // LEADS OFF
      // ─────────────────────────────────────

      if (leadsOff) {

        y = H / 2;
      }


      // ─────────────────────────────────────
      // REAL FIREBASE DATA
      // ─────────────────────────────────────

      else if (
        sampleQueue.length > 0
      ) {

        const sample =
          sampleQueue.shift();


        y =
          _sampleToY(sample);


        lastY = y;
      }


      // ─────────────────────────────────────
      // TEMPORARY DATABASE GAP
      // ─────────────────────────────────────

      else if (
        loopBuffer.length > 0
      ) {

        const sample =
          loopBuffer[
            loopBufferIdx %
            loopBuffer.length
          ];


        loopBufferIdx++;


        y =
          _sampleToY(sample);


        lastY = y;
      }


      // ─────────────────────────────────────
      // NO DATA
      // ─────────────────────────────────────

      else {

        y =
          lastY !== null
            ? lastY
            : H / 2;
      }


      // Add point to ECG trail.
      trailPoints.push({
        x: penX,
        y: y
      });


      penX +=
        PX_PER_SAMPLE;


      if (
        trailPoints.length >
        TRAIL_MAX
      ) {

        trailPoints.shift();
      }
    }


    // ─────────────────────────────────────
    // WRAP / SCROLL
    // ─────────────────────────────────────

    if (penX > W) {

      const shift =
        penX - W;


      trailPoints =
        trailPoints
          .map(point => ({
            x:
              point.x - shift,

            y:
              point.y
          }))
          .filter(
            point =>
              point.x >=
              -PX_PER_SAMPLE
          );


      penX = W;
    }


    _render();


    rafId =
      requestAnimationFrame(
        _loop
      );
  }


  // ══════════════════════════════════════════════════════════════
  // RENDER ECG
  // ══════════════════════════════════════════════════════════════

  function _render() {

    ctx.clearRect(
      0,
      0,
      W,
      H
    );


    if (
      trailPoints.length < 2
    ) {
      return;
    }


    // ─────────────────────────────────────
    // ERASE AREA AHEAD OF PEN
    // ─────────────────────────────────────

    const eraseW =
      Math.ceil(
        PX_PER_SEC * 0.20
      );


    ctx.fillStyle =
      '#040a07';


    ctx.fillRect(
      penX,
      0,
      eraseW,
      H
    );


    // ─────────────────────────────────────
    // CURSOR LINE
    // ─────────────────────────────────────

    ctx.beginPath();


    ctx.strokeStyle =
      'rgba(0,232,122,0.10)';


    ctx.lineWidth = 1;


    ctx.moveTo(
      penX,
      0
    );


    ctx.lineTo(
      penX,
      H
    );


    ctx.stroke();


    // ─────────────────────────────────────
    // LEADS OFF DISPLAY
    // ─────────────────────────────────────

    if (leadsOff) {

      ctx.fillStyle =
        'rgba(255,61,90,0.07)';


      ctx.fillRect(
        0,
        0,
        W,
        H
      );


      ctx.fillStyle =
        '#ff3d5a';


      ctx.font =
        'bold 12px "Share Tech Mono",monospace';


      ctx.textAlign = 'center';

      ctx.textBaseline = 'middle';


      ctx.fillText(
        '⚠  LEADS OFF — CHECK ELECTRODE CONNECTIONS',
        W / 2,
        H / 2
      );


      return;
    }


    // ═════════════════════════════════════
    // PHOSPHOR ECG TRAIL
    // ═════════════════════════════════════

    const len =
      trailPoints.length;


    const splitIdx =
      Math.floor(
        len * 0.30
      );


    ctx.lineCap = 'round';

    ctx.lineJoin = 'round';


    // ─────────────────────────────────────
    // OLD / DIM ECG HISTORY
    // ─────────────────────────────────────

    ctx.lineWidth = 1.5;


    for (
      let i = 1;
      i < splitIdx;
      i++
    ) {

      const t =
        i / splitIdx;


      const alpha =
        Math.pow(
          t,
          2.2
        ) * 0.42;


      ctx.beginPath();


      ctx.shadowBlur = 0;


      ctx.strokeStyle =
        _hexAlpha(
          '#00e87a',
          alpha
        );


      ctx.moveTo(
        trailPoints[i - 1].x,
        trailPoints[i - 1].y
      );


      ctx.lineTo(
        trailPoints[i].x,
        trailPoints[i].y
      );


      ctx.stroke();
    }


    // ─────────────────────────────────────
    // NEW / BRIGHT ECG HEAD
    // ─────────────────────────────────────

    ctx.lineWidth = 2.5;


    for (
      let i =
        Math.max(
          1,
          splitIdx
        );

      i < len;

      i++
    ) {

      const t =
        (
          i - splitIdx
        ) /
        Math.max(
          len - splitIdx,
          1
        );


      const alpha =
        0.72 +
        t * 0.26;


      ctx.beginPath();


      ctx.strokeStyle =
        _hexAlpha(
          '#00e87a',
          alpha
        );


      ctx.shadowColor =
        'rgba(0,232,122,0.50)';


      ctx.shadowBlur =
        7 + t * 9;


      ctx.moveTo(
        trailPoints[i - 1].x,
        trailPoints[i - 1].y
      );


      ctx.lineTo(
        trailPoints[i].x,
        trailPoints[i].y
      );


      ctx.stroke();
    }


    ctx.shadowBlur = 0;
  }


  // ══════════════════════════════════════════════════════════════
  // COLOR UTILITY
  // ══════════════════════════════════════════════════════════════

  function _hexAlpha(hex, alpha) {

    const r =
      parseInt(
        hex.slice(1, 3),
        16
      );


    const g =
      parseInt(
        hex.slice(3, 5),
        16
      );


    const b =
      parseInt(
        hex.slice(5, 7),
        16
      );


    return (
      `rgba(${r},${g},${b},${alpha.toFixed(3)})`
    );
  }


  // ══════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════

  return {

    init,

    pushSamples,

    checkQRS,

    setLeadsOff,

    clearLeadsOff

  };

})();