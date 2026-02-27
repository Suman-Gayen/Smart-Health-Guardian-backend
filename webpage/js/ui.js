/**
 * ui.js — UI Utilities & App Init
 * ════════════════════════════════
 * Handles: live clock, connection status badge, ECG init.
 * This file runs last (per script order in index.html).
 */

const UI = (() => {

  // ── Live Clock ────────────────────────────────────────
  function _startClock() {
    function tick() {
      const now   = new Date();
      const tEl   = document.getElementById('clock-time');
      const dEl   = document.getElementById('clock-date');

      if (tEl) tEl.textContent = now.toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      });
      if (dEl) dEl.textContent = now.toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric'
      }).toUpperCase();
    }
    tick();
    setInterval(tick, 1000);
  }

  // ── Connection Status ─────────────────────────────────
  function setStatus(state) {
    const dot   = document.getElementById('connection-dot');
    const label = document.getElementById('connection-label');
    if (!dot || !label) return;

    dot.className = 'status-dot';   // reset

    const MAP = {
      connecting: { cls: '',     text: 'Connecting…'  },
      live:       { cls: 'live', text: 'Live'          },
      demo:       { cls: 'live', text: 'Demo Mode'     },
      error:      { cls: 'error',text: 'Disconnected'  }
    };
    const s = MAP[state] || MAP.connecting;
    if (s.cls) dot.classList.add(s.cls);
    label.textContent = s.text;
  }

  // ── App Init ──────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    _startClock();
    ECGRenderer.init();
  });

  return { setStatus };
})();

// ── Download Report ────────────────────────────────────
function downloadReport() {
  // Read the patient ID currently shown in the banner
  const patientId = document.getElementById('patient-id')?.textContent?.trim();

  if (!patientId || patientId === '---') {
    alert('No patient loaded yet. Please wait for data to arrive.');
    return;
  }
  const url = `https://smart-health-api-m32s.onrender.com/download/${patientId}`;
  const btn = document.getElementById('btn-download');

  // Visual feedback while the download triggers
  if (btn) {
    btn.classList.add('loading');
    btn.textContent = '⏳ Requesting…';
  }

  // Open the download URL in a new tab
  // The browser will handle the file download automatically
  const link = document.createElement('a');
  link.href   = url;
  link.target = '_blank';          // opens in new tab; if API returns a file, browser downloads it
  link.rel    = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Restore button after short delay
  setTimeout(() => {
    if (btn) {
      btn.classList.remove('loading');
      btn.innerHTML = '<span class="btn-icon">⬇</span> Download Report';
    }
  }, 2000);
}
