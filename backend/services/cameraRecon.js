import net from 'net';
import { validateCameraHost, CAMERA_PORTS, JAM_PROFILES } from './cameraJamRunner.js';
import { buildViewUrls, probeViewUrls } from './cameraView.js';

const SCAN_PORTS = [554, 8554, 80, 8080, 443, 8000, 37777, 8899, 8443, 5540, 9000];
const PROBE_TIMEOUT = 4000;

const HTTP_PATHS = [
  { path: '/', label: 'Root' },
  { path: '/index.html', label: 'Index' },
  { path: '/login.html', label: 'Login page' },
  { path: '/doc/page/login.asp', label: 'Dahua login' },
  { path: '/ISAPI/System/deviceInfo', label: 'Hikvision ISAPI' },
  { path: '/ISAPI/System/status', label: 'Hikvision status' },
  { path: '/onvif/device_service', label: 'ONVIF service' },
  { path: '/cgi-bin/magicBox.cgi?action=getSystemInfo', label: 'Dahua system info' },
  { path: '/cgi-bin/snapshot.cgi', label: 'Snapshot CGI' },
  { path: '/SDK/status', label: 'Hikvision SDK' },
  { path: '/PSIA/System/deviceInfo', label: 'PSIA device info' },
];

function tcpProbe(host, port, timeoutMs = PROBE_TIMEOUT) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = net.connect({ host, port, timeout: timeoutMs });
    const finish = (open, error = null) => {
      resolve({
        port,
        open,
        latencyMs: Date.now() - started,
        error,
      });
    };
    socket.on('connect', () => {
      socket.destroy();
      finish(true);
    });
    socket.on('error', (err) => finish(false, err.message || 'closed'));
    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      finish(false, 'timeout');
    });
  });
}

