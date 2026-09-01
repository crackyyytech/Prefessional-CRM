import mongoose from 'mongoose';
import { PROVIDER_DEFAULTS, normalizeProvider, migrateProviderModel, migrateGithubBaseUrl, isProviderReady } from '../services/aiProvider.js';
import { decryptSecret } from '../utils/secretCrypto.js';

const appSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    appName: { type: String, trim: true, default: 'Vistawin CRM' },
    appTagline: { type: String, trim: true, default: 'Customer relationships' },
    companyLegalName: { type: String, trim: true, default: '' },
    companyAddress: { type: String, trim: true, default: '' },
    companyPhone: { type: String, trim: true, default: '' },
    companyEmail: { type: String, trim: true, default: '' },
    companyGstin: { type: String, trim: true, default: '' },
    aiEnabled: { type: Boolean, default: false },
    aiProvider: {
      type: String,
      default: 'gemini',
    },
    aiApiKey: { type: String, default: '' },
    aiBaseUrl: { type: String, default: 'https://generativelanguage.googleapis.com/v1beta' },
    aiModel: { type: String, default: 'gemini-2.0-flash-lite' },
    // Multi-provider configs: { gemini: {...}, groq: {...} }
    aiProviders: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Email SMTP
    emailHost: { type: String, default: '' },
    emailPort: { type: Number, default: 587 },
    emailSecure: { type: Boolean, default: false },
    emailUser: { type: String, default: '' },
    emailPass: { type: String, default: '' },
    emailFrom: { type: String, default: '' },

    // WhatsApp Cloud API
    whatsappToken: { type: String, default: '' },
    whatsappPhoneNumberId: { type: String, default: '' },

    // SMS (Twilio)
    smsAccountSid: { type: String, default: '' },
    smsAuthToken: { type: String, default: '' },
    smsFromNumber: { type: String, default: '' },
    smsMessagingServiceSid: { type: String, default: '' },
    smsStatusCallbackUrl: { type: String, default: '' },
    smsDailyLimit: { type: Number, default: 100 },

    // Social
    facebookPageUrl: { type: String, default: '' },
    instagramUrl: { type: String, default: '' },
    linkedinUrl: { type: String, default: '' },
    twitterUrl: { type: String, default: '' },
    facebookPixelId: { type: String, default: '' },

    // Payments
    razorpayKeyId: { type: String, default: '' },
    razorpayKeySecret: { type: String, default: '' },
    stripePublishableKey: { type: String, default: '' },
    stripeSecretKey: { type: String, default: '' },
    paymentWebhookUrl: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('AppSettings', appSettingsSchema);

export async function getAppSettings() {
  let settings = await mongoose.model('AppSettings').findOne({ key: 'global' });
  if (!settings) {
    settings = await mongoose.model('AppSettings').create({ key: 'global' });
  }
  return settings;
}

export function maskApiKey(apiKey) {
  if (!apiKey) return '';
  // Encrypted values should not be partially exposed
  if (String(apiKey).startsWith('enc:v1:')) return '•••••••• (encrypted)';
  if (apiKey.length <= 8) return '••••••••';
  return `${apiKey.slice(0, 3)}••••${apiKey.slice(-4)}`;
}

export function maskSid(sid) {
  if (!sid) return '';
  if (sid.length <= 8) return '••••••••';
  return `${sid.slice(0, 4)}••••${sid.slice(-4)}`;
}

export const AI_PROVIDER_IDS = [
  'gemini',
  'groq',
  'openrouter',
  'huggingface',
  'cerebras',
  'mistral',
  'sambanova',
  'cloudflare',
  'github',
  'together',
  'fireworks',
  'deepseek',
  'nvidia',
  'siliconflow',
  'cohere',
  'glm',
  'ollama',
  'pollinations',
  'cursor',
];

