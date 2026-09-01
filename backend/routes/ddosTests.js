import express from 'express';
import DdosTest from '../models/DdosTest.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import {
  validateDdosUrl,
  clampDdosConfig,
  executeDdosTest,
  cancelDdosTest,
  getAttackProfilesMeta,
  resolveDdosGodModePlan,
  MAX_DURATION_SECONDS,
  MAX_CONCURRENCY,
  GOD_MODE_BURST_SIZE,
  MAX_IN_FLIGHT_CAP,
} from '../services/ddosRunner.js';
import { getAppSettings, toBrandingSettings } from '../models/AppSettings.js';
import { generateDdosReportPdf } from '../services/ddosReportPdf.js';

const router = express.Router();

router.use(authenticate);

router.get('/meta', requirePermission('ddos:view'), async (_req, res) => {
  try {
    const settings = await getAppSettings();
    const godPlan = await resolveDdosGodModePlan(settings);
    res.json({
      maxDurationSeconds: MAX_DURATION_SECONDS,
      maxConcurrency: MAX_CONCURRENCY,
      godModeMaxConcurrency: MAX_CONCURRENCY,
      godModeBurstSize: GOD_MODE_BURST_SIZE,
      powerPayloadKb: 16,
      maxInFlightCap: MAX_IN_FLIGHT_CAP,
      godModePlan: {
        concurrency: godPlan.concurrency,
        aiProviderChannels: godPlan.aiProviderChannels,
        aiProvidersUsed: godPlan.aiProvidersUsed,
        burstSize: godPlan.burstSize,
      },
      attackProfiles: getAttackProfilesMeta(),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/', requirePermission('ddos:view'), async (_req, res) => {
  try {
    const tests = await DdosTest.find()
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(tests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id/pdf', requirePermission('ddos:view'), async (req, res) => {
  try {
    const test = await DdosTest.findById(req.params.id)
      .populate('createdBy', 'name email')
      .lean();
    if (!test) return res.status(404).json({ message: 'DDoS test not found' });
    if (!['completed', 'cancelled'].includes(test.status) || !(test.report?.totalRequests > 0)) {
      return res.status(400).json({ message: 'PDF report is available after a completed simulation with results' });
    }

    const settings = await getAppSettings();
    const company = toBrandingSettings(settings);
    const pdf = await generateDdosReportPdf(test, company);
    const safeName = String(test.name || 'ddos-test').replace(/[^\w\-]+/g, '-').slice(0, 40);
    const filename = `DDoSReport-${safeName}-${String(test._id).slice(-6)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', requirePermission('ddos:view'), async (req, res) => {
  try {
    const test = await DdosTest.findById(req.params.id).populate('createdBy', 'name email');
    if (!test) return res.status(404).json({ message: 'DDoS test not found' });
    res.json(test);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', requirePermission('ddos:run'), async (req, res) => {
  try {
    const targetUrl = validateDdosUrl(req.body.targetUrl);
    const settings = await getAppSettings();
    const godPlan = req.body.godMode ? await resolveDdosGodModePlan(settings) : null;
    const {
      durationSeconds,
      concurrency,
      attackProfile,
      godMode,
      maxPower,
      mixedMethods,
      methods,
      aiProviderChannels,
      aiProvidersUsed,
      burstSize,
    } = clampDdosConfig(req.body, godPlan);
    const name = String(req.body.name || '').trim();

    const test = await DdosTest.create({
      name: name || (godMode
        ? `God mode DDoS ${new Date().toLocaleString('en-IN')}`
        : `DDoS simulation ${new Date().toLocaleString('en-IN')}`),
      targetUrl,
      attackProfile,
      godMode,
      maxPower,
      mixedMethods,
      methods,
      durationSeconds,
      concurrency,
      report: godMode || maxPower ? {
        godMode: Boolean(godMode),
        maxPower: Boolean(maxPower),
        aiProviderChannels: aiProviderChannels || 0,
        aiProvidersUsed: aiProvidersUsed || [],
        burstSize,
        effectiveConcurrency: concurrency,
        mixedMethods: mixedMethods || false,
        methods,
      } : {},
      status: 'pending',
      createdBy: req.user._id,
    });

    executeDdosTest(test._id).catch((err) => {
      console.warn('[ddos] background error:', err.message);
    });

    await test.populate('createdBy', 'name email');
    res.status(201).json(test);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/:id/cancel', requirePermission('ddos:run'), async (req, res) => {
  try {
    const test = await DdosTest.findById(req.params.id);
    if (!test) return res.status(404).json({ message: 'DDoS test not found' });
    if (!['pending', 'running'].includes(test.status)) {
      return res.status(400).json({ message: 'Only pending or running simulations can be cancelled' });
    }
    cancelDdosTest(test._id);
    test.status = 'cancelled';
    test.finishedAt = new Date();
    await test.save();
    res.json({ message: 'DDoS simulation cancelled', test });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id', requirePermission('ddos:delete'), async (req, res) => {
  try {
    const test = await DdosTest.findById(req.params.id);
    if (!test) return res.status(404).json({ message: 'DDoS test not found' });
    if (test.status === 'running') cancelDdosTest(test._id);
    await DdosTest.findByIdAndDelete(req.params.id);
    res.json({ message: 'DDoS test deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
