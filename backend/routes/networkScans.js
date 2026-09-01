import express from 'express';
import NetworkScan from '../models/NetworkScan.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { discoverNetworkDevices, networkMetaLive } from '../services/networkDiscovery.js';

const router = express.Router();

router.use(authenticate);

router.get('/meta', requirePermission('network:view'), async (_req, res) => {
  try {
    res.json(await networkMetaLive());
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/', requirePermission('network:view'), async (_req, res) => {
  try {
    const scans = await NetworkScan.find()
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(40);
    res.json(scans);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', requirePermission('network:view'), async (req, res) => {
  try {
    const scan = await NetworkScan.findById(req.params.id).populate('createdBy', 'name email');
    if (!scan) return res.status(404).json({ message: 'Network scan not found' });
    res.json(scan);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', requirePermission('network:run'), async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const subnet = String(req.body.subnet || '').trim();

    const scan = await NetworkScan.create({
      name: name || `Network scan ${new Date().toLocaleString('en-IN')}`,
      subnet: subnet || '',
      status: 'running',
      startedAt: new Date(),
      createdBy: req.user._id,
    });

    try {
      const report = await discoverNetworkDevices({ subnetCidr: subnet || undefined });
      scan.subnet = report.subnet;
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

router.delete('/:id', requirePermission('network:delete'), async (req, res) => {
  try {
    const scan = await NetworkScan.findByIdAndDelete(req.params.id);
    if (!scan) return res.status(404).json({ message: 'Network scan not found' });
    res.json({ message: 'Network scan deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
