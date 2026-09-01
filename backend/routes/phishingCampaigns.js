import express from 'express';
import PhishingCampaign from '../models/PhishingCampaign.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import {
  normalizeDomain,
  clampPhishingConfig,
  runPhishingCampaign,
  resolvePhishingGodModePlan,
  getCampaignProfilesMeta,
  MAX_TARGETS,
  GOD_MODE_TEMPLATE_VARIANTS,
} from '../services/phishingSimulator.js';
import { getAppSettings, toBrandingSettings } from '../models/AppSettings.js';
import { generatePhishingReportPdf } from '../services/phishingReportPdf.js';

const router = express.Router();

router.use(authenticate);

router.get('/meta', requirePermission('phishing:view'), async (_req, res) => {
  try {
    const settings = await getAppSettings();
    const godPlan = await resolvePhishingGodModePlan(settings);
    res.json({
      maxTargets: MAX_TARGETS,
      godModeTemplateVariants: GOD_MODE_TEMPLATE_VARIANTS,
      godModePlan: {
        aiProviderChannels: godPlan.aiProviderChannels,
        aiProvidersUsed: godPlan.aiProvidersUsed,
      },
      campaignProfiles: getCampaignProfilesMeta(),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/', requirePermission('phishing:view'), async (_req, res) => {
  try {
    const campaigns = await PhishingCampaign.find()
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(campaigns);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id/pdf', requirePermission('phishing:view'), async (req, res) => {
  try {
    const campaign = await PhishingCampaign.findById(req.params.id)
      .populate('createdBy', 'name email')
      .lean();
    if (!campaign) return res.status(404).json({ message: 'Phishing campaign not found' });
    if (campaign.status !== 'completed' || campaign.report?.riskScore == null) {
      return res.status(400).json({ message: 'PDF available after a completed simulation' });
    }

    const settings = await getAppSettings();
    const company = toBrandingSettings(settings);
    const pdf = await generatePhishingReportPdf(campaign, company);
    const safeName = String(campaign.name || 'phishing').replace(/[^\w\-]+/g, '-').slice(0, 40);
    const filename = `PhishingReport-${safeName}-${String(campaign._id).slice(-6)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', requirePermission('phishing:view'), async (req, res) => {
  try {
    const campaign = await PhishingCampaign.findById(req.params.id).populate('createdBy', 'name email');
    if (!campaign) return res.status(404).json({ message: 'Phishing campaign not found' });
    res.json(campaign);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', requirePermission('phishing:run'), async (req, res) => {
  try {
    const settings = await getAppSettings();
    const godPlan = req.body.godMode ? await resolvePhishingGodModePlan(settings) : null;
    const config = clampPhishingConfig(req.body, godPlan);
    const name = String(req.body.name || '').trim();

    const campaign = await PhishingCampaign.create({
      name: name || (config.godMode
        ? `God mode phishing ${new Date().toLocaleString('en-IN')}`
        : `Phishing simulation ${new Date().toLocaleString('en-IN')}`),
      targetDomain: config.targetDomain,
      targetEmails: config.targetEmails,
      campaignProfile: config.campaignProfile,
      godMode: config.godMode,
      maxPower: config.maxPower,
      sendLive: config.sendLive,
      status: 'pending',
      createdBy: req.user._id,
    });

    await runPhishingCampaign(campaign._id);
    const fresh = await PhishingCampaign.findById(campaign._id).populate('createdBy', 'name email');
    res.status(201).json(fresh);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.delete('/:id', requirePermission('phishing:delete'), async (req, res) => {
  try {
    const campaign = await PhishingCampaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ message: 'Phishing campaign not found' });
    await PhishingCampaign.findByIdAndDelete(req.params.id);
    res.json({ message: 'Phishing campaign deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
