import express from 'express';
import SecurityScan from '../models/SecurityScan.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { runSecurityScan, validateSecurityUrl } from '../services/securityScanner.js';
import { getAppSettings, toBrandingSettings } from '../models/AppSettings.js';
import { generateSecurityReportPdf } from '../services/securityReportPdf.js';

const router = express.Router();

router.use(authenticate);

router.get('/', requirePermission('security:view'), async (_req, res) => {
  try {
    const scans = await SecurityScan.find()
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(scans);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id/pdf', requirePermission('security:view'), async (req, res) => {
  try {
    const scan = await SecurityScan.findById(req.params.id)
      .populate('createdBy', 'name email')
      .lean();
    if (!scan) return res.status(404).json({ message: 'Security scan not found' });
    if (scan.status !== 'completed' || scan.report?.securityScore == null) {
      return res.status(400).json({ message: 'PDF available after a completed scan' });
    }

    const settings = await getAppSettings();
    const company = toBrandingSettings(settings);
    const pdf = await generateSecurityReportPdf(scan, company);
    const safeName = String(scan.name || 'security-scan').replace(/[^\w\-]+/g, '-').slice(0, 40);
    const filename = `SecurityReport-${safeName}-${String(scan._id).slice(-6)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', requirePermission('security:view'), async (req, res) => {
  try {
    const scan = await SecurityScan.findById(req.params.id).populate('createdBy', 'name email');
    if (!scan) return res.status(404).json({ message: 'Security scan not found' });
    res.json(scan);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', requirePermission('security:scan'), async (req, res) => {
  try {
    const targetUrl = validateSecurityUrl(req.body.targetUrl);
    const name = String(req.body.name || '').trim();

    const scan = await SecurityScan.create({
      name: name || `Security scan ${new Date().toLocaleString('en-IN')}`,
      targetUrl,
      status: 'running',
      startedAt: new Date(),
      createdBy: req.user._id,
    });

    try {
      scan.report = await runSecurityScan(targetUrl);
      scan.status = 'completed';
    } catch (error) {
      scan.status = 'failed';
      scan.errorMessage = error.message;
    }
    scan.finishedAt = new Date();
    await scan.save();
    await scan.populate('createdBy', 'name email');

    res.status(201).json(scan);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.delete('/:id', requirePermission('security:delete'), async (req, res) => {
  try {
    const scan = await SecurityScan.findByIdAndDelete(req.params.id);
    if (!scan) return res.status(404).json({ message: 'Security scan not found' });
    res.json({ message: 'Security scan deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
