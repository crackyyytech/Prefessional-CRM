import express from 'express';
import Deal from '../models/Deal.js';
import { authenticate, requirePermission } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.get('/', requirePermission('deals:view'), async (_req, res) => {
  try {
    const deals = await Deal.find().populate('contact', 'firstName lastName company email').sort({ updatedAt: -1 });
    res.json(deals);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', requirePermission('deals:view'), async (req, res) => {
  try {
    const deal = await Deal.findById(req.params.id).populate('contact', 'firstName lastName company email');
    if (!deal) return res.status(404).json({ message: 'Deal not found' });
    res.json(deal);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', requirePermission('deals:create'), async (req, res) => {
  try {
    const deal = await Deal.create(req.body);
    await deal.populate('contact', 'firstName lastName company email');
    res.status(201).json(deal);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.put('/:id', requirePermission('deals:update'), async (req, res) => {
  try {
    const deal = await Deal.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate('contact', 'firstName lastName company email');
    if (!deal) return res.status(404).json({ message: 'Deal not found' });
    res.json(deal);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.delete('/:id', requirePermission('deals:delete'), async (req, res) => {
  try {
    const deal = await Deal.findByIdAndDelete(req.params.id);
    if (!deal) return res.status(404).json({ message: 'Deal not found' });
    res.json({ message: 'Deal deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
