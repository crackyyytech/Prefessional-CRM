import express from 'express';
import JobListing from '../models/JobListing.js';
import { getAppSettings, resolveAiRuntime, listReadyAiProviders } from '../models/AppSettings.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { generateJobListings } from '../services/aiProvider.js';
import {
  analyzeJob,
  enrichJobDocument,
  jobsToCsv,
} from '../services/jobAnalysis.js';

const router = express.Router();

router.use(authenticate);

function buildJobFilter(req) {
  const filter = {};
  if (req.query.experienceLevel) filter.experienceLevel = req.query.experienceLevel;
  if (req.query.city) filter.city = new RegExp(String(req.query.city), 'i');
  if (req.query.role) filter.role = new RegExp(String(req.query.role), 'i');
  if (req.query.verifiedOnly === 'true' || req.query.verifiedOnly === '1') {
    filter.isVerified = true;
  }
  if (req.query.minCompleteness) {
    const min = Math.min(100, Math.max(0, Number(req.query.minCompleteness) || 0));
    filter.dataCompleteness = { $gte: min };
  }
  if (req.query.q) {
    const q = String(req.query.q).trim();
    filter.$or = [
      { jobTitle: new RegExp(q, 'i') },
      { role: new RegExp(q, 'i') },
      { company: new RegExp(q, 'i') },
      { city: new RegExp(q, 'i') },
      { skills: new RegExp(q, 'i') },
      { requirements: new RegExp(q, 'i') },
    ];
  }
  return filter;
}

