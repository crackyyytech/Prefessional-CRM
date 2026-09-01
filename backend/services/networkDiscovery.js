import os from 'os';
import net from 'net';
import dns from 'dns/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const PROBE_PORTS = [
  { port: 80, service: 'HTTP' },
  { port: 443, service: 'HTTPS' },
  { port: 445, service: 'SMB' },
  { port: 22, service: 'SSH' },
  { port: 135, service: 'RPC' },
  { port: 139, service: 'NetBIOS' },
  { port: 3389, service: 'RDP' },
  { port: 8080, service: 'HTTP-Alt' },
  { port: 8443, service: 'HTTPS-Alt' },
  { port: 53, service: 'DNS' },
  { port: 548, service: 'AFP' },
  { port: 5555, service: 'ADB' },
  { port: 62078, service: 'iPhone' },
  { port: 7000, service: 'AirPlay' },
  { port: 9100, service: 'Printer' },
];

const PROBE_TIMEOUT_MS = 260;
const HOST_CONCURRENCY = 56;
const PING_CONCURRENCY = 64;

const OUI_VENDORS = {
  '00:50:56': 'VMware',
  '00:0c:29': 'VMware',
  '00:1a:11': 'Google',
  '00:1b:63': 'Apple',
  '00:1c:b3': 'Apple',
  '00:1e:c2': 'Apple',
  '00:23:12': 'Apple',
  '00:25:00': 'Apple',
  '00:26:4a': 'Apple',
  '00:26:bb': 'Apple',
  '04:0c:ce': 'Apple',
  '0c:74:c2': 'Apple',
  '18:65:90': 'Apple',
  '28:cf:e9': 'Apple',
  '3c:15:c2': 'Apple',
  '40:6c:8f': 'Apple',
  '58:55:ca': 'Apple',
  '70:48:0f': 'Apple',
  '78:31:c1': 'Apple',
  '88:63:df': 'Apple',
  'a4:83:e7': 'Apple',
  'ac:bc:32': 'Apple',
  'b8:e8:56': 'Apple',
  'c8:bc:c8': 'Apple',
  'd0:03:4b': 'Apple',
  'dc:a6:32': 'Raspberry Pi',
  'b8:27:eb': 'Raspberry Pi',
  'e4:5f:01': 'Raspberry Pi',
  '00:14:22': 'Dell',
  '00:1e:4f': 'Dell',
  '00:21:70': 'Dell',
  '00:24:e8': 'Dell',
  '14:18:77': 'Dell',
  '18:03:73': 'Dell',
  '24:b6:fd': 'Dell',
  '34:17:eb': 'Dell',
  'f0:1f:af': 'Dell',
  '00:15:5d': 'Microsoft Hyper-V',
  '00:03:ff': 'Microsoft',
  '00:50:f2': 'Microsoft',
  '28:18:78': 'Microsoft',
  '00:e0:4c': 'Realtek',
  '52:54:00': 'QEMU/KVM',
  '08:00:27': 'VirtualBox',
  '00:1c:42': 'Parallels',
  '00:16:3e': 'Xen',
  'f4:f5:d8': 'Google',
  '3c:5a:b4': 'Google',
  '94:eb:2c': 'Google',
  'a4:77:33': 'Google',
  '00:1d:0f': 'TP-Link',
  '14:cc:20': 'TP-Link',
  '50:c7:bf': 'TP-Link',
  '60:e3:27': 'TP-Link',
  '98:da:c4': 'TP-Link',
  'ac:84:c6': 'TP-Link',
  'c0:25:e9': 'TP-Link',
  'ec:08:6b': 'TP-Link',
  '00:18:e7': 'Netgear',
  '20:4e:7f': 'Netgear',
  '28:c6:8e': 'Netgear',
  'a0:04:60': 'Netgear',
  'c4:04:15': 'Netgear',
  'e0:46:9a': 'Netgear',
  '00:1e:58': 'D-Link',
  '00:26:5a': 'D-Link',
  '1c:7e:e5': 'D-Link',
  '28:10:7b': 'D-Link',
  '34:08:04': 'D-Link',
  '00:90:a9': 'Western Digital',
  '00:14:d1': 'TRENDnet',
  '00:1f:33': 'Netgear',
  'e8:65:d4': 'Tenda',
  'bc:fc:e7': 'Samsung',
  'f4:f5:e8': 'Google',
  'ac:67:b2': 'Espressif',
  '24:0a:c4': 'Espressif',
  'b0:be:83': 'Apple',
  'f0:18:98': 'Apple',
  'fc:e9:98': 'Apple',
  'a0:93:51': 'Xiaomi',
  '64:cc:2e': 'Xiaomi',
  '28:6c:07': 'Xiaomi',
  '34:ce:00': 'Xiaomi',
  'fc:64:ba': 'Xiaomi',
  'd8:63:75': 'Xiaomi',
  'e4:46:da': 'Xiaomi',
  '48:2c:a0': 'Xiaomi',
  'c8:63:14': 'Motorola',
  '00:26:e8': 'Murata/WiFi',
};

