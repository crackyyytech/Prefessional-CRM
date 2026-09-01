import express from 'express';
import AlertSmsLog from '../models/AlertSmsLog.js';
import SmsTemplate from '../models/SmsTemplate.js';
import Contact from '../models/Contact.js';
import { getAppSettings, resolveAiRuntime, listReadyAiProviders, toBrandingSettings } from '../models/AppSettings.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { smsSendLimiter, aiLimiter } from '../middleware/rateLimits.js';
import {
  sendSms,
  isSmsConfigured,
  normalizeSmsPhone,
  applyTemplate,
} from '../services/messaging.js';
import { runAiChat } from '../services/aiProvider.js';
import { writeAudit } from '../models/AuditLog.js';

const router = express.Router();

const MAX_RECIPIENTS = 3;
const MAX_MESSAGE_CHARS = 320;
const COOLDOWN_MS = 60_000;
const OPT_OUT_KEYWORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);

router.use(authenticate);

function normalizePhoneList(input) {
  const raw = Array.isArray(input)
    ? input
    : String(input || '')
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);

  const phones = [];
  const seen = new Set();
  for (const item of raw) {
    const phone = normalizeSmsPhone(item);
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    phones.push(phone);
  }
  return phones;
}

function isQuietHour(timezone) {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'UTC',
      hour: 'numeric',
      hour12: false,
    });
    const hour = Number(fmt.format(new Date()));
    return hour < 8 || hour >= 21;
  } catch {
    return false;
  }
}

