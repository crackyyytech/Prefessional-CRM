import express from 'express';
import PortScan from '../models/PortScan.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { runPortScan, COMMON_PORTS } from '../services/portScanRunner.js';

const router = express.Router();

router.use(authenticate);

router.get('/meta', requirePermission('portscan:view'), async (_req, res) => {
  try {
    res.json({
      commonPorts: COMMON_PORTS.map(({ port, service, risk }) => ({ port, service, risk })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/', requirePermission('portscan:view'), async (_req, res) => {
  try {
    const scans = await PortScan.find()
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(scans);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', requirePermission('portscan:view'), async (req, res) => {
  try {
    const scan = await PortScan.findById(req.params.id).populate('createdBy', 'name email');
    if (!scan) return res.status(404).json({ message: 'Port scan not found' });
    res.json(scan);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', requirePermission('portscan:run'), async (req, res) => {
  try {
    const targetHost = String(req.body.targetHost || req.body.host || '').trim();
    const name = String(req.body.name || '').trim();

    const scan = await PortScan.create({
      name: name || `Port scan ${new Date().toLocaleString('en-IN')}`,
      targetHost,
      status: 'running',
      startedAt: new Date(),
      createdBy: req.user._id,
    });

    try {
      const report = await runPortScan(targetHost);
      scan.targetHost = report.host;
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

router.delete('/:id', requirePermission('portscan:delete'), async (req, res) => {
  try {
    const scan = await PortScan.findByIdAndDelete(req.params.id);
    if (!scan) return res.status(404).json({ message: 'Port scan not found' });
    res.json({ message: 'Port scan deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
