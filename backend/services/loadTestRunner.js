import LoadTest from '../models/LoadTest.js';
import {
  getAppSettings,
  listReadyAiProviders,
  AI_PROVIDER_IDS,
} from '../models/AppSettings.js';

export const MAX_DURATION_SECONDS = 30 * 3600; // 30 hours
export const MAX_CONCURRENCY = 10000;
export const GOD_MODE_MAX_CONCURRENCY = 10000;
export const GOD_MODE_BURST_SIZE = 5;
export const ALL_HTTP_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const LATENCY_SAMPLE_SIZE = 10000;

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
    channelCounts: {},
    errors: {},
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
    agg.errors[result.error] = (agg.errors[result.error] || 0) + 1;
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

  if (agg.latencySample.length < LATENCY_SAMPLE_SIZE) {
    agg.latencySample.push(result.latencyMs);
  } else {
    const idx = Math.floor(Math.random() * agg.totalRequests);
    if (idx < LATENCY_SAMPLE_SIZE) {
      agg.latencySample[idx] = result.latencyMs;
    }
  }
}

function finalizeReport(agg, durationSeconds, meta = {}) {
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

  return {
    totalRequests: total,
    successfulRequests: agg.successfulRequests,
    failedRequests: agg.failedRequests,
    successRate: total ? Math.round((agg.successfulRequests / total) * 1000) / 10 : 0,
    avgLatencyMs: total ? Math.round(agg.latencySum / total) : 0,
    minLatencyMs: total && agg.minLatencyMs !== Infinity ? Math.round(agg.minLatencyMs) : 0,
    maxLatencyMs: Math.round(agg.maxLatencyMs),
    p50LatencyMs: Math.round(percentile(latencies, 50)),
    p95LatencyMs: Math.round(percentile(latencies, 95)),
    p99LatencyMs: Math.round(percentile(latencies, 99)),
    requestsPerSecond: durationSeconds ? Math.round((total / durationSeconds) * 10) / 10 : 0,
    bytesTransferred: agg.bytesTransferred,
    statusCodes: agg.statusCodes,
    methodCounts: agg.methodCounts,
    channelCounts: agg.channelCounts,
    errors: agg.errors,
    timeline,
    timelineBucketSeconds: agg.bucketSize,
    godMode: Boolean(meta.godMode),
    aiProviderChannels: meta.aiProviderChannels || 0,
    aiProvidersUsed: meta.aiProvidersUsed || [],
    effectiveConcurrency: meta.effectiveConcurrency || 0,
    burstSize: meta.burstSize || 1,
  };
}

export function getAiLoadChannels(settings) {
  const ready = listReadyAiProviders(settings);
  if (ready.length) {
    return ready.map((p) => ({ id: p.id, label: p.label || p.id }));
  }
  return AI_PROVIDER_IDS.map((id) => ({ id, label: id }));
}

export async function resolveGodModePlan(settings) {
  const channels = getAiLoadChannels(settings);
  const perChannel = Math.ceil(GOD_MODE_MAX_CONCURRENCY / channels.length);
  const concurrency = Math.min(GOD_MODE_MAX_CONCURRENCY, perChannel * channels.length);
  return {
    godMode: true,
    concurrency,
    mixedMethods: true,
    methods: [...ALL_HTTP_METHODS],
    method: 'MIXED',
    aiProviderChannels: channels.length,
    aiProvidersUsed: channels.map((c) => c.id),
    effectiveConcurrency: concurrency,
    burstSize: GOD_MODE_BURST_SIZE,
    channels,
  };
}