export const AI_PROVIDER_META = {
  gemini: {
    label: 'Google Gemini (Free)',
    description: 'Free Google AI Studio key — gemini-2.0-flash recommended',
    docsUrl: 'https://aistudio.google.com/apikey',
    showBaseUrl: false,
    freeTier: 'complete',
    requiresApiKey: true,
  },
  groq: {
    label: 'Groq (Free)',
    description: 'Free GroqCloud — very fast Llama 3.3 70B',
    docsUrl: 'https://console.groq.com/keys',
    showBaseUrl: true,
    freeTier: 'complete',
    requiresApiKey: true,
  },
  openrouter: {
    label: 'OpenRouter (Free models)',
    description: 'Uses openrouter/free auto-router, with fallbacks if a model is down',
    docsUrl: 'https://openrouter.ai/keys',
    showBaseUrl: true,
    freeTier: 'complete',
    requiresApiKey: true,
  },
  huggingface: {
    label: 'Hugging Face (Free)',
    description: 'Free Inference / router API with open models',
    docsUrl: 'https://huggingface.co/settings/tokens',
    showBaseUrl: true,
  },
  cerebras: {
    label: 'Cerebras (Free)',
    description: 'Free Cerebras Cloud — fast Llama inference',
    docsUrl: 'https://cloud.cerebras.ai/',
    showBaseUrl: true,
  },
  mistral: {
    label: 'Mistral (Free tier)',
    description: 'Mistral AI platform free rate limits',
    docsUrl: 'https://console.mistral.ai/api-keys/',
    showBaseUrl: true,
  },
  sambanova: {
    label: 'SambaNova (Free)',
    description: 'Free SambaNova Cloud — Llama models',
    docsUrl: 'https://cloud.sambanova.ai/',
    showBaseUrl: true,
  },
  cloudflare: {
    label: 'Cloudflare Workers AI (Free)',
    description: 'Account ID is auto-detected from your API token — leave ACCOUNT_ID in base URL',
    docsUrl: 'https://dash.cloudflare.com/profile/api-tokens',
    showBaseUrl: true,
  },
  github: {
    label: 'GitHub Models (Free)',
    description: 'Free AI models with a GitHub PAT — uses models.github.ai',
    docsUrl: 'https://github.com/settings/tokens',
    showBaseUrl: true,
  },
  together: {
    label: 'Together AI (Paid credits)',
    description: 'Requires Together account credits — Llama 3.1 models deprecated; uses Llama 3.3 70B',
    docsUrl: 'https://api.together.ai/settings/api-keys',
    showBaseUrl: true,
  },
  fireworks: {
    label: 'Fireworks AI (Free tier)',
    description: 'Deploy a model at fireworks.ai/models first — llama-v3p1-8b-instruct recommended',
    docsUrl: 'https://fireworks.ai/account/api-keys',
    showBaseUrl: true,
  },
  deepseek: {
    label: 'DeepSeek (Paid credits)',
    description: 'Requires DeepSeek account balance — use Gemini or Groq if credits are empty',
    docsUrl: 'https://platform.deepseek.com/api_keys',
    showBaseUrl: true,
  },
  nvidia: {
    label: 'NVIDIA NIM (Free)',
    description: 'Free NVIDIA inference microservices — Llama 3.3 70B',
    docsUrl: 'https://build.nvidia.com/',
    showBaseUrl: true,
  },
  siliconflow: {
    label: 'SiliconFlow (Free credits)',
    description: 'Free signup credits — DeepSeek V3, Qwen 72B, and more',
    docsUrl: 'https://cloud.siliconflow.com/account/ak',
    showBaseUrl: true,
  },
  cohere: {
    label: 'Cohere (Free trial)',
    description: 'Free trial — Command R 08-2024 with OpenAI-compatible API',
    docsUrl: 'https://dashboard.cohere.com/api-keys',
    showBaseUrl: true,
  },
  glm: {
    label: 'Z.AI GLM (Free credits)',
    description: 'Free starter credits — GLM-4-Flash and GLM-5.2 models',
    docsUrl: 'https://z.ai/model-api',
    showBaseUrl: true,
    freeTier: 'credits',
    requiresApiKey: true,
  },
  ollama: {
    label: 'Ollama (100% Free — Local)',
    description: 'Runs on your PC — no API key, no credits. Install Ollama and pull a model (e.g. llama3.2)',
    docsUrl: 'https://ollama.com/download',
    showBaseUrl: true,
    freeTier: 'complete',
    requiresApiKey: false,
  },
  pollinations: {
    label: 'Pollinations (Free Pollen)',
    description: 'Free Pollen via Quests — default model gemini-fast (cheapest). Earn Pollen at enter.pollinations.ai',
    docsUrl: 'https://enter.pollinations.ai/keys',
    showBaseUrl: true,
    freeTier: 'complete',
    requiresApiKey: true,
  },
  cursor: {
    label: 'Cursor API',
    description: 'Uses your Cursor API key — Composer models via Cursor SDK (uses Cursor plan usage)',
    docsUrl: 'https://cursor.com/dashboard/integrations',
    showBaseUrl: false,
    freeTier: 'subscription',
    requiresApiKey: true,
  },
};

