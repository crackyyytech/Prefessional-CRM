import express from 'express';
import AlertSmsLog from '../models/AlertSmsLog.js';
import Contact from '../models/Contact.js';
import { getAppSettings } from '../models/AppSettings.js';
import { normalizeSmsPhone } from '../services/messaging.js';
import { getPublicRequestUrl, validateTwilioSignature } from '../utils/twilioSignature.js';
import { writeAudit } from '../models/AuditLog.js';

const router = express.Router();

const OPT_OUT = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
const OPT_IN = new Set(['START', 'YES', 'UNSTOP']);

function mapProviderStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'delivered') return 'delivered';
  if (s === 'sent') return 'sent';
  if (s === 'undelivered') return 'undelivered';
  if (s === 'failed') return 'failed';
  if (s === 'queued' || s === 'accepted' || s === 'sending') return 'queued';
  return s || 'queued';
}

async function assertTwilio(req, res) {
  const settings = await getAppSettings();
  const signature = req.headers['x-twilio-signature'];
  const url = getPublicRequestUrl(req);
  const skip = process.env.TWILIO_SKIP_SIGNATURE === '1' && process.env.NODE_ENV !== 'production';
  if (skip) return settings;

  if (!validateTwilioSignature(settings.smsAuthToken, signature, url, req.body || {})) {
    res.status(403).send('Forbidden');
    return null;
  }
  return settings;
}

router.post('/sms/status', async (req, res) => {
  try {
    const settings = await assertTwilio(req, res);
    if (!settings) return;

    const messageSid = req.body.MessageSid || req.body.SmsSid;
    const messageStatus = req.body.MessageStatus || req.body.SmsStatus;
    if (!messageSid) return res.sendStatus(204);

    const log = await AlertSmsLog.findOne({
      'deliveries.providerMessageId': messageSid,
      deletedAt: null,
    });
    if (!log) return res.sendStatus(204);

    const delivery = log.deliveries.find((d) => d.providerMessageId === messageSid);
    if (delivery) {
      delivery.providerStatus = messageStatus || delivery.providerStatus;
      delivery.status = mapProviderStatus(messageStatus);
      if (req.body.ErrorCode) delivery.errorCode = String(req.body.ErrorCode);
      if (req.body.ErrorMessage) delivery.error = String(req.body.ErrorMessage);
      if (req.body.Price != null) delivery.price = String(req.body.Price);
      if (req.body.PriceUnit) delivery.priceUnit = String(req.body.PriceUnit);
      if (req.body.NumSegments) delivery.numSegments = Number(req.body.NumSegments);
      if (delivery.status === 'delivered') delivery.deliveredAt = new Date();
    }

    const statuses = (log.deliveries || []).map((d) => d.status);
    if (statuses.every((s) => s === 'delivered')) log.status = 'delivered';
    else if (statuses.every((s) => s === 'failed' || s === 'undelivered')) log.status = 'failed';
    else if (statuses.some((s) => s === 'failed' || s === 'undelivered') && statuses.some((s) => s !== 'failed' && s !== 'undelivered')) {
      log.status = 'partial';
    } else if (statuses.some((s) => s === 'sent' || s === 'delivered')) {
      log.status = 'sent';
    } else {
      log.status = 'queued';
    }

    log.totalSegments = (log.deliveries || []).reduce((sum, d) => sum + (d.numSegments || 0), 0);
    log.totalPrice = (log.deliveries || []).reduce((sum, d) => sum + Math.abs(Number(d.price) || 0), 0);
    const unit = (log.deliveries || []).find((d) => d.priceUnit)?.priceUnit;
    if (unit) log.priceUnit = unit;

    await log.save();
    res.sendStatus(204);
  } catch (error) {
    console.warn('[twilio status]', error.message);
    res.sendStatus(204);
  }
});

router.post('/sms/inbound', async (req, res) => {
  try {
    const settings = await assertTwilio(req, res);
    if (!settings) return;

    const from = normalizeSmsPhone(req.body.From);
    const body = String(req.body.Body || '').trim().toUpperCase();
    if (!from) return res.type('text/xml').send('<Response></Response>');

    const contact = await Contact.findOne({
      $or: [{ phoneNormalized: from }, { phone: new RegExp(`${from.slice(-10)}$`) }],
    });

    if (OPT_OUT.has(body.split(/\s+/)[0])) {
      if (contact) {
        contact.smsOptedOut = true;
        contact.smsOptIn = false;
        contact.smsOptedOutAt = new Date();
        contact.smsOptOutKeyword = body.split(/\s+/)[0];
        await contact.save();
      }
      await writeAudit({
        action: 'sms.opt_out',
        targetType: 'Contact',
        targetId: contact?._id,
        message: `STOP from +${from}`,
        meta: { phone: from, keyword: body.split(/\s+/)[0] },
      });
      return res
        .type('text/xml')
        .send('<Response><Message>You are unsubscribed from SMS alerts. Reply START to re-subscribe.</Message></Response>');
    }

    if (OPT_IN.has(body.split(/\s+/)[0]) && contact) {
      contact.smsOptedOut = false;
      contact.smsOptIn = true;
      contact.smsOptInAt = new Date();
      contact.smsConsentMethod = 'api';
      contact.smsConsentSource = 'inbound_sms';
      contact.smsOptOutKeyword = '';
      await contact.save();
      return res
        .type('text/xml')
        .send('<Response><Message>You are re-subscribed to SMS alerts.</Message></Response>');
    }

    res.type('text/xml').send('<Response></Response>');
  } catch (error) {
    console.warn('[twilio inbound]', error.message);
    res.type('text/xml').send('<Response></Response>');
  }
});

export default router;
