import PhishingCampaign from '../models/PhishingCampaign.js';
import { getAppSettings } from '../models/AppSettings.js';
import { getAiLoadChannels } from './loadTestRunner.js';
import { sendEmail } from './messaging.js';
import { checkDomainSecurity } from './dnsSecurity.js';

export const MAX_TARGETS = 500;
export const GOD_MODE_TEMPLATE_VARIANTS = 12;

export const CAMPAIGN_PROFILES = {
  spear_phishing: {
    label: 'Spear Phishing',
    description: 'Highly personalized attack targeting specific individuals — ×85 effectiveness',
    effectiveness: 85,
    openRate: 42,
    clickRate: 18,
    submitRate: 8,
    sophistication: 90,
    vectors: ['email'],
  },
  credential_harvest: {
    label: 'Credential Harvest',
    description: 'Fake login portal to steal passwords — ×90 effectiveness',
    effectiveness: 90,
    openRate: 38,
    clickRate: 24,
    submitRate: 15,
    sophistication: 88,
    vectors: ['email', 'landing'],
  },
  bec_attack: {
    label: 'BEC / Wire Fraud',
    description: 'Business email compromise — urgent payment redirect — ×95 effectiveness',
    effectiveness: 95,
    openRate: 55,
    clickRate: 22,
    submitRate: 12,
    sophistication: 92,
    vectors: ['email'],
  },
  clone_phishing: {
    label: 'Clone Phishing',
    description: 'Replica of trusted service notifications — ×80 effectiveness',
    effectiveness: 80,
    openRate: 35,
    clickRate: 20,
    submitRate: 10,
    sophistication: 85,
    vectors: ['email', 'clone'],
  },
  whaling: {
    label: 'Whaling',
    description: 'C-suite executive impersonation — ×92 effectiveness',
    effectiveness: 92,
    openRate: 48,
    clickRate: 20,
    submitRate: 9,
    sophistication: 94,
    vectors: ['email'],
  },
  smishing: {
    label: 'Smishing + Link',
    description: 'SMS-style urgent link attack (email vector simulation) — ×75 effectiveness',
    effectiveness: 75,
    openRate: 62,
    clickRate: 28,
    submitRate: 11,
    sophistication: 70,
    vectors: ['sms', 'email'],
  },
  apocalypse_phish: {
    label: 'Apocalypse Phish',
    description: 'Multi-vector total compromise simulation — ×98 effectiveness, all tactics combined',
    effectiveness: 98,
    openRate: 58,
    clickRate: 32,
    submitRate: 20,
    sophistication: 98,
    vectors: ['email', 'landing', 'clone', 'sms'],
  },
};

function riskGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function vulnerabilityLevel(score) {
  if (score >= 85) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

export function normalizeDomain(raw) {
  let input = String(raw || '').trim().toLowerCase();
  input = input.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
  if (!input || !/^[a-z0-9]([a-z0-9\-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]*[a-z0-9])?)+$/i.test(input)) {
    throw new Error('Enter a valid domain (e.g. company.com)');
  }
  return input;
}