export function defaultAiProviders() {
  return Object.fromEntries(
    AI_PROVIDER_IDS.map((id) => [
      id,
      {
        enabled: false,
        apiKey: '',
        baseUrl: PROVIDER_DEFAULTS[id].baseUrl,
        model: PROVIDER_DEFAULTS[id].model,
        accountId: id === 'cloudflare' ? '' : undefined,
      },
    ])
  );
}

export function normalizeAiProviders(settings) {
  const providers = defaultAiProviders();
  const stored = settings.aiProviders && typeof settings.aiProviders === 'object'
    ? settings.aiProviders
    : {};

  for (const id of AI_PROVIDER_IDS) {
    const row = stored[id] || {};
    let baseUrl = String(row.baseUrl || PROVIDER_DEFAULTS[id].baseUrl).replace(/\/$/, '');
    if (id === 'github') baseUrl = migrateGithubBaseUrl(baseUrl);
    providers[id] = {
      enabled: Boolean(row.enabled),
      apiKey: String(row.apiKey || ''),
      baseUrl,
      model: migrateProviderModel(id, String(row.model || PROVIDER_DEFAULTS[id].model).trim() || PROVIDER_DEFAULTS[id].model),
      ...(id === 'cloudflare' ? { accountId: String(row.accountId || '').trim() } : {}),
    };
  }

  // Migrate single-provider legacy fields into the multi-provider map.
  const legacyId = normalizeProvider(settings.aiProvider || 'gemini');
  if (settings.aiApiKey && !providers[legacyId].apiKey) {
    providers[legacyId] = {
      enabled: Boolean(settings.aiEnabled),
      apiKey: settings.aiApiKey,
      baseUrl: String(settings.aiBaseUrl || PROVIDER_DEFAULTS[legacyId].baseUrl).replace(/\/$/, ''),
      model: migrateProviderModel(legacyId, String(settings.aiModel || PROVIDER_DEFAULTS[legacyId].model).trim()
        || PROVIDER_DEFAULTS[legacyId].model),
    };
  }

  return providers;
}

export function listReadyAiProviders(settings) {
  const providers = normalizeAiProviders(settings);
  return AI_PROVIDER_IDS
    .filter((id) => isProviderReady(id, providers[id]))
    .map((id) => ({
      id,
      label: AI_PROVIDER_META[id].label,
      model: providers[id].model,
      hasApiKey: AI_PROVIDER_META[id].requiresApiKey === false || Boolean(providers[id].apiKey),
      freeTier: AI_PROVIDER_META[id].freeTier || 'free-key',
    }));
}

export function resolveAiRuntime(settings, preferredProvider) {
  const providers = normalizeAiProviders(settings);
  const preferred = preferredProvider ? normalizeProvider(preferredProvider) : null;
  const defaultId = normalizeProvider(settings.aiProvider || 'gemini');
  const order = [
    preferred,
    defaultId,
    ...AI_PROVIDER_IDS,
  ].filter(Boolean);

  const tried = new Set();
  for (const id of order) {
    if (tried.has(id)) continue;
    tried.add(id);
    const cfg = providers[id];
    if (isProviderReady(id, cfg)) {
      return {
        aiEnabled: true,
        aiProvider: id,
        aiApiKey: decryptSecret(cfg.apiKey) || cfg.apiKey || '',
        aiBaseUrl: cfg.baseUrl || PROVIDER_DEFAULTS[id].baseUrl,
        aiModel: cfg.model || PROVIDER_DEFAULTS[id].model,
        ...(id === 'cloudflare' ? { aiAccountId: cfg.accountId || '' } : {}),
      };
    }
  }

  if (settings.aiEnabled && settings.aiApiKey) {
    const id = defaultId;
    return {
      aiEnabled: true,
      aiProvider: id,
      aiApiKey: decryptSecret(settings.aiApiKey) || settings.aiApiKey,
      aiBaseUrl: settings.aiBaseUrl || PROVIDER_DEFAULTS[id].baseUrl,
      aiModel: settings.aiModel || PROVIDER_DEFAULTS[id].model,
    };
  }

  return null;
}