async function httpProbe(host, port, path, timeoutMs = PROBE_TIMEOUT) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const scheme = port === 443 || port === 8443 ? 'https' : 'http';
  const url = `${scheme}://${host}:${port}${path}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'VistawinCameraRecon/1.0', Connection: 'close' },
    });
    const headers = {};
    response.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    let bodySnippet = '';
    try {
      const text = await response.text();
      bodySnippet = text.slice(0, 2000);
    } catch {
      bodySnippet = '';
    }
    return {
      url,
      path,
      port,
      ok: true,
      status: response.status,
      latencyMs: Date.now() - started,
      headers,
      bodySnippet,
      title: extractTitle(bodySnippet),
    };
  } catch (error) {
    return {
      url,
      path,
      port,
      ok: false,
      status: 0,
      latencyMs: Date.now() - started,
      headers: {},
      bodySnippet: '',
      title: '',
      error: error.name === 'AbortError' ? 'Timeout' : (error.message || 'Failed'),
    };
  } finally {
    clearTimeout(timer);
  }
}

function extractTitle(html) {
  const match = String(html || '').match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim().slice(0, 120) : '';
}

function detectManufacturer(portScan, httpProbes, bodyText) {
  const combined = `${bodyText} ${httpProbes.map((p) => p.bodySnippet).join(' ')}`.toLowerCase();
  const serverHeaders = httpProbes.map((p) => p.headers?.server || '').join(' ').toLowerCase();

  if (combined.includes('hikvision') || serverHeaders.includes('hikvision') || portScan.some((p) => p.port === 8000 && p.open)) {
    return { brand: 'Hikvision', confidence: 'high', model: extractModel(combined, 'hikvision') };
  }
  if (combined.includes('dahua') || combined.includes('dvr') && portScan.some((p) => p.port === 37777 && p.open)) {
    return { brand: 'Dahua', confidence: 'high', model: extractModel(combined, 'dahua') };
  }
  if (combined.includes('onvif') || httpProbes.some((p) => p.path.includes('onvif') && p.ok)) {
    return { brand: 'ONVIF Generic', confidence: 'medium', model: extractOnvifModel(combined) };
  }
  if (combined.includes('axis')) return { brand: 'Axis', confidence: 'medium', model: '' };
  if (combined.includes('reolink')) return { brand: 'Reolink', confidence: 'medium', model: '' };
  if (combined.includes('foscam')) return { brand: 'Foscam', confidence: 'medium', model: '' };
  if (combined.includes('tp-link') || combined.includes('tapo')) return { brand: 'TP-Link/Tapo', confidence: 'medium', model: '' };
  if (portScan.some((p) => p.port === 554 && p.open)) {
    return { brand: 'Unknown IP Camera', confidence: 'low', model: '' };
  }
  return { brand: 'Unknown', confidence: 'none', model: '' };
}

function extractModel(text, brand) {
  const patterns = [
    /model[:\s"']+([A-Z0-9\-_.]+)/i,
    /deviceType[:\s"']+([A-Z0-9\-_.]+)/i,
    /(DS-[A-Z0-9]+)/i,
    /(IPC-[A-Z0-9]+)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1].slice(0, 60);
  }
  return '';
}

function extractOnvifModel(text) {
  const m = text.match(/<tds:Model[^>]*>([^<]+)/i) || text.match(/model[^>]*>([^<]+)/i);
  return m ? m[1].trim().slice(0, 60) : '';
}

function recommendJamProfile(openPorts, manufacturer) {
  const ports = new Set(openPorts.map((p) => p.port));
  if (manufacturer.brand === 'Hikvision' || ports.has(8000)) return 'hikvision_jam';
  if (manufacturer.brand === 'Dahua' || ports.has(37777)) return 'dahua_jam';
  if (ports.has(554) && !ports.has(80)) return 'rtsp_flood';
  if (ports.has(8899) || manufacturer.brand === 'ONVIF Generic') return 'onvif_swarm';
  if (ports.has(80) || ports.has(8080)) return 'http_admin_jam';
  if (ports.size >= 4) return 'multi_port_swarm';
  if (ports.size >= 2) return 'multi_port_swarm';
  return 'rtsp_flood';
}

function buildAttackVectors(host, openPorts, httpProbes) {
  const vectors = [];
  openPorts.forEach(({ port }) => {
    if (port === 554 || port === 8554) {
      vectors.push({ type: 'RTSP', target: `rtsp://${host}:${port}/`, port, priority: 'high' });
    }
    if ([80, 8080, 443, 8443].includes(port)) {
      vectors.push({ type: 'HTTP Admin', target: `http://${host}:${port}/`, port, priority: 'high' });
    }
    if (port === 8000) {
      vectors.push({ type: 'Hikvision SDK', target: `http://${host}:8000/ISAPI/System/status`, port, priority: 'critical' });
    }
    if (port === 37777) {
      vectors.push({ type: 'Dahua Binary', target: `tcp://${host}:37777`, port, priority: 'critical' });
    }
    if (port === 8899) {
      vectors.push({ type: 'ONVIF', target: `http://${host}:8899/onvif/device_service`, port, priority: 'high' });
    }
  });

  httpProbes.filter((p) => p.ok).forEach((p) => {
    vectors.push({
      type: 'HTTP Endpoint',
      target: p.url,
      port: p.port,
      priority: p.status === 401 ? 'critical' : 'medium',
      status: p.status,
      title: p.title,
    });
  });

  const seen = new Set();
  return vectors.filter((v) => {
    const key = v.target;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 20);
}

function computeExposureScore(openPorts, httpProbes, manufacturer) {
  let score = 0;
  score += openPorts.length * 8;
  score += httpProbes.filter((p) => p.ok && p.status === 200).length * 5;
  score += httpProbes.filter((p) => p.ok && p.status === 401).length * 3;
  if (openPorts.some((p) => p.port === 554)) score += 15;
  if (openPorts.some((p) => p.port === 37777 || p.port === 8000)) score += 20;
  if (manufacturer.confidence === 'high') score += 10;
  return Math.min(100, score);
}

