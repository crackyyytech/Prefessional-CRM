import express from 'express';
import { getAppSettings, resolveAiRuntime, listReadyAiProviders } from '../models/AppSettings.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import {
  buildCrmContext,
  buildSystemPrompt,
  runAiChat,
} from '../services/aiProvider.js';

const router = express.Router();

function isBalanceOrQuotaError(message = '') {
  return /no credits|balance left|insufficient balance|insufficient_quota|quota|billing|payment required/i.test(String(message));
}

function shouldFallbackToOtherProvider(message = '') {
  const text = String(message);
  return isBalanceOrQuotaError(text)
    || /deprecated|requires more credits|credit balance/i.test(text)
    || /model not found|not deployed|inaccessible|NOT_FOUND|unknown model/i.test(text);
}

router.use(authenticate, requirePermission('ai:chat'));

router.post('/chat', async (req, res) => {
  try {
    const { messages, provider } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ message: 'messages array is required' });
    }

    const settings = await getAppSettings();
    const isAutoMode = !provider || provider === 'auto' || provider === 'all';
    const preferred = isAutoMode
      ? resolveAiRuntime(settings)
      : resolveAiRuntime(settings, provider);
    if (!preferred) {
      return res.status(400).json({
        message: 'No AI provider is configured. Ask an admin to add API keys in Settings → AI integrations.',
      });
    }

    const strictProvider = Boolean(provider) && !isAutoMode;
    const crmContext = await buildCrmContext();
    const systemPrompt = buildSystemPrompt(crmContext);

    const chatMessages = messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

    const tried = [];
    const providerErrors = {};
    const readyIds = listReadyAiProviders(settings).map((p) => p.id);
    const defaultId = settings.aiProvider || readyIds[0];
    let queue = isAutoMode
      ? [...new Set([defaultId, ...readyIds].filter(Boolean))]
      : strictProvider
        ? [preferred.aiProvider]
        : [preferred.aiProvider, ...readyIds.filter((id) => id !== preferred.aiProvider)];

    let lastError = 'AI request failed';
    let balanceFallback = false;

    for (let i = 0; i < queue.length; i += 1) {
      const providerId = queue[i];
      const runtime = resolveAiRuntime(settings, providerId);
      if (!runtime || tried.includes(providerId)) continue;
      tried.push(providerId);
      try {
        const reply = await runAiChat({
          settings: runtime,
          messages: chatMessages,
          systemPrompt,
        });
        return res.json({
          reply,
          model: runtime.aiModel,
          provider: runtime.aiProvider,
          availableProviders: listReadyAiProviders(settings),
          fallbackUsed: isAutoMode ? providerId !== queue[0] : providerId !== preferred.aiProvider,
          mergeMode: isAutoMode,
          providersTried: tried,
          balanceFallback,
          providerErrors: Object.keys(providerErrors).length ? providerErrors : undefined,
        });
      } catch (error) {
        lastError = error.message || String(error);
        providerErrors[providerId] = lastError;

        if (
          strictProvider
          && !balanceFallback
          && i === 0
          && shouldFallbackToOtherProvider(lastError)
        ) {
          const extras = readyIds.filter((id) => id !== preferred.aiProvider && !queue.includes(id));
          if (extras.length) {
            balanceFallback = true;
            queue = [...queue, ...extras];
          }
        }
      }
    }

    res.status(502).json({
      message: strictProvider && !balanceFallback
        ? `${preferred.aiProvider} failed: ${lastError}`
        : lastError,
      providerErrors,
    });
  } catch (error) {
    res.status(502).json({ message: error.message || 'AI request failed' });
  }
});

export default router;