function ipToInt(ip) {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function intToIp(num) {
  return [
    (num >>> 24) & 255,
    (num >>> 16) & 255,
    (num >>> 8) & 255,
    num & 255,
  ].join('.');
}

function cidrFromNetmask(address, netmask) {
  const maskBits = netmask
    .split('.')
    .map(Number)
    .reduce((bits, octet) => bits + octet.toString(2).split('1').length - 1, 0);
  return `${address}/${maskBits}`;
}

function isPrivateIpv4(ip) {
  const n = ipToInt(ip);
  return (
    (n >>> 24) === 10
    || ((n >>> 24) === 172 && ((n >>> 16) & 0xff) >= 16 && ((n >>> 16) & 0xff) <= 31)
    || ((n >>> 24) === 192 && ((n >>> 16) & 0xff) === 168)
  );
}

function classifyInterfaceKind(name = '') {
  const n = String(name).toLowerCase();
  if (/wi-?fi|wlan|wireless|802\.11|wifi/i.test(n)) return 'wifi';
  if (/ethernet|eth|lan|realtek.*pcie|gigabit/i.test(n)) return 'ethernet';
  if (/bluetooth|vmware|virtual|hyper-v|loopback|vethernet/i.test(n)) return 'virtual';
  return 'other';
}

export function listLocalInterfaces() {
  const ifaces = os.networkInterfaces();
  const out = [];
  for (const [name, rows] of Object.entries(ifaces)) {
    for (const row of rows || []) {
      if (row.family !== 'IPv4' && row.family !== 4) continue;
      out.push({
        name,
        address: row.address,
        netmask: row.netmask,
        cidr: cidrFromNetmask(row.address, row.netmask),
        mac: row.mac && row.mac !== '00:00:00:00:00:00' ? row.mac.toLowerCase() : '',
        family: 'IPv4',
        internal: Boolean(row.internal),
        kind: row.internal ? 'loopback' : classifyInterfaceKind(name),
      });
    }
  }
  return out;
}

export function pickPrimaryLan(interfaces = listLocalInterfaces()) {
  const candidates = interfaces
    .filter((iface) => !iface.internal && isPrivateIpv4(iface.address))
    .sort((a, b) => {
      const score = (iface) => {
        let s = 0;
        if (iface.kind === 'wifi') s += 4;
        if (iface.kind === 'ethernet') s += 3;
        if (iface.address.startsWith('192.168.')) s += 2;
        if (iface.address.startsWith('10.')) s += 1;
        return s;
      };
      return score(b) - score(a);
    });
  return candidates[0] || interfaces.find((i) => !i.internal) || interfaces[0] || null;
}

function hostsForCidr(address, netmask) {
  const ipNum = ipToInt(address);
  const maskNum = ipToInt(netmask);
  const network = ipNum & maskNum;
  const broadcast = network | (~maskNum >>> 0);
  const hosts = [];
  const start = network + 1;
  const end = Math.min(broadcast - 1, network + 254);
  for (let n = start; n <= end; n += 1) hosts.push(intToIp(n));
  return { network: intToIp(network), broadcast: intToIp(broadcast), hosts };
}

function tcpProbe(host, port, timeoutMs = PROBE_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = new net.Socket();
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch { /* ignore */ }
      resolve(ok ? { open: true, latencyMs: Date.now() - started } : { open: false, latencyMs: null });
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let index = 0;
  async function run() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, () => run()));
  return results;
}

