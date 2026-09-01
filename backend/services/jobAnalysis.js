function clean(value) {
  return String(value || '').trim();
}

function isValidEmail(email) {
  const value = clean(email).toLowerCase();
  return value.length > 5 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhone(phone) {
  const digits = clean(phone).replace(/\D/g, '');
  return digits.length >= 10 && !/^(\d)\1+$/.test(digits);
}

function isValidUrl(url) {
  const value = clean(url);
  return /^https?:\/\/.+/i.test(value) || /^[\w.-]+\.(com|in|org|net|co)/i.test(value);
}

/** Weighted job data completeness 0–100 for outreach / application readiness. */
export function calculateJobCompleteness(job = {}) {
  const checks = [
    { weight: 12, ok: () => clean(job.jobTitle).length >= 3 },
    { weight: 10, ok: () => clean(job.role).length >= 2 },
    { weight: 10, ok: () => clean(job.company).length >= 2 },
    { weight: 8, ok: () => clean(job.city || job.location).length >= 2 },
    { weight: 10, ok: () => ['fresher', 'experienced', 'both'].includes(clean(job.experienceLevel).toLowerCase()) },
    { weight: 8, ok: () => clean(job.experienceYears).length >= 1 },
    { weight: 12, ok: () => (Array.isArray(job.requirements) ? job.requirements.length : 0) >= 2 },
    { weight: 10, ok: () => (Array.isArray(job.skills) ? job.skills.length : 0) >= 2 },
    { weight: 8, ok: () => isValidPhone(job.contactPhone) || isValidEmail(job.contactEmail) },
    { weight: 6, ok: () => clean(job.contactName).length >= 2 },
    { weight: 8, ok: () => isValidUrl(job.website) || isValidUrl(job.applyUrl) },
    { weight: 8, ok: () => clean(job.salaryRange).length >= 2 || clean(job.jobType).length >= 2 },
  ];

  let score = 0;
  const breakdown = {};
  const fields = [
    'jobTitle', 'role', 'company', 'location', 'experienceLevel',
    'experienceYears', 'requirements', 'skills', 'contact', 'contactName',
    'website', 'compensation',
  ];

  checks.forEach((check, index) => {
    const passed = Boolean(check.ok());
    if (passed) score += check.weight;
    breakdown[fields[index]] = passed;
  });

  return {
    dataCompleteness: Math.min(100, Math.round(score)),
    breakdown,
    missingFields: Object.entries(breakdown).filter(([, ok]) => !ok).map(([field]) => field),
  };
}

export function isVerifiedJob(job = {}) {
  if (job.isVerified === false) return false;
  const { dataCompleteness } = calculateJobCompleteness(job);
  const hasContact = isValidPhone(job.contactPhone) || isValidEmail(job.contactEmail);
  const hasRole = clean(job.jobTitle) && clean(job.role || job.jobTitle);
  return hasRole && hasContact && dataCompleteness >= 55;
}

export function analyzeJob(job = {}) {
  const { dataCompleteness, breakdown, missingFields } = calculateJobCompleteness(job);
  return {
    dataCompleteness,
    isVerified: isVerifiedJob({ ...job, dataCompleteness }),
    breakdown,
    missingFields,
  };
}

export function enrichJobDocument(job) {
  const plain = typeof job.toObject === 'function' ? job.toObject() : { ...job };
  const analysis = analyzeJob(plain);
  plain.dataCompleteness = analysis.dataCompleteness;
  plain.isVerified = analysis.isVerified;
  plain.jobAnalysis = analysis.breakdown;
  return plain;
}

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function jobsToCsv(jobs = []) {
  const headers = [
    'jobTitle', 'role', 'company', 'location', 'city', 'area',
    'experienceLevel', 'experienceYears', 'requirements', 'skills',
    'salaryRange', 'jobType', 'contactName', 'contactEmail', 'contactPhone',
    'website', 'applyUrl', 'postedDate', 'dataCompleteness', 'isVerified',
    'source', 'notes', 'savedAt', 'createdAt',
  ];

  const rows = jobs.map((job) => [
    job.jobTitle, job.role, job.company, job.location, job.city, job.area,
    job.experienceLevel, job.experienceYears,
    (job.requirements || []).join('; '),
    (job.skills || []).join('; '),
    job.salaryRange, job.jobType,
    job.contactName, job.contactEmail, job.contactPhone,
    job.website, job.applyUrl, job.postedDate,
    job.dataCompleteness ?? '', job.isVerified === false ? 'No' : 'Yes',
    job.source || '', job.notes || '',
    job.savedAt ? new Date(job.savedAt).toISOString() : '',
    job.createdAt ? new Date(job.createdAt).toISOString() : '',
  ].map(csvEscape).join(','));

  return [headers.join(','), ...rows].join('\n');
}
