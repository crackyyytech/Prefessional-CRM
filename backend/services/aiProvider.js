import path from 'path';
import { fileURLToPath } from 'url';
import Contact from '../models/Contact.js';
import Deal from '../models/Deal.js';
import Task from '../models/Task.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CRM_ROOT = path.resolve(__dirname, '..', '..');

export const PROVIDER_DEFAULTS = {
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.0-flash',
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openrouter/free',
  },
  huggingface: {
    baseUrl: 'https://router.huggingface.co/v1',
    model: 'Qwen/Qwen2.5-72B-Instruct',
  },
  cerebras: {
    baseUrl: 'https://api.cerebras.ai/v1',
    model: 'llama-3.3-70b',
  },
  mistral: {
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'mistral-small-latest',
  },
  sambanova: {
    baseUrl: 'https://api.sambanova.ai/v1',
    model: 'Meta-Llama-3.3-70B-Instruct',
  },
  cloudflare: {
    baseUrl: 'https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/ai/v1',
    model: '@cf/meta/llama-3.1-8b-instruct-fast',
  },
  github: {
    baseUrl: 'https://models.github.ai/inference',
    model: 'openai/gpt-4.1-mini',
  },
  together: {
    baseUrl: 'https://api.together.xyz/v1',
    model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  },
  fireworks: {
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    model: 'accounts/fireworks/models/llama-v3p1-8b-instruct',
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  nvidia: {
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    model: 'meta/llama-3.3-70b-instruct',
  },
  siliconflow: {
    baseUrl: 'https://api.siliconflow.com/v1',
    model: 'deepseek-ai/DeepSeek-V3',
  },
  cohere: {
    baseUrl: 'https://api.cohere.com/compatibility/v1',
    model: 'command-r-08-2024',
  },
  glm: {
    baseUrl: 'https://api.z.ai/api/paas/v4',
    model: 'glm-4-flash',
  },
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.2',
  },
  pollinations: {
    baseUrl: 'https://gen.pollinations.ai/v1',
    model: 'gemini-fast',
  },
  cursor: {
    baseUrl: 'https://api.cursor.com/v1',
    model: 'composer-2.5',
  },
};

/** Providers that work when enabled with no API key (local / open endpoints). */
export const NO_API_KEY_REQUIRED = new Set(['ollama']);

export function isProviderReady(id, cfg) {
  if (!cfg?.enabled) return false;
  if (NO_API_KEY_REQUIRED.has(id)) return true;
  return Boolean(String(cfg.apiKey || '').trim());
}

const GEMINI_FALLBACK_MODELS = [
  'gemini-2.0-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-2.0-flash',
  'gemini-flash-latest',
  'gemini-2.5-flash-lite',
  'gemini-1.5-flash-8b',
];

const FREE_OPENAI_COMPATIBLE = new Set([
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
]);

export const AI_FETCH_TIMEOUT_MS = 45000;

const cloudflareAccountCache = new Map();

