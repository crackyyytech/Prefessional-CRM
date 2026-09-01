import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  PROVIDER_DEFAULTS,
  prepareCloudflareRuntime,
  fetchCloudflareAccountId,
  isProviderReady,
} from './aiProvider.js';
import { listReadyAiProviders, resolveAiRuntime, normalizeAiProviders } from '../models/AppSettings.js';
import { decryptSecret } from '../utils/secretCrypto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const AI_IMAGES_DIR = path.join(__dirname, '..', 'uploads', 'ai-images');

if (!fs.existsSync(AI_IMAGES_DIR)) {
  fs.mkdirSync(AI_IMAGES_DIR, { recursive: true });
}

/** Providers that can generate images with current CRM keys/APIs */
export const IMAGE_PROVIDER_ORDER = [
  'cloudflare',
  'gemini',
  'together',
  'pollinations',
  'huggingface',
  'openrouter',
  'fireworks',
  'siliconflow',
];

export const IMAGE_MODEL_DEFAULTS = {
  cloudflare: '@cf/black-forest-labs/flux-1-schnell',
  gemini: 'gemini-2.5-flash-image',
  together: 'black-forest-labs/FLUX.1-schnell',
  pollinations: 'flux',
  huggingface: 'black-forest-labs/FLUX.1-schnell',
  openrouter: 'google/gemini-2.5-flash-image-preview:free',
  fireworks: 'accounts/fireworks/models/flux-1-schnell-fp8',
  siliconflow: 'black-forest-labs/FLUX.1-schnell',
};

const REALISM_SUFFIX =
  ', photorealistic, ultra high quality, sharp focus, natural lighting, detailed texture, 8k, professional photography';

function enhancePrompt(prompt, style = 'realistic') {
  const base = String(prompt || '').trim();
  if (!base) return '';
  if (style === 'raw') return base.slice(0, 1800);
  if (/photorealistic|8k|dslr|cinematic/i.test(base)) return base.slice(0, 1800);
  return `${base}${REALISM_SUFFIX}`.slice(0, 1800);
}

function secret(value) {
  return decryptSecret(value) || String(value || '');
}

async function saveImageBuffer(buffer, mimeType = 'image/png') {
  const ext = mimeType.includes('jpeg') || mimeType.includes('jpg')
    ? 'jpg'
    : mimeType.includes('webp')
      ? 'webp'
      : 'png';
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  const fullPath = path.join(AI_IMAGES_DIR, filename);
  await fs.promises.writeFile(fullPath, buffer);
  return {
    filename,
    path: fullPath,
    url: `/api/ai-image/files/${filename}`,
    mimeType,
    size: buffer.length,
  };
}

async function bufferFromDataUrlOrB64(data, mimeHint = 'image/png') {
  if (!data) throw new Error('Empty image data');
  if (typeof data === 'string' && data.startsWith('data:')) {
    const match = data.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error('Invalid data URL');
    return { buffer: Buffer.from(match[2], 'base64'), mimeType: match[1] };
  }
  if (typeof data === 'string') {
    return { buffer: Buffer.from(data, 'base64'), mimeType: mimeHint };
  }
  if (Buffer.isBuffer(data)) {
    return { buffer: data, mimeType: mimeHint };
  }
  throw new Error('Unsupported image payload');
}

