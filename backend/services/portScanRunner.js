import net from 'net';

export const COMMON_PORTS = [
  { port: 21, service: 'FTP', risk: 'high' },
  { port: 22, service: 'SSH', risk: 'medium' },
  { port: 23, service: 'Telnet', risk: 'critical' },
  { port: 25, service: 'SMTP', risk: 'medium' },
  { port: 53, service: 'DNS', risk: 'low' },
  { port: 80, service: 'HTTP', risk: 'low' },
  { port: 110, service: 'POP3', risk: 'high' },
  { port: 135, service: 'RPC', risk: 'high' },
  { port: 139, service: 'NetBIOS', risk: 'high' },
  { port: 143, service: 'IMAP', risk: 'medium' },
  { port: 443, service: 'HTTPS', risk: 'low' },
  { port: 445, service: 'SMB', risk: 'critical' },
  { port: 1433, service: 'MSSQL', risk: 'critical' },
  { port: 3306, service: 'MySQL', risk: 'critical' },
  { port: 3389, service: 'RDP', risk: 'critical' },
  { port: 5432, service: 'PostgreSQL', risk: 'critical' },
  { port: 5900, service: 'VNC', risk: 'high' },
  { port: 6379, service: 'Redis', risk: 'critical' },
  { port: 8080, service: 'HTTP-Alt', risk: 'medium' },
  { port: 8443, service: 'HTTPS-Alt', risk: 'low' },
  { port: 27017, service: 'MongoDB', risk: 'critical' },
];

const RISK_PENALTY = { critical: 18, high: 12, medium: 7, low: 3 };
const PROBE_TIMEOUT = 3500;

export function validateScanHost(raw) {
  const host = String(raw || '').trim();
  if (!host) throw new Error('Host is required');

  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const hostname = /^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/;

  if (ipv4.test(host)) {
    const parts = host.split('.').map(Number);
    if (parts.some((p) => p > 255)) throw new Error('Invalid IPv4 address');
    return host;
  }

  const cleaned = host.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
  if (!hostname.test(cleaned) || cleaned.length > 253) {
    throw new Error('Enter a valid hostname or IPv4 address');
  }
  return cleaned;
}

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

export function gradeFromScore(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function buildFindings(openPorts) {
  const findings = [];
  const risky = openPorts.filter((p) => p.risk === 'critical' || p.risk === 'high');

  if (openPorts.length === 0) {
    findings.push({
      id: 'no-open',
      severity: 'pass',
      title: 'No common ports open',
      detail: 'None of the scanned ports responded — good network exposure posture.',
      recommendation: '',
    });
    return findings;
  }

  for (const p of risky) {
    findings.push({
      id: `port-${p.port}`,
      severity: p.risk === 'critical' ? 'critical' : 'high',
      title: `${p.service} (${p.port}) exposed`,
      detail: `Port ${p.port} is open (${p.latencyMs}ms). ${p.service} on the public internet increases attack surface.`,
      recommendation: `Restrict ${p.service} to VPN/internal networks or disable if unused.`,
    });
  }

  const medium = openPorts.filter((p) => p.risk === 'medium');
  for (const p of medium.slice(0, 5)) {
    findings.push({
      id: `port-${p.port}`,
      severity: 'medium',
      title: `${p.service} (${p.port}) open`,
      detail: `Port ${p.port} responded in ${p.latencyMs}ms.`,
      recommendation: 'Verify this service is intentionally exposed and patched.',
    });
  }

  if (risky.length === 0 && medium.length === 0) {
    findings.push({
      id: 'low-exposure',
      severity: 'info',
      title: `${openPorts.length} low-risk port(s) open`,
      detail: openPorts.map((p) => `${p.service}:${p.port}`).join(', '),
      recommendation: 'Ensure web services use TLS and stay updated.',
    });
  }

  return findings;
}

function summarizeFindings(findings) {
  const summary = { critical: 0, high: 0, medium: 0, low: 0, pass: 0, info: 0 };
  for (const f of findings) {
    if (summary[f.severity] != null) summary[f.severity] += 1;
  }
  return summary;
}

export async function runPortScan(hostInput, options = {}) {
  const host = validateScanHost(hostInput);
  const portDefs = options.ports?.length
    ? COMMON_PORTS.filter((p) => options.ports.includes(p.port))
    : COMMON_PORTS;

  const probes = await Promise.all(
    portDefs.map(async (def) => {
      const result = await tcpProbe(host, def.port);
      return { ...def, ...result };
    })
  );

  const openPorts = probes
    .filter((p) => p.open)
    .map(({ port, service, risk, latencyMs }) => ({ port, service, risk, latencyMs }));

  let score = 100;
  for (const p of openPorts) {
    score -= RISK_PENALTY[p.risk] || 5;
  }
  const securityScore = Math.max(0, Math.min(100, Math.round(score)));
  const findings = buildFindings(openPorts);

  return {
    host,
    portsScanned: portDefs.length,
    openPortCount: openPorts.length,
    openPorts,
    closedCount: portDefs.length - openPorts.length,
    findings,
    securityScore,
    grade: gradeFromScore(securityScore),
    summary: summarizeFindings(findings),
  };
}