export async function repairAndPersistAiProviders() {
  const settings = await getAppSettings();
  const raw = settings.aiProviders && typeof settings.aiProviders === 'object' ? settings.aiProviders : {};
  const repaired = normalizeAiProviders(settings);
  let changed = false;

  for (const id of AI_PROVIDER_IDS) {
    const storedModel = String(raw[id]?.model || '').trim();
    const storedBase = String(raw[id]?.baseUrl || '').replace(/\/$/, '');
    if (storedModel && storedModel !== repaired[id].model) {
      changed = true;
    }
    if (id === 'github' && storedBase && migrateGithubBaseUrl(storedBase) !== repaired[id].baseUrl) {
      changed = true;
    }
  }

  if (!changed) return { changed: false, providers: repaired };

  settings.aiProviders = repaired;
  syncLegacyAiFields(settings, repaired, settings.aiProvider || 'gemini');
  settings.markModified('aiProviders');
  await settings.save();
  return { changed: true, providers: repaired };
}

export function syncLegacyAiFields(settings, providers, defaultProvider) {
  const id = normalizeProvider(defaultProvider || settings.aiProvider || 'gemini');
  const ready = AI_PROVIDER_IDS.filter((key) => providers[key]?.enabled && providers[key]?.apiKey);
  const activeId = providers[id]?.enabled && providers[id]?.apiKey
    ? id
    : (ready[0] || id);
  const active = providers[activeId] || providers[id] || defaultAiProviders()[id];

  settings.aiProvider = activeId;
  settings.aiEnabled = ready.length > 0 || Boolean(active && isProviderReady(activeId, active));
  settings.aiApiKey = active?.apiKey || '';
  settings.aiBaseUrl = active?.baseUrl || PROVIDER_DEFAULTS[activeId].baseUrl;
  settings.aiModel = active?.model || PROVIDER_DEFAULTS[activeId].model;
  settings.aiProviders = providers;
  return settings;
}

export function toBrandingSettings(settings) {
  const appName = String(settings.appName || 'Vistawin CRM').trim() || 'Vistawin CRM';
  const appTagline = String(settings.appTagline || 'Customer relationships').trim() || 'Customer relationships';
  return {
    appName,
    appTagline,
    appInitial: appName.charAt(0).toUpperCase() || 'V',
    companyLegalName: String(settings.companyLegalName || '').trim(),
    companyAddress: String(settings.companyAddress || '').trim(),
    companyPhone: String(settings.companyPhone || '').trim(),
    companyEmail: String(settings.companyEmail || '').trim(),
    companyGstin: String(settings.companyGstin || '').trim(),
  };
}

export function toPublicAiStatus(settings) {
  const ready = listReadyAiProviders(settings);
  const runtime = resolveAiRuntime(settings);
  return {
    enabled: ready.length > 0,
    configured: ready.length > 0,
    model: runtime?.aiModel || settings.aiModel,
    provider: runtime?.aiProvider || settings.aiProvider,
    providers: [
      {
        id: 'auto',
        label: 'All providers (auto-merge)',
        model: `${ready.length} providers`,
        isAuto: true,
      },
      ...ready,
    ],
    defaultProvider: 'auto',
    mergeMode: true,
  };
}

