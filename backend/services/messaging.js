import nodemailer from 'nodemailer';
import FollowUp from '../models/FollowUp.js';
import AlertSmsLog from '../models/AlertSmsLog.js';
import Contact from '../models/Contact.js';
import { getAppSettings, toBrandingSettings } from '../models/AppSettings.js';
import { decryptSecret } from '../utils/secretCrypto.js';

function applyTemplate(text, contact = {}, extras = {}) {
  const name = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || extras.toName || 'there';
  const map = {
    name,
    firstName: contact.firstName || name.split(' ')[0] || 'there',
    lastName: contact.lastName || '',
    email: extras.toEmail || contact.email || '',
    phone: contact.phone || extras.toPhone || '',
    company: contact.company || '',
  };

  return String(text || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    return map[key] != null && map[key] !== '' ? String(map[key]) : '';
  });
}

function secret(value) {
  return decryptSecret(value) || String(value || '');
}

function createTransport(settings) {
  const emailPass = secret(settings.emailPass);
  if (!settings.emailHost || !settings.emailUser || !emailPass) {
    throw new Error('Email SMTP is not configured. Go to Integrations -> Email (SMTP) and save host/user/password.');
  }

  const port = Number(settings.emailPort) || 587;
  const secure = settings.emailSecure != null ? Boolean(settings.emailSecure) : port === 465;
  const allowInsecureTls = process.env.SMTP_INSECURE_TLS === '1' || process.env.NODE_ENV !== 'production';

  return nodemailer.createTransport({
    host: settings.emailHost,
    port,
    secure,
    auth: {
      user: settings.emailUser,
      pass: emailPass.replace(/\s+/g, ''),
    },
    tls: {
      rejectUnauthorized: !allowInsecureTls,
    },
  });
}

export async function sendEmail({ settings, to, subject, message, fromName }) {
  const transporter = createTransport(settings);
  const branding = toBrandingSettings(settings);
  const fromAddress = settings.emailFrom || settings.emailUser;
  const from = fromName || branding.appName
    ? `"${fromName || branding.appName}" <${fromAddress}>`
    : fromAddress;

  const info = await transporter.sendMail({
    from,
    to,
    subject: subject || `Follow-up from ${branding.appName}`,
    text: message,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.5;white-space:pre-wrap">${String(message)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')}</div>`,
  });

  return info;
}

export async function testSmtpConnection(settings, toEmail) {
  const transporter = createTransport(settings);
  await transporter.verify();
  if (toEmail) {
    const branding = toBrandingSettings(settings);
    await sendEmail({
      settings,
      to: toEmail,
      subject: `${branding.appName} — SMTP test`,
      message: `This is a test email from ${branding.appName}.\n\nYour scheduled emails will be sent from ${settings.emailFrom || settings.emailUser}.`,
    });
  }
  return true;
}

function normalizeWhatsAppPhone(to) {
  let phone = String(to || '').replace(/\D/g, '');
  if (!phone) return '';
  if (phone.length === 10 && /^[6-9]/.test(phone)) {
    phone = `91${phone}`;
  }
  if (phone.startsWith('00')) phone = phone.slice(2);
  return phone;
}

function formatWhatsAppError(data, status) {
  const err = data?.error || {};
  const code = err.code;
  const msg = err.message || `WhatsApp send failed (${status})`;

  if (code === 131030 || /not in allowed list/i.test(msg)) {
    return (
      `${msg}\n\nFix (Meta Developer → WhatsApp → API Setup): ` +
      `under "To", click Manage phone number list and add this recipient ` +
      `(with country code, e.g. 919789802714). They must accept the SMS invite. ` +
      `Or use a production WhatsApp Business number to message any customer.`
    );
  }
  if (code === 131026 || /not a valid whatsapp/i.test(msg)) {
    return `${msg} Use full international format (e.g. 919789802714 for India).`;
  }
  return msg;
}

/**
 * Normalize to digits-only E.164 without leading +.
 * Prefer numbers that already include country code.
 * Bare 10-digit numbers starting 6-9 default to India (91) for local CRM use.
 */
export function normalizeSmsPhone(to, { defaultCountry = '91' } = {}) {
  let phone = String(to || '').trim();
  if (!phone) return '';
  phone = phone.replace(/[^\d+]/g, '');
  if (phone.startsWith('+')) phone = phone.slice(1);
  phone = phone.replace(/\D/g, '');
  if (phone.startsWith('00')) phone = phone.slice(2);
  if (phone.length === 10 && /^[6-9]/.test(phone) && defaultCountry) {
    phone = `${defaultCountry}${phone}`;
  }
  if (phone.length < 10 || phone.length > 15) return '';
  return phone;
}

export function toE164(phone) {
  const digits = normalizeSmsPhone(phone);
  return digits ? `+${digits}` : '';
}

export function isSmsConfigured(settings) {
  return Boolean(
    settings?.smsAccountSid
    && settings?.smsAuthToken
    && (settings?.smsFromNumber || settings?.smsMessagingServiceSid)
  );
}

