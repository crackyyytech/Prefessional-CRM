import { runAiChat } from './aiProvider.js';
import { scanResumeStrict } from './atsScanner.js';

function normalize(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function cleanList(items) {
  return (items || []).map((s) => normalize(s)).filter(Boolean);
}

function formatDateRange(start, end, current) {
  const s = normalize(start);
  const e = current ? 'Present' : normalize(end);
  if (s && e) return `${s} – ${e}`;
  return s || e || '';
}

export function emptyResumeData() {
  return {
    name: '',
    email: '',
    phone: '',
    location: '',
    linkedin: '',
    github: '',
    portfolio: '',
    targetRole: '',
    jobDescription: '',
    summary: '',
    experience: [{
      title: '',
      company: '',
      location: '',
      startDate: '',
      endDate: '',
      current: false,
      bullets: [''],
    }],
    education: [{
      degree: '',
      institution: '',
      year: '',
      gpa: '',
    }],
    skills: {
      technical: [],
      soft: [],
    },
    projects: [{
      name: '',
      description: '',
      technologies: '',
      link: '',
    }],
    certifications: [{
      name: '',
      issuer: '',
      year: '',
    }],
  };
}

export function sanitizeResumeData(raw = {}) {
  const base = emptyResumeData();
  const data = { ...base, ...raw };

  data.name = normalize(data.name);
  data.email = normalize(data.email);
  data.phone = normalize(data.phone);
  data.location = normalize(data.location);
  data.linkedin = normalize(data.linkedin);
  data.github = normalize(data.github);
  data.portfolio = normalize(data.portfolio);
  data.targetRole = normalize(data.targetRole);
  data.jobDescription = String(data.jobDescription || '').trim();
  data.summary = String(data.summary || '').trim();

  data.experience = Array.isArray(data.experience) && data.experience.length
    ? data.experience.map((exp) => ({
      title: normalize(exp.title),
      company: normalize(exp.company),
      location: normalize(exp.location),
      startDate: normalize(exp.startDate),
      endDate: normalize(exp.endDate),
      current: Boolean(exp.current),
      bullets: cleanList(exp.bullets).length ? cleanList(exp.bullets) : [''],
    }))
    : base.experience;

  data.education = Array.isArray(data.education) && data.education.length
    ? data.education.map((edu) => ({
      degree: normalize(edu.degree),
      institution: normalize(edu.institution),
      year: normalize(edu.year),
      gpa: normalize(edu.gpa),
    }))
    : base.education;

  data.skills = {
    technical: cleanList(data.skills?.technical || (typeof data.skills?.technical === 'string'
      ? data.skills.technical.split(',')
      : [])),
    soft: cleanList(data.skills?.soft || (typeof data.skills?.soft === 'string'
      ? data.skills.soft.split(',')
      : [])),
  };

  data.projects = Array.isArray(data.projects) && data.projects.length
    ? data.projects.map((p) => ({
      name: normalize(p.name),
      description: normalize(p.description),
      technologies: normalize(p.technologies),
      link: normalize(p.link),
    }))
    : base.projects;

  data.certifications = Array.isArray(data.certifications) && data.certifications.length
    ? data.certifications.map((c) => ({
      name: normalize(c.name),
      issuer: normalize(c.issuer),
      year: normalize(c.year),
    }))
    : base.certifications;

  return data;
}

/** Compose ATS-friendly plain-text resume from structured data. */
export function composeResumeText(data) {
  const d = sanitizeResumeData(data);
  const lines = [];

  if (d.name) lines.push(d.name.toUpperCase());
  const contact = [
    d.email,
    d.phone,
    d.location,
    d.linkedin,
    d.github,
    d.portfolio,
  ].filter(Boolean);
  if (contact.length) lines.push(contact.join(' | '));
  lines.push('');

  if (d.summary) {
    lines.push('PROFESSIONAL SUMMARY');
    lines.push(d.summary);
    lines.push('');
  }

  const expEntries = d.experience.filter((e) => e.title || e.company || e.bullets.some(Boolean));
  if (expEntries.length) {
    lines.push('EXPERIENCE');
    expEntries.forEach((exp) => {
      const header = [exp.title, exp.company, exp.location].filter(Boolean).join(' | ');
      const dates = formatDateRange(exp.startDate, exp.endDate, exp.current);
      lines.push(dates ? `${header} | ${dates}` : header);
      exp.bullets.filter(Boolean).forEach((b) => lines.push(`• ${b}`));
      lines.push('');
    });
  }

  const eduEntries = d.education.filter((e) => e.degree || e.institution);
  if (eduEntries.length) {
    lines.push('EDUCATION');
    eduEntries.forEach((edu) => {
      const parts = [edu.degree, edu.institution, edu.year].filter(Boolean);
      lines.push(parts.join(' | ') + (edu.gpa ? ` | GPA: ${edu.gpa}` : ''));
    });
    lines.push('');
  }

  const allSkills = [...d.skills.technical, ...d.skills.soft];
  if (allSkills.length) {
    lines.push('SKILLS');
    if (d.skills.technical.length) lines.push(`Technical: ${d.skills.technical.join(', ')}`);
    if (d.skills.soft.length) lines.push(`Soft Skills: ${d.skills.soft.join(', ')}`);
    lines.push('');
  }

  const projEntries = d.projects.filter((p) => p.name || p.description);
  if (projEntries.length) {
    lines.push('PROJECTS');
    projEntries.forEach((p) => {
      lines.push(p.name + (p.technologies ? ` | ${p.technologies}` : ''));
      if (p.description) lines.push(`• ${p.description}`);
      if (p.link) lines.push(p.link);
    });
    lines.push('');
  }

  const certEntries = d.certifications.filter((c) => c.name);
  if (certEntries.length) {
    lines.push('CERTIFICATIONS');
    certEntries.forEach((c) => {
      lines.push([c.name, c.issuer, c.year].filter(Boolean).join(' | '));
    });
  }

  return lines.join('\n').trim();
}

function extractJson(text) {
  const cleaned = String(text || '').replace(/```json/gi, '```').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('AI did not return valid JSON');
  }
}

export async function analyzeResumeDraft({ resumeData, settings, useAi = true }) {
  const text = composeResumeText(resumeData);
  if (text.length < 80) {
    throw new Error('Add more resume content before analysis (name, summary, experience, or skills).');
  }

  return scanResumeStrict({
    settings: settings || {},
    resumeText: text,
    targetRole: resumeData.targetRole || '',
    jobDescription: resumeData.jobDescription || '',
    useAi: useAi && Boolean(settings?.aiApiKey),
  });
}

export async function optimizeResumeWithAi({
  settings,
  resumeData,
  report,
  targetRole,
  jobDescription,
}) {
  const currentText = composeResumeText(resumeData);
  const systemPrompt = `You are an expert ATS resume writer and career coach. Rewrite the resume data to maximize ATS pass rate.
Return ONLY valid JSON matching this schema:
{
  "resumeData": {
    "name": "",
    "email": "",
    "phone": "",
    "location": "",
    "linkedin": "",
    "github": "",
    "portfolio": "",
    "summary": "",
    "experience": [{ "title": "", "company": "", "location": "", "startDate": "", "endDate": "", "current": false, "bullets": [""] }],
    "education": [{ "degree": "", "institution": "", "year": "", "gpa": "" }],
    "skills": { "technical": [], "soft": [] },
    "projects": [{ "name": "", "description": "", "technologies": "", "link": "" }],
    "certifications": [{ "name": "", "issuer": "", "year": "" }]
  },
  "optimizationNotes": ["what you improved"],
  "keywordAdditions": ["keywords added"],
  "expectedImprovements": "short summary of score/ATS gains"
}
Rules:
- Keep all factual info (names, companies, dates) unless clearly placeholder
- Use strong action verbs + metrics in bullets
- Mirror job description keywords naturally
- ATS-safe: no tables, no graphics, standard section headings in composed text
- 350-800 words total when composed
- No markdown in JSON values`;

  const userPrompt = `Target role: ${targetRole || resumeData.targetRole || 'General'}
${jobDescription || resumeData.jobDescription ? `Job description:\n${(jobDescription || resumeData.jobDescription).slice(0, 3500)}` : ''}

Current ATS score: ${report?.overallScore ?? 'unknown'}/100
Critical issues: ${(report?.criticalIssues || []).slice(0, 8).join('; ') || 'none'}
Missing keywords: ${(report?.keywordsMissing || []).slice(0, 12).join(', ') || 'none'}
Recommendations: ${(report?.recommendations || []).slice(0, 8).join('; ') || 'none'}

Current resume JSON:
${JSON.stringify(sanitizeResumeData(resumeData), null, 2)}

Current plain text:
${currentText.slice(0, 8000)}`;

  const reply = await runAiChat({
    settings,
    systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.35,
    maxTokens: 4096,
  });

  const parsed = extractJson(reply);
  const optimized = sanitizeResumeData({
    ...resumeData,
    ...parsed.resumeData,
    targetRole: resumeData.targetRole,
    jobDescription: resumeData.jobDescription,
  });

  return {
    resumeData: optimized,
    resumeText: composeResumeText(optimized),
    optimizationNotes: parsed.optimizationNotes || [],
    keywordAdditions: parsed.keywordAdditions || [],
    expectedImprovements: parsed.expectedImprovements || 'Resume optimized for ATS',
  };
}

export async function buildAndAnalyzeResume({ resumeData, settings, useAi = true }) {
  const sanitized = sanitizeResumeData(resumeData);
  const resumeText = composeResumeText(sanitized);
  const report = await analyzeResumeDraft({
    resumeData: sanitized,
    settings,
    useAi,
  });
  return { resumeData: sanitized, resumeText, report };
}

export async function buildOptimizeAndAnalyze({ resumeData, settings, report, useAi = true }) {
  if (!settings?.aiApiKey) {
    throw new Error('Configure an AI provider in Settings to run resume optimization.');
  }

  const optimization = await optimizeResumeWithAi({
    settings,
    resumeData,
    report,
    targetRole: resumeData.targetRole,
    jobDescription: resumeData.jobDescription,
  });

  const newReport = await analyzeResumeDraft({
    resumeData: optimization.resumeData,
    settings,
    useAi,
  });

  return {
    ...optimization,
    report: newReport,
    scoreBefore: report?.overallScore ?? null,
    scoreAfter: newReport.overallScore,
  };
}