export function validateLoadTestUrl(raw) {
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

export function normalizeMethods(body = {}) {
  if (body.godMode || body.mixedMethods || body.methodMix || String(body.method || '').toUpperCase() === 'MIXED') {
    return {
      methods: [...ALL_HTTP_METHODS],
      mixedMethods: true,
      method: 'MIXED',
    };
  }

  const rawList = Array.isArray(body.methods)
    ? body.methods
    : (body.method ? [body.method] : ['GET']);

  const methods = [...new Set(
    rawList
      .map((m) => String(m || '').trim().toUpperCase())
      .filter((m) => ALL_HTTP_METHODS.includes(m))
  )];

  if (!methods.length) {
    return { methods: ['GET'], mixedMethods: false, method: 'GET' };
  }

  return {
    methods,
    mixedMethods: methods.length > 1,
    method: methods.length > 1 ? 'MIXED' : methods[0],
  };
}

export function clampLoadTestConfig(body = {}, godPlan = null) {
  const durationSeconds = Math.min(
    MAX_DURATION_SECONDS,
    Math.max(5, Number(body.durationSeconds) || 30)
  );

  const godMode = Boolean(body.godMode || godPlan?.godMode);
  let concurrency;
  let aiProviderChannels = 0;
  let aiProvidersUsed = [];
  let burstSize = 1;

  if (godMode && godPlan) {
    concurrency = godPlan.concurrency;
    aiProviderChannels = godPlan.aiProviderChannels;
    aiProvidersUsed = godPlan.aiProvidersUsed;
    burstSize = godPlan.burstSize;
  } else {
    concurrency = Math.min(
      MAX_CONCURRENCY,
      Math.max(1, Number(body.concurrency) || 10)
    );
  }

  const methodConfig = godMode
    ? { methods: [...ALL_HTTP_METHODS], mixedMethods: true, method: 'MIXED' }
    : normalizeMethods(body);

  return {
    durationSeconds,
    concurrency,
    godMode,
    aiProviderChannels,
    aiProvidersUsed,
    burstSize,
    ...methodConfig,
  };
}

async function fireRequest(url, method, options = {}) {
  const {
    timeoutMs = 15000,
    flood = false,
    channel = 'default',
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
        'User-Agent': `VistawinCRM-GodLoad/${channel}`,
        'X-LoadTest-Channel': channel,
        'X-LoadTest-Flood': flood ? '1' : '0',
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(hasBody ? { body: '{}' } : {}),
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

export async function executeLoadTest(testId) {
  const test = await LoadTest.findById(testId);
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

  const agg = createAggregator(test.durationSeconds);
  const startMs = Date.now();
  const endMs = startMs + test.durationSeconds * 1000;
  const burstSize = test.godMode ? GOD_MODE_BURST_SIZE : 1;
  const flood = Boolean(test.godMode);
  const timeoutMs = test.godMode ? 8000 : 15000;

  const methods = (test.methods?.length ? test.methods : [test.method || 'GET'])
    .filter((m) => ALL_HTTP_METHODS.includes(String(m).toUpperCase()));
  const activeMethods = methods.length ? methods : ['GET'];

  const reportMeta = {
    godMode: test.godMode,
    aiProviderChannels: test.aiProviderChannels || channels.length,
    aiProvidersUsed: test.aiProvidersUsed?.length ? test.aiProvidersUsed : channels.map((c) => c.id),
    effectiveConcurrency: test.concurrency,
    burstSize,
  };

  async function worker(workerIndex) {
    const channel = channels[workerIndex % channels.length]?.id || 'default';
    while (Date.now() < endMs && !abort.cancelled) {
      const batch = [];
      for (let i = 0; i < burstSize; i += 1) {
        const method = (test.mixedMethods || activeMethods.length > 1)
          ? activeMethods[Math.floor(Math.random() * activeMethods.length)]
          : activeMethods[0];
        batch.push(fireRequest(test.targetUrl, method, { flood, channel, timeoutMs }));
      }
      const results = await Promise.all(batch);
      const elapsed = Date.now() - startMs;
      results.forEach((result) => recordResult(agg, result, elapsed));
    }
  }

  try {
    const workers = Array.from({ length: test.concurrency }, (_, i) => worker(i));
    await Promise.all(workers);

    if (abort.cancelled) {
      test.status = 'cancelled';
      if (agg.totalRequests > 0) {
        test.report = finalizeReport(agg, Math.max(1, Math.ceil((Date.now() - startMs) / 1000)), reportMeta);
      }
    } else {
      test.status = 'completed';
      test.report = finalizeReport(agg, test.durationSeconds, reportMeta);
    }
  } catch (error) {
    test.status = 'failed';
    test.errorMessage = error.message || 'Load test failed';
  } finally {
    test.finishedAt = new Date();
    await test.save();
    runningTests.delete(String(testId));
  }
}

export function cancelLoadTest(testId) {
  const abort = runningTests.get(String(testId));
  if (abort) abort.cancelled = true;
}

export function isLoadTestRunning(testId) {
  return runningTests.has(String(testId));
}