function formatSmsError(data, status) {
  const code = data?.code || data?.error_code;
  const msg = data?.message || data?.error_message || `SMS send failed (${status})`;
  if (code === 21211) return `${msg} Use E.164 format (e.g. +9198XXXXXXXX).`;
  if (code === 21408) return `${msg} Enable geo permissions for this country in Twilio Console.`;
  if (code === 21608 || /trial/i.test(msg)) {
    return `${msg} Trial accounts can only SMS verified numbers. Verify the recipient in Twilio Console or upgrade.`;
  }
  if (code === 21610) return `${msg} Recipient opted out (STOP). Do not retry.`;
  if (code === 30007) return `${msg} Message filtered as spam. Review content and sender reputation.`;
  if (code === 30034) return `${msg} Complete A2P 10DLC registration for US traffic.`;
  return msg;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendSms({ settings, to, message, statusCallback }) {
  if (!isSmsConfigured(settings)) {
    throw new Error(
      'SMS is not configured. Go to Integrations -> SMS (Twilio) and save Account SID, Auth Token, and From number or Messaging Service SID.'
    );
  }

  const phone = normalizeSmsPhone(to);
  if (!phone) throw new Error('Recipient phone number is invalid. Use country code (E.164).');

  const body = String(message || '').trim();
  if (!body) throw new Error('SMS message is empty');

  const accountSid = String(settings.smsAccountSid || '').trim();
  const authToken = secret(settings.smsAuthToken);
  const from = String(settings.smsFromNumber || '').trim();
  const messagingServiceSid = String(settings.smsMessagingServiceSid || '').trim();
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  const form = new URLSearchParams();
  form.set('To', `+${phone}`);
  form.set('Body', body.slice(0, 1600));
  if (messagingServiceSid) {
    form.set('MessagingServiceSid', messagingServiceSid);
  } else {
    form.set('From', from.startsWith('+') ? from : `+${from.replace(/\D/g, '')}`);
  }

  const callbackUrl = statusCallback || settings.smsStatusCallbackUrl || '';
  if (callbackUrl) form.set('StatusCallback', callbackUrl);

  let lastError = 'SMS send failed';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
          signal: controller.signal,
        }
      );
      const data = await response.json().catch(() => ({}));
      if (response.status === 429) {
        const base = 100 * (2 ** attempt);
        const jitter = base * 0.1 * (2 * Math.random() - 1);
        await sleep(Math.min(base + jitter, 30000));
        lastError = formatSmsError(data, response.status);
        continue;
      }
      if (!response.ok) {
        throw new Error(formatSmsError(data, response.status));
      }
      return {
        sid: data.sid || '',
        status: data.status || 'queued',
        price: data.price || null,
        priceUnit: data.price_unit || '',
        numSegments: data.num_segments ? Number(data.num_segments) : null,
        errorCode: data.error_code || null,
        errorMessage: data.error_message || '',
      };
    } catch (error) {
      if (error.name === 'AbortError') {
        lastError = 'Twilio request timed out';
      } else {
        lastError = error.message || lastError;
      }
      if (attempt >= 4 || !/429|rate|timeout/i.test(lastError)) {
        throw new Error(lastError);
      }
      const base = 100 * (2 ** attempt);
      await sleep(Math.min(base, 30000));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(lastError);
}

export async function testSmsConnection(settings, toPhone) {
  if (!isSmsConfigured(settings)) {
    throw new Error(
      'SMS is not configured. Save Account SID, Auth Token, and From number or Messaging Service SID first.'
    );
  }

  const accountSid = String(settings.smsAccountSid || '').trim();
  const authToken = secret(settings.smsAuthToken);
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  const accountRes = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}.json`,
    {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(15000),
    }
  );
  const accountData = await accountRes.json().catch(() => ({}));
  if (!accountRes.ok) {
    throw new Error(formatSmsError(accountData, accountRes.status));
  }

  if (toPhone) {
    const branding = toBrandingSettings(settings);
    const result = await sendSms({
      settings,
      to: toPhone,
      message: `${branding.appName}: SMS integration test. If you received this, Twilio is configured correctly.`,
    });
    return { accountStatus: accountData.status, testSid: result.sid, testStatus: result.status };
  }

  return { accountStatus: accountData.status, friendlyName: accountData.friendly_name || '' };
}

async function sendWhatsApp({ settings, to, message }) {
  const token = secret(settings.whatsappToken);
  if (!token || !settings.whatsappPhoneNumberId) {
    throw new Error('WhatsApp API is not configured in Integrations');
  }

  const phone = normalizeWhatsAppPhone(to);
  if (!phone) throw new Error('Contact phone number is missing');

  const response = await fetch(
    `https://graph.facebook.com/v19.0/${settings.whatsappPhoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: message },
      }),
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(formatWhatsAppError(data, response.status));
  }
}

