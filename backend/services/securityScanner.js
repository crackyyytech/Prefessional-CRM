import tls from 'tls';
import { URL } from 'url';

const SECURITY_HEADERS = [
  {
    name: 'strict-transport-security',
    label: 'Strict-Transport-Security (HSTS)',
    weight: 15,
    recommendation: 'Add Strict-Transport-Security to force HTTPS for all future requests.',
  },
  {
    name: 'content-security-policy',
    label: 'Content-Security-Policy (CSP)',
    weight: 15,
    recommendation: 'Define a Content-Security-Policy to mitigate XSS and data injection attacks.',
  },
  {
    name: 'x-frame-options',
    label: 'X-Frame-Options',
    weight: 10,
    recommendation: 'Set X-Frame-Options to DENY or SAMEORIGIN to prevent clickjacking.',
  },
  {
    name: 'x-content-type-options',
    label: 'X-Content-Type-Options',
    weight: 10,
    recommendation: 'Set X-Content-Type-Options: nosniff to prevent MIME-type sniffing.',
  },
  {
    name: 'referrer-policy',
    label: 'Referrer-Policy',
    weight: 8,
    recommendation: 'Set Referrer-Policy to control how much referrer data is sent.',
  },
  {
    name: 'permissions-policy',
    label: 'Permissions-Policy',
    weight: 8,
    recommendation: 'Use Permissions-Policy to restrict browser features (camera, mic, geolocation).',
  },
  {
    name: 'cross-origin-opener-policy',
    label: 'Cross-Origin-Opener-Policy',
    weight: 6,
    recommendation: 'Set COOP to isolate browsing context and reduce cross-origin attacks.',
  },
  {
    name: 'cross-origin-resource-policy',
    label: 'Cross-Origin-Resource-Policy',
    weight: 6,
    recommendation: 'Set CORP to prevent other origins from loading your resources.',
  },
];

function gradeFromScore(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function normalizeUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw new Error('Enter a valid URL (include http:// or https://)');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only http and https URLs are allowed');
  }
  return url;
}

async function fetchTlsInfo(hostname, port = 443) {
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host: hostname, port, servername: hostname, rejectUnauthorized: false },
      () => {
        try {
          const cert = socket.getPeerCertificate();
          const validTo = cert.valid_to ? new Date(cert.valid_to) : null;
          const daysUntilExpiry = validTo
            ? Math.ceil((validTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            : 0;
          resolve({
            valid: Boolean(cert.subject),
            protocol: socket.getProtocol?.() || '',
            issuer: cert.issuer?.O || cert.issuer?.CN || '',
            subject: cert.subject?.CN || hostname,
            validFrom: cert.valid_from || '',
            validTo: cert.valid_to || '',
            daysUntilExpiry,
            selfSigned: Boolean(cert.issuer?.CN && cert.subject?.CN && cert.issuer.CN === cert.subject.CN),
          });
        } catch {
          resolve({ valid: false, protocol: '', issuer: '', subject: '', validFrom: '', validTo: '', daysUntilExpiry: 0, selfSigned: false });
        } finally {
          socket.end();
        }
      }
    );
    socket.on('error', () => {
      resolve({ valid: false, protocol: '', issuer: '', subject: '', validFrom: '', validTo: '', daysUntilExpiry: 0, selfSigned: false });
    });
    socket.setTimeout(10000, () => {
      socket.destroy();
      resolve({ valid: false, protocol: '', issuer: '', subject: '', validFrom: '', validTo: '', daysUntilExpiry: 0, selfSigned: false });
    });
  });
}

function analyzeCookies(setCookieHeaders = []) {
  const issues = [];
  setCookieHeaders.forEach((raw) => {
    const lower = String(raw).toLowerCase();
    const name = String(raw).split('=')[0]?.trim() || 'cookie';
    if (!lower.includes('secure') && !lower.includes('httponly')) {
      issues.push(`${name}: missing Secure and HttpOnly flags`);
    } else if (!lower.includes('secure')) {
      issues.push(`${name}: missing Secure flag`);
    } else if (!lower.includes('httponly')) {
      issues.push(`${name}: missing HttpOnly flag`);
    }
    if (!lower.includes('samesite')) {
      issues.push(`${name}: missing SameSite attribute`);
    }
  });
  return issues;
}

function addFinding(findings, { id, severity, title, detail, recommendation }) {
  findings.push({ id, severity, title, detail, recommendation });
}

