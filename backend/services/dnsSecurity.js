import dns from 'node:dns/promises';

export function normalizeDomain(raw) {
  let domain = String(raw || '').trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
  if (!domain || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
    throw new Error('Enter a valid domain (e.g. example.com)');
  }
  return domain;
}

export async function checkDomainSecurity(domain) {
  const checks = {
    domain,
    mxRecords: [],
    hasSpf: false,
    hasDmarc: false,
    hasDkim: false,
    spfRecord: '',
    dmarcRecord: '',
    dkimHint: '',
    dmarcPolicy: '',
    spfSoftFail: false,
  };

  try {
    checks.mxRecords = (await dns.resolveMx(domain)).map((r) => r.exchange).slice(0, 8);
  } catch {
    checks.mxRecords = [];
  }

  try {
    const txt = await dns.resolveTxt(domain);
    const flat = txt.map((r) => r.join('')).join(' ');
    checks.spfRecord = flat.includes('v=spf1') ? flat.match(/v=spf1[^"]*/)?.[0] || 'v=spf1' : '';
    checks.hasSpf = Boolean(checks.spfRecord);
    checks.spfSoftFail = checks.spfRecord.includes('~all') || checks.spfRecord.includes('+all');
  } catch {
    checks.hasSpf = false;
  }

  try {
    const dmarcTxt = await dns.resolveTxt(`_dmarc.${domain}`);
    const flat = dmarcTxt.map((r) => r.join('')).join(' ');
    checks.dmarcRecord = flat.includes('v=DMARC1') ? flat : '';
    checks.hasDmarc = Boolean(checks.dmarcRecord);
    const policyMatch = checks.dmarcRecord.match(/;\s*p=([^;\s]+)/i);
    checks.dmarcPolicy = policyMatch?.[1]?.toLowerCase() || '';
  } catch {
    checks.hasDmarc = false;
  }

  try {
    const dkimTxt = await dns.resolveTxt(`default._domainkey.${domain}`);
    checks.dkimHint = dkimTxt.flat().join(' ').slice(0, 120);
    checks.hasDkim = checks.dkimHint.length > 0;
  } catch {
    checks.hasDkim = false;
  }

  return checks;
}

export function gradeFromScore(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

export function buildDnsFindings(checks) {
  const findings = [];

  if (!checks.hasSpf) {
    findings.push({
      id: 'no-spf',
      severity: 'high',
      title: 'Missing SPF record',
      detail: 'No SPF TXT record found. Attackers can send email appearing to come from your domain.',
      recommendation: 'Publish a v=spf1 TXT record listing authorized mail servers.',
    });
  } else if (checks.spfSoftFail) {
    findings.push({
      id: 'weak-spf',
      severity: 'medium',
      title: 'Weak SPF policy',
      detail: 'SPF uses ~all or +all — spoofed mail may still be delivered.',
      recommendation: 'Use -all (hard fail) when all senders are listed.',
    });
  } else {
    findings.push({
      id: 'spf-ok',
      severity: 'pass',
      title: 'SPF record present',
      detail: checks.spfRecord.slice(0, 120),
      recommendation: '',
    });
  }

  if (!checks.hasDmarc) {
    findings.push({
      id: 'no-dmarc',
      severity: 'critical',
      title: 'Missing DMARC record',
      detail: 'No _dmarc TXT record. Email spoofing and phishing using your brand is easier.',
      recommendation: 'Add _dmarc.example.com TXT with v=DMARC1; p=quarantine or p=reject.',
    });
  } else if (checks.dmarcPolicy === 'none') {
    findings.push({
      id: 'dmarc-none',
      severity: 'medium',
      title: 'DMARC policy is p=none',
      detail: 'DMARC exists but only monitors — spoofed mail is not blocked.',
      recommendation: 'Move to p=quarantine then p=reject after monitoring.',
    });
  } else {
    findings.push({
      id: 'dmarc-ok',
      severity: 'pass',
      title: `DMARC active (p=${checks.dmarcPolicy || 'unknown'})`,
      detail: checks.dmarcRecord.slice(0, 120),
      recommendation: '',
    });
  }

  if (!checks.hasDkim) {
    findings.push({
      id: 'no-dkim',
      severity: 'high',
      title: 'DKIM not detected',
      detail: 'No default._domainkey TXT record found. Outbound mail may fail authentication checks.',
      recommendation: 'Enable DKIM signing with your email provider and publish the public key.',
    });
  } else {
    findings.push({
      id: 'dkim-ok',
      severity: 'pass',
      title: 'DKIM record detected',
      detail: checks.dkimHint.slice(0, 80) + (checks.dkimHint.length > 80 ? '…' : ''),
      recommendation: '',
    });
  }

  if (!checks.mxRecords.length) {
    findings.push({
      id: 'no-mx',
      severity: 'medium',
      title: 'No MX records',
      detail: 'Domain has no mail exchanger records — may not receive email or misconfigured.',
      recommendation: 'Add MX records pointing to your mail provider.',
    });
  } else {
    findings.push({
      id: 'mx-ok',
      severity: 'info',
      title: `${checks.mxRecords.length} MX record(s)`,
      detail: checks.mxRecords.join(', '),
      recommendation: '',
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

export async function runDnsSecurityScan(domainInput) {
  const domain = normalizeDomain(domainInput);
  const checks = await checkDomainSecurity(domain);
  const findings = buildDnsFindings(checks);

  let score = 100;
  if (!checks.hasSpf) score -= 25;
  else if (checks.spfSoftFail) score -= 10;
  if (!checks.hasDmarc) score -= 30;
  else if (checks.dmarcPolicy === 'none') score -= 15;
  else if (checks.dmarcPolicy === 'quarantine') score -= 5;
  if (!checks.hasDkim) score -= 20;
  if (!checks.mxRecords.length) score -= 10;

  const securityScore = Math.max(0, Math.min(100, Math.round(score)));

  return {
    domain,
    checks,
    findings,
    securityScore,
    grade: gradeFromScore(securityScore),
    summary: summarizeFindings(findings),
  };
}