export function toAdminAiSettings(settings) {
  const providers = normalizeAiProviders(settings);
  const publicProviders = {};
  for (const id of AI_PROVIDER_IDS) {
    const row = providers[id];
    publicProviders[id] = {
      enabled: row.enabled,
      baseUrl: row.baseUrl,
      model: row.model,
      hasApiKey: Boolean(row.apiKey),
      isReady: isProviderReady(id, row),
      requiresApiKey: AI_PROVIDER_META[id].requiresApiKey !== false,
      freeTier: AI_PROVIDER_META[id].freeTier || 'free-key',
      apiKeyMasked: maskApiKey(row.apiKey),
      label: AI_PROVIDER_META[id].label,
      description: AI_PROVIDER_META[id].description,
      docsUrl: AI_PROVIDER_META[id].docsUrl,
      showBaseUrl: AI_PROVIDER_META[id].showBaseUrl,
      ...(id === 'cloudflare' ? { accountId: row.accountId || '' } : {}),
    };
  }

  return {
    enabled: listReadyAiProviders(settings).length > 0 || Boolean(settings.aiEnabled),
    provider: settings.aiProvider,
    defaultProvider: settings.aiProvider,
    apiKeyMasked: maskApiKey(settings.aiApiKey),
    hasApiKey: Boolean(settings.aiApiKey),
    baseUrl: settings.aiBaseUrl,
    model: settings.aiModel,
    providers: publicProviders,
    providerDefaults: PROVIDER_DEFAULTS,
    providerMeta: AI_PROVIDER_META,
  };
}

function secretFields(settings) {
  return {
    emailPassMasked: maskApiKey(settings.emailPass),
    hasEmailPass: Boolean(settings.emailPass),
    whatsappTokenMasked: maskApiKey(settings.whatsappToken),
    hasWhatsappToken: Boolean(settings.whatsappToken),
    smsAuthTokenMasked: maskApiKey(settings.smsAuthToken),
    hasSmsAuthToken: Boolean(settings.smsAuthToken),
    razorpayKeySecretMasked: maskApiKey(settings.razorpayKeySecret),
    hasRazorpayKeySecret: Boolean(settings.razorpayKeySecret),
    stripeSecretKeyMasked: maskApiKey(settings.stripeSecretKey),
    hasStripeSecretKey: Boolean(settings.stripeSecretKey),
  };
}

export function toIntegrationsSettings(settings) {
  return {
    email: {
      host: settings.emailHost,
      port: settings.emailPort,
      secure: settings.emailSecure,
      user: settings.emailUser,
      from: settings.emailFrom,
      configured: Boolean(settings.emailHost && settings.emailUser && settings.emailPass),
    },
    whatsapp: {
      phoneNumberId: settings.whatsappPhoneNumberId,
      configured: Boolean(settings.whatsappToken && settings.whatsappPhoneNumberId),
    },
    sms: {
      accountSidMasked: maskSid(settings.smsAccountSid),
      accountSidSet: Boolean(settings.smsAccountSid),
      fromNumber: settings.smsFromNumber,
      messagingServiceSid: settings.smsMessagingServiceSid || '',
      statusCallbackUrl: settings.smsStatusCallbackUrl || '',
      dailyLimit: settings.smsDailyLimit || 100,
      configured: Boolean(
        settings.smsAccountSid
        && settings.smsAuthToken
        && (settings.smsFromNumber || settings.smsMessagingServiceSid)
      ),
    },
    social: {
      facebookPageUrl: settings.facebookPageUrl,
      instagramUrl: settings.instagramUrl,
      linkedinUrl: settings.linkedinUrl,
      twitterUrl: settings.twitterUrl,
      facebookPixelId: settings.facebookPixelId,
    },
    payments: {
      razorpayKeyId: settings.razorpayKeyId,
      stripePublishableKey: settings.stripePublishableKey,
      paymentWebhookUrl: settings.paymentWebhookUrl || '/api/integrations/payments/webhook',
      razorpayConfigured: Boolean(settings.razorpayKeyId && settings.razorpayKeySecret),
      stripeConfigured: Boolean(settings.stripePublishableKey && settings.stripeSecretKey),
    },
    secrets: secretFields(settings),
  };
}

export { normalizeProvider, PROVIDER_DEFAULTS };