export function parseTargetEmails(raw) {
  const list = Array.isArray(raw)
    ? raw
    : String(raw || '').split(/[,;\n]+/);
  const emails = [...new Set(
    list.map((e) => String(e || '').trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
  )];
  if (emails.length > MAX_TARGETS) {
    throw new Error(`Maximum ${MAX_TARGETS} target emails allowed`);
  }
  return emails;
}

export function clampPhishingConfig(body = {}, godPlan = null) {
  const godMode = Boolean(body.godMode || godPlan?.godMode);
  const maxPower = Boolean(body.maxPower || godMode);
  const sendLive = Boolean(body.sendLive);
  const campaignProfile = godMode ? 'apocalypse_phish' : (CAMPAIGN_PROFILES[body.campaignProfile] ? body.campaignProfile : 'spear_phishing');
  const targetEmails = parseTargetEmails(body.targetEmails || []);
  return {
    targetDomain: normalizeDomain(body.targetDomain),
    targetEmails,
    campaignProfile,
    godMode,
    maxPower,
    sendLive,
    aiProviderChannels: godPlan?.aiProviderChannels || 0,
    aiProvidersUsed: godPlan?.aiProvidersUsed || [],
  };
}

function buildTemplate(profile, domain, channel = 'default', variant = 0) {
  const brand = domain.split('.')[0];
  const capitalBrand = brand.charAt(0).toUpperCase() + brand.slice(1);
  const templates = {
    spear_phishing: {
      subject: `Action required: ${capitalBrand} account review`,
      body: `Dear {{name}},\n\nOur security team detected unusual activity on your ${capitalBrand} account.\n\nPlease verify your identity within 24 hours:\nhttps://secure-${brand}-verify.com/login\n\nFailure to comply may result in account suspension.\n\nIT Security Team\n${domain}`,
    },
    credential_harvest: {
      subject: `[${capitalBrand}] Password expires today`,
      body: `Your ${capitalBrand} password expires in 2 hours.\n\nReset now to avoid lockout:\nhttps://${brand}-sso-portal.net/reset?token=sim-${variant}\n\nThis link expires in 120 minutes.\n\nHelp Desk | ${domain}`,
    },
    bec_attack: {
      subject: `URGENT: Wire transfer authorization needed`,
      body: `I need you to process an urgent vendor payment before end of day.\n\nAmount: $48,500 USD\nReference: INV-${1000 + variant}\n\nUse the updated account details in the attached portal:\nhttps://payments-${brand}-corp.com/auth\n\nDo not call — I'm in meetings all day.\n\nSent from my iPhone`,
    },
    clone_phishing: {
      subject: `Microsoft 365: Shared document "${capitalBrand} Q3 Report"`,
      body: `You have a new shared document waiting.\n\n"${capitalBrand}_Financials_Q3.xlsx" was shared with you.\n\nView document:\nhttps://docs-${brand}-share.com/file?id=sim${variant}\n\nMicrosoft 365 Team`,
    },
    whaling: {
      subject: `Confidential: ${capitalBrand} acquisition`,
      body: `Board members only.\n\nReview the confidential M&A documents before tomorrow's vote:\nhttps://board-${brand}-secure.com/deal-room\n\nThis must stay between us until announcement.\n\n— CEO`,
    },
    smishing: {
      subject: `[SMS Alert] ${capitalBrand}: Unusual login detected`,
      body: `[SIMULATED SMS]\n\n${capitalBrand} Alert: Login from Mumbai, IN at 3:42 AM.\n\nNot you? Secure account now:\nhttps://${brand}-alert.net/s/${variant}\n\nReply STOP to opt out.`,
    },
    apocalypse_phish: {
      subject: `CRITICAL: ${capitalBrand} — Immediate action required`,
      body: `Multiple security alerts on your account.\n\n1. Verify identity: https://secure-${brand}-id.com/v${variant}\n2. Reset password: https://${brand}-portal.net/reset\n3. Confirm payment: https://pay-${brand}-urgent.com\n\nFailure to respond within 1 hour will result in permanent suspension.\n\n${capitalBrand} Security Operations`,
    },
  };

  const t = templates[profile] || templates.spear_phishing;
  return {
    id: `${profile}-${channel}-${variant}`,
    channel,
    subject: t.subject,
    preview: t.body.slice(0, 160).replace(/\n/g, ' '),
    body: t.body,
    sophistication: CAMPAIGN_PROFILES[profile]?.sophistication || 80,
  };
}

function computeRiskScore(profile, domainChecks, maxPower, godMode) {
  let score = profile.effectiveness;
  if (!domainChecks.hasDmarc) score += 8;
  if (!domainChecks.hasSpf) score += 6;
  if (!domainChecks.hasDkim) score += 4;
  if (!domainChecks.mxRecords?.length) score += 5;
  if (maxPower) score += 5;
  if (godMode) score += 8;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function buildFindings(profile, domainChecks, riskScore) {
  const findings = [];
  if (!domainChecks.hasDmarc) {
    findings.push({ severity: 'high', title: 'No DMARC record', detail: 'Domain lacks DMARC — attackers can spoof emails easily.', recommendation: 'Publish a DMARC policy with p=quarantine or p=reject.' });
  }
  if (!domainChecks.hasSpf) {
    findings.push({ severity: 'high', title: 'No SPF record', detail: 'Missing SPF allows unauthorized senders to impersonate your domain.', recommendation: 'Add an SPF TXT record to your DNS.' });
  }
  if (!domainChecks.hasDkim) {
    findings.push({ severity: 'medium', title: 'DKIM not detected', detail: 'No default DKIM selector found — email authenticity is weaker.', recommendation: 'Configure DKIM signing for outbound mail.' });
  }
  findings.push({
    severity: riskScore >= 85 ? 'critical' : riskScore >= 70 ? 'high' : 'medium',
    title: `${profile.label} vulnerability`,
    detail: `Predicted campaign effectiveness: ${profile.effectiveness}%. Organization risk score: ${riskScore}/100.`,
    recommendation: 'Run security awareness training and enable MFA for all users.',
  });
  return findings;
}

export async function resolvePhishingGodModePlan(settings) {
  const channels = getAiLoadChannels(settings);
  return {
    godMode: true,
    aiProviderChannels: channels.length,
    aiProvidersUsed: channels.map((c) => c.id),
    channels,
  };
}

export async function runPhishingCampaign(campaignId) {
  const campaign = await PhishingCampaign.findById(campaignId);
  if (!campaign || campaign.status !== 'pending') return;

  campaign.status = 'running';
  campaign.startedAt = new Date();
  campaign.errorMessage = '';
  await campaign.save();

  try {
    const settings = await getAppSettings();
    const profile = CAMPAIGN_PROFILES[campaign.campaignProfile] || CAMPAIGN_PROFILES.spear_phishing;
    const domainChecks = await checkDomainSecurity(campaign.targetDomain);
    const channels = campaign.godMode ? getAiLoadChannels(settings) : [{ id: 'default', label: 'default' }];

    const templates = [];
    const channelCounts = {};
    const variantCount = campaign.godMode
      ? Math.min(GOD_MODE_TEMPLATE_VARIANTS, channels.length * 2)
      : (campaign.maxPower ? 5 : 2);

    if (campaign.godMode) {
      channels.forEach((ch, i) => {
        templates.push(buildTemplate('apocalypse_phish', campaign.targetDomain, ch.id, i));
        templates.push(buildTemplate('credential_harvest', campaign.targetDomain, ch.id, i + 100));
        channelCounts[ch.id] = (channelCounts[ch.id] || 0) + 2;
      });
    } else {
      for (let v = 0; v < variantCount; v += 1) {
        templates.push(buildTemplate(campaign.campaignProfile, campaign.targetDomain, 'default', v));
      }
      channelCounts.default = variantCount;
    }

    const powerMult = campaign.maxPower ? 1.15 : 1;
    const godMult = campaign.godMode ? 1.25 : 1;
    const riskScore = computeRiskScore(profile, domainChecks, campaign.maxPower, campaign.godMode);

    let emailsSent = 0;
    let emailsFailed = 0;

    if (campaign.sendLive && campaign.targetEmails.length) {
      const simBanner = '[AUTHORIZED PHISHING SIMULATION — DO NOT ENTER REAL CREDENTIALS]\n\n';
      for (const email of campaign.targetEmails) {
        const template = templates[emailsSent % templates.length];
        try {
          await sendEmail({
            settings,
            to: email,
            subject: `[SIMULATION] ${template.subject}`,
            message: `${simBanner}${template.body}\n\n---\nThis is an authorized security awareness test. Report suspicious emails to your IT team.`,
          });
          emailsSent += 1;
        } catch {
          emailsFailed += 1;
        }
      }
    }

    const targetsTotal = campaign.targetEmails.length || Math.max(10, variantCount * 5);
    const predictedOpenRate = Math.min(99, Math.round(profile.openRate * powerMult * godMult));
    const predictedClickRate = Math.min(99, Math.round(profile.clickRate * powerMult * godMult));
    const predictedSubmitRate = Math.min(99, Math.round(profile.submitRate * powerMult * godMult));

    const findings = buildFindings(profile, domainChecks, riskScore);

    campaign.report = {
      riskScore,
      riskGrade: riskGrade(riskScore),
      vulnerabilityLevel: vulnerabilityLevel(riskScore),
      targetsTotal,
      emailsSent,
      emailsFailed,
      predictedOpenRate,
      predictedClickRate,
      predictedSubmitRate,
      effectivenessScore: Math.min(100, Math.round(profile.effectiveness * powerMult * godMult)),
      templates,
      domainChecks,
      findings,
      godMode: campaign.godMode,
      maxPower: campaign.maxPower,
      aiProviderChannels: campaign.godMode ? channels.length : 0,
      aiProvidersUsed: campaign.godMode ? channels.map((c) => c.id) : [],
      channelCounts,
      summary: {
        critical: findings.filter((f) => f.severity === 'critical').length,
        high: findings.filter((f) => f.severity === 'high').length,
        medium: findings.filter((f) => f.severity === 'medium').length,
        templatesGenerated: templates.length,
        vectors: profile.vectors,
      },
    };

    campaign.status = 'completed';
  } catch (error) {
    campaign.status = 'failed';
    campaign.errorMessage = error.message || 'Phishing simulation failed';
  } finally {
    campaign.finishedAt = new Date();
    await campaign.save();
  }
}

export function getCampaignProfilesMeta() {
  return Object.entries(CAMPAIGN_PROFILES).map(([id, p]) => ({
    id,
    label: p.label,
    description: p.description,
    effectiveness: p.effectiveness,
    vectors: p.vectors,
  }));
}