async function icmpPing(ip) {
  try {
    const args = process.platform === 'win32'
      ? ['-n', '1', '-w', '250', ip]
      : ['-c', '1', '-W', '1', ip];
    const { stdout } = await execFileAsync('ping', args, {
      timeout: 1200,
      windowsHide: true,
      maxBuffer: 64 * 1024,
    });
    const text = String(stdout || '');
    const alive = /TTL=|ttl=/i.test(text) || /bytes from/i.test(text);
    const ttlMatch = text.match(/TTL[=:](\d+)/i);
    const timeMatch = text.match(/time[=<]?\s*([\d.]+)\s*ms/i);
    return {
      alive,
      ttl: ttlMatch ? Number(ttlMatch[1]) : null,
      latencyMs: timeMatch ? Math.round(Number(timeMatch[1])) : null,
    };
  } catch {
    return { alive: false, ttl: null, latencyMs: null };
  }
}

function osFromTtl(ttl) {
  if (ttl == null) return '';
  if (ttl <= 64) return 'Linux / Android / Unix (TTL≤64)';
  if (ttl <= 128) return 'Windows (TTL≤128)';
  return 'Network appliance / router (TTL>128)';
}

async function probeHost(ip) {
  const openPorts = [];
  let bestLatency = null;
  const probes = await Promise.all(
    PROBE_PORTS.map(async ({ port, service }) => {
      const result = await tcpProbe(ip, port);
      return { port, service, ...result };
    })
  );
  for (const probe of probes) {
    if (!probe.open) continue;
    openPorts.push({
      port: probe.port,
      service: probe.service,
      latencyMs: probe.latencyMs,
    });
    if (bestLatency == null || probe.latencyMs < bestLatency) bestLatency = probe.latencyMs;
  }
  return {
    online: openPorts.length > 0,
    latencyMs: bestLatency,
    openPorts: openPorts.sort((a, b) => a.port - b.port),
  };
}

function normalizeMac(mac) {
  return String(mac || '')
    .toLowerCase()
    .replace(/-/g, ':')
    .replace(/[^0-9a-f:]/g, '');
}

function vendorFromMac(mac) {
  const normalized = normalizeMac(mac);
  if (!normalized || normalized.length < 8) return '';
  return OUI_VENDORS[normalized.slice(0, 8)] || '';
}

async function readArpTable() {
  const map = new Map();
  try {
    const isWin = process.platform === 'win32';
    const { stdout } = await execFileAsync(isWin ? 'arp' : 'arp', isWin ? ['-a'] : ['-an'], {
      timeout: 8000,
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
    });
    for (const line of String(stdout || '').split(/\r?\n/)) {
      const winMatch = line.match(/(\d+\.\d+\.\d+\.\d+)\s+([0-9a-f-]{11,17})\s+/i);
      const unixMatch = line.match(/\((\d+\.\d+\.\d+\.\d+)\)\s+at\s+([0-9a-f:]+)/i);
      const match = winMatch || unixMatch;
      if (!match) continue;
      const mac = normalizeMac(match[2]);
      if (mac && mac !== 'ff:ff:ff:ff:ff:ff' && !mac.includes('incomplete')) {
        map.set(match[1], mac);
      }
    }
  } catch {
    // ignore
  }
  return map;
}

