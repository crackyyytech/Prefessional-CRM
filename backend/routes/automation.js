import express from 'express';
import FollowUp from '../models/FollowUp.js';
import Contact from '../models/Contact.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { dispatchFollowUp, processDueFollowUps } from '../services/messaging.js';

const router = express.Router();

router.use(authenticate);

router.get('/', requirePermission('automation:view'), async (_req, res) => {
  try {
    // Process any due items when user opens Automation (extra safety)
    processDueFollowUps().catch(() => {});

    const items = await FollowUp.find()
      .populate('contact', 'firstName lastName email phone')
      .populate('createdBy', 'name')
      .sort({ scheduledAt: 1 });
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', requirePermission('automation:manage'), async (req, res) => {
  try {
    const { channel, subject, message, contactId, scheduledAt, toEmail, toPhone, toName } = req.body;
    if (!channel || !message || !scheduledAt) {
      return res.status(400).json({ message: 'channel, message and scheduledAt are required' });
    }
    if (!['email', 'whatsapp'].includes(channel)) {
      return res.status(400).json({ message: 'channel must be email or whatsapp' });
    }

    let contact = null;
    if (contactId) {
      contact = await Contact.findById(contactId);
      if (!contact) return res.status(404).json({ message: 'Contact not found' });
    }

    const recipientEmail = String(toEmail || contact?.email || '').trim().toLowerCase();
    const recipientPhone = String(toPhone || contact?.phone || '').trim();

    if (channel === 'email' && !recipientEmail) {
      return res.status(400).json({
        message: 'Recipient To email is required (select a contact with email, or enter To email)',
      });
    }
    if (channel === 'whatsapp' && !recipientPhone) {
      return res.status(400).json({
        message: 'Recipient phone is required (select a contact with phone, or enter phone)',
      });
    }

    const when = new Date(scheduledAt);
    if (Number.isNaN(when.getTime())) {
      return res.status(400).json({ message: 'Invalid schedule time' });
    }

    const followUp = await FollowUp.create({
      channel,
      subject: subject || '',
      message,
      contact: contactId || undefined,
      toEmail: recipientEmail,
      toPhone: recipientPhone,
      toName: toName || (contact ? `${contact.firstName} ${contact.lastName}`.trim() : ''),
      scheduledAt: when,
      createdBy: req.user._id,
      status: 'pending',
    });

    // If scheduled time is already due (or within 30s), send immediately
    if (when.getTime() <= Date.now() + 30 * 1000) {
      await dispatchFollowUp(followUp._id);
      const refreshed = await FollowUp.findById(followUp._id)
        .populate('contact', 'firstName lastName email phone');
      return res.status(201).json(refreshed);
    }

    await followUp.populate('contact', 'firstName lastName email phone');
    res.status(201).json(followUp);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/:id/send-now', requirePermission('automation:manage'), async (req, res) => {
  try {
    const followUp = await FollowUp.findById(req.params.id);
    if (!followUp) return res.status(404).json({ message: 'Follow-up not found' });
    if (followUp.status === 'sent') {
      return res.status(400).json({ message: 'Follow-up already sent' });
    }

    followUp.status = 'pending';
    followUp.scheduledAt = new Date();
    followUp.errorMessage = '';
    await followUp.save();

    const result = await dispatchFollowUp(followUp._id);
    await result.populate('contact', 'firstName lastName email phone');
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.patch('/:id/cancel', requirePermission('automation:manage'), async (req, res) => {
  try {
    const followUp = await FollowUp.findById(req.params.id);
    if (!followUp) return res.status(404).json({ message: 'Follow-up not found' });
    if (followUp.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending follow-ups can be cancelled' });
    }
    followUp.status = 'cancelled';
    await followUp.save();
    res.json(followUp);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.delete('/:id', requirePermission('automation:manage'), async (req, res) => {
  try {
    const followUp = await FollowUp.findByIdAndDelete(req.params.id);
    if (!followUp) return res.status(404).json({ message: 'Follow-up not found' });
    res.json({ message: 'Follow-up deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
