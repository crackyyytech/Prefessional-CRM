import express from 'express';
import CameraJam from '../models/CameraJam.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import {
  clampJamConfig,
  executeCameraJam,
  cancelCameraJam,
  getJamProfilesMeta,
  resolveCameraJamGodPlan,
  MAX_DURATION_SECONDS,
  MAX_CONCURRENCY,
  GOD_MODE_BURST_SIZE,
  MAX_IN_FLIGHT_CAP,
} from '../services/cameraJamRunner.js';
import { getAppSettings, toBrandingSettings } from '../models/AppSettings.js';
import { generateCameraJamPdf } from '../services/cameraJamPdf.js';
import { gatherCameraIntel } from '../services/cameraRecon.js';
import { fetchCameraPreview, probeViewUrls, buildViewUrls } from '../services/cameraView.js';
import { validateCameraHost } from '../services/cameraJamRunner.js';

const router = express.Router();
router.use(authenticate);

router.get('/meta', requirePermission('camjam:view'), async (_req, res) => {
  try {
    const settings = await getAppSettings();
    const godPlan = await resolveCameraJamGodPlan(settings);
    res.json({
      maxDurationSeconds: MAX_DURATION_SECONDS,
      maxConcurrency: MAX_CONCURRENCY,
      godModeBurstSize: GOD_MODE_BURST_SIZE,
      maxInFlightCap: MAX_IN_FLIGHT_CAP,
      godModePlan: godPlan,
      jamProfiles: getJamProfilesMeta(),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/', requirePermission('camjam:view'), async (_req, res) => {
  try {
    const tests = await CameraJam.find().populate('createdBy', 'name email').sort({ createdAt: -1 }).limit(50);
    res.json(tests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/recon', requirePermission('camjam:view'), async (req, res) => {
  try {
    const intel = await gatherCameraIntel(req.body.targetHost);
    res.json(intel);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/view-probe', requirePermission('camjam:view'), async (req, res) => {
  try {
    const host = validateCameraHost(req.body.targetHost);
    const viewUrls = req.body.viewUrls?.length
      ? req.body.viewUrls
      : buildViewUrls(host, req.body.openPorts || [80, 8080], req.body.manufacturer || {});
    const result = await probeViewUrls(host, viewUrls, req.body.username, req.body.password, 6);
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/preview', requirePermission('camjam:view'), async (req, res) => {
  try {
    const { buffer, contentType } = await fetchCameraPreview({
      targetHost: req.body.targetHost,
      viewUrl: req.body.viewUrl,
      username: req.body.username,
      password: req.body.password,
    });
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.get('/:id/pdf', requirePermission('camjam:view'), async (req, res) => {
  try {
    const test = await CameraJam.findById(req.params.id).populate('createdBy', 'name email').lean();
    if (!test) return res.status(404).json({ message: 'Camera jam test not found' });
    if (!['completed', 'cancelled'].includes(test.status) || !(test.report?.totalPackets > 0)) {
      return res.status(400).json({ message: 'PDF available after a completed jam test with results' });
    }
    const settings = await getAppSettings();
    const pdf = await generateCameraJamPdf(test, toBrandingSettings(settings));
    const safeName = String(test.name || 'cam-jam').replace(/[^\w\-]+/g, '-').slice(0, 40);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="CameraJam-${safeName}-${String(test._id).slice(-6)}.pdf"`);
    res.send(pdf);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', requirePermission('camjam:view'), async (req, res) => {
  try {
    const test = await CameraJam.findById(req.params.id).populate('createdBy', 'name email');
    if (!test) return res.status(404).json({ message: 'Camera jam test not found' });
    res.json(test);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', requirePermission('camjam:run'), async (req, res) => {
  try {
    const settings = await getAppSettings();
    const godPlan = req.body.godMode ? await resolveCameraJamGodPlan(settings) : null;
    const config = clampJamConfig(req.body, godPlan);
    const name = String(req.body.name || '').trim();

    let cameraIntel = req.body.cameraIntel || null;
    if (!cameraIntel && req.body.gatherIntel !== false) {
      try {
        cameraIntel = await gatherCameraIntel(config.targetHost);
      } catch {
        cameraIntel = null;
      }
    }

    const test = await CameraJam.create({
      name: name || (config.godMode ? `God mode camera jam ${new Date().toLocaleString('en-IN')}` : `Camera jam ${new Date().toLocaleString('en-IN')}`),
      targetHost: config.targetHost,
      jamProfile: req.body.jamProfile || cameraIntel?.recommendedProfile || config.jamProfile,
      godMode: config.godMode,
      maxPower: config.maxPower,
      durationSeconds: config.durationSeconds,
      concurrency: config.concurrency,
      cameraIntel,
      status: 'pending',
      createdBy: req.user._id,
    });

    executeCameraJam(test._id).catch((err) => console.warn('[camjam]', err.message));
    await test.populate('createdBy', 'name email');
    res.status(201).json(test);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/:id/cancel', requirePermission('camjam:run'), async (req, res) => {
  try {
    const test = await CameraJam.findById(req.params.id);
    if (!test) return res.status(404).json({ message: 'Camera jam test not found' });
    cancelCameraJam(test._id);
    test.status = 'cancelled';
    test.finishedAt = new Date();
    await test.save();
    res.json({ message: 'Jam stopped', test });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id', requirePermission('camjam:delete'), async (req, res) => {
  try {
    const test = await CameraJam.findById(req.params.id);
    if (!test) return res.status(404).json({ message: 'Camera jam test not found' });
    if (test.status === 'running') cancelCameraJam(test._id);
    await CameraJam.findByIdAndDelete(req.params.id);
    res.json({ message: 'Camera jam test deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