async function draftWithMergedAi(settings, { purpose, recipientHint, appName }) {
  const readyIds = listReadyAiProviders(settings).map((p) => p.id);
  if (!readyIds.length) {
    throw new Error('No AI provider is configured. Ask an admin to add API keys in Settings → AI integrations.');
  }

  const defaultId = settings.aiProvider || readyIds[0];
  const queue = [...new Set([defaultId, ...readyIds].filter(Boolean))];
  const systemPrompt = [
    `You draft short operational SMS alerts for ${appName}.`,
    'Rules:',
    '- Return ONLY the SMS body text, no quotes or explanation.',
    '- Keep it under 280 characters.',
    '- Clear, professional, and actionable.',
    '- Do not spam, threaten, or harass.',
    '- Include a brief reason for the alert.',
    '- Do not invent private data.',
    '- This is a draft for human review; never imply auto-send.',
  ].join('\n');

  const userPrompt = [
    `Purpose: ${purpose || 'General operational alert'}`,
    recipientHint ? `Recipient context: ${recipientHint}` : '',
    'Write one SMS alert message the user can review and send.',
  ]
    .filter(Boolean)
    .join('\n');

  let lastError = 'AI draft failed';
  for (const providerId of queue) {
    const runtime = resolveAiRuntime(settings, providerId);
    if (!runtime) continue;
    try {
      const reply = await runAiChat({
        settings: runtime,
        messages: [{ role: 'user', content: userPrompt }],
        systemPrompt,
      });
      const text = String(reply || '')
        .replace(/^["'`]+|["'`]+$/g, '')
        .trim()
        .slice(0, MAX_MESSAGE_CHARS);
      if (!text) throw new Error('Empty AI response');
      return { message: text, provider: runtime.aiProvider, model: runtime.aiModel };
    } catch (error) {
      lastError = error.message || lastError;
    }
  }
  throw new Error(lastError);
}

async function resolveRecipients({ phonesInput, contactIds, consentConfirmed }) {
  const phones = [];
  const contacts = [];
  const seen = new Set();

  if (Array.isArray(contactIds) && contactIds.length) {
    const docs = await Contact.find({ _id: { $in: contactIds } }).lean();
    for (const contact of docs) {
      const phone = normalizeSmsPhone(contact.phoneNormalized || contact.phone);
      if (!phone) {
        throw new Error(`${contact.firstName || 'Contact'} has no valid phone number`);
      }
      if (contact.smsOptedOut) {
        throw new Error(`${contact.firstName || phone} has opted out of SMS`);
      }
      if (!contact.smsOptIn) {
        throw new Error(`${contact.firstName || phone} has not consented to SMS alerts`);
      }
      if (isQuietHour(contact.timezone) && contact.smsConsentType === 'marketing') {
        throw new Error(`Quiet hours (8am–9pm) block marketing SMS for ${contact.firstName || phone}`);
      }
      if (seen.has(phone)) continue;
      seen.add(phone);
      phones.push(phone);
      contacts.push(contact._id);
    }
  }

  const manual = normalizePhoneList(phonesInput);
  for (const phone of manual) {
    if (seen.has(phone)) continue;
    const existing = await Contact.findOne({
      $or: [{ phoneNormalized: phone }, { phone: new RegExp(`${phone.slice(-10)}$`) }],
    }).lean();
    if (existing?.smsOptedOut) {
      throw new Error(`${phone} has opted out of SMS`);
    }
    if (existing && !existing.smsOptIn && !consentConfirmed) {
      throw new Error(`${phone} requires SMS consent. Confirm consent or select an opted-in contact.`);
    }
    if (!existing && !consentConfirmed) {
      throw new Error(`Manual number ${phone} requires explicit consent confirmation.`);
    }
    seen.add(phone);
    phones.push(phone);
    if (existing) contacts.push(existing._id);
  }

  return { phones, contacts };
}

router.get('/', requirePermission('alertsms:view'), async (req, res) => {
  try {
    const settings = await getAppSettings();
    const logs = await AlertSmsLog.find({ deletedAt: null })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('createdBy', 'name email')
      .populate('contacts', 'firstName lastName phone smsOptIn')
      .lean();

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayCount = await AlertSmsLog.countDocuments({
      createdBy: req.user._id,
      createdAt: { $gte: startOfDay },
      status: { $nin: ['failed', 'cancelled'] },
      deletedAt: null,
    });

    const usage = await AlertSmsLog.aggregate([
      { $match: { deletedAt: null, sentAt: { $gte: new Date(Date.now() - 30 * 86400000) } } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          segments: { $sum: { $ifNull: ['$totalSegments', 0] } },
          price: { $sum: { $ifNull: ['$totalPrice', 0] } },
        },
      },
    ]);

    res.json({
      smsConfigured: isSmsConfigured(settings),
      maxRecipients: MAX_RECIPIENTS,
      maxMessageChars: MAX_MESSAGE_CHARS,
      cooldownSeconds: Math.round(COOLDOWN_MS / 1000),
      dailyLimit: settings.smsDailyLimit || 100,
      todayCount,
      usage,
      logs,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/templates', requirePermission('alertsms:view'), async (_req, res) => {
  try {
    const templates = await SmsTemplate.find({ isActive: true }).sort({ updatedAt: -1 }).lean();
    res.json(templates);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/templates', requirePermission('alertsms:send'), async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const body = String(req.body.body || '').trim().slice(0, MAX_MESSAGE_CHARS);
    if (!name || !body) return res.status(400).json({ message: 'Template name and body are required' });
    const variables = [...body.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]);
    const template = await SmsTemplate.create({
      name,
      purpose: String(req.body.purpose || '').trim().slice(0, 200),
      body,
      variables,
      createdBy: req.user._id,
    });
    res.status(201).json(template);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.delete('/templates/:id', requirePermission('alertsms:delete'), async (req, res) => {
  try {
    const template = await SmsTemplate.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!template) return res.status(404).json({ message: 'Template not found' });
    res.json({ message: 'Template archived' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/draft', aiLimiter, requirePermission('alertsms:send'), async (req, res) => {
  try {
    const purpose = String(req.body.purpose || '').trim().slice(0, 400);
    const recipientHint = String(req.body.recipientHint || '').trim().slice(0, 200);
    if (!purpose) {
      return res.status(400).json({ message: 'Enter a purpose for the alert (e.g. payment reminder, appointment).' });
    }

    const settings = await getAppSettings();
    const branding = toBrandingSettings(settings);
    const draft = await draftWithMergedAi(settings, {
      purpose,
      recipientHint,
      appName: branding.appName || 'CRM',
    });

    res.json({
      message: draft.message,
      provider: draft.provider,
      model: draft.model,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/send', smsSendLimiter, requirePermission('alertsms:send'), async (req, res) => {
  try {
    const message = String(req.body.message || '').trim();
    if (!message) return res.status(400).json({ message: 'Alert message is required.' });
    if (message.length > MAX_MESSAGE_CHARS) {
      return res.status(400).json({ message: `Message is too long (max ${MAX_MESSAGE_CHARS} characters).` });
    }

    const { phones, contacts } = await resolveRecipients({
      phonesInput: req.body.phones || req.body.phone,
      contactIds: req.body.contactIds,
      consentConfirmed: Boolean(req.body.consentConfirmed),
    });

    if (!phones.length) {
      return res.status(400).json({ message: 'Enter at least one phone number or select opted-in contacts.' });
    }
    if (phones.length > MAX_RECIPIENTS) {
      return res.status(400).json({
        message: `Maximum ${MAX_RECIPIENTS} recipients per send. Remove extra numbers and try again.`,
      });
    }

    const settings = await getAppSettings();
    if (!isSmsConfigured(settings)) {
      return res.status(400).json({
        message: 'SMS is not configured. Go to Integrations -> SMS (Twilio) and save credentials.',
      });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayCount = await AlertSmsLog.countDocuments({
      createdBy: req.user._id,
      createdAt: { $gte: startOfDay },
      status: { $nin: ['failed', 'cancelled'] },
      deletedAt: null,
    });
    const dailyLimit = settings.smsDailyLimit || 100;
    if (todayCount + 1 > dailyLimit) {
      return res.status(429).json({ message: `Daily SMS alert budget reached (${dailyLimit}).` });
    }

    // Atomic cooldown claim
    const cooldownClaim = await AlertSmsLog.findOneAndUpdate(
      {
        createdBy: req.user._id,
        sentAt: { $gte: new Date(Date.now() - COOLDOWN_MS) },
        status: { $in: ['queued', 'sent', 'partial', 'delivered'] },
        deletedAt: null,
      },
      {},
      { sort: { sentAt: -1 } }
    );
    if (cooldownClaim) {
      const waitSec = Math.ceil((COOLDOWN_MS - (Date.now() - new Date(cooldownClaim.sentAt).getTime())) / 1000);
      return res.status(429).json({
        message: `Cooldown active. Wait ${Math.max(waitSec, 1)}s before sending another alert batch.`,
      });
    }

    const scheduledAt = req.body.scheduledAt ? new Date(req.body.scheduledAt) : null;
    if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
      return res.status(400).json({ message: 'Invalid schedule time' });
    }
    if (scheduledAt && scheduledAt.getTime() > Date.now() + 1000) {
      const log = await AlertSmsLog.create({
        phones,
        contacts,
        message,
        purpose: String(req.body.purpose || '').trim().slice(0, 400),
        templateId: req.body.templateId || null,
        templateName: String(req.body.templateName || '').trim(),
        status: 'scheduled',
        scheduledAt,
        aiDrafted: Boolean(req.body.aiDrafted),
        aiProvider: String(req.body.aiProvider || '').trim().slice(0, 40),
        consentConfirmed: Boolean(req.body.consentConfirmed),
        createdBy: req.user._id,
        deliveries: [],
      });
      return res.status(201).json({
        message: `Alert SMS scheduled for ${scheduledAt.toISOString()}`,
        log,
      });
    }

    const deliveries = [];
    let totalSegments = 0;
    let totalPrice = 0;
    let priceUnit = '';

    for (const phone of phones) {
      try {
        const result = await sendSms({
          settings,
          to: phone,
          message,
          statusCallback: settings.smsStatusCallbackUrl || undefined,
        });
        const mapped = ['failed', 'undelivered'].includes(result.status)
          ? 'failed'
          : result.status === 'delivered'
            ? 'delivered'
            : result.status === 'sent'
              ? 'sent'
              : 'queued';
        deliveries.push({
          phone,
          status: mapped,
          providerMessageId: result.sid || '',
          providerStatus: result.status || 'queued',
          price: result.price,
          priceUnit: result.priceUnit || '',
          numSegments: result.numSegments,
          error: '',
        });
        if (result.numSegments) totalSegments += result.numSegments;
        if (result.price != null) totalPrice += Math.abs(Number(result.price) || 0);
        if (result.priceUnit) priceUnit = result.priceUnit;
      } catch (error) {
        deliveries.push({
          phone,
          status: 'failed',
          providerMessageId: '',
          error: error.message || 'Send failed',
        });
      }
    }

    const okCount = deliveries.filter((d) => d.status !== 'failed').length;
    const status = okCount === phones.length ? 'queued' : okCount > 0 ? 'partial' : 'failed';
    const errorMessage = deliveries
      .filter((d) => d.status === 'failed')
      .map((d) => `${d.phone}: ${d.error}`)
      .join('; ');

    const log = await AlertSmsLog.create({
      phones,
      contacts,
      message,
      purpose: String(req.body.purpose || '').trim().slice(0, 400),
      templateId: req.body.templateId || null,
      templateName: String(req.body.templateName || '').trim(),
      status,
      aiDrafted: Boolean(req.body.aiDrafted),
      aiProvider: String(req.body.aiProvider || '').trim().slice(0, 40),
      deliveries,
      errorMessage,
      totalSegments,
      totalPrice,
      priceUnit,
      consentConfirmed: Boolean(req.body.consentConfirmed),
      createdBy: req.user._id,
      sentAt: new Date(),
    });

    await writeAudit({
      action: 'sms.alert_send',
      actor: req.user._id,
      actorEmail: req.user.email,
      targetType: 'AlertSmsLog',
      targetId: log._id,
      success: status !== 'failed',
      message: status,
      meta: { recipients: phones.length, status },
      ip: req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || '',
      userAgent: req.headers['user-agent'] || '',
    });

    const populated = await AlertSmsLog.findById(log._id)
      .populate('createdBy', 'name email')
      .populate('contacts', 'firstName lastName phone')
      .lean();

    if (status === 'failed') {
      return res.status(400).json({
        message: errorMessage || 'Failed to send SMS alert',
        log: populated,
      });
    }

    res.status(201).json({
      message:
        status === 'queued'
          ? `Alert SMS queued for ${okCount} recipient(s). Delivery status will update via webhook.`
          : `Partial send: ${okCount}/${phones.length} accepted by Twilio.`,
      log: populated,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/:id/cancel', requirePermission('alertsms:send'), async (req, res) => {
  try {
    const log = await AlertSmsLog.findOne({ _id: req.params.id, deletedAt: null });
    if (!log) return res.status(404).json({ message: 'Log not found' });
    if (log.status !== 'scheduled') {
      return res.status(400).json({ message: 'Only scheduled alerts can be cancelled' });
    }
    log.status = 'cancelled';
    await log.save();
    res.json({ message: 'Scheduled alert cancelled', log });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.delete('/:id', requirePermission('alertsms:delete'), async (req, res) => {
  try {
    const log = await AlertSmsLog.findByIdAndUpdate(
      req.params.id,
      { deletedAt: new Date() },
      { new: true }
    );
    if (!log) return res.status(404).json({ message: 'Log not found' });
    res.json({ message: 'Alert SMS log archived' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export { OPT_OUT_KEYWORDS, applyTemplate };
export default router;
