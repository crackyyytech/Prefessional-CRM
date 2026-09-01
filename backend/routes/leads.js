import express from 'express';
import Contact, { LEAD_SOURCES } from '../models/Contact.js';
import LeadForm from '../models/LeadForm.js';
import { getAppSettings, resolveAiRuntime, listReadyAiProviders } from '../models/AppSettings.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { calculateLeadScore, scoreLabel } from '../services/leadScoring.js';
import {
  analyzeLead,
  enrichLeadDocument,
  leadsToCsv,
} from '../services/leadAnalysis.js';
import { generateNearbyContacts } from '../services/aiProvider.js';

const router = express.Router();

async function withScore(contact) {
  const score = await calculateLeadScore(contact._id);
  contact.leadScore = score;
  contact.leadScoreLabel = scoreLabel(score);
  contact.leadScoredAt = new Date();
  const analysis = analyzeLead(contact);
  contact.dataCompleteness = analysis.dataCompleteness;
  contact.isOriginal = analysis.isOriginal;
  await contact.save();
  return contact;
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildLeadFilter(req) {
  const filter = { status: 'lead' };
  if (req.query.source) filter.source = req.query.source;
  if (req.query.campaign) filter.campaign = new RegExp(escapeRegex(req.query.campaign), 'i');
  if (req.query.city) filter.city = new RegExp(escapeRegex(req.query.city), 'i');
  if (req.query.originalOnly === 'true' || req.query.originalOnly === '1') {
    filter.isOriginal = true;
  }
  if (req.query.minCompleteness) {
    const min = Math.min(100, Math.max(0, Number(req.query.minCompleteness) || 0));
    filter.dataCompleteness = { $gte: min };
  }
  if (req.query.q) {
    const q = escapeRegex(String(req.query.q).trim());
    filter.$or = [
      { firstName: new RegExp(q, 'i') },
      { lastName: new RegExp(q, 'i') },
      { email: new RegExp(q, 'i') },
      { company: new RegExp(q, 'i') },
      { phone: new RegExp(q, 'i') },
      { city: new RegExp(q, 'i') },
      { area: new RegExp(q, 'i') },
      { address: new RegExp(q, 'i') },
      { category: new RegExp(q, 'i') },
      { needType: new RegExp(q, 'i') },
    ];
  }
  return filter;
}

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

router.use(authenticate);

router.get('/sources', requirePermission('leads:view'), (_req, res) => {
  res.json({ sources: LEAD_SOURCES });
});

router.get('/stats', requirePermission('leads:view'), async (_req, res) => {
  try {
    const [bySource, byScore, total, recent] = await Promise.all([
      Contact.aggregate([
        { $match: { status: 'lead' } },
        { $group: { _id: '$source', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Contact.aggregate([
        { $match: { status: 'lead' } },
        { $group: { _id: '$leadScoreLabel', count: { $sum: 1 } } },
      ]),
      Contact.countDocuments({ status: 'lead' }),
      Contact.countDocuments({
        status: 'lead',
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      }),
    ]);

    res.json({
      total,
      recentWeek: recent,
      bySource: Object.fromEntries(bySource.map((row) => [row._id || 'manual', row.count])),
      byScore: Object.fromEntries(byScore.map((row) => [row._id || 'Cold', row.count])),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/analysis', requirePermission('leads:view'), async (req, res) => {
  try {
    const leads = await Contact.find({ status: 'lead' });
    let totalCompleteness = 0;
    let originalCount = 0;
    let complete100 = 0;
    const fieldMissing = {
      contactName: 0,
      company: 0,
      phone: 0,
      email: 0,
      address: 0,
      location: 0,
      category: 0,
      websiteInfo: 0,
      marketing: 0,
      digitalPresence: 0,
      insights: 0,
    };

    for (const lead of leads) {
      const analysis = analyzeLead(lead);
      totalCompleteness += analysis.dataCompleteness;
      if (analysis.isOriginal) originalCount += 1;
      if (analysis.dataCompleteness >= 100) complete100 += 1;
      for (const [field, ok] of Object.entries(analysis.breakdown)) {
        if (!ok && fieldMissing[field] !== undefined) fieldMissing[field] += 1;
      }
    }

    const total = leads.length;
    res.json({
      total,
      originalCount,
      duplicateOrIncomplete: total - originalCount,
      averageCompleteness: total ? Math.round(totalCompleteness / total) : 0,
      complete100Count: complete100,
      complete100Percent: total ? Math.round((complete100 / total) * 100) : 0,
      originalPercent: total ? Math.round((originalCount / total) * 100) : 0,
      fieldGaps: Object.fromEntries(
        Object.entries(fieldMissing).map(([field, count]) => [field, { missing: count, percent: total ? Math.round((count / total) * 100) : 0 }])
      ),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/export', requirePermission('leads:view'), async (req, res) => {
  try {
    const filter = buildLeadFilter(req);
    const leads = await Contact.find(filter).sort({ dataCompleteness: -1, leadScore: -1, createdAt: -1 });
    const enriched = leads.map((lead) => enrichLeadDocument(lead));
    const csv = leadsToCsv(enriched);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="leads-export-${stamp}.csv"`);
    res.send(`\uFEFF${csv}`);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/', requirePermission('leads:view'), async (req, res) => {
  try {
    const filter = buildLeadFilter(req);
    const leads = await Contact.find(filter).sort({ dataCompleteness: -1, leadScore: -1, createdAt: -1 });
    res.json(leads.map((lead) => enrichLeadDocument(lead)));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', requirePermission('leads:manage'), async (req, res) => {
  try {
    const payload = {
      ...req.body,
      status: 'lead',
      source: req.body.source || 'manual',
      capturedAt: req.body.capturedAt ? new Date(req.body.capturedAt) : new Date(),
    };
    let lead = await Contact.create(payload);
    lead = await withScore(lead);
    res.status(201).json(lead);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.get('/forms', requirePermission('leads:view'), async (_req, res) => {
  try {
    const forms = await LeadForm.find().sort({ updatedAt: -1 });
    res.json(forms);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/forms', requirePermission('leads:manage'), async (req, res) => {
  try {
    const slug = slugify(req.body.slug || req.body.name);
    if (!slug) return res.status(400).json({ message: 'A valid slug is required' });

    const form = await LeadForm.create({
      name: req.body.name,
      slug,
      title: req.body.title || req.body.name,
      description: req.body.description || '',
      thankYouMessage: req.body.thankYouMessage,
      source: req.body.source || 'form',
      campaign: req.body.campaign || '',
      isActive: req.body.isActive !== false,
      fields: req.body.fields || undefined,
    });
    res.status(201).json(form);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'A form with this slug already exists' });
    }
    res.status(400).json({ message: error.message });
  }
});

router.put('/forms/:id', requirePermission('leads:manage'), async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.slug) updates.slug = slugify(updates.slug);
    const form = await LeadForm.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!form) return res.status(404).json({ message: 'Form not found' });
    res.json(form);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'A form with this slug already exists' });
    }
    res.status(400).json({ message: error.message });
  }
});

router.delete('/forms/:id', requirePermission('leads:manage'), async (req, res) => {
  try {
    const form = await LeadForm.findByIdAndDelete(req.params.id);
    if (!form) return res.status(404).json({ message: 'Form not found' });
    res.json({ message: 'Form deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/ai-nearby', requirePermission('ai:chat'), async (req, res) => {
  try {
    const settingsDoc = await getAppSettings();
    const preferred = resolveAiRuntime(settingsDoc, req.body.provider);
    if (!preferred) {
      return res.status(400).json({
        message: 'AI is not configured. Ask an admin to enable at least one AI provider in Settings.',
      });
    }

    const location = String(req.body.location || '').trim();
    if (!location) return res.status(400).json({ message: 'Location is required' });

    const queue = [preferred.aiProvider];
    for (const item of listReadyAiProviders(settingsDoc)) {
      if (!queue.includes(item.id)) queue.push(item.id);
    }

    let lastError = 'AI nearby search failed';
    let used = preferred;
    let results;

    for (const providerId of queue) {
      const settings = resolveAiRuntime(settingsDoc, providerId);
      if (!settings) continue;
      try {
        results = await generateNearbyContacts({
          settings,
          location,
          businessType: req.body.businessType || req.body.needType || 'all',
          needType: req.body.needType || req.body.businessType || 'all',
          radiusKm: req.body.radiusKm || 5,
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

    const minCompleteness = Math.min(100, Math.max(0, Number(req.body.minCompleteness) ?? 100));
    const originalOnly = req.body.originalOnly !== false;

    const analyzed = results.map((item) => {
      const analysis = analyzeLead(item);
      return { ...item, ...analysis, missingFields: analysis.missingFields };
    });

    const filtered = analyzed.filter((item) => {
      if (originalOnly && !item.isOriginal) return false;
      if (item.dataCompleteness < minCompleteness) return false;
      return true;
    });

    res.json({
      location,
      needType: req.body.needType || req.body.businessType || 'all',
      businessType: req.body.businessType || req.body.needType || 'all',
      radiusKm: Number(req.body.radiusKm) || 5,
      provider: used.aiProvider,
      model: used.aiModel,
      minCompleteness,
      originalOnly,
      totalGenerated: analyzed.length,
      totalQualified: filtered.length,
      disclaimer: originalOnly
        ? `Showing ${filtered.length} original lead(s) with ${minCompleteness}%+ complete data. Verify phone/email before outreach.`
        : `Showing ${filtered.length} lead(s) with ${minCompleteness}%+ data completeness.`,
      results: filtered,
      rejected: analyzed.length - filtered.length,
    });
  } catch (error) {
    res.status(502).json({ message: error.message || 'AI nearby search failed' });
  }
});

router.post('/ai-nearby/save', requirePermission('leads:manage'), async (req, res) => {
  try {
    const items = Array.isArray(req.body.leads) ? req.body.leads : [];
    if (!items.length) return res.status(400).json({ message: 'No leads selected' });

    const campaign = String(req.body.campaign || `ai-nearby-${new Date().toISOString().slice(0, 10)}`).trim();
    const created = [];
    const skipped = [];

    for (const item of items.slice(0, 25)) {
      const firstName = String(item.firstName || '').trim();
      const lastName = String(item.lastName || 'Contact').trim();
      const company = String(item.company || '').trim();
      const email = String(item.email || '').trim().toLowerCase();
      const phone = String(item.phone || '').trim();

      if (!firstName && !company) {
        skipped.push({ reason: 'Missing name/company', item });
        continue;
      }

      const analysis = analyzeLead(item);
      if (req.body.originalOnly !== false && !analysis.isOriginal) {
        skipped.push({ reason: 'Not an original lead (incomplete/placeholder)', company });
        continue;
      }
      const minSave = Math.min(100, Math.max(0, Number(req.body.minCompleteness) ?? 100));
      if (analysis.dataCompleteness < minSave) {
        skipped.push({ reason: `Data completeness below ${minSave}%`, company });
        continue;
      }

      if (email) {
        const existingEmail = await Contact.findOne({ email });
        if (existingEmail) {
          skipped.push({ reason: 'Email already exists', email });
          continue;
        }
      }

      if (phone) {
        const existingPhone = await Contact.findOne({ phone, status: 'lead' });
        if (existingPhone) {
          skipped.push({ reason: 'Phone already exists', phone });
          continue;
        }
      }

      let lead = await Contact.create({
        firstName: firstName || company.split(/\s+/)[0] || 'Lead',
        lastName: lastName || 'Nearby',
        email,
        phone,
        company,
        address: String(item.address || '').trim(),
        city: String(item.city || '').trim(),
        area: String(item.area || '').trim(),
        category: String(item.category || '').trim(),
        needType: ['website', 'software', 'application'].includes(String(item.needType || '').toLowerCase())
          ? String(item.needType).toLowerCase()
          : '',
        hasWebsite: typeof item.hasWebsite === 'boolean' ? item.hasWebsite : undefined,
        websiteStatus: String(item.websiteStatus || '').trim(),
        website: String(item.website || '').trim(),
        marketingChannels: Array.isArray(item.marketingChannels) ? item.marketingChannels : [],
        socialFacebook: String(item.socialMedia?.facebook || item.socialFacebook || '').trim(),
        socialInstagram: String(item.socialMedia?.instagram || item.socialInstagram || '').trim(),
        whatsappBusiness: Boolean(item.socialMedia?.whatsappBusiness || item.whatsappBusiness),
        digitalPresence: String(item.digitalPresence || '').trim(),
        currentTools: String(item.currentTools || '').trim(),
        notes: [
          item.notes,
          'Source: AI nearby finder — verified original lead',
        ].filter(Boolean).join('\n'),
        source: 'ai',
        campaign,
        status: 'lead',
        capturedAt: new Date(),
        dataCompleteness: analysis.dataCompleteness,
        isOriginal: analysis.isOriginal,
      });
      lead = await withScore(lead);
      created.push(lead);
    }

    res.status(201).json({
      message: `Saved ${created.length} lead(s)`,
      created: created.length,
      skipped: skipped.length,
      leads: created,
      skippedItems: skipped,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/import', requirePermission('leads:import'), async (req, res) => {
  try {
    const csv = String(req.body.csv || '').trim();
    if (!csv) return res.status(400).json({ message: 'CSV content is required' });

    const lines = csv.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) {
      return res.status(400).json({ message: 'CSV needs a header row and at least one data row' });
    }

    const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, ''));
    const required = ['firstname', 'lastname'];
    for (const key of required) {
      if (!headers.includes(key)) {
        return res.status(400).json({
          message: `Missing required column: ${key}. Use firstName,lastName,email,phone,company,source,campaign,notes`,
        });
      }
    }

    const created = [];
    const errors = [];

    for (let i = 1; i < lines.length; i += 1) {
      const cells = parseCsvLine(lines[i]);
      const row = {};
      headers.forEach((header, index) => {
        row[header] = cells[index] || '';
      });

      if (!row.firstname || !row.lastname) {
        errors.push({ row: i + 1, message: 'firstName and lastName are required' });
        continue;
      }

      const source = LEAD_SOURCES.includes(row.source) ? row.source : 'import';

      try {
        let lead = await Contact.create({
          firstName: row.firstname,
          lastName: row.lastname,
          email: row.email || '',
          phone: row.phone || '',
          company: row.company || '',
          address: row.address || '',
          city: row.city || '',
          area: row.area || '',
          notes: row.notes || '',
          source,
          campaign: row.campaign || req.body.campaign || '',
          status: 'lead',
          capturedAt: new Date(),
        });
        lead = await withScore(lead);
        created.push(lead);
      } catch (err) {
        errors.push({ row: i + 1, message: err.message });
      }
    }

    res.status(201).json({
      message: `Imported ${created.length} lead(s)`,
      created: created.length,
      errors,
      leads: created,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.patch('/:id/convert', requirePermission('leads:manage'), async (req, res) => {
  try {
    const status = req.body.status === 'customer' ? 'customer' : 'prospect';
    let lead = await Contact.findById(req.params.id);
    if (!lead || lead.status !== 'lead') {
      return res.status(404).json({ message: 'Lead not found' });
    }
    lead.status = status;
    lead = await withScore(lead);
    res.json(lead);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.put('/:id', requirePermission('leads:manage'), async (req, res) => {
  try {
    const updates = { ...req.body, status: 'lead' };
    let lead = await Contact.findOneAndUpdate(
      { _id: req.params.id, status: 'lead' },
      updates,
      { new: true, runValidators: true }
    );
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    lead = await withScore(lead);
    res.json(lead);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.delete('/:id', requirePermission('leads:manage'), async (req, res) => {
  try {
    const lead = await Contact.findOneAndDelete({ _id: req.params.id, status: 'lead' });
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    res.json({ message: 'Lead deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