export function listReadyImageProviders(settings) {
  const readyChat = listReadyAiProviders(settings);
  const readyIds = new Set(readyChat.map((p) => p.id));
  const providers = normalizeAiProviders(settings);

  const list = [];
  for (const id of IMAGE_PROVIDER_ORDER) {
    if (id === 'pollinations') {
      // Always available as free URL fallback (key optional)
      list.push({
        id,
        label: 'Pollinations',
        model: IMAGE_MODEL_DEFAULTS.pollinations,
        ready: true,
        free: true,
      });
      continue;
    }
    if (!readyIds.has(id) && !isProviderReady(id, providers[id])) continue;
    list.push({
      id,
      label: id,
      model: IMAGE_MODEL_DEFAULTS[id] || PROVIDER_DEFAULTS[id]?.model,
      ready: true,
      free: false,
    });
  }

  // Dedupe by id
  const seen = new Set();
  return list.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

async function generateCloudflare(runtime, prompt, size) {
  const prepared = await prepareCloudflareRuntime({
    ...runtime,
    aiApiKey: secret(runtime.aiApiKey),
  });
  const accountId = prepared.aiBaseUrl.match(/accounts\/([^/]+)/)?.[1]
    || await fetchCloudflareAccountId(prepared.aiApiKey);
  const model = IMAGE_MODEL_DEFAULTS.cloudflare;
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
  const [width, height] = size === '1792x1024' ? [1792, 1024] : size === '1024x1792' ? [1024, 1792] : [1024, 1024];

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${prepared.aiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, width, height }),
    signal: AbortSignal.timeout(90000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.errors?.[0]?.message || data?.message || `Cloudflare image failed (${response.status})`);
  }

  // Workers AI returns { result: { image: base64 } } or binary depending on model
  const b64 = data?.result?.image || data?.result?.[0] || data?.image;
  if (!b64) throw new Error('Cloudflare returned no image');
  const { buffer, mimeType } = await bufferFromDataUrlOrB64(b64, 'image/png');
  return { buffer, mimeType, model };
}

async function generateGemini(runtime, prompt) {
  const key = secret(runtime.aiApiKey);
  const models = [
    'gemini-2.5-flash-image',
    'gemini-2.5-flash-image-preview',
    'gemini-2.0-flash-exp-image-generation',
    'imagen-4.0-generate-001',
    'imagen-3.0-generate-002',
    IMAGE_MODEL_DEFAULTS.gemini,
  ];

  let lastError = 'Gemini image generation failed';
  for (const model of models) {
    try {
      if (model.startsWith('imagen')) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${encodeURIComponent(key)}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instances: [{ prompt }],
            parameters: { sampleCount: 1, aspectRatio: '1:1' },
          }),
          signal: AbortSignal.timeout(90000),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          lastError = data?.error?.message || `Gemini Imagen failed (${response.status})`;
          continue;
        }
        const b64 = data?.predictions?.[0]?.bytesBase64Encoded;
        if (!b64) {
          lastError = 'Gemini returned no image bytes';
          continue;
        }
        return { buffer: Buffer.from(b64, 'base64'), mimeType: 'image/png', model };
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `Generate a photorealistic high-quality image: ${prompt}` }] }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
        }),
        signal: AbortSignal.timeout(90000),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        lastError = data?.error?.message || `Gemini image failed (${response.status})`;
        continue;
      }
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const inline = parts.find((p) => p.inlineData?.data || p.inline_data?.data);
      const b64 = inline?.inlineData?.data || inline?.inline_data?.data;
      const mime = inline?.inlineData?.mimeType || inline?.inline_data?.mime_type || 'image/png';
      if (!b64) {
        lastError = 'Gemini returned no inline image';
        continue;
      }
      return { buffer: Buffer.from(b64, 'base64'), mimeType: mime, model };
    } catch (error) {
      lastError = error.message || lastError;
    }
  }
  throw new Error(lastError);
}

async function generateOpenAiStyleImages({ baseUrl, apiKey, model, prompt, size, extraHeaders = {} }) {
  const url = `${String(baseUrl).replace(/\/$/, '')}/images/generations`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size: size || '1024x1024',
      response_format: 'b64_json',
    }),
    signal: AbortSignal.timeout(90000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.message || `Image API failed (${response.status})`);
  }
  const item = data?.data?.[0];
  if (item?.b64_json) {
    return { buffer: Buffer.from(item.b64_json, 'base64'), mimeType: 'image/png', model };
  }
  if (item?.url) {
    const imgRes = await fetch(item.url, { signal: AbortSignal.timeout(60000) });
    if (!imgRes.ok) throw new Error('Failed to download generated image URL');
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const mimeType = imgRes.headers.get('content-type') || 'image/png';
    return { buffer, mimeType, model };
  }
  throw new Error('Image API returned no image');
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Anonymous Pollinations ≈ 1 req / 15s — enforce gap so live typing does not 429 */
let lastPollinationsAt = 0;
const POLLINATIONS_GAP_MS = 16000;

