const PLACEHOLDER_NAMES = new Set([
  'lead', 'nearby', 'contact', 'owner', 'manager', 'local business', 'business', 'n/a', 'na', 'unknown',
]);
const PLACEHOLDER_COMPANIES = new Set([
  'local business', 'business', 'n/a', 'na', 'unknown', 'company', 'shop', 'store',
]);
const FAKE_EMAIL_PATTERNS = [
  /@example\./i,
  /@test\./i,
  /@sample\./i,
  /^noreply@/i,
  /^no-reply@/i,
  /^info@example/i,
  /@domain\.com$/i,
  /^email@/i,
  /^test@/i,
];

function clean(value) {
  return String(value || '').trim();
}

export function isValidEmail(email) {
  const value = clean(email).toLowerCase();
  if (!value) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return false;
  return !FAKE_EMAIL_PATTERNS.some((pattern) => pattern.test(value));
}

export function isValidPhone(phone) {
  const digits = clean(phone).replace(/\D/g, '');
  if (digits.length < 10) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  return true;
}

export function isPlaceholderName(firstName, lastName) {
  const full = `${clean(firstName)} ${clean(lastName)}`.trim().toLowerCase();
  if (!full || full === 'lead nearby' || full === 'lead contact') return true;
  if (PLACEHOLDER_NAMES.has(clean(firstName).toLowerCase()) && PLACEHOLDER_NAMES.has(clean(lastName).toLowerCase())) {
    return true;
  }
  return false;
}

export function isPlaceholderCompany(company) {
  const value = clean(company).toLowerCase();
  if (!value) return true;
  return PLACEHOLDER_COMPANIES.has(value);
}

/** Weighted completeness 0–100 for lead alignment / outreach readiness. */
export function calculateLeadCompleteness(lead = {}) {
  const checks = [
    { weight: 8, ok: () => clean(lead.firstName) && !PLACEHOLDER_NAMES.has(clean(lead.firstName).toLowerCase()) },
    { weight: 7, ok: () => clean(lead.lastName) && !PLACEHOLDER_NAMES.has(clean(lead.lastName).toLowerCase()) },
    { weight: 12, ok: () => clean(lead.company) && !isPlaceholderCompany(lead.company) },
    { weight: 15, ok: () => isValidPhone(lead.phone) },
    { weight: 10, ok: () => isValidEmail(lead.email) },
    { weight: 10, ok: () => clean(lead.address).length >= 5 },
    { weight: 5, ok: () => clean(lead.city).length >= 2 },
    { weight: 5, ok: () => clean(lead.area).length >= 2 },
    { weight: 8, ok: () => clean(lead.category || lead.needType).length >= 2 },
    { weight: 8, ok: () => typeof lead.hasWebsite === 'boolean' || clean(lead.websiteStatus) },
    { weight: 7, ok: () => Array.isArray(lead.marketingChannels) ? lead.marketingChannels.length > 0 : clean(lead.marketingChannels).length > 0 },
    { weight: 8, ok: () => clean(lead.digitalPresence).length >= 8 },
    { weight: 7, ok: () => clean(lead.currentTools || lead.notes).length >= 8 },
  ];

  let score = 0;
  const breakdown = {};
  for (const check of checks) {
    const passed = Boolean(check.ok());
    if (passed) score += check.weight;
    breakdown[check.weight] = passed;
  }

  return {
    dataCompleteness: Math.min(100, Math.round(score)),
    breakdown: {
      contactName: checks[0].ok() && checks[1].ok(),
      company: checks[2].ok(),
      phone: checks[3].ok(),
      email: checks[4].ok(),
      address: checks[5].ok(),
      location: checks[6].ok() && checks[7].ok(),
      category: checks[8].ok(),
      websiteInfo: checks[9].ok(),
      marketing: checks[10].ok(),
      digitalPresence: checks[11].ok(),
      insights: checks[12].ok(),
    },
  };
}

/** Original = real business lead, not AI placeholder / duplicate pattern. */
export function isOriginalLead(lead = {}) {
  if (lead.isOriginal === false) return false;

  const company = clean(lead.company);
  const hasContact = !isPlaceholderName(lead.firstName, lead.lastName);
  const hasCompany = company && !isPlaceholderCompany(company);
  const hasReach = isValidPhone(lead.phone) || isValidEmail(lead.email);

  if (!hasCompany && !hasContact) return false;
  if (!hasReach) return false;

  const notes = clean(lead.notes).toLowerCase();
  if (/verify details|example only|placeholder|fictional|sample data/i.test(notes)) return false;

  const { dataCompleteness } = calculateLeadCompleteness(lead);
  return dataCompleteness >= 50;
}

export function analyzeLead(lead = {}) {
  const { dataCompleteness, breakdown } = calculateLeadCompleteness(lead);
  const original = isOriginalLead({ ...lead, dataCompleteness });
  return {
    dataCompleteness,
    isOriginal: original,
    breakdown,
    missingFields: Object.entries(breakdown)
      .filter(([, ok]) => !ok)
      .map(([field]) => field),
  };
}

export function enrichLeadDocument(lead) {
  const plain = typeof lead.toObject === 'function' ? lead.toObject() : { ...lead };
  const analysis = analyzeLead(plain);
  plain.dataCompleteness = analysis.dataCompleteness;
  plain.isOriginal = analysis.isOriginal;
  plain.leadAnalysis = analysis.breakdown;
  return plain;
}

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function leadsToCsv(leads = []) {
  const headers = [
    'firstName', 'lastName', 'company', 'email', 'phone',
    'address', 'area', 'city', 'category', 'needType',
    'hasWebsite', 'websiteStatus', 'website',
    'marketingChannels', 'socialFacebook', 'socialInstagram', 'whatsappBusiness',
    'digitalPresence', 'currentTools',
    'source', 'campaign', 'formSlug',
    'utmSource', 'utmMedium', 'utmCampaign',
    'leadScore', 'leadScoreLabel', 'dataCompleteness', 'isOriginal',
    'notes', 'capturedAt', 'createdAt',
  ];

  const rows = leads.map((lead) => {
    const channels = Array.isArray(lead.marketingChannels)
      ? lead.marketingChannels.join('; ')
      : clean(lead.marketingChannels);
    return [
      lead.firstName, lead.lastName, lead.company, lead.email, lead.phone,
      lead.address, lead.area, lead.city, lead.category, lead.needType,
      lead.hasWebsite === true ? 'Yes' : lead.hasWebsite === false ? 'No' : '',
      lead.websiteStatus || '', lead.website || '',
      channels, lead.socialFacebook || '', lead.socialInstagram || '',
      lead.whatsappBusiness ? 'Yes' : 'No',
      lead.digitalPresence || '', lead.currentTools || '',
      lead.source || '', lead.campaign || '', lead.formSlug || '',
      lead.utmSource || '', lead.utmMedium || '', lead.utmCampaign || '',
      lead.leadScore ?? '', lead.leadScoreLabel || '',
      lead.dataCompleteness ?? '', lead.isOriginal === false ? 'No' : 'Yes',
      lead.notes || '',
      lead.capturedAt ? new Date(lead.capturedAt).toISOString() : '',
      lead.createdAt ? new Date(lead.createdAt).toISOString() : '',
    ].map(csvEscape).join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}
