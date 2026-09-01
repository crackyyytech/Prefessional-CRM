import {
  assertOnline,
  setMeasuredSpeed,
  setSpeedMeasuring,
} from './networkBus.js';

const PROBE_INTERVAL_MS = 30000;
let probeTimer = null;
let probing = false;
let enabled = false;

function roundMbps(value) {
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

async function measureOnce() {
  if (!enabled || probing) return null;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return null;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return null;

  probing = true;
  setSpeedMeasuring(true);

  try {
    assertOnline();

    const pingStart = performance.now();
    const pingRes = await fetch(`/api/ping?_=${Date.now()}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!pingRes.ok) throw new Error('Ping failed');
    await pingRes.json().catch(() => ({}));
    const latencyMs = performance.now() - pingStart;

    const dlStart = performance.now();
    const dlRes = await fetch(`/api/speed-probe?_=${Date.now()}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (!dlRes.ok) throw new Error('Speed probe failed');
    const buffer = await dlRes.arrayBuffer();
    const elapsedSec = Math.max((performance.now() - dlStart) / 1000, 0.001);
    const bytes = buffer.byteLength || Number(dlRes.headers.get('X-Probe-Bytes')) || 0;
    const downlinkMbps = roundMbps((bytes * 8) / (elapsedSec * 1_000_000));

    const result = {
      downlinkMbps,
      latencyMs: Math.round(latencyMs),
      effectiveType: navigator.connection?.effectiveType || null,
    };
    setMeasuredSpeed(result);
    return result;
  } catch {
    setSpeedMeasuring(false);
    return null;
  } finally {
    probing = false;
  }
}

export function startNetworkSpeedMonitor() {
  enabled = true;
  if (probeTimer) return () => stopNetworkSpeedMonitor();

  measureOnce();
  probeTimer = setInterval(() => {
    measureOnce();
  }, PROBE_INTERVAL_MS);

  const onVisibility = () => {
    if (document.visibilityState === 'visible' && enabled) measureOnce();
  };
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    stopNetworkSpeedMonitor();
  };
}

export function stopNetworkSpeedMonitor() {
  enabled = false;
  clearInterval(probeTimer);
  probeTimer = null;
  setSpeedMeasuring(false);
}

export function refreshNetworkSpeed() {
  enabled = true;
  return measureOnce();
}
