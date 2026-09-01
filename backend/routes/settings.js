import express from 'express';
import {
  getAppSettings,
  toAdminAiSettings,
  toPublicAiStatus,
  toIntegrationsSettings,
  toBrandingSettings,
  normalizeProvider,
  PROVIDER_DEFAULTS,
  AI_PROVIDER_IDS,
  normalizeAiProviders,
  syncLegacyAiFields,
  resolveAiRuntime,
} from '../models/AppSettings.js';
import { migrateProviderModel, testAiProvider, testAllAiProviders } from '../services/aiProvider.js';
import { clearAiHealthCache, getCachedAiHealth, getLiveAiHealth } from '../services/aiHealthCache.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { testSmtpConnection, testSmsConnection } from '../services/messaging.js';
import { encryptSecret } from '../utils/secretCrypto.js';
import { writeAudit } from '../models/AuditLog.js';

const router = express.Router();

const SECRET_FIELDS = new Set([
  'emailPass',
  'whatsappToken',
  'smsAuthToken',
  'razorpayKeySecret',
  'stripeSecretKey',
  'aiApiKey',
]);

function applySecret(settings, field, value) {
  if (value === undefined || value === null) return;
  let trimmed = String(value).trim();
  if (!trimmed || trimmed.includes('••••')) return;
  // Gmail app passwords are often pasted with spaces — strip them
  if (field === 'emailPass') trimmed = trimmed.replace(/\s+/g, '');
  settings[field] = SECRET_FIELDS.has(field) ? encryptSecret(trimmed) : trimmed;
}

function applyProviderSecret(target, apiKey) {
  if (apiKey === undefined || apiKey === null) return;
  const trimmed = String(apiKey).trim();
  if (!trimmed || trimmed.includes('••••')) return;
  target.apiKey = encryptSecret(trimmed);
}

