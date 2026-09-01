import express from 'express';
import Contact from '../models/Contact.js';
import Deal from '../models/Deal.js';
import Task from '../models/Task.js';
import FollowUp from '../models/FollowUp.js';
import Quotation from '../models/Quotation.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { calculateLeadScore, scoreLabel } from '../services/leadScoring.js';
import { normalizeSmsPhone } from '../services/messaging.js';

const router = express.Router();

router.use(authenticate);

const CONTACT_FIELDS = [
  'firstName', 'lastName', 'email', 'phone', 'company', 'address', 'city', 'area', 'timezone',
  'status', 'notes', 'source', 'campaign', 'utmSource', 'utmMedium', 'utmCampaign', 'formSlug',
  'needType', 'category', 'hasWebsite', 'websiteStatus', 'website', 'marketingChannels',
  'socialFacebook', 'socialInstagram', 'whatsappBusiness', 'digitalPresence', 'currentTools',
  'smsOptIn', 'smsConsentType', 'smsConsentMethod', 'smsConsentSource', 'smsOptedOut',
];

function pickContactFields(body = {}) {
  const out = {};
  for (const key of CONTACT_FIELDS) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

function applyPhoneNormalized(data) {
  if (data.phone !== undefined) {
    data.phoneNormalized = normalizeSmsPhone(data.phone) || '';
  }
  if (data.smsOptIn === true && !data.smsOptInAt) {
    data.smsOptInAt = new Date();
  }
  if (data.smsOptedOut === true) {
    data.smsOptIn = false;
    data.smsOptedOutAt = new Date();
  }
  return data;
}

async function withScore(contact) {
  const score = await calculateLeadScore(contact._id);
  contact.leadScore = score;
  contact.leadScoreLabel = scoreLabel(score);
  contact.leadScoredAt = new Date();
  await contact.save();
  return contact;
}

function parsePaging(req, defaultLimit = 50) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || defaultLimit));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

router.get('/', requirePermission('contacts:view'), async (req, res) => {
  try {
    const wantsPaging = req.query.page != null || req.query.limit != null || req.query.paged === '1';
    const { page, limit, skip } = parsePaging(req, wantsPaging ? 50 : 5000);
    const filter = {};
    if (req.query.hasPhone === '1' || req.query.hasPhone === 'true') {
      filter.phoneNormalized = { $ne: '' };
    }
    if (req.query.smsOptIn === '1' || req.query.smsOptIn === 'true') {
      filter.smsOptIn = true;
      filter.smsOptedOut = { $ne: true };
    }
    if (req.query.q) {
      const q = String(req.query.q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { firstName: new RegExp(q, 'i') },
        { lastName: new RegExp(q, 'i') },
        { email: new RegExp(q, 'i') },
        { company: new RegExp(q, 'i') },
        { phone: new RegExp(q, 'i') },
      ];
    }

    const fields = req.query.fields
      ? String(req.query.fields).split(',').map((s) => s.trim()).filter(Boolean).join(' ')
      : undefined;

    const query = Contact.find(filter).select(fields).sort({ leadScore: -1, updatedAt: -1 });
    if (wantsPaging) query.skip(skip).limit(limit);
    else query.limit(limit);

    const items = await query.lean();
    if (!wantsPaging) return res.json(items);

    const total = await Contact.countDocuments(filter);
    res.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', requirePermission('contacts:view'), async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) return res.status(404).json({ message: 'Contact not found' });
    res.json(contact);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', requirePermission('contacts:create'), async (req, res) => {
  try {
    const data = applyPhoneNormalized(pickContactFields(req.body));
    if (!data.firstName?.trim() || !data.lastName?.trim()) {
      return res.status(400).json({ message: 'First and last name are required' });
    }
    let contact = await Contact.create(data);
    contact = await withScore(contact);
    res.status(201).json(contact);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.put('/:id', requirePermission('contacts:update'), async (req, res) => {
  try {
    const data = applyPhoneNormalized(pickContactFields(req.body));
    let contact = await Contact.findByIdAndUpdate(req.params.id, data, {
      new: true,
      runValidators: true,
    });
    if (!contact) return res.status(404).json({ message: 'Contact not found' });
    contact = await withScore(contact);
    res.json(contact);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.delete('/:id', requirePermission('contacts:delete'), async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) return res.status(404).json({ message: 'Contact not found' });

    await Promise.all([
      Deal.updateMany({ contact: contact._id }, { $unset: { contact: 1 } }),
      Task.updateMany({ contact: contact._id }, { $unset: { contact: 1 } }),
      FollowUp.updateMany({ contact: contact._id }, { $unset: { contact: 1 } }),
      Quotation.updateMany({ contact: contact._id }, { $unset: { contact: 1 } }),
    ]);

    await contact.deleteOne();
    res.json({ message: 'Contact deleted; related records were unlinked' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