router.get('/stats', requirePermission('jobs:view'), async (_req, res) => {
  try {
    const [total, byExp, byType, avgCompleteness] = await Promise.all([
      JobListing.countDocuments(),
      JobListing.aggregate([
        { $group: { _id: '$experienceLevel', count: { $sum: 1 } } },
      ]),
      JobListing.aggregate([
        { $group: { _id: '$jobType', count: { $sum: 1 } } },
      ]),
      JobListing.aggregate([
        { $group: { _id: null, avg: { $avg: '$dataCompleteness' } } },
      ]),
    ]);

    res.json({
      total,
      averageCompleteness: Math.round(avgCompleteness[0]?.avg || 0),
      byExperience: Object.fromEntries(byExp.map((r) => [r._id || 'both', r.count])),
      byJobType: Object.fromEntries(byType.map((r) => [r._id || 'full-time', r.count])),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/analysis', requirePermission('jobs:view'), async (_req, res) => {
  try {
    const jobs = await JobListing.find();
    let totalCompleteness = 0;
    let verifiedCount = 0;
    let complete100 = 0;
    let fresherCount = 0;
    let experiencedCount = 0;

    for (const job of jobs) {
      const analysis = analyzeJob(job);
      totalCompleteness += analysis.dataCompleteness;
      if (analysis.isVerified) verifiedCount += 1;
      if (analysis.dataCompleteness >= 100) complete100 += 1;
      if (job.experienceLevel === 'fresher') fresherCount += 1;
      if (job.experienceLevel === 'experienced') experiencedCount += 1;
    }

    const total = jobs.length;
    res.json({
      total,
      verifiedCount,
      averageCompleteness: total ? Math.round(totalCompleteness / total) : 0,
      complete100Count: complete100,
      complete100Percent: total ? Math.round((complete100 / total) * 100) : 0,
      fresherCount,
      experiencedCount,
      bothCount: total - fresherCount - experiencedCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/export', requirePermission('jobs:view'), async (req, res) => {
  try {
    const filter = buildJobFilter(req);
    const jobs = await JobListing.find(filter).sort({ dataCompleteness: -1, createdAt: -1 });
    const enriched = jobs.map((job) => enrichJobDocument(job));
    const csv = jobsToCsv(enriched);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="jobs-export-${stamp}.csv"`);
    res.send(`\uFEFF${csv}`);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/', requirePermission('jobs:view'), async (req, res) => {
  try {
    const filter = buildJobFilter(req);
    const jobs = await JobListing.find(filter).sort({ dataCompleteness: -1, createdAt: -1 });
    res.json(jobs.map((job) => enrichJobDocument(job)));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/ai-find', requirePermission('ai:chat'), async (req, res) => {
  try {
    const settingsDoc = await getAppSettings();
    const preferred = resolveAiRuntime(settingsDoc, req.body.provider);
    if (!preferred) {
      return res.status(400).json({
        message: 'AI is not configured. Enable a provider in Settings → AI Integrations.',
      });
    }

    const location = String(req.body.location || '').trim();
    const role = String(req.body.role || req.body.keyword || '').trim();
    if (!location && !role) {
      return res.status(400).json({ message: 'Location or job role is required' });
    }

    const queue = [preferred.aiProvider];
    for (const item of listReadyAiProviders(settingsDoc)) {
      if (!queue.includes(item.id)) queue.push(item.id);
    }

    let lastError = 'Job search failed';
    let used = preferred;
    let results;

    for (const providerId of queue) {
      const settings = resolveAiRuntime(settingsDoc, providerId);
      if (!settings) continue;
      try {
        results = await generateJobListings({
          settings,
          location,
          role,
          keyword: req.body.keyword,
          experienceLevel: req.body.experienceLevel || 'all',
          jobType: req.body.jobType || '',
          count: req.body.count || 10,
        });
        used = settings;
        break;
      } catch (error) {
        lastError = error.message || String(error);
      }
    }

    if (!results) {
      return res.status(502).json({ message: lastError });
    }

    const minCompleteness = Math.min(100, Math.max(0, Number(req.body.minCompleteness) ?? 70));
    const verifiedOnly = req.body.verifiedOnly !== false;

    const analyzed = results.map((item) => {
      const analysis = analyzeJob(item);
      return { ...item, ...analysis };
    });

    const filtered = analyzed.filter((item) => {
      if (verifiedOnly && !item.isVerified) return false;
      if (item.dataCompleteness < minCompleteness) return false;
      return true;
    });

    res.json({
      location,
      role,
      experienceLevel: req.body.experienceLevel || 'all',
      jobType: req.body.jobType || '',
      provider: used.aiProvider,
      model: used.aiModel,
      minCompleteness,
      verifiedOnly,
      totalGenerated: analyzed.length,
      totalQualified: filtered.length,
      disclaimer: `Found ${filtered.length} job(s) with role, requirements, contact & website analysis. Verify before applying.`,
      results: filtered,
      rejected: analyzed.length - filtered.length,
    });
  } catch (error) {
    res.status(502).json({ message: error.message || 'Job search failed' });
  }
});

router.post('/ai-find/save', requirePermission('jobs:manage'), async (req, res) => {
  try {
    const items = Array.isArray(req.body.jobs) ? req.body.jobs : [];
    if (!items.length) return res.status(400).json({ message: 'No jobs selected' });

    const searchQuery = String(req.body.searchQuery || '').trim();
    const created = [];
    const skipped = [];

    for (const item of items.slice(0, 25)) {
      const jobTitle = String(item.jobTitle || '').trim();
      if (!jobTitle) {
        skipped.push({ reason: 'Missing job title', item });
        continue;
      }

      const analysis = analyzeJob(item);
      const minSave = Math.min(100, Math.max(0, Number(req.body.minCompleteness) ?? 70));
      if (req.body.verifiedOnly !== false && !analysis.isVerified) {
        skipped.push({ reason: 'Incomplete / unverified job data', jobTitle });
        continue;
      }
      if (analysis.dataCompleteness < minSave) {
        skipped.push({ reason: `Completeness below ${minSave}%`, jobTitle });
        continue;
      }

      const existing = await JobListing.findOne({
        jobTitle: new RegExp(`^${jobTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        company: String(item.company || '').trim(),
      });
      if (existing) {
        skipped.push({ reason: 'Already saved', jobTitle });
        continue;
      }

      const job = await JobListing.create({
        jobTitle,
        role: String(item.role || '').trim(),
        company: String(item.company || '').trim(),
        location: String(item.location || '').trim(),
        city: String(item.city || '').trim(),
        area: String(item.area || '').trim(),
        experienceLevel: ['fresher', 'experienced', 'both'].includes(item.experienceLevel)
          ? item.experienceLevel
          : 'both',
        experienceYears: String(item.experienceYears || '').trim(),
        requirements: Array.isArray(item.requirements) ? item.requirements : [],
        skills: Array.isArray(item.skills) ? item.skills : [],
        salaryRange: String(item.salaryRange || '').trim(),
        jobType: item.jobType || 'full-time',
        contactName: String(item.contactName || '').trim(),
        contactEmail: String(item.contactEmail || '').trim().toLowerCase(),
        contactPhone: String(item.contactPhone || '').trim(),
        website: String(item.website || '').trim(),
        applyUrl: String(item.applyUrl || '').trim(),
        postedDate: String(item.postedDate || '').trim(),
        notes: String(item.notes || '').trim(),
        source: 'ai',
        searchQuery,
        dataCompleteness: analysis.dataCompleteness,
        isVerified: analysis.isVerified,
        savedAt: new Date(),
      });
      created.push(enrichJobDocument(job));
    }

    res.status(201).json({
      message: `Saved ${created.length} job(s)`,
      created: created.length,
      skipped: skipped.length,
      jobs: created,
      skippedItems: skipped,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/', requirePermission('jobs:manage'), async (req, res) => {
  try {
    const analysis = analyzeJob(req.body);
    const job = await JobListing.create({
      ...req.body,
      source: req.body.source || 'manual',
      dataCompleteness: analysis.dataCompleteness,
      isVerified: analysis.isVerified,
      savedAt: new Date(),
    });
    res.status(201).json(enrichJobDocument(job));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.delete('/:id', requirePermission('jobs:manage'), async (req, res) => {
  try {
    const job = await JobListing.findByIdAndDelete(req.params.id);
    if (!job) return res.status(404).json({ message: 'Job not found' });
    res.json({ message: 'Job deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