async function generatePollinations(prompt, size, { waitForSlot = true } = {}) {
  const [w, h] = size === '1792x1024' ? [1792, 1024] : size === '1024x1792' ? [1024, 1792] : [1024, 1024];
  const seed = Math.floor(Math.random() * 2_147_483_647);
  const models = ['flux', 'turbo', 'zimage'];
  const encoded = encodeURIComponent(prompt.slice(0, 1200));

  if (waitForSlot) {
    const wait = lastPollinationsAt + POLLINATIONS_GAP_MS - Date.now();
    if (wait > 0) await sleep(Math.min(wait, POLLINATIONS_GAP_MS));
  }

  let lastError = 'Pollinations image failed';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const model = models[attempt % models.length];
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=${w}&height=${h}&model=${model}&nologo=true&enhance=true&safe=true&private=true&seed=${seed + attempt}`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'image/*',
          'User-Agent': 'VistawinCRM/1.0',
        },
        signal: AbortSignal.timeout(90000),
      });
      if (response.status === 429 || response.status === 503) {
        const retryAfter = Number(response.headers.get('retry-after') || 0);
        const delay = Math.max((retryAfter || 8) * 1000, 8000) + attempt * 2000;
        lastError = `Pollinations rate limited (${response.status})`;
        await sleep(Math.min(delay, 20000));
        continue;
      }
      if (!response.ok) {
        lastError = `Pollinations image failed (${response.status})`;
        continue;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      // Placeholder / rate-limit images are often huge (~1MB+); real flux jpgs are smaller
      if (buffer.length > 900_000) {
        lastError = 'Pollinations rate limited (placeholder image)';
        await sleep(12000);
        continue;
      }
      if (buffer.length < 2000) {
        lastError = 'Pollinations returned empty image';
        continue;
      }
      lastPollinationsAt = Date.now();
      const mimeType = response.headers.get('content-type') || 'image/jpeg';
      return { buffer, mimeType, model };
    } catch (error) {
      lastError = error.message || lastError;
      await sleep(1500 * (attempt + 1));
    }
  }
  throw new Error(lastError);
}

async function generateHuggingFace(runtime, prompt) {
  const key = secret(runtime.aiApiKey);
  const model = IMAGE_MODEL_DEFAULTS.huggingface;
  const url = `https://api-inference.huggingface.co/models/${model}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'image/png',
    },
    body: JSON.stringify({ inputs: prompt, parameters: { width: 1024, height: 1024 } }),
    signal: AbortSignal.timeout(120000),
  });
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error || `Hugging Face image failed (${response.status})`);
  }
  if (contentType.includes('application/json')) {
    const data = await response.json();
    throw new Error(data?.error || 'Hugging Face returned JSON instead of image');
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, mimeType: contentType || 'image/png', model };
}