router.get('/branding', async (_req, res) => {
  try {
    const settings = await getAppSettings();
    res.json(toBrandingSettings(settings));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.use(authenticate);

router.put('/branding', requirePermission('users:manage'), async (req, res) => {
  try {
    const settings = await getAppSettings();
    if (req.body.appName !== undefined) {
      const name = String(req.body.appName || '').trim();
      if (!name) return res.status(400).json({ message: 'Application name is required' });
      if (name.length > 60) return res.status(400).json({ message: 'Application name must be 60 characters or less' });
      settings.appName = name;
    }
    if (req.body.appTagline !== undefined) {
      const tagline = String(req.body.appTagline || '').trim();
      if (tagline.length > 80) return res.status(400).json({ message: 'Tagline must be 80 characters or less' });
      settings.appTagline = tagline || 'Customer relationships';
    }
    if (req.body.companyLegalName !== undefined) {
      settings.companyLegalName = String(req.body.companyLegalName || '').trim().slice(0, 120);
    }
    if (req.body.companyAddress !== undefined) {
      settings.companyAddress = String(req.body.companyAddress || '').trim().slice(0, 400);
    }
    if (req.body.companyPhone !== undefined) {
      settings.companyPhone = String(req.body.companyPhone || '').trim().slice(0, 40);
    }
    if (req.body.companyEmail !== undefined) {
      settings.companyEmail = String(req.body.companyEmail || '').trim().slice(0, 120);
    }
    if (req.body.companyGstin !== undefined) {
      settings.companyGstin = String(req.body.companyGstin || '').trim().slice(0, 20).toUpperCase();
    }
    await settings.save();
    res.json({
      message: 'Application branding saved',
      settings: toBrandingSettings(settings),
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.get('/ai/status', requirePermission('ai:chat'), async (_req, res) => {
  try {
    const settings = await getAppSettings();
    res.json(toPublicAiStatus(settings));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/ai', requirePermission('ai:manage'), async (_req, res) => {
  try {
    const settings = await getAppSettings();
    res.json(toAdminAiSettings(settings));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/ai', requirePermission('ai:manage'), async (req, res) => {
  try {
    const settings = await getAppSettings();
    const {
      enabled,
      provider,
      defaultProvider,
      apiKey,
      baseUrl,
      model,
      providers,
    } = req.body;

    const nextProviders = normalizeAiProviders(settings);

    if (providers && typeof providers === 'object') {
      for (const id of AI_PROVIDER_IDS) {
        if (!providers[id]) continue;
        const incoming = providers[id];
        const defaults = PROVIDER_DEFAULTS[id];
        if (incoming.enabled !== undefined) nextProviders[id].enabled = Boolean(incoming.enabled);
        if (incoming.baseUrl !== undefined) {
          nextProviders[id].baseUrl = String(incoming.baseUrl || defaults.baseUrl).replace(/\/$/, '');
        }
        if (incoming.model !== undefined) {
          nextProviders[id].model = String(incoming.model || defaults.model).trim() || defaults.model;
        }
        if (id === 'cloudflare' && incoming.accountId !== undefined) {
          nextProviders[id].accountId = String(incoming.accountId || '').trim();
        }
        applyProviderSecret(nextProviders[id], incoming.apiKey);
      }
    } else {
      const id = normalizeProvider(provider || settings.aiProvider || 'gemini');
      if (enabled !== undefined) nextProviders[id].enabled = Boolean(enabled);
      if (baseUrl !== undefined) {
        nextProviders[id].baseUrl = String(baseUrl || PROVIDER_DEFAULTS[id].baseUrl).replace(/\/$/, '');
      }
      if (model !== undefined) {
        nextProviders[id].model = String(model || PROVIDER_DEFAULTS[id].model).trim()
          || PROVIDER_DEFAULTS[id].model;
      }
      applyProviderSecret(nextProviders[id], apiKey);
      if (enabled === false && provider === undefined) {
        for (const key of AI_PROVIDER_IDS) nextProviders[key].enabled = false;
      }
    }

    for (const id of AI_PROVIDER_IDS) {
      nextProviders[id].model = migrateProviderModel(id, nextProviders[id].model);
    }

    const chosenDefault = normalizeProvider(
      defaultProvider || provider || settings.aiProvider || 'gemini'
    );
    syncLegacyAiFields(settings, nextProviders, chosenDefault);
    settings.markModified('aiProviders');
    await settings.save();

    res.json({
      message: 'AI integrations saved',
      settings: toAdminAiSettings(settings),
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/ai/test', requirePermission('ai:manage'), async (req, res) => {
  try {
    const settings = await getAppSettings();
    const providerId = normalizeProvider(req.body.provider || settings.aiProvider || 'gemini');
    const runtime = resolveAiRuntime(settings, providerId);
    if (!runtime) {
      return res.status(400).json({ message: `${providerId} is not enabled or not configured` });
    }
    const result = await testAiProvider(runtime);
    res.json({ message: `${providerId} is working`, ...result });
  } catch (error) {
    res.status(400).json({ message: error.message || 'AI provider test failed' });
  }
});

router.get('/ai/health', requirePermission('ai:manage'), async (req, res) => {
  try {
    const settings = await getAppSettings();
    const live = req.query.live === '1' || req.query.live === 'true';

    if (live) {
      const report = await getLiveAiHealth(
        () => testAllAiProviders(settings),
        { refreshMs: 30000 }
      );
      return res.json(report);
    }

    clearAiHealthCache();
    const report = await testAllAiProviders(settings);
    res.json({ ...report, checkedAt: Date.now(), fromCache: false });
  } catch (error) {
    res.status(500).json({ message: error.message || 'AI health check failed' });
  }
});

router.get('/integrations', requirePermission('integrations:manage'), async (_req, res) => {
  try {
    const settings = await getAppSettings();
    res.json(toIntegrationsSettings(settings));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/integrations', requirePermission('integrations:manage'), async (req, res) => {
  try {
    const settings = await getAppSettings();
    const { email = {}, whatsapp = {}, sms = {}, social = {}, payments = {} } = req.body;

    if (email.host !== undefined) settings.emailHost = email.host;
    if (email.port !== undefined) settings.emailPort = Number(email.port) || 587;
    if (email.secure !== undefined) settings.emailSecure = Boolean(email.secure);
    if (email.user !== undefined) settings.emailUser = email.user;
    if (email.from !== undefined) settings.emailFrom = email.from;
    applySecret(settings, 'emailPass', email.pass);

    if (whatsapp.phoneNumberId !== undefined) settings.whatsappPhoneNumberId = whatsapp.phoneNumberId;
    applySecret(settings, 'whatsappToken', whatsapp.token);

    if (sms.accountSid !== undefined) settings.smsAccountSid = String(sms.accountSid || '').trim();
    if (sms.fromNumber !== undefined) settings.smsFromNumber = String(sms.fromNumber || '').trim();
    if (sms.messagingServiceSid !== undefined) {
      settings.smsMessagingServiceSid = String(sms.messagingServiceSid || '').trim();
    }
    if (sms.statusCallbackUrl !== undefined) {
      settings.smsStatusCallbackUrl = String(sms.statusCallbackUrl || '').trim();
    }
    if (sms.dailyLimit !== undefined) {
      settings.smsDailyLimit = Math.max(1, Math.min(10000, Number(sms.dailyLimit) || 100));
    }
    applySecret(settings, 'smsAuthToken', sms.authToken);

    if (social.facebookPageUrl !== undefined) settings.facebookPageUrl = social.facebookPageUrl;
    if (social.instagramUrl !== undefined) settings.instagramUrl = social.instagramUrl;
    if (social.linkedinUrl !== undefined) settings.linkedinUrl = social.linkedinUrl;
    if (social.twitterUrl !== undefined) settings.twitterUrl = social.twitterUrl;
    if (social.facebookPixelId !== undefined) settings.facebookPixelId = social.facebookPixelId;

    if (payments.razorpayKeyId !== undefined) settings.razorpayKeyId = payments.razorpayKeyId;
    if (payments.stripePublishableKey !== undefined) settings.stripePublishableKey = payments.stripePublishableKey;
    if (payments.paymentWebhookUrl !== undefined) settings.paymentWebhookUrl = payments.paymentWebhookUrl;
    applySecret(settings, 'razorpayKeySecret', payments.razorpayKeySecret);
    applySecret(settings, 'stripeSecretKey', payments.stripeSecretKey);

    await settings.save();
    await writeAudit({
      action: 'integrations.saved',
      actor: req.user?._id,
      actorEmail: req.user?.email,
      success: true,
      meta: {
        email: Boolean(settings.emailHost),
        sms: Boolean(settings.smsAccountSid),
        whatsapp: Boolean(settings.whatsappPhoneNumberId),
      },
    });
    res.json({
      message: 'Integrations saved',
      settings: toIntegrationsSettings(settings),
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/integrations/test-email', requirePermission('integrations:manage'), async (req, res) => {
  try {
    const settings = await getAppSettings();
    const to = String(req.body.to || settings.emailUser || '').trim();
    if (!to) return res.status(400).json({ message: 'Enter a To email for the test' });
    await testSmtpConnection(settings, to);
    res.json({ message: `Test email sent to ${to}` });
  } catch (error) {
    res.status(400).json({ message: error.message || 'SMTP test failed' });
  }
});

router.post('/integrations/test-sms', requirePermission('integrations:manage'), async (req, res) => {
  try {
    const settings = await getAppSettings();
    const to = String(req.body.to || '').trim();
    const result = await testSmsConnection(settings, to || undefined);
    res.json({
      message: to
        ? `Twilio account OK (${result.accountStatus}). Test SMS queued${result.testSid ? ` (${result.testSid})` : ''}.`
        : `Twilio account OK (${result.accountStatus}${result.friendlyName ? `: ${result.friendlyName}` : ''}).`,
      result,
    });
  } catch (error) {
    res.status(400).json({ message: error.message || 'SMS test failed' });
  }
});

export default router;