async function getWifiStatus() {
  if (process.platform !== 'win32') {
    return { connected: false, ssid: '', signal: '', bssid: '', radio: '', state: '', interface: '' };
  }
  try {
    const { stdout } = await execFileAsync('netsh', ['wlan', 'show', 'interfaces'], {
      timeout: 5000,
      windowsHide: true,
      maxBuffer: 512 * 1024,
    });
    const text = String(stdout || '');
    const pick = (re) => (text.match(re)?.[1] || '').trim();
    const state = pick(/^\s*State\s*:\s*(.+)$/im);
    const ssid = pick(/^\s*SSID\s*:\s*(.+)$/im);
    const bssid = pick(/^\s*BSSID\s*:\s*(.+)$/im);
    const signal = pick(/^\s*Signal\s*:\s*(.+)$/im);
    const radio = pick(/^\s*Radio type\s*:\s*(.+)$/im);
    const iface = pick(/^\s*Name\s*:\s*(.+)$/im);
    const connected = /connected/i.test(state) && Boolean(ssid);
    return {
      connected,
      ssid: connected ? ssid : '',
      signal,
      bssid: normalizeMac(bssid.replace(/-/g, ':')),
      radio,
      state,
      interface: iface,
    };
  } catch {
    return { connected: false, ssid: '', signal: '', bssid: '', radio: '', state: '', interface: '' };
  }
}

async function reverseHostname(ip) {
  try {
    const names = await dns.reverse(ip);
    return names?.[0] || '';
  } catch {
    return '';
  }
}

async function resolveNetbiosName(ip) {
  if (process.platform !== 'win32') return '';
  try {
    const { stdout } = await execFileAsync('nbtstat', ['-A', ip], {
      timeout: 2200,
      windowsHide: true,
      maxBuffer: 256 * 1024,
    });
    for (const line of String(stdout || '').split(/\r?\n/)) {
      const match = line.match(/^\s*([^\s<]+)\s*<00>\s+UNIQUE/i);
      if (match?.[1] && !/^__MSBROWSE__/i.test(match[1])) return match[1].trim();
    }
  } catch {
    // ignore
  }
  return '';
}

async function resolvePingHostname(ip) {
  try {
    const args = process.platform === 'win32'
      ? ['-a', '-n', '1', '-w', '500', ip]
      : ['-c', '1', '-W', '1', ip];
    const { stdout } = await execFileAsync('ping', args, {
      timeout: 2200,
      windowsHide: true,
      maxBuffer: 128 * 1024,
    });
    const text = String(stdout || '');
    const win = text.match(/Pinging\s+([^\s\[]+)\s+\[/i);
    if (win?.[1] && win[1] !== ip) return win[1];
    const unix = text.match(/PING\s+([^\s(]+)\s+\(/i);
    if (unix?.[1] && unix[1] !== ip) return unix[1];
  } catch {
    // ignore
  }
  return '';
}

async function sniffHttpIdentity(ip, openPorts = []) {
  const preferHttps = openPorts.some((p) => p.port === 443 || p.port === 8443);
  const preferHttp = openPorts.some((p) => p.port === 80 || p.port === 8080);
  const candidates = [];
  if (preferHttps) candidates.push(`https://${ip}/`);
  if (preferHttp) candidates.push(`http://${ip}/`);
  if (!candidates.length) candidates.push(`http://${ip}/`, `https://${ip}/`);

  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(900),
        headers: { 'User-Agent': 'VistawinCRM-NetworkScan/1.0' },
      });
      const server = response.headers.get('server') || '';
      const powered = response.headers.get('x-powered-by') || '';
      const text = await response.text().catch(() => '');
      const titleMatch = String(text).match(/<title[^>]*>([^<]{1,120})<\/title>/i);
      const title = titleMatch?.[1]?.replace(/\s+/g, ' ').trim() || '';
      return {
        httpServer: server.slice(0, 80),
        httpPoweredBy: powered.slice(0, 80),
        httpTitle: title.slice(0, 80),
        httpStatus: response.status,
        attackUrl: url,
      };
    } catch {
      // next
    }
  }
  return {
    httpServer: '',
    httpPoweredBy: '',
    httpTitle: '',
    httpStatus: null,
    attackUrl: '',
  };
}

