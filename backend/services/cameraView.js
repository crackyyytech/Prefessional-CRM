import { validateCameraHost } from './cameraJamRunner.js';

const ALLOWED_PORTS = new Set([80, 8080, 443, 8443, 8000, 8899, 5540, 9000, 554, 8554]);
const PREVIEW_TIMEOUT = 8000;

const VIEW_PATHS = {
  hikvision: [
    { path: '/ISAPI/Streaming/channels/101/picture', label: 'Hikvision snapshot CH101', type: 'snapshot' },
    { path: '/ISAPI/Streaming/channels/1/picture', label: 'Hikvision snapshot CH1', type: 'snapshot' },
    { path: '/Streaming/channels/1/picture', label: 'Hikvision legacy snapshot', type: 'snapshot' },
  ],
  dahua: [
    { path: '/cgi-bin/snapshot.cgi', label: 'Dahua snapshot', type: 'snapshot' },
    { path: '/cgi-bin/currentpic.cgi', label: 'Dahua current picture', type: 'snapshot' },
  ],
  onvif: [
    { path: '/onvif/snapshot', label: 'ONVIF snapshot', type: 'snapshot' },
    { path: '/snapshot.jpg', label: 'ONVIF JPG', type: 'snapshot' },
  ],
  axis: [
    { path: '/axis-cgi/jpg/image.cgi', label: 'Axis snapshot', type: 'snapshot' },
    { path: '/axis-cgi/mjpg/video.cgi', label: 'Axis MJPEG', type: 'mjpeg' },
  ],
  generic: [
    { path: '/cgi-bin/snapshot.cgi', label: 'CGI snapshot', type: 'snapshot' },
    { path: '/snapshot.jpg', label: 'Snapshot JPG', type: 'snapshot' },
    { path: '/jpg/image.jpg', label: 'JPG image', type: 'snapshot' },
    { path: '/tmpfs/auto.jpg', label: 'Auto JPG', type: 'snapshot' },
    { path: '/cgi-bin/currentpic.cgi', label: 'Current picture', type: 'snapshot' },
    { path: '/video/mjpg.cgi', label: 'MJPEG stream', type: 'mjpeg' },
    { path: '/cgi-bin/mjpg/video.cgi?channel=0&subtype=1', label: 'MJPEG channel 0', type: 'mjpeg' },
  ],
};

function schemeForPort(port) {
  return port === 443 || port === 8443 ? 'https' : 'http';
}

export function buildViewUrls(host, openPorts = [], manufacturer = {}) {
  const brand = (manufacturer.brand || '').toLowerCase();
  const httpPorts = openPorts
    .map((p) => (typeof p === 'object' ? p.port : p))
    .filter((port) => [80, 8080, 443, 8443, 8000, 8899].includes(port));

  const paths = [];
  if (brand.includes('hikvision') || httpPorts.includes(8000)) paths.push(...VIEW_PATHS.hikvision);
  if (brand.includes('dahua') || openPorts.some((p) => (p.port ?? p) === 37777)) paths.push(...VIEW_PATHS.dahua);
  if (brand.includes('onvif')) paths.push(...VIEW_PATHS.onvif);
  if (brand.includes('axis')) paths.push(...VIEW_PATHS.axis);
  paths.push(...VIEW_PATHS.generic);

  const ports = httpPorts.length ? httpPorts : [80, 8080];
  const urls = [];
  const seen = new Set();

  for (const port of ports.slice(0, 3)) {
    for (const item of paths) {
      const url = `${schemeForPort(port)}://${host}:${port}${item.path}`;
      if (seen.has(url)) continue;
      seen.add(url);
      urls.push({ url, label: item.label, type: item.type, port });
    }
  }

  return urls.slice(0, 24);
}

export function validateViewUrl(host, viewUrl) {
  const normalizedHost = validateCameraHost(host);
  let parsed;
  try {
    parsed = new URL(viewUrl);
  } catch {
    throw new Error('Invalid camera view URL');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only HTTP/HTTPS camera URLs are allowed');
  }

  const urlHost = parsed.hostname.replace(/^\[/, '').replace(/\]$/, '');
  if (urlHost !== normalizedHost && urlHost !== `[${normalizedHost}]`) {
    throw new Error('View URL must target the same camera host');
  }

  const port = parsed.port ? Number(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80);
  if (!ALLOWED_PORTS.has(port)) {
    throw new Error(`Port ${port} is not allowed for camera preview`);
  }

  return { host: normalizedHost, url: parsed.toString(), port };
}

async function fetchPreviewOnce(viewUrl, username, password) {
  const headers = { 'User-Agent': 'VistawinCameraView/1.0', Connection: 'close' };
  if (username) {
    headers.Authorization = `Basic ${Buffer.from(`${username}:${password || ''}`).toString('base64')}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PREVIEW_TIMEOUT);

  try {
    const response = await fetch(viewUrl, { method: 'GET', headers, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Camera returned HTTP ${response.status}`);
    }

    const contentType = (response.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 128) {
      throw new Error('Camera returned empty or invalid image data');
    }

    const isImage = contentType.startsWith('image/') || contentType.includes('octet-stream');
    const isMjpeg = contentType.includes('multipart');
    if (!isImage && !isMjpeg) {
      throw new Error(`Unsupported content type: ${contentType}`);
    }

    return { buffer, contentType, size: buffer.length };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchCameraPreview({ targetHost, viewUrl, username, password }) {
  const { url } = validateViewUrl(targetHost, viewUrl);
  return fetchPreviewOnce(url, username, password);
}

export async function probeViewUrls(targetHost, viewUrls = [], username, password, limit = 5) {
  const host = validateCameraHost(targetHost);
  const results = [];

  for (const item of viewUrls.slice(0, limit)) {
    const started = Date.now();
    try {
      validateViewUrl(host, item.url);
      const preview = await fetchPreviewOnce(item.url, username, password);
      results.push({
        ...item,
        ok: true,
        latencyMs: Date.now() - started,
        contentType: preview.contentType,
        size: preview.size,
      });
      if (results.filter((r) => r.ok).length >= 2) break;
    } catch (error) {
      results.push({
        ...item,
        ok: false,
        latencyMs: Date.now() - started,
        error: error.message || 'Failed',
      });
    }
  }

  const working = results.filter((r) => r.ok);
  return {
    host,
    probed: results.length,
    working,
    bestUrl: working[0]?.url || null,
    results,
  };
}
