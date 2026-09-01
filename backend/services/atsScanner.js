import { runAiChat } from './aiProvider.js';

const ACTION_VERBS = [
  'achieved', 'built', 'created', 'delivered', 'designed', 'developed', 'implemented',
  'improved', 'increased', 'led', 'managed', 'optimized', 'reduced', 'resolved',
  'automated', 'collaborated', 'deployed', 'engineered', 'executed', 'launched',
  'maintained', 'migrated', 'negotiated', 'planned', 'produced', 'streamlined',
];

const SECTION_PATTERNS = {
  experience: /experience|employment|work history|professional experience|career/i,
  education: /education|academic|qualification|degree|university|college/i,
  skills: /skills|technical skills|core competencies|technologies|expertise/i,
  summary: /summary|profile|objective|about me|professional summary/i,
  projects: /projects|portfolio/i,
  certifications: /certification|certificate|licenses/i,
};

function normalize(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function wordCount(text) {
  return normalize(text).split(/\s+/).filter(Boolean).length;
}

function hasEmail(text) {
  return /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text);
}

function hasPhone(text) {
  return /(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?\d{3,4}[\s-]?\d{4,}/.test(text);
}

function hasLinkedIn(text) {
  return /linkedin\.com\/in\//i.test(text);
}

function countMatches(text, regex) {
  const m = text.match(regex);
  return m ? m.length : 0;
}

function scoreCategory(score, max) {
  const pct = max ? Math.round((score / max) * 100) : 0;
  let status = 'fail';
  if (pct >= 85) status = 'excellent';
  else if (pct >= 70) status = 'good';
  else if (pct >= 50) status = 'warning';
  return { score, maxScore: max, percent: pct, status };
}

/** Strict rule-based ATS checks — harsh scoring. */
export function runStrictAtsRules(resumeText, targetRole = '') {
  const text = normalize(resumeText);
  const lower = text.toLowerCase();
  const words = wordCount(text);
  const categories = [];
  const criticalIssues = [];
  const recommendations = [];
  const keywordsFound = [];
  const keywordsMissing = [];

  if (words < 80) {
    criticalIssues.push('Resume text is too short or could not be extracted — ATS may reject empty files.');
  }

  // 1. Contact (12)
  let contactScore = 0;
  const contactIssues = [];
  if (hasEmail(text)) contactScore += 4; else contactIssues.push('Missing professional email address');
  if (hasPhone(text)) contactScore += 4; else contactIssues.push('Missing phone number');
  if (hasLinkedIn(text)) contactScore += 2; else contactIssues.push('LinkedIn profile URL not found');
  if (/^[A-Z][a-z]+ [A-Z]/m.test(text) || /\b(name|resume)\b/i.test(text.slice(0, 200))) contactScore += 2;
  else contactIssues.push('Name/header not clearly visible at top');
  categories.push({
    id: 'contact',
    name: 'Contact & Header',
    ...scoreCategory(contactScore, 12),
    issues: contactIssues,
    tips: ['Place name, email, phone, and LinkedIn on the first lines — no header/footer only.'],
  });

  // 2. Structure (14)
  let structScore = 0;
  const structIssues = [];
  for (const [key, pattern] of Object.entries(SECTION_PATTERNS)) {
    if (pattern.test(text)) {
      structScore += key === 'experience' || key === 'education' || key === 'skills' ? 3 : 1;
    } else if (['experience', 'education', 'skills'].includes(key)) {
      structIssues.push(`Missing clear "${key}" section heading`);
    }
  }
  structScore = Math.min(14, structScore);
  if (!SECTION_PATTERNS.experience.test(text)) criticalIssues.push('No Experience section — mandatory for ATS.');
  if (!SECTION_PATTERNS.skills.test(text)) criticalIssues.push('No Skills section — ATS keyword matching will fail.');
  categories.push({
    id: 'structure',
    name: 'Section Structure',
    ...scoreCategory(structScore, 14),
    issues: structIssues,
    tips: ['Use standard headings: Summary, Experience, Skills, Education, Projects.'],
  });

  // 3. ATS format (14)
  let formatScore = 14;
  const formatIssues = [];
  if (/\|{3,}|┌|┐|table/i.test(text)) { formatScore -= 4; formatIssues.push('Possible tables detected — many ATS cannot parse tables'); }
  if (countMatches(text, /[^\x00-\x7F]/g) > 25) { formatScore -= 2; formatIssues.push('Heavy special characters — may break ATS parsing'); }
  if (countMatches(text, /(?:https?:\/\/|www\.)/gi) > 8) { formatScore -= 1; formatIssues.push('Too many URLs inline — move links to contact block'); }
  if (text.includes('Page 1 of') || text.includes('Page 2 of')) { formatScore -= 2; formatIssues.push('Page markers detected — use continuous single-column flow'); }
  if (words > 1200) { formatScore -= 2; formatIssues.push('Resume may be too long (>2 pages) for many ATS'); }
  if (words > 0 && words < 250) { formatScore -= 3; formatIssues.push('Resume too thin — expand with achievements and skills'); }
  formatScore = Math.max(0, formatScore);
  categories.push({
    id: 'format',
    name: 'ATS Format Compatibility',
    ...scoreCategory(formatScore, 14),
    issues: formatIssues,
    tips: ['Single column, standard fonts, no text boxes, no graphics-only headers.'],
  });

  // 4. Keywords & role match (14)
  let kwScore = 0;
  const kwIssues = [];
  const roleWords = targetRole
    ? targetRole.toLowerCase().split(/[\s,/|-]+/).filter((w) => w.length > 2)
    : [];
  const skillHits = countMatches(lower, /\b(javascript|python|java|react|node|sql|aws|docker|git|api|html|css|typescript|angular|vue|mongodb|excel|communication|leadership|management|sales|marketing|hr|finance|accounting|design|testing|agile|scrum)\b/gi);
  kwScore += Math.min(6, skillHits * 2);
  if (skillHits >= 3) keywordsFound.push(`${skillHits} technical/soft skill keywords detected`);
  else kwIssues.push('Low keyword density — add role-specific skills');

  if (roleWords.length) {
    const matched = roleWords.filter((w) => lower.includes(w));
    matched.forEach((w) => keywordsFound.push(w));
    roleWords.filter((w) => !lower.includes(w)).forEach((w) => keywordsMissing.push(w));
    kwScore += Math.min(8, Math.round((matched.length / roleWords.length) * 8));
    if (matched.length < roleWords.length * 0.5) {
      kwIssues.push(`Target role "${targetRole}" keywords largely missing from resume`);
      criticalIssues.push(`Resume not aligned to target role: ${targetRole}`);
    }
  } else {
    kwScore += skillHits >= 2 ? 4 : 0;
    if (skillHits < 2) kwIssues.push('Add a dedicated Skills section with ATS keywords');
  }
  categories.push({
    id: 'keywords',
    name: 'Keywords & Role Match',
    ...scoreCategory(Math.min(14, kwScore), 14),
    issues: kwIssues,
    tips: ['Mirror exact phrases from the job description in Skills and Experience bullets.'],
  });

  // 5. Experience quality (14)
  let expScore = 0;
  const expIssues = [];
  const verbHits = ACTION_VERBS.filter((v) => lower.includes(v)).length;
  expScore += Math.min(6, verbHits * 2);
  if (verbHits < 3) expIssues.push('Few action verbs — start bullets with Achieved, Led, Built, Improved…');
  const dateHits = countMatches(text, /\b(20\d{2}|19\d{2})\b/g);
  expScore += Math.min(4, dateHits >= 2 ? 4 : dateHits * 2);
  if (dateHits < 2) expIssues.push('Missing employment dates (year) — ATS timeline parsing fails');
  if (/\b(intern|developer|engineer|manager|analyst|executive|associate|consultant|designer)\b/i.test(text)) expScore += 2;
  else expIssues.push('Job titles not clearly stated');
  if (SECTION_PATTERNS.experience.test(text)) expScore += 2;
  categories.push({
    id: 'experience',
    name: 'Experience Quality',
    ...scoreCategory(Math.min(14, expScore), 14),
    issues: expIssues,
    tips: ['Use: Action verb + task + metric + result for each bullet.'],
  });

  // 6. Quantifiable impact (10)
  let metricScore = 0;
  const metricIssues = [];
  const numHits = countMatches(text, /\b\d+%|\b\d+\+|\$\d|₹\d|\d{1,3}(?:,\d{3})+|\b\d+\s*(?:years|yrs|months|mo)\b/gi);
  metricScore += Math.min(10, numHits * 2);
  if (numHits < 3) {
    metricIssues.push('Insufficient metrics — add %, revenue, time saved, team size, KPIs');
    recommendations.push('Add 3–5 quantified achievements (e.g. "Increased sales 25%", "Managed team of 8").');
  }
  categories.push({
    id: 'metrics',
    name: 'Quantifiable Impact',
    ...scoreCategory(metricScore, 10),
    issues: metricIssues,
    tips: ['Numbers prove impact — ATS and recruiters scan for digits and percentages.'],
  });

  // 7. Education (8)
  let eduScore = 0;
  const eduIssues = [];
  if (SECTION_PATTERNS.education.test(text)) eduScore += 4;
  else eduIssues.push('Education section missing');
  if (/\b(b\.?tech|b\.?e|b\.?sc|m\.?tech|mba|b\.?com|bca|mca|diploma|degree|bachelor|master|ph\.?d)\b/i.test(text)) eduScore += 4;
  else eduIssues.push('Degree/qualification not clearly mentioned');
  categories.push({
    id: 'education',
    name: 'Education & Certifications',
    ...scoreCategory(eduScore, 8),
    issues: eduIssues,
    tips: ['List degree, institution, year. Add certifications if relevant.'],
  });

  // 8. Clarity (8)
  let clarityScore = 8;
  const clarityIssues = [];
  const avgWordLen = words ? text.replace(/\s/g, '').length / words : 0;
  if (avgWordLen > 7) { clarityScore -= 2; clarityIssues.push('Sentences may be too complex — shorten bullets'); }
  if (countMatches(text, /\b(I am|I have been|responsible for)\b/gi) > 5) {
    clarityScore -= 2;
    clarityIssues.push('Too passive ("responsible for") — use strong action verbs');
  }
  if (countMatches(text, /[.!?]{2,}/g) > 0) clarityScore -= 1;
  categories.push({
    id: 'clarity',
    name: 'Clarity & Readability',
    ...scoreCategory(Math.max(0, clarityScore), 8),
    issues: clarityIssues,
    tips: ['Keep bullets under 2 lines. Avoid paragraphs in experience section.'],
  });

  // 9. Length (6)
  let lenScore = 0;
  const lenIssues = [];
  if (words >= 350 && words <= 900) lenScore = 6;
  else if (words >= 250 && words <= 1100) lenScore = 4;
  else if (words >= 150) lenScore = 2;
  else lenIssues.push(`Word count ${words} — aim for 350–800 words (1–2 pages)`);
  categories.push({
    id: 'length',
    name: 'Length & Density',
    ...scoreCategory(lenScore, 6),
    issues: lenIssues,
    tips: ['1 page for freshers, 2 pages max for experienced professionals.'],
  });

  const ruleTotal = categories.reduce((sum, c) => sum + c.score, 0);
  const ruleMax = categories.reduce((sum, c) => sum + c.maxScore, 0);
  const rulePercent = ruleMax ? Math.round((ruleTotal / ruleMax) * 100) : 0;

  return {
    ruleScore: rulePercent,
    rulePoints: ruleTotal,
    ruleMax,
    categories,
    criticalIssues,
    recommendations,
    keywordsFound,
    keywordsMissing,
    wordCount: words,
  };
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

export async function runAiDeepAtsScan({ settings, resumeText, targetRole, jobDescription }) {
  const excerpt = resumeText.slice(0, 12000);
  const systemPrompt = `You are a STRICT ATS (Applicant Tracking System) auditor. Score harshly like enterprise ATS (Workday, Taleo, Greenhouse).
Return ONLY valid JSON:
{
  "aiScore": 0-100,
  "grade": "A|B|C|D|F",
  "verdict": "short verdict",
  "criticalIssues": ["..."],
  "recommendations": ["..."],
  "keywordGaps": ["..."],
  "strengths": ["..."],
  "categoryNotes": {
    "contact": "note",
    "structure": "note",
    "keywords": "note",
    "experience": "note",
    "metrics": "note",
    "format": "note"
  },
  "atsPassProbability": "0-100%",
  "fresherOrExperienced": "fresher|experienced|unknown"
}
Be VERY strict: score below 50 if missing sections, no metrics, or poor role fit. No markdown.`;

  const userPrompt = `Deep ATS scan this resume.
Target role: ${targetRole || 'General'}
${jobDescription ? `Job description:\n${jobDescription.slice(0, 3000)}` : ''}

Resume text:
${excerpt}`;

  const reply = await runAiChat({
    settings,
    systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.2,
    maxTokens: 2048,
  });

  return extractJson(reply);
}

export function combineAtsScores(rulePercent, aiScore) {
  const ai = Math.min(100, Math.max(0, Number(aiScore) || 0));
  const combined = Math.round(rulePercent * 0.5 + ai * 0.5);
  return Math.min(100, Math.max(0, combined));
}

export function scoreToGrade(score) {
  if (score >= 90) return { grade: 'A', verdict: 'Excellent — ATS optimized' };
  if (score >= 80) return { grade: 'B', verdict: 'Good — minor improvements needed' };
  if (score >= 65) return { grade: 'C', verdict: 'Average — several ATS gaps' };
  if (score >= 50) return { grade: 'D', verdict: 'Weak — likely filtered by ATS' };
  return { grade: 'F', verdict: 'Poor — major rewrite required' };
}

export async function scanResumeStrict({
  settings,
  resumeText,
  targetRole = '',
  jobDescription = '',
  useAi = true,
}) {
  const rules = runStrictAtsRules(resumeText, targetRole);
  let aiAnalysis = null;
  let aiScore = rules.ruleScore;

  if (useAi && settings?.aiApiKey) {
    try {
      aiAnalysis = await runAiDeepAtsScan({
        settings,
        resumeText,
        targetRole,
        jobDescription,
      });
      aiScore = Number(aiAnalysis.aiScore) || rules.ruleScore;
      if (Array.isArray(aiAnalysis.criticalIssues)) {
        rules.criticalIssues.push(...aiAnalysis.criticalIssues.filter((x) => !rules.criticalIssues.includes(x)));
      }
      if (Array.isArray(aiAnalysis.recommendations)) {
        rules.recommendations.push(...aiAnalysis.recommendations.filter((x) => !rules.recommendations.includes(x)));
      }
      if (Array.isArray(aiAnalysis.keywordGaps)) {
        aiAnalysis.keywordGaps.forEach((k) => {
          if (!rules.keywordsMissing.includes(k)) rules.keywordsMissing.push(k);
        });
      }
    } catch {
      aiAnalysis = { error: 'AI deep scan unavailable — rule-based score only' };
    }
  }

  const overallScore = combineAtsScores(rules.ruleScore, aiScore);
  const { grade, verdict } = scoreToGrade(overallScore);

  return {
    overallScore,
    ruleScore: rules.ruleScore,
    aiScore: aiAnalysis?.aiScore ?? null,
    grade,
    verdict: aiAnalysis?.verdict || verdict,
    atsPassProbability: aiAnalysis?.atsPassProbability || `${Math.max(0, overallScore - 10)}%`,
    fresherOrExperienced: aiAnalysis?.fresherOrExperienced || 'unknown',
    wordCount: rules.wordCount,
    categories: rules.categories,
    criticalIssues: [...new Set(rules.criticalIssues)].slice(0, 15),
    recommendations: [...new Set(rules.recommendations)].slice(0, 15),
    keywordsFound: rules.keywordsFound,
    keywordsMissing: rules.keywordsMissing,
    strengths: aiAnalysis?.strengths || [],
    aiAnalysis,
    scanMode: aiAnalysis && !aiAnalysis.error ? 'strict+ai' : 'strict-rules',
  };
}
