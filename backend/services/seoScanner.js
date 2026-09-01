import { URL } from 'url';
import { runAiChat } from './aiProvider.js';

const FETCH_TIMEOUT_MS = 20000;
const MAX_HTML_BYTES = 2 * 1024 * 1024;

export function validateSeoUrl(raw) {
  let input = String(raw || '').trim();
  if (!input) throw new Error('URL is required');
  if (!/^https?:\/\//i.test(input)) input = `https://${input}`;
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error('Enter a valid URL (e.g. https://example.com)');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only http and https URLs are allowed');
  }
  return url.href;
}

function stripTags(html) {
  return String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function matchAll(html, regex) {
  const results = [];
  const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
  let m;
  while ((m = re.exec(html)) !== null) results.push(m);
  return results;
}

function metaContent(html, name) {
  const re = new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${name}["']`, 'i');
  return re.exec(html)?.[1] || re2.exec(html)?.[1] || '';
}

function ogContent(html, property) {
  const re = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${property}["']`, 'i');
  return re.exec(html)?.[1] || re2.exec(html)?.[1] || '';
}

function scoreCategory(score, max) {
  const percent = max ? Math.round((score / max) * 100) : 0;
  let status = 'fail';
  if (percent >= 85) status = 'excellent';
  else if (percent >= 70) status = 'good';
  else if (percent >= 50) status = 'warning';
  return { score, maxScore: max, percent, status };
}

async function fetchUrl(url, options = {}) {
  const started = Date.now();
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'VistawinCRM-SEO-Scanner/1.0 (+https://localhost)',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    ...options,
  });
  const buffer = await response.arrayBuffer();
  const truncated = buffer.byteLength > MAX_HTML_BYTES;
  const text = new TextDecoder('utf-8', { fatal: false }).decode(
    truncated ? buffer.slice(0, MAX_HTML_BYTES) : buffer
  );
  return {
    response,
    html: text,
    latencyMs: Date.now() - started,
    truncated,
    sizeBytes: buffer.byteLength,
  };
}

export function analyzeHtmlSeo(html, pageUrl, fetchMeta = {}) {
  const parsed = new URL(pageUrl);
  const categories = [];
  const criticalIssues = [];
  const recommendations = [];
  const checks = {};

  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
  const description = metaContent(html, 'description');
  const robots = metaContent(html, 'robots');
  const viewport = metaContent(html, 'viewport');
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]
    || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1]
    || '';
  const lang = html.match(/<html[^>]+lang=["']([^"']+)["']/i)?.[1] || '';
  const charset = html.match(/<meta[^>]+charset=["']?([^"'\s>]+)/i)?.[1] || '';

  const h1s = matchAll(html, /<h1[^>]*>([\s\S]*?)<\/h1>/gi).map((m) => stripTags(m[1])).filter(Boolean);
  const h2Count = matchAll(html, /<h2[\s>]/gi).length;
  const h3Count = matchAll(html, /<h3[\s>]/gi).length;

  const imgs = matchAll(html, /<img\b[^>]*>/gi);
  const imgsWithAlt = imgs.filter((m) => /alt=["'][^"']+["']/i.test(m[0])).length;
  const imgsMissingAlt = imgs.length - imgsWithAlt;

  const links = matchAll(html, /<a\b[^>]+href=["']([^"'#][^"']*)["']/gi);
  let internalLinks = 0;
  let externalLinks = 0;
  links.forEach((m) => {
    try {
      const href = m[1];
      const linkUrl = new URL(href, pageUrl);
      if (linkUrl.hostname === parsed.hostname) internalLinks += 1;
      else externalLinks += 1;
    } catch { /* ignore */ }
  });

  const jsonLd = matchAll(html, /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  const hasJsonLd = jsonLd.length > 0;

  const ogTitle = ogContent(html, 'og:title');
  const ogDesc = ogContent(html, 'og:description');
  const ogImage = ogContent(html, 'og:image');
  const twitterCard = metaContent(html, 'twitter:card');

  const bodyText = stripTags(html);
  const wordCount = bodyText.split(/\s+/).filter(Boolean).length;

  checks.title = title;
  checks.description = description;
  checks.h1Count = h1s.length;
  checks.h1Text = h1s[0] || '';
  checks.wordCount = wordCount;
  checks.canonical = canonical;
  checks.robots = robots;
  checks.lang = lang;

  // 1. Title (12)
  let titleScore = 0;
  const titleIssues = [];
  if (title) {
    titleScore += 4;
    if (title.length >= 30 && title.length <= 60) titleScore += 6;
    else if (title.length >= 20 && title.length <= 70) titleScore += 3;
    else titleIssues.push(`Title length ${title.length} chars — aim for 50–60`);
  } else {
    titleIssues.push('Missing <title> tag — critical for SEO');
    criticalIssues.push('No page title — search engines cannot rank properly');
  }
  categories.push({
    id: 'title',
    name: 'Title Tag',
    ...scoreCategory(titleScore, 12),
    issues: titleIssues,
    tips: ['Include primary keyword near the start of the title.'],
  });

  // 2. Meta description (10)
  let descScore = 0;
  const descIssues = [];
  if (description) {
    descScore += 4;
    if (description.length >= 120 && description.length <= 160) descScore += 6;
    else if (description.length >= 70 && description.length <= 180) descScore += 3;
    else descIssues.push(`Meta description ${description.length} chars — aim for 150–160`);
  } else {
    descIssues.push('Missing meta description');
    criticalIssues.push('No meta description — hurts click-through rate in SERPs');
  }
  categories.push({
    id: 'description',
    name: 'Meta Description',
    ...scoreCategory(descScore, 10),
    issues: descIssues,
    tips: ['Write a compelling summary with target keyword and call to action.'],
  });

  // 3. Headings (12)
  let headScore = 0;
  const headIssues = [];
  if (h1s.length === 1) headScore += 6;
  else if (h1s.length === 0) headIssues.push('Missing H1 heading');
  else headIssues.push(`Multiple H1 tags (${h1s.length}) — use only one H1`);
  if (h2Count >= 1) headScore += 3;
  else headIssues.push('No H2 subheadings — add content structure');
  if (h3Count >= 1) headScore += 1;
  if (h1s[0] && title && h1s[0].toLowerCase() !== title.toLowerCase()) headScore += 2;
  categories.push({
    id: 'headings',
    name: 'Heading Structure',
    ...scoreCategory(Math.min(12, headScore), 12),
    issues: headIssues,
    tips: ['One H1, logical H2/H3 hierarchy with keywords.'],
  });

  // 4. Content (12)
  let contentScore = 0;
  const contentIssues = [];
  if (wordCount >= 600) contentScore = 12;
  else if (wordCount >= 300) contentScore = 8;
  else if (wordCount >= 150) contentScore = 4;
  else contentIssues.push(`Thin content (${wordCount} words) — aim for 600+ for competitive ranking`);
  if (wordCount < 300) criticalIssues.push('Thin content — Google prefers comprehensive pages');
  categories.push({
    id: 'content',
    name: 'Content Depth',
    ...scoreCategory(contentScore, 12),
    issues: contentIssues,
    tips: ['Add unique, valuable content that answers user intent.'],
  });

  // 5. Technical / indexability (14)
  let techScore = 0;
  const techIssues = [];
  if (parsed.protocol === 'https:') techScore += 4;
  else {
    techIssues.push('Site not using HTTPS');
    criticalIssues.push('No HTTPS — ranking penalty and trust issue');
  }
  if (viewport) techScore += 3;
  else techIssues.push('Missing viewport meta — mobile SEO failure');
  if (canonical) techScore += 2;
  else techIssues.push('No canonical URL — duplicate content risk');
  if (lang) techScore += 1;
  if (charset) techScore += 1;
  if (robots && /noindex/i.test(robots)) {
    techScore = 0;
    techIssues.push('Page has noindex — will NOT appear in search results');
    criticalIssues.push('robots noindex detected — page blocked from indexing');
  } else techScore += 3;
  if (fetchMeta.statusCode >= 200 && fetchMeta.statusCode < 300) techScore += 2;
  else techIssues.push(`HTTP status ${fetchMeta.statusCode}`);
  if (fetchMeta.latencyMs <= 800) techScore += 2;
  else if (fetchMeta.latencyMs <= 2000) techScore += 1;
  else techIssues.push(`Slow response (${fetchMeta.latencyMs}ms) — affects Core Web Vitals`);
  categories.push({
    id: 'technical',
    name: 'Technical SEO',
    ...scoreCategory(Math.min(14, techScore), 14),
    issues: techIssues,
    tips: ['HTTPS, fast load, mobile viewport, no accidental noindex.'],
  });

  // 6. Images (8)
  let imgScore = imgs.length ? 8 : 4;
  const imgIssues = [];
  if (imgs.length && imgsMissingAlt > 0) {
    imgScore -= Math.min(6, imgsMissingAlt * 2);
    imgIssues.push(`${imgsMissingAlt} image(s) missing alt text`);
  }
  if (!imgs.length) imgIssues.push('No images — consider relevant visuals with alt tags');
  categories.push({
    id: 'images',
    name: 'Image SEO',
    ...scoreCategory(Math.max(0, imgScore), 8),
    issues: imgIssues,
    tips: ['Descriptive alt text on every meaningful image.'],
  });

  // 7. Links (8)
  let linkScore = 0;
  const linkIssues = [];
  if (internalLinks >= 3) linkScore += 4;
  else linkIssues.push('Few internal links — improve site structure');
  if (externalLinks >= 1) linkScore += 2;
  if (internalLinks + externalLinks >= 5) linkScore += 2;
  categories.push({
    id: 'links',
    name: 'Internal & External Links',
    ...scoreCategory(Math.min(8, linkScore), 8),
    issues: linkIssues,
    tips: ['Link to related pages internally; cite authoritative external sources.'],
  });

  // 8. Social / OG (8)
  let socialScore = 0;
  const socialIssues = [];
  if (ogTitle) socialScore += 2;
  else socialIssues.push('Missing og:title');
  if (ogDesc) socialScore += 2;
  else socialIssues.push('Missing og:description');
  if (ogImage) socialScore += 3;
  else socialIssues.push('Missing og:image — poor social sharing');
  if (twitterCard) socialScore += 1;
  categories.push({
    id: 'social',
    name: 'Open Graph & Social',
    ...scoreCategory(socialScore, 8),
    issues: socialIssues,
    tips: ['Complete Open Graph tags for better social and rich snippet previews.'],
  });

  // 9. Structured data (8)
  let schemaScore = hasJsonLd ? 8 : 0;
  const schemaIssues = hasJsonLd ? [] : ['No JSON-LD structured data — add Organization, WebPage, or Article schema'];
  categories.push({
    id: 'schema',
    name: 'Structured Data (Schema.org)',
    ...scoreCategory(schemaScore, 8),
    issues: schemaIssues,
    tips: ['Add JSON-LD for rich results in Google Search.'],
  });

  // 10. URL quality (8)
  let urlScore = 0;
  const urlIssues = [];
  if (parsed.pathname.length <= 80) urlScore += 3;
  else urlIssues.push('URL path is long — shorten if possible');
  if (!/[_A-Z]/.test(parsed.pathname)) urlScore += 2;
  if (!parsed.search || parsed.search.length < 30) urlScore += 3;
  else urlIssues.push('URL has long query string — prefer clean URLs');
  categories.push({
    id: 'url',
    name: 'URL Structure',
    ...scoreCategory(urlScore, 8),
    issues: urlIssues,
    tips: ['Short, lowercase, hyphen-separated URLs rank better.'],
  });

  const rulePoints = categories.reduce((s, c) => s + c.score, 0);
  const ruleMax = categories.reduce((s, c) => s + c.maxScore, 0);
  const ruleScore = ruleMax ? Math.round((rulePoints / ruleMax) * 100) : 0;

  if (ruleScore < 50) recommendations.push('Fix critical title, description, and HTTPS issues first.');
  if (wordCount < 500) recommendations.push('Expand page content with keyword-rich, helpful sections.');
  if (!hasJsonLd) recommendations.push('Add JSON-LD structured data via schema.org.');
  if (imgsMissingAlt > 0) recommendations.push(`Add alt text to ${imgsMissingAlt} images.`);

  return {
    ruleScore,
    rulePoints,
    ruleMax,
    categories,
    criticalIssues,
    recommendations,
    checks: {
      ...checks,
      h2Count,
      h3Count,
      imgsTotal: imgs.length,
      imgsMissingAlt,
      internalLinks,
      externalLinks,
      hasJsonLd,
      ogTitle,
      ogDesc,
      ogImage,
      twitterCard,
      viewport,
      charset,
      pageSizeBytes: fetchMeta.sizeBytes,
      latencyMs: fetchMeta.latencyMs,
      statusCode: fetchMeta.statusCode,
      finalUrl: fetchMeta.finalUrl || pageUrl,
    },
  };
}

async function checkRobotsTxt(origin) {
  try {
    const { response, html } = await fetchUrl(`${origin}/robots.txt`);
    if (!response.ok) return { found: false, allowsAll: null, sitemap: null };
    const sitemapMatch = html.match(/^Sitemap:\s*(.+)$/im);
    const blocksAll = /User-agent:\s*\*[\s\S]*?Disallow:\s*\/\s*$/im.test(html);
    return {
      found: true,
      allowsAll: !blocksAll,
      sitemap: sitemapMatch?.[1]?.trim() || null,
      snippet: html.slice(0, 500),
    };
  } catch {
    return { found: false, allowsAll: null, sitemap: null };
  }
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

async function runAiSeoDeepScan({ settings, url, htmlExcerpt, ruleSummary, targetKeyword }) {
  const systemPrompt = `You are a strict SEO auditor (Google Search guidelines). Return ONLY JSON:
{
  "aiScore": 0-100,
  "seoRank": "Poor|Below Average|Average|Good|Excellent",
  "verdict": "one sentence",
  "criticalIssues": ["..."],
  "recommendations": ["..."],
  "keywordAnalysis": "brief",
  "contentQuality": "brief",
  "competitiveNotes": "brief"
}
Score harshly. seoRank maps to score: Excellent 90+, Good 75+, Average 60+, Below Average 45+, Poor <45.`;

  const userPrompt = `Deep SEO audit for: ${url}
Target keyword: ${targetKeyword || 'not specified'}
Rule-based score so far: ${ruleSummary.ruleScore}/100
Critical: ${ruleSummary.criticalIssues.join('; ') || 'none'}

HTML excerpt:
${htmlExcerpt.slice(0, 8000)}`;

  const reply = await runAiChat({
    settings,
    systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.2,
    maxTokens: 2048,
  });
  return extractJson(reply);
}

export function scoreToSeoGrade(score) {
  if (score >= 90) return { grade: 'A', rank: 'Excellent', verdict: 'Strong SEO foundation — competitive ranking potential' };
  if (score >= 80) return { grade: 'B', rank: 'Good', verdict: 'Good SEO — minor optimizations will boost rankings' };
  if (score >= 65) return { grade: 'C', rank: 'Average', verdict: 'Average SEO — several issues limiting visibility' };
  if (score >= 50) return { grade: 'D', rank: 'Below Average', verdict: 'Weak SEO — likely poor search visibility' };
  return { grade: 'F', rank: 'Poor', verdict: 'Critical SEO failures — major rewrite needed' };
}

export async function runSeoScan(targetUrl, { settings = null, targetKeyword = '', useAi = true } = {}) {
  const url = validateSeoUrl(targetUrl);
  const parsed = new URL(url);

  const { response, html, latencyMs, sizeBytes, truncated } = await fetchUrl(url);
  if (!response.ok && response.status >= 400) {
    throw new Error(`URL returned HTTP ${response.status} — cannot analyze`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html') && !html.includes('<html')) {
    throw new Error('URL did not return HTML content');
  }

  const fetchMeta = {
    statusCode: response.status,
    latencyMs,
    sizeBytes,
    finalUrl: response.url,
  };

  const rules = analyzeHtmlSeo(html, response.url || url, fetchMeta);
  const robotsTxt = await checkRobotsTxt(parsed.origin);

  if (robotsTxt.found && robotsTxt.allowsAll === false) {
    rules.criticalIssues.push('robots.txt may block all crawlers (Disallow: /)');
  }
  if (!robotsTxt.sitemap) {
    rules.recommendations.push('Add Sitemap URL to robots.txt for better crawl coverage.');
  }

  let aiAnalysis = null;
  let aiScore = rules.ruleScore;

  if (useAi && settings?.aiApiKey) {
    try {
      aiAnalysis = await runAiSeoDeepScan({
        settings,
        url: response.url || url,
        htmlExcerpt: html,
        ruleSummary: rules,
        targetKeyword,
      });
      aiScore = Number(aiAnalysis.aiScore) || rules.ruleScore;
      if (Array.isArray(aiAnalysis.criticalIssues)) {
        aiAnalysis.criticalIssues.forEach((i) => {
          if (!rules.criticalIssues.includes(i)) rules.criticalIssues.push(i);
        });
      }
      if (Array.isArray(aiAnalysis.recommendations)) {
        aiAnalysis.recommendations.forEach((i) => {
          if (!rules.recommendations.includes(i)) rules.recommendations.push(i);
        });
      }
    } catch {
      aiAnalysis = { error: 'AI deep scan unavailable — rule-based score only' };
    }
  }

  const overallScore = Math.round(rules.ruleScore * 0.55 + aiScore * 0.45);
  const clamped = Math.min(100, Math.max(0, overallScore));
  const { grade, rank, verdict } = scoreToSeoGrade(clamped);

  return {
    targetUrl: url,
    finalUrl: fetchMeta.finalUrl,
    targetKeyword,
    overallScore: clamped,
    ruleScore: rules.ruleScore,
    aiScore: aiAnalysis?.aiScore ?? null,
    grade,
    seoRank: aiAnalysis?.seoRank || rank,
    verdict: aiAnalysis?.verdict || verdict,
    categories: rules.categories,
    criticalIssues: [...new Set(rules.criticalIssues)].slice(0, 20),
    recommendations: [...new Set(rules.recommendations)].slice(0, 20),
    checks: rules.checks,
    robotsTxt,
    truncated,
    scanMode: aiAnalysis && !aiAnalysis.error ? 'deep+ai' : 'deep-rules',
    aiAnalysis,
  };
}