export async function dispatchFollowUp(followUpId) {
  const followUp = await FollowUp.findById(followUpId).populate('contact');
  if (!followUp || followUp.status !== 'pending') return followUp;

  const settings = await getAppSettings();
  const contact = followUp.contact;
  const toEmail = (followUp.toEmail || contact?.email || '').trim();
  const toPhone = (followUp.toPhone || contact?.phone || '').trim();

  try {
    if (followUp.channel === 'email') {
      if (!toEmail) throw new Error('Recipient email is missing');
      const subject = applyTemplate(followUp.subject, contact, { toEmail });
      const message = applyTemplate(followUp.message, contact, { toEmail });
      await sendEmail({
        settings,
        to: toEmail,
        subject,
        message,
      });
    } else if (followUp.channel === 'whatsapp') {
      if (!toPhone) throw new Error('Recipient phone is missing');
      const message = applyTemplate(followUp.message, contact, { toEmail });
      await sendWhatsApp({
        settings,
        to: toPhone,
        message,
      });
    } else if (followUp.channel === 'sms') {
      if (!toPhone) throw new Error('Recipient phone is missing');
      if (contact?.smsOptedOut) throw new Error('Contact has opted out of SMS');
      if (contact && contact.smsOptIn === false) throw new Error('Contact has not consented to SMS');
      const message = applyTemplate(followUp.message, contact, { toPhone });
      await sendSms({ settings, to: toPhone, message });
    }

    followUp.status = 'sent';
    followUp.sentAt = new Date();
    followUp.errorMessage = '';
    await followUp.save();
    console.log(`[automation] Sent ${followUp.channel} follow-up ${followUp._id}`);
  } catch (error) {
    followUp.status = 'failed';
    followUp.errorMessage = error.message;
    await followUp.save();
    console.warn(`[automation] Failed follow-up ${followUp._id}: ${error.message}`);
  }

  return followUp;
}

export async function processDueFollowUps() {
  const now = new Date();
  const due = await FollowUp.find({
    status: 'pending',
    scheduledAt: { $lte: now },
  }).limit(25);

  for (const item of due) {
    await dispatchFollowUp(item._id);
  }

  return due.length;
}

export async function processDueAlertSms() {
  const now = new Date();
  const due = await AlertSmsLog.find({
    status: 'scheduled',
    scheduledAt: { $lte: now },
    deletedAt: null,
  }).limit(20);

  const settings = await getAppSettings();
  for (const log of due) {
    try {
      if (!isSmsConfigured(settings)) {
        log.status = 'failed';
        log.errorMessage = 'SMS is not configured';
        await log.save();
        continue;
      }

      const deliveries = [];
      for (const phone of log.phones || []) {
        const contact = (log.contacts || []).length
          ? await Contact.findOne({
            $or: [
              { phone },
              { phoneNormalized: normalizeSmsPhone(phone) },
            ],
          })
          : null;
        if (contact?.smsOptedOut) {
          deliveries.push({ phone, status: 'failed', error: 'Opted out', providerMessageId: '' });
          continue;
        }
        try {
          const result = await sendSms({
            settings,
            to: phone,
            message: log.message,
            statusCallback: settings.smsStatusCallbackUrl || undefined,
          });
          deliveries.push({
            phone,
            status: result.status === 'failed' ? 'failed' : 'queued',
            providerMessageId: result.sid || '',
            providerStatus: result.status || 'queued',
            price: result.price,
            priceUnit: result.priceUnit || '',
            numSegments: result.numSegments,
            error: '',
          });
        } catch (error) {
          deliveries.push({
            phone,
            status: 'failed',
            providerMessageId: '',
            error: error.message || 'Send failed',
          });
        }
      }

      const sentCount = deliveries.filter((d) => d.status !== 'failed').length;
      log.deliveries = deliveries;
      log.status = sentCount === (log.phones || []).length ? 'queued' : sentCount > 0 ? 'partial' : 'failed';
      log.sentAt = new Date();
      log.errorMessage = deliveries.filter((d) => d.status === 'failed').map((d) => `${d.phone}: ${d.error}`).join('; ');
      await log.save();
    } catch (error) {
      log.status = 'failed';
      log.errorMessage = error.message;
      await log.save();
    }
  }
  return due.length;
}

let workerStarted = false;

export function startFollowUpWorker() {
  if (workerStarted) return;
  workerStarted = true;

  processDueFollowUps().catch((err) => {
    console.warn('Follow-up worker startup error:', err.message);
  });
  processDueAlertSms().catch((err) => {
    console.warn('Alert SMS worker startup error:', err.message);
  });

  setInterval(() => {
    processDueFollowUps().catch((err) => {
      console.warn('Follow-up worker error:', err.message);
    });
    processDueAlertSms().catch((err) => {
      console.warn('Alert SMS worker error:', err.message);
    });
  }, 30 * 1000);

  console.log('Scheduled email/WhatsApp/SMS worker started (every 30s)');
}

export { applyTemplate };