export async function runSecurityScan(targetUrl) {
  const url = normalizeUrl(targetUrl);
  const findings = [];
  let score = 100;
  const summary = { critical: 0, high: 0, medium: 0, low: 0, pass: 0 };

  const bump = (severity, points) => {
    summary[severity] = (summary[severity] || 0) + 1;
    if (severity === 'critical') score -= points || 25;
    else if (severity === 'high') score -= points || 15;
    else if (severity === 'medium') score -= points || 8;
    else if (severity === 'low') score -= points || 4;
  };

  let responseStatus = 0;
  let responseTimeMs = 0;
  let headers = {};
  let setCookies = [];
  let finalUrl = url.toString();
  let httpsEnabled = url.protocol === 'https:';
  let redirectsToHttps = httpsEnabled;

  const started = performance.now();
  try {
    const response = await fetch(finalUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': 'VistawinCRM-SecurityScan/1.0' },
    });
    responseTimeMs = Math.round(performance.now() - started);
    responseStatus = response.status;
    finalUrl = response.url || finalUrl;
    httpsEnabled = finalUrl.startsWith('https://');
    redirectsToHttps = httpsEnabled;

    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    setCookies = response.headers.getSetCookie?.() || [];
    if (!setCookies.length) {
      const single = response.headers.get('set-cookie');
      if (single) setCookies = [single];
    }
    try {
      await response.arrayBuffer();
    } catch {
      // ignore body read errors
    }
  } catch (error) {
    responseTimeMs = Math.round(performance.now() - started);
    addFinding(findings, {
      id: 'fetch-failed',
      severity: 'critical',
      title: 'Site unreachable',
      detail: error.message,
      recommendation: 'Ensure the URL is online and accessible from the server.',
    });
    bump('critical', 40);
  }

  if (!httpsEnabled) {
    addFinding(findings, {
      id: 'no-https',
      severity: 'critical',
      title: 'HTTPS not used',
      detail: 'The site does not use HTTPS encryption.',
      recommendation: 'Install an SSL/TLS certificate and redirect all HTTP traffic to HTTPS.',
    });
    bump('critical', 30);
  } else {
    addFinding(findings, {
      id: 'https-ok',
      severity: 'pass',
      title: 'HTTPS enabled',
      detail: `Final URL uses HTTPS (${finalUrl}).`,
      recommendation: '',
    });
    bump('pass');
  }

  let tls = {
    valid: false,
    protocol: '',
    issuer: '',
    subject: '',
    validFrom: '',
    validTo: '',
    daysUntilExpiry: 0,
    selfSigned: false,
  };

  if (httpsEnabled) {
    const parsed = new URL(finalUrl);
    tls = await fetchTlsInfo(parsed.hostname, parsed.port || 443);

    if (!tls.valid) {
      addFinding(findings, {
        id: 'tls-invalid',
        severity: 'high',
        title: 'TLS certificate issue',
        detail: 'Could not validate TLS certificate details.',
        recommendation: 'Verify SSL certificate installation and chain of trust.',
      });
      bump('high', 20);
    } else if (tls.daysUntilExpiry <= 0) {
      addFinding(findings, {
        id: 'tls-expired',
        severity: 'critical',
        title: 'SSL certificate expired',
        detail: `Certificate expired on ${tls.validTo}.`,
        recommendation: 'Renew the SSL certificate immediately.',
      });
      bump('critical', 25);
    } else if (tls.daysUntilExpiry <= 30) {
      addFinding(findings, {
        id: 'tls-expiring',
        severity: 'high',
        title: 'SSL certificate expiring soon',
        detail: `Certificate expires in ${tls.daysUntilExpiry} days (${tls.validTo}).`,
        recommendation: 'Renew the SSL certificate before expiry.',
      });
      bump('high', 15);
    } else {
      addFinding(findings, {
        id: 'tls-ok',
        severity: 'pass',
        title: 'Valid SSL certificate',
        detail: `${tls.subject} · expires in ${tls.daysUntilExpiry} days · ${tls.protocol}`,
        recommendation: '',
      });
      bump('pass');
    }

    if (tls.selfSigned) {
      addFinding(findings, {
        id: 'tls-self-signed',
        severity: 'medium',
        title: 'Self-signed certificate',
        detail: 'The certificate appears to be self-signed.',
        recommendation: 'Use a certificate from a trusted Certificate Authority.',
      });
      bump('medium', 10);
    }
  }

  const headerResults = SECURITY_HEADERS.map((spec) => {
    const value = headers[spec.name] || '';
    const present = Boolean(value);
    let status = 'missing';
    if (present) {
      status = 'pass';
      addFinding(findings, {
        id: `header-${spec.name}`,
        severity: 'pass',
        title: `${spec.label} present`,
        detail: value.slice(0, 120),
        recommendation: '',
      });
      bump('pass');
    } else {
      status = spec.weight >= 10 ? 'fail' : 'warn';
      const severity = spec.weight >= 10 ? 'medium' : 'low';
      addFinding(findings, {
        id: `header-missing-${spec.name}`,
        severity,
        title: `${spec.label} missing`,
        detail: 'Security header not found in response.',
        recommendation: spec.recommendation,
      });
      bump(severity, spec.weight);
    }
    return { name: spec.label, value: value.slice(0, 200), present, status };
  });

  const serverHeader = headers.server || headers['x-powered-by'] || '';
  if (serverHeader) {
    addFinding(findings, {
      id: 'server-disclosure',
      severity: 'low',
      title: 'Server version disclosure',
      detail: `Response reveals: ${serverHeader}`,
      recommendation: 'Remove or genericize Server / X-Powered-By headers.',
    });
    bump('low', 3);
  }

  const cookieIssues = analyzeCookies(setCookies);
  cookieIssues.forEach((issue, i) => {
    addFinding(findings, {
      id: `cookie-${i}`,
      severity: 'medium',
      title: 'Insecure cookie configuration',
      detail: issue,
      recommendation: 'Set Secure, HttpOnly, and SameSite on all session cookies.',
    });
    bump('medium', 5);
  });

  if (responseStatus >= 500) {
    addFinding(findings, {
      id: 'server-error',
      severity: 'high',
      title: 'Server error response',
      detail: `HTTP ${responseStatus} returned.`,
      recommendation: 'Fix server errors — they may expose stack traces or debug info.',
    });
    bump('high', 10);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    securityScore: score,
    grade: gradeFromScore(score),
    httpsEnabled,
    redirectsToHttps,
    responseStatus,
    responseTimeMs,
    serverHeader,
    tls,
    headers: headerResults,
    cookieIssues,
    findings,
    summary,
  };
}

export { gradeFromScore, normalizeUrl as validateSecurityUrl };