function inferDeviceProfile({
  ip,
  hostname,
  netbios,
  vendor,
  openPorts = [],
  isSelf,
  isGateway,
  httpTitle,
  httpServer,
  ttl,
  connectionType,
}) {
  const ports = new Set(openPorts.map((p) => p.port));
  let deviceType = 'LAN device';
  let osHint = osFromTtl(ttl) || 'Unknown';
  let riskLevel = 'low';

  if (isSelf) {
    deviceType = 'This computer';
    osHint = process.platform === 'win32' ? 'Windows' : process.platform;
  } else if (isGateway) {
    deviceType = 'Router / Gateway';
    osHint = vendor ? `${vendor} firmware` : 'Network appliance';
  } else if (ports.has(62078) || ports.has(7000) || /apple/i.test(vendor)) {
    deviceType = connectionType === 'wifi' ? 'Apple Wi‑Fi device' : 'Apple device';
    osHint = 'iOS / macOS';
  } else if (ports.has(5555) || /xiaomi|samsung|motorola|phone|android/i.test(`${vendor} ${httpTitle}`)) {
    deviceType = connectionType === 'wifi' ? 'Phone / Mobile (Wi‑Fi)' : 'Phone / Mobile';
    osHint = 'Android / Mobile OS';
  } else if (ports.has(548)) {
    deviceType = 'Mac / NAS';
    osHint = 'macOS / AFP';
  } else if (ports.has(9100)) {
    deviceType = 'Network printer';
    osHint = vendor || 'Print service';
  } else if (ports.has(445) || ports.has(139) || ports.has(135)) {
    deviceType = 'Windows PC / Server';
    osHint = 'Windows';
  } else if (ports.has(22) && !ports.has(445)) {
    deviceType = 'Linux / SSH host';
    osHint = 'Linux / Unix';
  } else if (ports.has(3389)) {
    deviceType = 'Remote desktop host';
    osHint = 'Windows';
  } else if (ports.has(80) || ports.has(443) || ports.has(8080)) {
    deviceType = 'Web device / IoT';
    osHint = httpServer || osFromTtl(ttl) || 'HTTP service';
  } else if (/tp-link|netgear|d-link|tenda|router/i.test(`${vendor} ${httpTitle}`)) {
    deviceType = 'Router / AP';
    osHint = vendor || 'Network appliance';
  } else if (connectionType === 'wifi' && openPorts.length === 0) {
    deviceType = 'Wi‑Fi client';
    osHint = osFromTtl(ttl) || vendor || 'Silent Wi‑Fi device';
  }

  if (ports.has(445) || ports.has(3389) || ports.has(23) || ports.has(5555)) riskLevel = 'high';
  else if (ports.has(22) || ports.has(8080) || ports.has(135)) riskLevel = 'medium';

  const shortHost = String(hostname || '').split('.')[0].trim();
  const displayName = [
    shortHost,
    netbios,
    httpTitle && httpTitle.length <= 40 ? httpTitle : '',
    vendor && deviceType ? `${vendor} ${deviceType}` : '',
    vendor ? `${vendor} device` : '',
    deviceType,
    `Host-${ip.split('.').pop()}`,
  ].filter(Boolean)[0];

  const serviceSummary = openPorts.length
    ? openPorts.map((p) => `${p.service || 'Port'} ${p.port}`).join(' · ')
    : (connectionType === 'wifi' ? 'Wi‑Fi online (no open common ports)' : 'No common ports open');

  let attackUrl = '';
  if (ports.has(443)) attackUrl = `https://${ip}/`;
  else if (ports.has(8443)) attackUrl = `https://${ip}:8443/`;
  else if (ports.has(80)) attackUrl = `http://${ip}/`;
  else if (ports.has(8080)) attackUrl = `http://${ip}:8080/`;
  else attackUrl = `http://${ip}/`;

  return { displayName, deviceType, osHint, riskLevel, serviceSummary, attackUrl };
}

