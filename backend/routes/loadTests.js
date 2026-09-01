import express from 'express';
import LoadTest from '../models/LoadTest.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import {
  validateLoadTestUrl,
  clampLoadTestConfig,
  executeLoadTest,
  cancelLoadTest,
  resolveGodModePlan,
} from '../services/loadTestRunner.js';
import { getAppSettings, toBrandingSettings } from '../models/AppSettings.js';
import { generateLoadTestPdf } from '../services/loadTestPdf.js';

const router = express.Router();

router.use(authenticate);

router.get('/meta', requirePermission('loadtest:view'), async (_req, res) => {
  try {
    const settings = await getAppSettings();
    const godPlan = await resolveGodModePlan(settings);
    res.json({
      maxDurationSeconds: 30 * 3600,
      maxConcurrency: 10000,
      godModeMaxConcurrency: 10000,
      godModeBurstSize: 5,
      godModePlan: {
        concurrency: godPlan.concurrency,
        aiProviderChannels: godPlan.aiProviderChannels,
        aiProvidersUsed: godPlan.aiProvidersUsed,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/', requirePermission('loadtest:view'), async (_req, res) => {
  try {
    const tests = await LoadTest.find()
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(tests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id/pdf', requirePermission('loadtest:view'), async (req, res) => {
  try {
    const test = await LoadTest.findById(req.params.id)
      .populate('createdBy', 'name email')
      .lean();
    if (!test) return res.status(404).json({ message: 'Load test not found' });
    if (!['completed', 'cancelled'].includes(test.status) || !test.report?.totalRequests) {
      return res.status(400).json({ message: 'PDF report is available after a completed load test with results' });
    }

    const settings = await getAppSettings();
    const company = toBrandingSettings(settings);
    const pdf = await generateLoadTestPdf(test, company);
    const safeName = String(test.name || 'load-test').replace(/[^\w\-]+/g, '-').slice(0, 40);
    const filename = `LoadTest-${safeName}-${String(test._id).slice(-6)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', requirePermission('loadtest:view'), async (req, res) => {
  try {
    const test = await LoadTest.findById(req.params.id).populate('createdBy', 'name email');
    if (!test) return res.status(404).json({ message: 'Load test not found' });
    res.json(test);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', requirePermission('loadtest:run'), async (req, res) => {
  try {
    const targetUrl = validateLoadTestUrl(req.body.targetUrl);
    const settings = await getAppSettings();
    const godPlan = req.body.godMode ? await resolveGodModePlan(settings) : null;
    const {
      durationSeconds,
      concurrency,
      method,
      methods,
      mixedMethods,
      godMode,
      aiProviderChannels,
      aiProvidersUsed,
      burstSize,
    } = clampLoadTestConfig(req.body, godPlan);
    const name = String(req.body.name || '').trim();

    const test = await LoadTest.create({
      name: name || (godMode ? `God mode load ${new Date().toLocaleString('en-IN')}` : `Load test ${new Date().toLocaleString('en-IN')}`),
      targetUrl,
      method,
      methods,
      mixedMethods,
      godMode,
      durationSeconds,
      concurrency,
      report: godMode ? {
        aiProviderChannels,
        aiProvidersUsed,
        burstSize,
        effectiveConcurrency: concurrency,
        godMode: true,
      } : {},
      status: 'pending',
      createdBy: req.user._id,
    });

    executeLoadTest(test._id).catch((err) => {
      console.warn('[loadtest] background error:', err.message);
    });

    await test.populate('createdBy', 'name email');
    res.status(201).json(test);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/:id/cancel', requirePermission('loadtest:run'), async (req, res) => {
  try {
    const test = await LoadTest.findById(req.params.id);
    if (!test) return res.status(404).json({ message: 'Load test not found' });
    if (!['pending', 'running'].includes(test.status)) {
      return res.status(400).json({ message: 'Only pending or running tests can be cancelled' });
    }
    cancelLoadTest(test._id);
    test.status = 'cancelled';
    test.finishedAt = new Date();
    await test.save();
    res.json({ message: 'Load test cancelled', test });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id', requirePermission('loadtest:delete'), async (req, res) => {
  try {
    const test = await LoadTest.findById(req.params.id);
    if (!test) return res.status(404).json({ message: 'Load test not found' });
    if (test.status === 'running') cancelLoadTest(test._id);
    await LoadTest.findByIdAndDelete(req.params.id);
    res.json({ message: 'Load test deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
