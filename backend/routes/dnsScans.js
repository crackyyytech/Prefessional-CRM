import express from 'express';
import DnsScan from '../models/DnsScan.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { runDnsSecurityScan } from '../services/dnsSecurity.js';

const router = express.Router();

router.use(authenticate);

router.get('/', requirePermission('dnssec:view'), async (_req, res) => {
  try {
    const scans = await DnsScan.find()
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(scans);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', requirePermission('dnssec:view'), async (req, res) => {
  try {
    const scan = await DnsScan.findById(req.params.id).populate('createdBy', 'name email');
    if (!scan) return res.status(404).json({ message: 'DNS scan not found' });
    res.json(scan);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', requirePermission('dnssec:run'), async (req, res) => {
  try {
    const targetDomain = String(req.body.targetDomain || req.body.domain || '').trim();
    const name = String(req.body.name || '').trim();

    const scan = await DnsScan.create({
      name: name || `DNS scan ${new Date().toLocaleString('en-IN')}`,
      targetDomain,
      status: 'running',
      startedAt: new Date(),
      createdBy: req.user._id,
    });

    try {
      const report = await runDnsSecurityScan(targetDomain);
      scan.targetDomain = report.domain;
      scan.report = report;
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

router.delete('/:id', requirePermission('dnssec:delete'), async (req, res) => {
  try {
    const scan = await DnsScan.findByIdAndDelete(req.params.id);
    if (!scan) return res.status(404).json({ message: 'DNS scan not found' });
    res.json({ message: 'DNS scan deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