function buildDeepAnalysis(device) {
  const findings = [];
  const ports = device.openPorts || [];

  findings.push({
    id: 'identity',
    severity: 'info',
    title: 'Identity',
    detail: `${device.displayName} · ${device.deviceType} · ${device.osHint || 'OS unknown'}`,
  });

  if (device.connectionType === 'wifi') {
    findings.push({
      id: 'wifi-link',
      severity: 'info',
      title: 'Wi‑Fi connected device',
      detail: device.wifiSsid
        ? `Seen on Wi‑Fi network "${device.wifiSsid}"${device.wifiSignal ? ` · signal ${device.wifiSignal}` : ''}`
        : 'Appears on the Wi‑Fi LAN subnet',
    });
  } else if (device.connectionType === 'ethernet') {
    findings.push({
      id: 'eth-link',
      severity: 'info',
      title: 'Ethernet / wired LAN',
      detail: `Found on wired adapter subnet ${device.subnet || ''}`.trim(),
    });
  }

  if (device.mac) {
    findings.push({
      id: 'mac',
      severity: 'info',
      title: 'Hardware identity',
      detail: `MAC ${device.mac}${device.vendor ? ` · vendor ${device.vendor}` : ''}`,
    });
  }

  if (device.ttl != null) {
    findings.push({
      id: 'ttl',
      severity: 'info',
      title: 'TTL fingerprint',
      detail: `ICMP TTL ${device.ttl} → ${osFromTtl(device.ttl) || 'unknown stack'}`,
    });
  }

  if (device.icmpAlive && ports.length === 0) {
    findings.push({
      id: 'silent',
      severity: 'medium',
      title: 'Silent online host',
      detail: 'Responds to ping/ARP but no common TCP services are exposed (common for phones).',
    });
  }

  for (const p of ports) {
    const high = [23, 445, 3389, 5555, 1433, 3306, 6379, 27017].includes(p.port);
    findings.push({
      id: `port-${p.port}`,
      severity: high ? 'high' : 'medium',
      title: `${p.service} open on ${p.port}`,
      detail: `Service responded in ${p.latencyMs} ms`,
      recommendation: high
        ? 'Restrict this service to trusted networks or disable if unused.'
        : 'Confirm this service is intentionally exposed on the LAN.',
    });
  }

  if (device.httpTitle || device.httpServer) {
    findings.push({
      id: 'http',
      severity: 'info',
      title: 'Web footprint',
      detail: [
        device.httpStatus ? `HTTP ${device.httpStatus}` : '',
        device.httpTitle ? `title "${device.httpTitle}"` : '',
        device.httpServer ? `server ${device.httpServer}` : '',
        device.httpPoweredBy ? `powered-by ${device.httpPoweredBy}` : '',
      ].filter(Boolean).join(' · '),
    });
  }

  if (device.isGateway) {
    findings.push({
      id: 'gateway',
      severity: 'info',
      title: 'Likely default gateway',
      detail: 'First host in subnet; usually your Wi‑Fi router.',
    });
  }

  const scoreBase = 100
    - findings.filter((f) => f.severity === 'high').length * 18
    - findings.filter((f) => f.severity === 'medium').length * 8;
  const analysisScore = Math.max(20, Math.min(100, scoreBase));

  return {
    score: analysisScore,
    summary: `${findings.length} signals gathered · ${ports.length} open services · ${device.connectionType || 'lan'} link`,
    findings,
  };
}

function matchConnectionType(ip, interfaces, wifi) {
  const n = ipToInt(ip);
  for (const iface of interfaces) {
    if (iface.internal || !isPrivateIpv4(iface.address)) continue;
    const mask = ipToInt(iface.netmask);
    if ((n & mask) === (ipToInt(iface.address) & mask)) {
      if (iface.kind === 'wifi' || (wifi?.connected && iface.name === wifi.interface)) {
        return { connectionType: 'wifi', subnet: iface.cidr, adapter: iface.name };
      }
      if (iface.kind === 'ethernet') {
        return { connectionType: 'ethernet', subnet: iface.cidr, adapter: iface.name };
      }
      return { connectionType: iface.kind || 'lan', subnet: iface.cidr, adapter: iface.name };
    }
  }
  return { connectionType: 'lan', subnet: '', adapter: '' };
}