export async function fetchCloudflareAccountId(apiKey) {
  const cacheKey = String(apiKey || '').slice(-12);
  if (cloudflareAccountCache.has(cacheKey)) {
    return cloudflareAccountCache.get(cacheKey);
  }

  const headers = { Authorization: `Bearer ${apiKey}` };

  const tryAccounts = async () => {
    const response = await fetch('https://api.cloudflare.com/client/v4/accounts?per_page=5', {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok && data?.result?.[0]?.id) return data.result[0].id;
    return null;
  };

  const tryZones = async () => {
    const response = await fetch('https://api.cloudflare.com/client/v4/zones?per_page=1', {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok && data?.result?.[0]?.account?.id) return data.result[0].account.id;
    return null;
  };

  const accountId = (await tryAccounts()) || (await tryZones());
  if (!accountId) {
    throw new Error(
      'Could not auto-detect Cloudflare Account ID. Open Workers AI → Use REST API, copy Account ID, and paste it in Settings → AI → Cloudflare Account ID.'
    );
  }
  cloudflareAccountCache.set(cacheKey, accountId);
  return accountId;
}

export function resolveCloudflareBaseUrl(baseUrl, accountId) {
  return String(baseUrl || PROVIDER_DEFAULTS.cloudflare.baseUrl)
    .replace(/ACCOUNT_ID|\{account_id\}|\{ACCOUNT_ID\}/gi, accountId)
    .replace(/\/$/, '');
}

export async function prepareCloudflareRuntime(settings) {
  let baseUrl = String(settings.aiBaseUrl || PROVIDER_DEFAULTS.cloudflare.baseUrl).replace(/\/$/, '');
  const storedAccountId = String(settings.aiAccountId || '').trim();

  if (/ACCOUNT_ID|\{account_id\}/i.test(baseUrl)) {
    const accountId = storedAccountId || await fetchCloudflareAccountId(settings.aiApiKey);
    baseUrl = resolveCloudflareBaseUrl(baseUrl, accountId);
  } else if (storedAccountId && !baseUrl.includes(storedAccountId)) {
    baseUrl = resolveCloudflareBaseUrl(baseUrl, storedAccountId);
  }

  if (/ACCOUNT_ID|\{account_id\}/i.test(baseUrl)) {
    throw new Error('Paste your Cloudflare Account ID in Settings → AI Integrations → Cloudflare.');
  }
  if (!settings.aiApiKey) {
    throw new Error('Cloudflare API key is required. Add it in Settings → AI Integrations.');
  }
  return { ...settings, aiBaseUrl: baseUrl };
}

export function migrateSambaNovaModel(model = '') {
  const id = String(model || '').trim();
  const deprecated = new Set([
    'Meta-Llama-3.1-8B-Instruct',
    'Meta-Llama-3.1-70B-Instruct',
    'Meta-Llama-3.1-405B-Instruct',
    'Llama-3.1-Swallow-8B-Instruct-v0.3',
  ]);
  if (!id || deprecated.has(id) || /llama-3\.1/i.test(id)) {
    return PROVIDER_DEFAULTS.sambanova.model;
  }
  return id;
}

const CEREBRAS_DEPRECATED_MODELS = new Set([
  'qwen-3-32b',
  'llama3.1-70b',
  'llama-4-scout-17b-16e-instruct',
]);

export function migrateCerebrasModel(model = '') {
  const id = String(model || '').trim();
  if (id === 'gpt-oss-120b') return 'llama-3.3-70b';
  if (!id || CEREBRAS_DEPRECATED_MODELS.has(id)) {
    return PROVIDER_DEFAULTS.cerebras.model;
  }
  return id;
}

const CLOUDFLARE_DEPRECATED_MODELS = new Set([
  '@cf/meta/llama-3.1-8b-instruct',
  '@cf/meta/llama-3.1-8b-instruct-awq',
  '@cf/meta/llama-3.1-70b-instruct',
  '@cf/meta/llama-3-8b-instruct',
  '@cf/meta/llama-3-8b-instruct-awq',
  '@hf/meta-llama/meta-llama-3-8b-instruct',
  '@cf/meta/llama-2-7b-chat-int8',
  '@cf/meta/llama-2-7b-chat-fp16',
  '@cf/mistral/mistral-7b-instruct-v0.1',
  '@hf/mistral/mistral-7b-instruct-v0.2',
  '@hf/google/gemma-7b-it',
  '@cf/google/gemma-3-12b-it',
  '@cf/moonshotai/kimi-k2.5',
  '@cf/qwen/qwen1.5-7b-chat-awq',
]);

export function migrateCloudflareModel(model = '') {
  const id = String(model || '').trim();
  if (!id || CLOUDFLARE_DEPRECATED_MODELS.has(id)) {
    return PROVIDER_DEFAULTS.cloudflare.model;
  }
  return id;
}

export function migrateGithubBaseUrl(baseUrl = '') {
  let url = String(baseUrl || '').trim().replace(/\/$/, '');
  if (!url || /inference\.ai\.azure\.com/i.test(url)) {
    return PROVIDER_DEFAULTS.github.baseUrl;
  }
  if (/\/chat\/completions$/i.test(url)) {
    url = url.replace(/\/chat\/completions$/i, '');
  }
  return url || PROVIDER_DEFAULTS.github.baseUrl;
}

const GITHUB_DEPRECATED_MODELS = new Set([
  'mistral-ai/mistral-small-2503',
  'mistral-ai/Mistral-small-2503',
  'meta-llama/Llama-3.3-70B-Instruct',
]);

export function migrateGithubModel(model = '') {
  const id = String(model || '').trim();
  if (!id || GITHUB_DEPRECATED_MODELS.has(id)) {
    return PROVIDER_DEFAULTS.github.model;
  }
  return id;
}

const FIREWORKS_DEPRECATED_MODELS = new Set([
  'accounts/fireworks/models/qwen2p5-7b-instruct',
  'qwen2p5-7b-instruct',
]);

const TOGETHER_DEPRECATED_MODELS = new Set([
  'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
  'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
  'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
]);

export function migrateTogetherModel(model = '') {
  const id = String(model || '').trim();
  if (!id || TOGETHER_DEPRECATED_MODELS.has(id)) {
    return PROVIDER_DEFAULTS.together.model;
  }
  return id;
}

export function migrateFireworksModel(model = '') {
  const id = String(model || '').trim();
  if (!id || FIREWORKS_DEPRECATED_MODELS.has(id)) {
    return PROVIDER_DEFAULTS.fireworks.model;
  }
  return id;
}

export function migratePollinationsModel(model = '') {
  const id = String(model || '').trim();
  const DEPRECATED = new Set(['openai', 'openai-large', 'claude', 'gpt-5.4']);
  if (!id || DEPRECATED.has(id)) {
    return PROVIDER_DEFAULTS.pollinations.model;
  }
  return id;
}

export function migrateProviderModel(providerId, model = '') {
  const id = normalizeProvider(providerId);
  if (id === 'sambanova') return migrateSambaNovaModel(model);
  if (id === 'cloudflare') return migrateCloudflareModel(model);
  if (id === 'cerebras') return migrateCerebrasModel(model);
  if (id === 'github') return migrateGithubModel(model);
  if (id === 'fireworks') return migrateFireworksModel(model);
  if (id === 'together') return migrateTogetherModel(model);
  if (id === 'pollinations') return migratePollinationsModel(model);

  const POWER_MODEL_UPGRADES = {
    gemini: { 'gemini-2.0-flash-lite': 'gemini-2.0-flash', 'gemini-1.5-flash': 'gemini-2.0-flash' },
    groq: { 'llama-3.1-8b-instant': 'llama-3.3-70b-versatile' },
    huggingface: { 'Qwen/Qwen2.5-7B-Instruct': 'Qwen/Qwen2.5-72B-Instruct' },
    nvidia: { 'meta/llama-3.1-8b-instruct': 'meta/llama-3.3-70b-instruct' },
  };
  const trimmed = String(model || '').trim();
  const upgraded = POWER_MODEL_UPGRADES[id]?.[trimmed];
  if (upgraded) return upgraded;

  const fallback = PROVIDER_DEFAULTS[id]?.model || '';
  return trimmed || fallback;
}

export function normalizeProvider(provider) {
  const id = String(provider || '').toLowerCase().trim();
  if (id === 'gemini') return 'gemini';
  if (id === 'cursor') return 'cursor';
  if (FREE_OPENAI_COMPATIBLE.has(id)) return id;
  // Legacy paid/unknown → Gemini free default
  return 'gemini';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableAiError(status, message = '') {
  const text = String(message).toLowerCase();
  return (
    status === 429
    || status === 503
    || status === 500
    || text.includes('high demand')
    || text.includes('overloaded')
    || text.includes('unavailable')
    || text.includes('try again')
    || text.includes('rate limit')
    || text.includes('resource_exhausted')
    || text.includes('quota')
  );
}

export async function buildCrmContext() {
  const [contacts, deals, tasks, contactCount, dealCount, taskCount] = await Promise.all([
    Contact.find().sort({ updatedAt: -1 }).limit(8).select('firstName lastName company status'),
    Deal.find().sort({ updatedAt: -1 }).limit(8).select('title value stage'),
    Task.find().sort({ updatedAt: -1 }).limit(8).select('title status priority'),
    Contact.countDocuments(),
    Deal.countDocuments(),
    Task.countDocuments(),
  ]);

  return {
    totals: {
      contacts: contactCount,
      deals: dealCount,
      tasks: taskCount,
    },
    recentContacts: contacts.map((c) => ({
      name: `${c.firstName} ${c.lastName}`.trim(),
      company: c.company || null,
      status: c.status,
    })),
    recentDeals: deals.map((d) => ({
      title: d.title,
      value: d.value,
      stage: d.stage,
    })),
    recentTasks: tasks.map((t) => ({
      title: t.title,
      status: t.status,
      priority: t.priority,
    })),
  };
}

export function buildSystemPrompt(crmContext) {
  return `You are Vistawin CRM assistant. Answer CRM questions briefly and practically in English.
If data is missing, say so. Reply in plain text only — no markdown.
CRM snapshot: ${JSON.stringify(crmContext)}`;
}

const OPENROUTER_FREE_FALLBACKS = [
  'openrouter/free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemma-3-27b-it:free',
  'google/gemma-2-9b-it:free',
  'openai/gpt-oss-20b:free',
  'qwen/qwen-2.5-72b-instruct:free',
  'qwen/qwen-2.5-7b-instruct:free',
  'mistralai/mistral-7b-instruct:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'nousresearch/deephermes-3-llama-3-8b-preview:free',
  'google/gemma-3-12b-it:free',
  'z-ai/glm-4.5-air:free',
];

export const PROVIDER_MODEL_FALLBACKS = {
  openrouter: OPENROUTER_FREE_FALLBACKS,
  cerebras: ['llama-3.3-70b', 'llama3.1-8b', 'gpt-oss-120b', 'zai-glm-4.7'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it', 'mixtral-8x7b-32768'],
  mistral: ['mistral-small-latest', 'mistral-large-latest', 'open-mistral-7b'],
  huggingface: ['Qwen/Qwen2.5-72B-Instruct', 'Qwen/Qwen2.5-7B-Instruct', 'meta-llama/Meta-Llama-3-8B-Instruct'],
  sambanova: ['Meta-Llama-3.3-70B-Instruct', 'gpt-oss-120b', 'DeepSeek-V3.1'],
  cloudflare: [
    '@cf/meta/llama-3.1-8b-instruct-fast',
    '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    '@cf/google/gemma-4-26b-a4b-it',
    '@cf/zai-org/glm-4.7-flash',
  ],
  github: [
    'openai/gpt-4.1-mini',
    'openai/gpt-4.1-nano',
    'openai/gpt-4o',
  ],
  together: [
    'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    'Qwen/Qwen2.5-7B-Instruct-Turbo',
    'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
  ],
  fireworks: [
    'accounts/fireworks/models/llama-v3p1-8b-instruct',
    'accounts/fireworks/models/llama-v3p3-70b-instruct',
    'accounts/fireworks/models/llama-v3p1-70b-instruct',
    'accounts/fireworks/models/mistral-small-24b-instruct-2501',
  ],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  nvidia: [
    'meta/llama-3.3-70b-instruct',
    'meta/llama-3.1-8b-instruct',
    'mistralai/mistral-7b-instruct-v0.3',
    'deepseek-ai/deepseek-r1',
  ],
  siliconflow: [
    'deepseek-ai/DeepSeek-V3',
    'Qwen/Qwen2.5-72B-Instruct',
    'deepseek-ai/DeepSeek-R1',
    'THUDM/GLM-4-32B-0414',
  ],
  cohere: [
    'command-r-08-2024',
    'command-r-plus-08-2024',
    'command-r7b-12-2024',
  ],
  glm: [
    'glm-4-flash',
    'glm-4-plus',
    'glm-5.2',
  ],
  ollama: [
    'llama3.2',
    'llama3.1',
    'mistral',
    'qwen2.5',
    'gemma2',
  ],
  pollinations: [
    'gemini-fast',
    'Spit-fires/free',
    'solarnode-developement/free',
    'openai-fast',
    'gemma',
    'mistral',
    'deepseek',
    'gemini',
    'openai',
  ],
  cursor: [
    'composer-2.5',
    'auto',
    'composer-2',
  ],
};

function extractAiError(data, status) {
  const err = data?.error;
  if (typeof err === 'string') return err;
  const parts = [
    err?.message,
    err?.code,
    err?.type,
    err?.param,
    err?.metadata?.raw,
    err?.metadata?.provider_name ? `provider=${err.metadata.provider_name}` : '',
    data?.message,
    data?.detail,
    data?.errors?.[0]?.message,
    data?.errors?.[0]?.code,
  ].filter(Boolean);
  const detail = parts.join(' — ').trim();
  if (detail) {
    if (/insufficient balance|insufficient_quota|payment required|billing|credit|no credits|quota exceeded|deprecated|requires more credits|pollen|out of pollen/i.test(detail)) {
      return 'This AI provider has no credits or balance left. For Pollinations, earn free Pollen at enter.pollinations.ai or switch to Gemini/Groq in the provider dropdown.';
    }
    if (/model not found|not deployed|inaccessible|NOT_FOUND/i.test(detail)) {
      return 'AI model not found or not deployed on this provider. Switch to Gemini or Groq, or deploy the model at fireworks.ai/models (for Fireworks).';
    }
    if (/provider returned error/i.test(detail)) {
      return `${detail}. Free model may be overloaded — try another model or switch provider (Gemini/Groq).`;
    }
    if (status === 410) {
      return `${detail}. This model or endpoint may be retired — update the model in Settings → AI (try Meta-Llama-3.3-70B-Instruct).`;
    }
    if (/deprecated|5028|no longer available|retired/i.test(detail)) {
      return `${detail}. Update Cloudflare model in Settings → AI (try @cf/meta/llama-3.1-8b-instruct-fast).`;
    }
    return detail;
  }
  if (status === 410) {
    return 'AI provider returned 410 Gone — model or endpoint retired. Update SambaNova model in Settings → AI.';
  }
  if (status === 404 && String(data?.errors?.[0]?.message || detail || '').toLowerCase().includes('account')) {
    return 'Cloudflare account not found — check API token permissions and base URL account ID.';
  }
  return `AI provider error (${status})`;
}

function shouldTryNextModel(status, message = '') {
  const text = String(message).toLowerCase();
  return (
    status === 404
    || status === 400
    || status === 429
    || status === 502
    || status === 503
    || text.includes('does not exist')
    || text.includes('not found')
    || text.includes('do not have access')
    || text.includes('invalid model')
    || text.includes('unknown model')
    || text.includes('unknown_model')
    || text.includes('provider returned error')
    || text.includes('unavailable')
    || text.includes('rate limit')
    || text.includes('overloaded')
    || text.includes('deprecated')
    || text.includes('credit')
    || text.includes('pollen')
    || text.includes('balance')
    || text.includes('quota')
    || text.includes('billing')
    || text.includes('5028')
  );
}

export async function chatWithOpenAICompatible({ settings, messages, systemPrompt, temperature = 0.4, maxTokens }) {
  let runtime = settings;
  if (settings.aiProvider === 'cloudflare') {
    runtime = await prepareCloudflareRuntime(settings);
  }
  if (settings.aiProvider === 'github') {
    runtime = {
      ...settings,
      aiBaseUrl: migrateGithubBaseUrl(settings.aiBaseUrl),
      aiModel: migrateGithubModel(settings.aiModel),
    };
  }
  if (settings.aiProvider === 'fireworks') {
    runtime = {
      ...settings,
      aiModel: migrateFireworksModel(settings.aiModel),
    };
  }
  if (settings.aiProvider === 'together') {
    runtime = {
      ...settings,
      aiModel: migrateTogetherModel(settings.aiModel),
    };
  }
  if (settings.aiProvider === 'pollinations') {
    runtime = {
      ...settings,
      aiModel: migratePollinationsModel(settings.aiModel),
    };
  }
  const baseUrl = (runtime.aiBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const preferred = runtime.aiModel || PROVIDER_DEFAULTS[runtime.aiProvider]?.model || 'gpt-4o-mini';
  const fallbacks = PROVIDER_MODEL_FALLBACKS[runtime.aiProvider] || [];
  const models = [preferred, ...fallbacks.filter((m) => m !== preferred)];

  const headers = {
    'Content-Type': 'application/json',
  };
  if (runtime.aiApiKey) {
    headers.Authorization = `Bearer ${runtime.aiApiKey}`;
  } else if (runtime.aiProvider !== 'ollama') {
    throw new Error('API key is required for this provider');
  }
  if (runtime.aiProvider === 'openrouter') {
    headers['HTTP-Referer'] = 'http://localhost:5173';
    headers['X-Title'] = 'Vistawin CRM';
  }
  if (runtime.aiProvider === 'github') {
    headers['Accept'] = 'application/vnd.github+json';
    headers['X-GitHub-Api-Version'] = '2022-11-28';
  }

  let lastError = 'AI provider request failed';
  const safeTemperature = runtime.aiProvider === 'sambanova'
    ? Math.min(1, Math.max(0, Number(temperature) || 0.4))
    : temperature;

  for (const model of models) {
    const body = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      temperature: safeTemperature,
    };
    if (maxTokens) {
      // Cerebras prefers max_completion_tokens; others use max_tokens
      if (runtime.aiProvider === 'cerebras') body.max_completion_tokens = maxTokens;
      else body.max_tokens = maxTokens;
    }

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(AI_FETCH_TIMEOUT_MS),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        lastError = extractAiError(data, response.status);
        if (runtime.aiProvider === 'sambanova' && response.status === 401) {
          lastError = `${lastError}. Regenerate your key at https://cloud.sambanova.ai/apis and save it in Settings → AI.`;
        }
        if (runtime.aiProvider === 'cloudflare' && response.status === 404) {
          lastError = `${lastError}. Check Cloudflare Workers AI is enabled and the model name is correct (@cf/...).`;
        }
        if (models.length > 1 && shouldTryNextModel(response.status, lastError)) {
          if (response.status === 429) await sleep(1200);
          continue;
        }
        throw new Error(lastError);
      }

      const reply = data?.choices?.[0]?.message?.content?.trim();
      if (!reply) {
        lastError = 'AI returned an empty response';
        if (models.length > 1) continue;
        throw new Error(lastError);
      }
      return reply;
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        lastError = `${settings.aiProvider || 'AI'} request timed out after ${Math.round(AI_FETCH_TIMEOUT_MS / 1000)}s`;
      } else {
        lastError = error.message || String(error);
      }
      if (models.length > 1 && shouldTryNextModel(0, lastError)) continue;
      throw new Error(lastError);
    }
  }

  throw new Error(lastError);
}

export async function testAiProvider(settings) {
  const provider = normalizeProvider(settings.aiProvider);
  let runtime = {
    ...settings,
    aiProvider: provider,
    aiApiKey: settings.aiApiKey,
    aiBaseUrl: settings.aiBaseUrl || PROVIDER_DEFAULTS[provider]?.baseUrl,
    aiModel: migrateProviderModel(provider, settings.aiModel || PROVIDER_DEFAULTS[provider]?.model),
    aiAccountId: settings.aiAccountId || '',
  };
  if (provider === 'cloudflare') {
    runtime = await prepareCloudflareRuntime(runtime);
  }

  const reply = await runAiChat({
    settings: runtime,
    messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    systemPrompt: 'Reply briefly.',
    temperature: 0.2,
    maxTokens: 32,
  });
  return {
    ok: true,
    provider,
    model: runtime.aiModel,
    reply: reply.slice(0, 120),
  };
}

export async function testAllAiProviders(settingsDoc) {
  const { listReadyAiProviders, resolveAiRuntime } = await import('../models/AppSettings.js');
  const ready = listReadyAiProviders(settingsDoc);
  const results = await Promise.all(ready.map(async (item) => {
    const runtime = resolveAiRuntime(settingsDoc, item.id);
    const started = Date.now();
    try {
      const result = await testAiProvider(runtime);
      return {
        id: item.id,
        label: item.label,
        ok: true,
        model: result.model,
        reply: result.reply,
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      return {
        id: item.id,
        label: item.label,
        ok: false,
        model: item.model,
        error: error.message || String(error),
        latencyMs: Date.now() - started,
      };
    }
  }));
  return {
    tested: results.length,
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

export async function chatWithGemini({ settings, messages, systemPrompt, temperature = 0.4, maxTokens = 512 }) {
  const preferred = settings.aiModel || 'gemini-2.0-flash-lite';
  const models = [preferred, ...GEMINI_FALLBACK_MODELS.filter((m) => m !== preferred)];
  const baseUrl = (settings.aiBaseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');

  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const payload = {
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  };

  let lastError = 'Gemini request failed';

  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const url = `${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(settings.aiApiKey)}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await response.json().catch(() => ({}));
        const detail = data?.error?.message || data?.message || `Gemini error (${response.status})`;

        if (!response.ok) {
          lastError = detail;
          if (isRetryableAiError(response.status, detail)) {
            if (attempt < 2) {
              await sleep(800 * attempt);
              continue;
            }
            break; // try next model
          }
          throw new Error(detail);
        }

        const reply = data?.candidates?.[0]?.content?.parts
          ?.map((part) => part.text || '')
          .join('')
          .trim();

        if (!reply) {
          const block = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason;
          lastError = block ? `Gemini blocked the response (${block})` : 'Gemini returned an empty response';
          break;
        }

        return reply;
      } catch (error) {
        lastError = error.message || String(error);
        if (isRetryableAiError(0, lastError) && attempt < 2) {
          await sleep(800 * attempt);
          continue;
        }
        if (!isRetryableAiError(0, lastError)) {
          throw error;
        }
        break;
      }
    }
  }

  throw new Error(lastError);
}

export async function chatWithCursor({ settings, messages, systemPrompt }) {
  const { Agent, CursorAgentError } = await import('@cursor/sdk');

  const transcript = messages
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  const prompt = `${systemPrompt}

Conversation so far:
${transcript}

Reply as the Vistawin CRM assistant to the latest user message. Text only — do not edit files.`;

  const models = [
    settings.aiModel || 'composer-2.5',
    ...(PROVIDER_MODEL_FALLBACKS.cursor || []).filter((m) => m !== settings.aiModel),
  ];

  let lastError = 'Cursor agent request failed';
  for (const modelId of models) {
    try {
      const result = await Agent.prompt(prompt, {
        apiKey: settings.aiApiKey,
        model: { id: modelId },
        local: { cwd: CRM_ROOT, settingSources: [] },
      });

      if (result.status === 'error') {
        lastError = String(result.result || 'Cursor agent run failed');
        if (models.length > 1) continue;
        throw new Error(lastError);
      }

      const reply = String(result.result || '').trim();
      if (!reply) {
        lastError = 'Cursor returned an empty response';
        if (models.length > 1) continue;
        throw new Error(lastError);
      }
      return reply;
    } catch (error) {
      if (error?.name === 'CursorAgentError' || error instanceof CursorAgentError) {
        lastError = `Cursor API: ${error.message}`;
      } else {
        lastError = error.message || String(error);
      }
      if (models.length > 1 && /model|not found|invalid/i.test(lastError)) continue;
      throw new Error(lastError);
    }
  }

  throw new Error(lastError);
}

export async function runAiChat({ settings, messages, systemPrompt, temperature, maxTokens }) {
  const provider = normalizeProvider(settings.aiProvider);
  if (provider === 'gemini') {
    return chatWithGemini({ settings, messages, systemPrompt, temperature, maxTokens });
  }
  if (provider === 'cursor') {
    return chatWithCursor({ settings, messages, systemPrompt });
  }
  // Free OpenAI-compatible providers (Groq, OpenRouter, HF, Ollama, etc.)
  return chatWithOpenAICompatible({
    settings: { ...settings, aiProvider: provider },
    messages,
    systemPrompt,
    temperature,
    maxTokens,
  });
}

function extractJson(text) {
  const cleaned = String(text || '')
    .replace(/```json/gi, '```')
    .replace(/```/g, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    const arrStart = cleaned.indexOf('[');
    const arrEnd = cleaned.lastIndexOf(']');
    if (arrStart >= 0 && arrEnd > arrStart) {
      return JSON.parse(cleaned.slice(arrStart, arrEnd + 1));
    }
    throw new Error('AI did not return valid JSON');
  }
}

function splitName(fullName = '') {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: 'Lead', lastName: 'Nearby' };
  if (parts.length === 1) return { firstName: parts[0], lastName: 'Contact' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export async function generateNearbyContacts({ settings, location, businessType, needType, radiusKm, count }) {
  const limit = Math.min(Math.max(Number(count) || 10, 3), 20);
  const radius = Math.min(Math.max(Number(radiusKm) || 5, 1), 50);
  const place = String(location || '').trim();
  const need = String(needType || businessType || 'all').trim().toLowerCase();

  const needLabel =
    need === 'website' ? 'a website'
      : need === 'software' ? 'custom software / CRM / business software'
        : need === 'application' || need === 'app' ? 'a mobile or web application'
          : 'a website, custom software, or mobile/web application';

  const needFilterRule =
    need === 'website' ? 'ONLY businesses that clearly need a website (outdated/no website, poor online presence, offline-only shops/clinics/services).'
      : need === 'software' ? 'ONLY businesses that clearly need custom software (manual billing, inventory, appointments, accounting, CRM, ERP, school/hospital ops).'
        : need === 'application' || need === 'app' ? 'ONLY businesses that clearly need a mobile/web app (delivery, booking, ordering, membership, field staff, customer app).'
          : 'ONLY businesses that clearly need a website OR custom software OR a mobile/web application. Skip anyone who already has strong digital products.';

  if (!place) throw new Error('Location is required');

  const systemPrompt = `You are a B2B sales research assistant for a software company that sells website development, custom software, and applications.
Return ONLY valid JSON (no markdown, no commentary) with this exact shape:
{
  "results": [
    {
      "businessName": "string",
      "contactName": "string",
      "email": "string or empty",
      "phone": "string",
      "address": "string",
      "area": "string",
      "city": "string",
      "category": "string",
      "needType": "website" | "software" | "application",
      "hasWebsite": true | false,
      "websiteStatus": "none" | "outdated" | "basic" | "active",
      "website": "URL or empty",
      "marketingChannels": ["Social Media", "WhatsApp", "Google Maps", "Offline / Walk-in", "Print ads", "Word of mouth"],
      "socialMedia": {
        "facebook": "url or empty",
        "instagram": "url or empty",
        "whatsappBusiness": true | false,
        "others": "string or empty"
      },
      "digitalPresence": "short summary of online presence",
      "currentTools": "how they manage work now (manual, Excel, paper billing, etc.)",
      "notes": "why they need digital service"
    }
  ]
}
STRICT FILTERING RULES:
- ${needFilterRule}
- Do NOT return random businesses just because they are nearby.
- Do NOT return IT companies, software agencies, web developers, app studios, or digital marketing agencies (they are competitors / not buyers).
- Prefer small-to-mid local businesses, clinics, shops, schools, restaurants, salons, warehouses, transporters, coaching centers, real-estate offices, manufacturers, etc. that still rely on manual processes or have weak digital presence.
- For each result, needType must be one of: website, software, application.
- hasWebsite must be accurate: false if no site; true if they have any site (even outdated).
- websiteStatus: "none" when no website; "outdated"/"basic"/"active" when they have one.
- marketingChannels must list how they currently get customers (e.g. Social Media, WhatsApp Business, Google Maps listing, Offline walk-ins, Flex banners, Word of mouth). Use realistic local marketing methods.
- digitalPresence and currentTools must give useful sales insight.
- notes must explain the buying need in 1 short sentence.
- Include phone numbers in local format when possible.
- If email is unknown, use empty string.
- Provide exactly ${limit} unique results around "${place}" within about ${radius} km.
- city should match the requested location region.
- ORIGINAL LEADS ONLY: every result must be a real local business with a valid phone OR email. Do not invent placeholder names like "Lead Nearby" or generic "Local Business".
- Each result must include complete address, area, city, category, needType, marketingChannels, digitalPresence, and currentTools so data is 100% sales-ready.`;

  const userPrompt = `Find ${limit} nearby sales leads near "${place}" (approx ${radius} km) who need ${needLabel}.
For each lead include: whether they already have a website (yes/no + status + URL), how they do marketing now (social media / WhatsApp / offline / etc.), digital presence summary, and current tools.
Return only qualified prospects. Exclude anyone who does not need website/software/app.`;

  const reply = await runAiChat({
    settings,
    systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.4,
    maxTokens: 4096,
  });

  const parsed = extractJson(reply);
  const rows = Array.isArray(parsed) ? parsed : parsed.results;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('AI returned no nearby contacts');
  }

  const allowedNeeds = new Set(['website', 'software', 'application', 'app']);
  const wanted = need === 'all' || need === 'website, software or application'
    ? allowedNeeds
    : new Set([need === 'app' ? 'application' : need]);

  const mapped = rows.slice(0, limit).map((row, index) => {
    const names = splitName(row.contactName || row.ownerName || row.name || '');
    let itemNeed = String(row.needType || row.need || '').trim().toLowerCase();
    if (itemNeed === 'app' || itemNeed === 'mobile app' || itemNeed === 'web app') itemNeed = 'application';
    if (!allowedNeeds.has(itemNeed)) {
      if (need === 'website' || need === 'software' || need === 'application') itemNeed = need;
      else itemNeed = 'website';
    }

    const websiteUrl = String(row.website || row.websiteUrl || '').trim();
    let hasWebsite = row.hasWebsite;
    if (typeof hasWebsite !== 'boolean') {
      hasWebsite = Boolean(websiteUrl);
    }

    let websiteStatus = String(row.websiteStatus || '').trim().toLowerCase();
    if (!['none', 'outdated', 'basic', 'active'].includes(websiteStatus)) {
      websiteStatus = hasWebsite ? (websiteUrl ? 'basic' : 'outdated') : 'none';
    }
    if (!hasWebsite) websiteStatus = 'none';

    const marketingChannels = Array.isArray(row.marketingChannels)
      ? row.marketingChannels.map((c) => String(c).trim()).filter(Boolean)
      : String(row.marketing || row.marketingMethods || '')
        .split(/[,;/|]/)
        .map((c) => c.trim())
        .filter(Boolean);

    const social = row.socialMedia && typeof row.socialMedia === 'object' ? row.socialMedia : {};
    const socialMedia = {
      facebook: String(social.facebook || '').trim(),
      instagram: String(social.instagram || '').trim(),
      whatsappBusiness: Boolean(social.whatsappBusiness),
      others: String(social.others || social.other || '').trim(),
    };

    return {
      id: `ai-${Date.now()}-${index}`,
      company: String(row.businessName || row.company || 'Local Business').trim(),
      firstName: names.firstName,
      lastName: names.lastName,
      email: String(row.email || '').trim().toLowerCase(),
      phone: String(row.phone || row.mobile || '').trim(),
      address: String(row.address || '').trim(),
      area: String(row.area || row.locality || '').trim(),
      city: String(row.city || place).trim(),
      category: String(row.category || 'Business').trim(),
      needType: itemNeed === 'app' ? 'application' : itemNeed,
      hasWebsite,
      websiteStatus,
      website: websiteUrl,
      marketingChannels: marketingChannels.length
        ? marketingChannels
        : ['Offline / Walk-in', 'Word of mouth'],
      socialMedia,
      digitalPresence: String(row.digitalPresence || row.onlinePresence || '').trim(),
      currentTools: String(row.currentTools || row.tools || '').trim(),
      notes: String(
        row.notes
        || `Needs ${itemNeed} near ${place}`
      ).trim(),
    };
  }).filter((item) => wanted.has(item.needType) || need === 'all');

  if (!mapped.length) {
    throw new Error('No leads found that need website, software, or application');
  }

  return mapped;
}

export async function generateJobListings({
  settings,
  location,
  role,
  keyword,
  experienceLevel,
  jobType,
  count,
}) {
  const limit = Math.min(Math.max(Number(count) || 10, 3), 20);
  const place = String(location || '').trim();
  const roleQuery = String(role || keyword || '').trim();
  const exp = String(experienceLevel || 'all').trim().toLowerCase();

  const expFilter =
    exp === 'fresher' ? 'ONLY fresher / entry-level / 0-1 year jobs. No senior roles.'
      : exp === 'experienced' ? 'ONLY experienced roles (typically 2+ years). No pure fresher-only posts unless hybrid.'
        : 'Include both fresher and experienced roles when relevant.';

  if (!place && !roleQuery) {
    throw new Error('Enter a location or job role to search');
  }

  const systemPrompt = `You are a job research assistant. Return ONLY valid JSON (no markdown) with this exact shape:
{
  "results": [
    {
      "jobTitle": "string",
      "role": "string (e.g. Software Developer, HR Executive, Sales Manager)",
      "company": "string",
      "location": "full address or area",
      "city": "string",
      "area": "string",
      "experienceLevel": "fresher" | "experienced" | "both",
      "experienceYears": "e.g. 0-1 years, 2-4 years, 5+ years",
      "requirements": ["requirement 1", "requirement 2", "..."],
      "skills": ["skill1", "skill2"],
      "salaryRange": "e.g. 3-5 LPA or Not disclosed",
      "jobType": "full-time" | "part-time" | "contract" | "internship" | "remote" | "hybrid",
      "contactName": "HR/recruiter name or empty",
      "contactEmail": "string or empty",
      "contactPhone": "string with local format",
      "website": "company website URL",
      "applyUrl": "job posting or careers page URL",
      "postedDate": "e.g. Posted 2 days ago or March 2026",
      "notes": "short summary of role fit and how to apply"
    }
  ]
}
RULES:
- ${expFilter}
- Each result MUST clearly state fresher OR experienced in experienceLevel and experienceYears.
- requirements must list 3-6 concrete job requirements (education, skills, responsibilities).
- Include REALISTIC contact details (HR email/phone) when known; use empty string if unknown — do not invent fake emails.
- website and applyUrl should be real company/career links when possible.
- Prefer local/regional companies and well-known job boards references in applyUrl when direct company site unknown.
- Provide exactly ${limit} unique job listings${place ? ` near or in "${place}"` : ''}${roleQuery ? ` for role/keyword "${roleQuery}"` : ''}.
- jobType must match the listing (remote/hybrid/full-time etc.).`;

  const userPrompt = `Find ${limit} job openings${place ? ` in ${place}` : ''}${roleQuery ? ` for ${roleQuery}` : ''}.
${jobType ? `Job type preference: ${jobType}.` : ''}
Experience filter: ${exp === 'all' ? 'any' : exp}.
For each job include: role title, company, full requirements list, skills, fresher/experienced level, contact details, website, and apply link.`;

  const reply = await runAiChat({
    settings,
    systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.35,
    maxTokens: 4096,
  });

  const parsed = extractJson(reply);
  const rows = Array.isArray(parsed) ? parsed : parsed.results;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('AI returned no job listings');
  }

  const allowedExp = new Set(['fresher', 'experienced', 'both']);
  const allowedTypes = new Set(['full-time', 'part-time', 'contract', 'internship', 'remote', 'hybrid', 'other']);

  return rows.slice(0, limit).map((row, index) => {
    let level = String(row.experienceLevel || row.experience || '').trim().toLowerCase();
    if (level.includes('fresh') || level.includes('entry') || level.includes('0-1')) level = 'fresher';
    else if (level.includes('exper') || level.includes('senior') || level.includes('2+')) level = 'experienced';
    else if (!allowedExp.has(level)) level = 'both';

    let type = String(row.jobType || row.type || 'full-time').trim().toLowerCase();
    if (!allowedTypes.has(type)) type = 'full-time';

    const requirements = Array.isArray(row.requirements)
      ? row.requirements.map((r) => String(r).trim()).filter(Boolean)
      : String(row.requirements || row.requirement || '')
        .split(/[,;\n|]/)
        .map((r) => r.trim())
        .filter(Boolean);

    const skills = Array.isArray(row.skills)
      ? row.skills.map((s) => String(s).trim()).filter(Boolean)
      : String(row.skills || row.skill || '')
        .split(/[,;\n|]/)
        .map((s) => s.trim())
        .filter(Boolean);

    const item = {
      id: `job-${Date.now()}-${index}`,
      jobTitle: String(row.jobTitle || row.title || row.role || 'Job Opening').trim(),
      role: String(row.role || row.jobRole || row.designation || row.jobTitle || '').trim(),
      company: String(row.company || row.employer || row.organization || '').trim(),
      location: String(row.location || row.address || '').trim(),
      city: String(row.city || place || '').trim(),
      area: String(row.area || row.locality || '').trim(),
      experienceLevel: level,
      experienceYears: String(row.experienceYears || row.experience || row.experienceRequired || '').trim(),
      requirements: requirements.length ? requirements : ['See job description'],
      skills: skills.length ? skills : [],
      salaryRange: String(row.salaryRange || row.salary || row.ctc || 'Not disclosed').trim(),
      jobType: type,
      contactName: String(row.contactName || row.recruiter || row.hrName || '').trim(),
      contactEmail: String(row.contactEmail || row.email || row.hrEmail || '').trim().toLowerCase(),
      contactPhone: String(row.contactPhone || row.phone || row.mobile || '').trim(),
      website: String(row.website || row.companyWebsite || '').trim(),
      applyUrl: String(row.applyUrl || row.applicationUrl || row.jobUrl || row.url || '').trim(),
      postedDate: String(row.postedDate || row.posted || row.datePosted || 'Recent').trim(),
      notes: String(row.notes || row.summary || '').trim(),
    };

    if (exp === 'fresher' && item.experienceLevel === 'experienced') return null;
    if (exp === 'experienced' && item.experienceLevel === 'fresher') return null;

    return item;
  }).filter(Boolean);
}