export async function gatherCameraIntel(rawHost) {
  const host = validateCameraHost(rawHost);
  const started = Date.now();

  const portScan = await Promise.all(SCAN_PORTS.map((port) => tcpProbe(host, port)));
  const openPorts = portScan.filter((p) => p.open);

  const httpPorts = openPorts
    .map((p) => p.port)
    .filter((port) => [80, 8080, 443, 8443, 8000, 8899].includes(port));

  const httpProbes = [];
  for (const port of httpPorts.slice(0, 4)) {
    const paths = HTTP_PATHS.slice(0, 6);
    const results = await Promise.all(paths.map((item) => httpProbe(host, port, item.path)));
    httpProbes.push(...results.map((r, i) => ({ ...r, label: paths[i].label })));
  }

  const bodyText = httpProbes.map((p) => p.bodySnippet).join(' ');
  const manufacturer = detectManufacturer(openPorts, httpProbes, bodyText);
  const recommendedProfile = recommendJamProfile(openPorts, manufacturer);
  const recommended = JAM_PROFILES[recommendedProfile];
  const attackVectors = buildAttackVectors(host, openPorts, httpProbes);
  const exposureScore = computeExposureScore(openPorts, httpProbes, manufacturer);

  const services = openPorts.map(({ port, latencyMs }) => {
    const names = {
      554: 'RTSP', 8554: 'RTSP Alt', 80: 'HTTP', 8080: 'HTTP Alt', 443: 'HTTPS',
      8000: 'Hikvision SDK', 37777: 'Dahua', 8899: 'ONVIF', 8443: 'HTTPS Alt',
    };
    return { port, service: names[port] || 'Unknown', latencyMs, status: 'open' };
  });

  const rtspUrls = openPorts
    .filter((p) => p.port === 554 || p.port === 8554)
    .map((p) => ({
      url: `rtsp://${host}:${p.port}/Streaming/Channels/101`,
      alt: `rtsp://${host}:${p.port}/live`,
      port: p.port,
    }));

  const viewUrls = buildViewUrls(host, openPorts, manufacturer);
  let viewProbe = null;
  if (viewUrls.length) {
    try {
      viewProbe = await probeViewUrls(host, viewUrls, '', '', 4);
    } catch {
      viewProbe = null;
    }
  }

  return {
    host,
    scannedAt: new Date().toISOString(),
    scanDurationMs: Date.now() - started,
    online: openPorts.length > 0,
    exposureScore,
    manufacturer,
    services,
    openPorts: openPorts.map(({ port, latencyMs }) => ({ port, latencyMs })),
    closedPorts: portScan.filter((p) => !p.open).map((p) => p.port),
    httpProbes: httpProbes.map((p) => ({
      label: p.label,
      url: p.url,
      status: p.status,
      ok: p.ok,
      latencyMs: p.latencyMs,
      title: p.title,
      server: p.headers?.server || '',
      error: p.error || '',
    })),
    rtspUrls,
    viewUrls,
    viewProbe: viewProbe ? {
      bestUrl: viewProbe.bestUrl,
      workingCount: viewProbe.working.length,
      probed: viewProbe.probed,
      working: viewProbe.working.map((w) => ({
        url: w.url,
        label: w.label,
        type: w.type,
        latencyMs: w.latencyMs,
        contentType: w.contentType,
      })),
    } : null,
    attackVectors,
    recommendedProfile,
    recommendedProfileLabel: recommended?.label || recommendedProfile,
    recommendedPorts: recommended?.ports || [],
    recommendedBurst: recommended?.burstSize || 0,
    summary: {
      openPortCount: openPorts.length,
      httpEndpointsFound: httpProbes.filter((p) => p.ok).length,
      attackVectorCount: attackVectors.length,
      primaryVector: attackVectors[0]?.type || 'None detected',
      viewUrlsFound: viewUrls.length,
      liveViewAvailable: Boolean(viewProbe?.bestUrl),
    },
  };
}