export async function discoverNetworkDevices({ subnetCidr } = {}) {
  const started = Date.now();
  const localInterfaces = listLocalInterfaces();
  const wifi = await getWifiStatus();
  const primary = pickPrimaryLan(localInterfaces);
  if (!primary) {
    throw new Error('No local LAN interface found. Connect to Wi‑Fi or Ethernet and retry.');
  }

  // Scan all private LAN adapters (Wi‑Fi + Ethernet), not only primary
  let scanTargets = localInterfaces.filter((iface) => !iface.internal && isPrivateIpv4(iface.address));
  if (subnetCidr && /^\d+\.\d+\.\d+\.\d+\/\d+$/.test(subnetCidr)) {
    const [ip, bits] = subnetCidr.split('/');
    const bitCount = Number(bits);
    if (bitCount < 24 || bitCount > 30) throw new Error('Subnet must be /24 to /30 for safety');
    const maskNum = bitCount === 0 ? 0 : (~0 << (32 - bitCount)) >>> 0;
    scanTargets = [{
      name: 'custom',
      address: ip,
      netmask: intToIp(maskNum),
      cidr: subnetCidr,
      kind: 'custom',
      internal: false,
      mac: '',
    }];
  }
  if (!scanTargets.length) scanTargets = [primary];

  const hostSet = new Set();
  const hostMeta = new Map();
  for (const target of scanTargets) {
    const { hosts } = hostsForCidr(target.address, target.netmask);
    for (const ip of hosts) {
      hostSet.add(ip);
      if (!hostMeta.has(ip)) {
        hostMeta.set(ip, {
          gatewayGuess: intToIp((ipToInt(target.address) & ipToInt(target.netmask)) + 1),
          kind: target.kind,
          cidr: target.cidr,
          adapter: target.name,
        });
      }
    }
  }
  const hosts = [...hostSet];
  const selfIps = new Set(localInterfaces.map((i) => i.address));

  // ICMP first so quiet Wi‑Fi phones appear even without open ports
  const pingResults = await mapPool(hosts, PING_CONCURRENCY, async (ip) => ({
    ip,
    ...(await icmpPing(ip)),
  }));
  const pingMap = new Map(pingResults.map((r) => [r.ip, r]));

  const probed = await mapPool(hosts, HOST_CONCURRENCY, async (ip) => {
    const ping = pingMap.get(ip) || { alive: false };
    const result = await probeHost(ip);
    const online = result.online || ping.alive || selfIps.has(ip);
    if (!online) return null;
    return {
      ip,
      ...result,
      online,
      icmpAlive: Boolean(ping.alive),
      ttl: ping.ttl,
      latencyMs: result.latencyMs ?? ping.latencyMs,
    };
  });

  // Refresh ARP after probes/pings so Wi‑Fi clients populate
  const arp = await readArpTable();
  for (const [ip, mac] of arp.entries()) {
    if (!hostSet.has(ip)) continue;
    if (probed.some((row) => row && row.ip === ip)) continue;
    const ping = pingMap.get(ip) || {};
    probed.push({
      ip,
      online: true,
      openPorts: [],
      latencyMs: ping.latencyMs ?? null,
      icmpAlive: Boolean(ping.alive),
      ttl: ping.ttl ?? null,
      fromArp: true,
    });
  }

  const online = probed.filter(Boolean);
  for (const ip of selfIps) {
    if (!hostSet.has(ip)) continue;
    if (online.some((d) => d.ip === ip)) continue;
    online.push({
      ip,
      online: true,
      openPorts: [],
      latencyMs: 0,
      icmpAlive: true,
      ttl: null,
    });
  }

  const devices = await Promise.all(
    online.map(async (row) => {
      const meta = hostMeta.get(row.ip) || {};
      const link = matchConnectionType(row.ip, localInterfaces, wifi);
      const mac = arp.get(row.ip) || (selfIps.has(row.ip)
        ? (localInterfaces.find((i) => i.address === row.ip)?.mac || '')
        : '');
      const vendor = vendorFromMac(mac);
      const [hostname, netbios, pingName, httpInfo] = await Promise.all([
        reverseHostname(row.ip),
        resolveNetbiosName(row.ip),
        resolvePingHostname(row.ip),
        sniffHttpIdentity(row.ip, row.openPorts || []),
      ]);
      const resolvedHost = hostname
        || (selfIps.has(row.ip) ? os.hostname() : '')
        || pingName
        || netbios
        || '';
      const isGateway = row.ip === meta.gatewayGuess;
      const profile = inferDeviceProfile({
        ip: row.ip,
        hostname: resolvedHost,
        netbios,
        vendor,
        openPorts: row.openPorts || [],
        isSelf: selfIps.has(row.ip),
        isGateway,
        httpTitle: httpInfo.httpTitle,
        httpServer: httpInfo.httpServer,
        ttl: row.ttl,
        connectionType: link.connectionType,
      });

      const device = {
        ip: row.ip,
        hostname: resolvedHost,
        displayName: profile.displayName,
        deviceType: profile.deviceType,
        osHint: profile.osHint,
        mac,
        vendor,
        httpTitle: httpInfo.httpTitle || '',
        httpServer: httpInfo.httpServer || '',
        httpPoweredBy: httpInfo.httpPoweredBy || '',
        httpStatus: httpInfo.httpStatus,
        serviceSummary: profile.serviceSummary,
        riskLevel: profile.riskLevel,
        attackUrl: httpInfo.attackUrl || profile.attackUrl,
        latencyMs: row.latencyMs,
        icmpAlive: Boolean(row.icmpAlive),
        ttl: row.ttl ?? null,
        connectionType: link.connectionType,
        subnet: link.subnet || meta.cidr || '',
        adapter: link.adapter || meta.adapter || '',
        wifiSsid: link.connectionType === 'wifi' ? (wifi.ssid || '') : '',
        wifiSignal: link.connectionType === 'wifi' ? (wifi.signal || '') : '',
        isSelf: selfIps.has(row.ip),
        isGateway,
        openPorts: row.openPorts || [],
        status: 'online',
      };
      device.analysis = buildDeepAnalysis(device);
      return device;
    })
  );

  devices.sort((a, b) => {
    if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
    if (a.isGateway !== b.isGateway) return a.isGateway ? -1 : 1;
    if ((a.connectionType === 'wifi') !== (b.connectionType === 'wifi')) {
      return a.connectionType === 'wifi' ? -1 : 1;
    }
    return ipToInt(a.ip) - ipToInt(b.ip);
  });

  const wifiDevices = devices.filter((d) => d.connectionType === 'wifi');
  const ethernetDevices = devices.filter((d) => d.connectionType === 'ethernet');

  return {
    subnet: scanTargets.map((t) => t.cidr).join(', '),
    scannedHosts: hosts.length,
    onlineCount: devices.length,
    wifiDeviceCount: wifiDevices.length,
    ethernetDeviceCount: ethernetDevices.length,
    durationMs: Date.now() - started,
    localInterfaces,
    wifi,
    devices,
    wifiDevices,
    ethernetDevices,
    primaryInterface: primary,
  };
}

export function networkMeta() {
  const localInterfaces = listLocalInterfaces();
  const primary = pickPrimaryLan(localInterfaces);
  return {
    hostname: os.hostname(),
    platform: process.platform,
    primaryInterface: primary,
    localInterfaces,
    probePorts: PROBE_PORTS,
    wifiPromise: true,
  };
}

export async function networkMetaLive() {
  const base = networkMeta();
  const wifi = await getWifiStatus();
  return {
    ...base,
    wifi,
  };
}
