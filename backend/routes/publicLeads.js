import express from 'express';
import Contact from '../models/Contact.js';
import LeadForm from '../models/LeadForm.js';
import { calculateLeadScore, scoreLabel } from '../services/leadScoring.js';

const router = express.Router();

function publicForm(form) {
  return {
    slug: form.slug,
    title: form.title,
    description: form.description,
    thankYouMessage: form.thankYouMessage,
    fields: form.fields,
    campaign: form.campaign,
  };
}

router.get('/forms/:slug', async (req, res) => {
  try {
    const form = await LeadForm.findOne({ slug: req.params.slug, isActive: true });
    if (!form) return res.status(404).json({ message: 'Lead form not found or inactive' });
    res.json(publicForm(form));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/forms/:slug/submit', async (req, res) => {
  try {
    const form = await LeadForm.findOne({ slug: req.params.slug, isActive: true });
    if (!form) return res.status(404).json({ message: 'Lead form not found or inactive' });

    const firstName = String(req.body.firstName || '').trim();
    const lastName = String(req.body.lastName || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const phone = String(req.body.phone || '').trim();
    const company = String(req.body.company || '').trim();
    const notes = String(req.body.notes || '').trim();

    if (!firstName) return res.status(400).json({ message: 'First name is required' });
    if (form.fields?.lastNameRequired !== false && !lastName) {
      return res.status(400).json({ message: 'Last name is required' });
    }
    if (form.fields?.emailRequired !== false && !email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    if (form.fields?.phoneRequired && !phone) {
      return res.status(400).json({ message: 'Phone is required' });
    }

    if (email) {
      const existing = await Contact.findOne({ email, status: 'lead' });
      if (existing) {
        existing.firstName = firstName || existing.firstName;
        existing.lastName = lastName || existing.lastName;
        existing.phone = phone || existing.phone;
        existing.company = company || existing.company;
        if (notes) existing.notes = [existing.notes, notes].filter(Boolean).join('\n');
        existing.source = form.source || 'form';
        existing.campaign = form.campaign || existing.campaign;
        existing.formSlug = form.slug;
        existing.utmSource = String(req.body.utmSource || existing.utmSource || '').trim();
        existing.utmMedium = String(req.body.utmMedium || existing.utmMedium || '').trim();
        existing.utmCampaign = String(req.body.utmCampaign || existing.utmCampaign || '').trim();
        existing.capturedAt = new Date();

        const score = await calculateLeadScore(existing._id);
        existing.leadScore = score;
        existing.leadScoreLabel = scoreLabel(score);
        existing.leadScoredAt = new Date();
        await existing.save();

        form.submissionCount = (form.submissionCount || 0) + 1;
        await form.save();

        return res.status(200).json({
          message: form.thankYouMessage,
          updated: true,
        });
      }
    }

    let lead = await Contact.create({
      firstName,
      lastName: lastName || 'Lead',
      email,
      phone,
      company: form.fields?.companyEnabled === false ? '' : company,
      notes: form.fields?.notesEnabled === false ? '' : notes,
      status: 'lead',
      source: form.source || 'form',
      campaign: form.campaign || '',
      formSlug: form.slug,
      utmSource: String(req.body.utmSource || '').trim(),
      utmMedium: String(req.body.utmMedium || '').trim(),
      utmCampaign: String(req.body.utmCampaign || '').trim(),
      capturedAt: new Date(),
    });

    const score = await calculateLeadScore(lead._id);
    lead.leadScore = score;
    lead.leadScoreLabel = scoreLabel(score);
    lead.leadScoredAt = new Date();
    await lead.save();

    form.submissionCount = (form.submissionCount || 0) + 1;
    await form.save();

    res.status(201).json({
      message: form.thankYouMessage,
      created: true,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