async function generateWithProvider(providerId, settingsDoc, prompt, size) {
  if (providerId === 'pollinations') {
    return generatePollinations(prompt, size);
  }

  const runtime = resolveAiRuntime(settingsDoc, providerId);
  if (!runtime) throw new Error(`${providerId} is not configured`);
  runtime.aiApiKey = secret(runtime.aiApiKey);

  if (providerId === 'cloudflare') {
    return generateCloudflare(runtime, prompt, size);
  }
  if (providerId === 'gemini') {
    return generateGemini(runtime, prompt);
  }
  if (providerId === 'huggingface') {
    return generateHuggingFace(runtime, prompt);
  }
  if (providerId === 'together') {
    return generateOpenAiStyleImages({
      baseUrl: runtime.aiBaseUrl || PROVIDER_DEFAULTS.together.baseUrl,
      apiKey: runtime.aiApiKey,
      model: IMAGE_MODEL_DEFAULTS.together,
      prompt,
      size,
    });
  }
  if (providerId === 'openrouter') {
    return generateOpenAiStyleImages({
      baseUrl: runtime.aiBaseUrl || PROVIDER_DEFAULTS.openrouter.baseUrl,
      apiKey: runtime.aiApiKey,
      model: IMAGE_MODEL_DEFAULTS.openrouter,
      prompt,
      size,
      extraHeaders: {
        'HTTP-Referer': 'https://vistawin-crm.local',
        'X-Title': 'Vistawin CRM Image Generator',
      },
    });
  }
  if (providerId === 'fireworks') {
    return generateOpenAiStyleImages({
      baseUrl: runtime.aiBaseUrl || PROVIDER_DEFAULTS.fireworks?.baseUrl || 'https://api.fireworks.ai/inference/v1',
      apiKey: runtime.aiApiKey,
      model: IMAGE_MODEL_DEFAULTS.fireworks,
      prompt,
      size,
    });
  }
  if (providerId === 'siliconflow') {
    return generateOpenAiStyleImages({
      baseUrl: runtime.aiBaseUrl || PROVIDER_DEFAULTS.siliconflow?.baseUrl || 'https://api.siliconflow.cn/v1',
      apiKey: runtime.aiApiKey,
      model: IMAGE_MODEL_DEFAULTS.siliconflow,
      prompt,
      size,
    });
  }
  throw new Error(`${providerId} does not support image generation`);
}

export async function generateAiImage({
  settings,
  prompt,
  provider = 'auto',
  size = '1024x1024',
  style = 'realistic',
  live = false,
} = {}) {
  const enhanced = enhancePrompt(prompt, style);
  if (!enhanced || enhanced.length < 3) {
    throw new Error('Enter a descriptive image prompt (at least a few words).');
  }

  const ready = listReadyImageProviders(settings);
  if (!ready.length) {
    throw new Error('No image-capable AI providers are available. Add keys in Settings → AI, or use Pollinations fallback.');
  }

  const isAuto = !provider || provider === 'auto' || provider === 'all';
  let queue = isAuto
    ? ready.map((p) => p.id)
    : [provider, ...ready.map((p) => p.id).filter((id) => id !== provider)];

  // Live typing: free fast path only — avoid cascading every paid provider error on each keystroke
  if (live && isAuto) {
    queue = ['pollinations'];
    if (ready.some((p) => p.id === 'gemini')) queue.push('gemini');
  }

  const tried = [];
  const errors = {};
  let lastError = 'Image generation failed';
  let rateLimited = false;

  for (const providerId of queue) {
    if (tried.includes(providerId)) continue;
    if (!IMAGE_PROVIDER_ORDER.includes(providerId) && providerId !== 'pollinations') continue;
    tried.push(providerId);
    try {
      const result = await generateWithProvider(providerId, settings, enhanced, size);
      const saved = await saveImageBuffer(result.buffer, result.mimeType);
      return {
        filename: saved.filename,
        path: saved.path,
        url: saved.url,
        mimeType: saved.mimeType,
        byteSize: saved.size,
        provider: providerId,
        model: result.model,
        prompt: enhanced,
        originalPrompt: String(prompt || '').trim(),
        size,
        style,
        fallbackUsed: tried.length > 1,
        providersTried: tried,
        mergeMode: isAuto,
      };
    } catch (error) {
      lastError = error.message || lastError;
      errors[providerId] = lastError;
      if (/429|rate limit/i.test(lastError)) rateLimited = true;
    }
  }

  if (live) {
    const err = new Error(
      rateLimited
        ? 'Free image API is rate-limited. Wait ~15 seconds, then keep typing — live preview will update.'
        : 'Live preview could not generate right now. Wait a moment and keep typing, or click Save to chat.'
    );
    err.code = rateLimited ? 'RATE_LIMITED' : 'LIVE_FAILED';
    err.retryAfterMs = rateLimited ? POLLINATIONS_GAP_MS : 5000;
    err.providersTried = tried;
    throw err;
  }

  const short = Object.entries(errors)
    .slice(0, 3)
    .map(([id, msg]) => `${id}: ${String(msg).slice(0, 80)}`)
    .join(' · ');
  throw new Error(short || lastError);
}
