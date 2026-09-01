export const NETWORK_OFFLINE_ERROR =
  'No internet connection. Requests are paused until you are back online.';

const SLOW_THRESHOLD_MS = 1800;
const RTT_SAMPLE_LIMIT = 12;

let pending = 0;
let slow = false;
let slowTimer = null;
let online = typeof navigator !== 'undefined' ? navigator.onLine : true;
let reconnectFlash = false;
let reconnectTimer = null;
let nextRequestId = 0;

const requestStarts = new Map();
const rttSamples = [];

let speed = {
  downlinkMbps: null,
  latencyMs: null,
  quality: 'unknown',
  effectiveType: null,
  measuredAt: null,
  measuring: false,
};

const listeners = new Set();

function average(values) {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, n) => sum + n, 0) / values.length);
}

function qualityFromMetrics(downlinkMbps, latencyMs) {
  if (downlinkMbps == null && latencyMs == null) return 'unknown';
  if ((downlinkMbps != null && downlinkMbps < 1) || (latencyMs != null && latencyMs > 800)) return 'slow';
  if ((downlinkMbps != null && downlinkMbps < 5) || (latencyMs != null && latencyMs > 350)) return 'fair';
  if ((downlinkMbps != null && downlinkMbps < 15) || (latencyMs != null && latencyMs > 150)) return 'good';
  return 'excellent';
}

function snapshot() {
  return {
    pending,
    slow,
    online,
    reconnectFlash,
    loading: pending > 0 && online,
    speed: { ...speed },
    avgRttMs: average(rttSamples),
  };
}

function emit() {
  const state = snapshot();
  listeners.forEach((fn) => fn(state));
}

function pushRtt(ms) {
  if (!Number.isFinite(ms) || ms < 0) return;
  rttSamples.push(Math.round(ms));
  if (rttSamples.length > RTT_SAMPLE_LIMIT) rttSamples.shift();
  if (speed.latencyMs == null) {
    speed = {
      ...speed,
      latencyMs: average(rttSamples),
      quality: qualityFromMetrics(speed.downlinkMbps, average(rttSamples)),
    };
  }
}

export function subscribe(fn) {
  listeners.add(fn);
  fn(snapshot());
  return () => listeners.delete(fn);
}

export function getNetworkState() {
  return snapshot();
}

export function assertOnline() {
  if (!navigator.onLine || !online) {
    throw new Error(NETWORK_OFFLINE_ERROR);
  }
}

export function requestStart() {
  const id = ++nextRequestId;
  if (!online) return id;
  requestStarts.set(id, typeof performance !== 'undefined' ? performance.now() : Date.now());
  pending += 1;
  if (pending === 1) {
    clearTimeout(slowTimer);
    slowTimer = setTimeout(() => {
      slow = true;
      emit();
    }, SLOW_THRESHOLD_MS);
  }
  emit();
  return id;
}

export function requestEnd(id) {
  if (id != null && requestStarts.has(id)) {
    const started = requestStarts.get(id);
    requestStarts.delete(id);
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    pushRtt(now - started);
  }

  pending = Math.max(0, pending - 1);
  if (pending === 0) {
    clearTimeout(slowTimer);
    slowTimer = null;
    slow = false;
  }
  emit();
}

export function setOnlineStatus(isOnline) {
  online = isOnline;

  if (!isOnline) {
    clearTimeout(slowTimer);
    clearTimeout(reconnectTimer);
    slowTimer = null;
    reconnectTimer = null;
    pending = 0;
    slow = false;
    reconnectFlash = false;
    requestStarts.clear();
    speed = {
      ...speed,
      downlinkMbps: 0,
      quality: 'offline',
      measuredAt: Date.now(),
      measuring: false,
    };
  } else {
    reconnectFlash = true;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      reconnectFlash = false;
      emit();
    }, 2600);
  }

  emit();
}

export function setBrowserConnectionHint(connection) {
  if (!connection) return;
  const downlink = Number(connection.downlink);
  const rtt = Number(connection.rtt);
  speed = {
    ...speed,
    effectiveType: connection.effectiveType || speed.effectiveType,
    downlinkMbps: Number.isFinite(downlink) && downlink > 0 ? downlink : speed.downlinkMbps,
    latencyMs: Number.isFinite(rtt) && rtt > 0 ? rtt : speed.latencyMs,
    quality: qualityFromMetrics(
      Number.isFinite(downlink) && downlink > 0 ? downlink : speed.downlinkMbps,
      Number.isFinite(rtt) && rtt > 0 ? rtt : speed.latencyMs
    ),
  };
  emit();
}

export function setSpeedMeasuring(measuring) {
  speed = { ...speed, measuring: Boolean(measuring) };
  emit();
}

export function setMeasuredSpeed({ downlinkMbps, latencyMs, effectiveType } = {}) {
  const nextDownlink = Number.isFinite(downlinkMbps) ? Number(downlinkMbps) : speed.downlinkMbps;
  const nextLatency = Number.isFinite(latencyMs) ? Math.round(latencyMs) : speed.latencyMs;
  if (Number.isFinite(latencyMs)) pushRtt(latencyMs);

  speed = {
    downlinkMbps: nextDownlink,
    latencyMs: nextLatency,
    effectiveType: effectiveType || speed.effectiveType,
    quality: qualityFromMetrics(nextDownlink, nextLatency),
    measuredAt: Date.now(),
    measuring: false,
  };
  emit();
}
