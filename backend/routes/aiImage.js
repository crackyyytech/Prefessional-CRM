import express from 'express';
import path from 'path';
import fs from 'fs';
import AiGeneratedImage from '../models/AiGeneratedImage.js';
import { getAppSettings } from '../models/AppSettings.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { aiImageGenerateLimiter } from '../middleware/rateLimits.js';
import {
  AI_IMAGES_DIR,
  generateAiImage,
  listReadyImageProviders,
  IMAGE_PROVIDER_ORDER,
  IMAGE_MODEL_DEFAULTS,
} from '../services/aiImage.js';

const router = express.Router();

router.use(authenticate);

router.get('/status', requirePermission('aiimage:view'), async (_req, res) => {
  try {
    const settings = await getAppSettings();
    const providers = listReadyImageProviders(settings);
    res.json({
      enabled: providers.length > 0,
      mergeMode: true,
      defaultProvider: 'auto',
      providers: [
        {
          id: 'auto',
          label: 'All image providers (auto-merge)',
          model: 'merged',
          ready: providers.length > 0,
        },
        ...providers.map((p) => ({
          id: p.id,
          label: p.id,
          model: p.model || IMAGE_MODEL_DEFAULTS[p.id],
          ready: true,
          free: Boolean(p.free),
        })),
      ],
      order: IMAGE_PROVIDER_ORDER,
      sizes: ['1024x1024', '1792x1024', '1024x1792'],
      styles: ['realistic', 'raw'],
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/history', requirePermission('aiimage:view'), async (req, res) => {
  try {
    const items = await AiGeneratedImage.find({ createdBy: req.user._id })
      .sort({ createdAt: -1 })
      .limit(40)
      .lean();
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/files/:filename', requirePermission('aiimage:view'), async (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const fullPath = path.join(AI_IMAGES_DIR, filename);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ message: 'Image not found' });
    }
    res.sendFile(fullPath);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/generate', aiImageGenerateLimiter, requirePermission('aiimage:generate'), async (req, res) => {
  try {
    const prompt = String(req.body.prompt || '').trim();
    const provider = String(req.body.provider || 'auto').trim() || 'auto';
    const size = ['1024x1024', '1792x1024', '1024x1792'].includes(req.body.size)
      ? req.body.size
      : '1024x1024';
    const style = req.body.style === 'raw' ? 'raw' : 'realistic';
    const live = Boolean(req.body.live);

    if (!prompt) {
      return res.status(400).json({ message: 'Prompt is required' });
    }
    if (prompt.length > 2000) {
      return res.status(400).json({ message: 'Prompt is too long (max 2000 characters)' });
    }

    const settings = await getAppSettings();
    const result = await generateAiImage({
      settings,
      prompt,
      provider,
      size,
      style,
      live,
    });

    const doc = await AiGeneratedImage.create({
      prompt: result.prompt,
      originalPrompt: result.originalPrompt,
      provider: result.provider,
      model: result.model,
      style,
      size,
      filename: result.filename,
      url: result.url,
      mimeType: result.mimeType,
      byteSize: result.byteSize || 0,
      fallbackUsed: result.fallbackUsed,
      providersTried: result.providersTried,
      createdBy: req.user._id,
    });

    res.status(201).json({
      message: 'Image generated',
      image: doc,
      provider: result.provider,
      model: result.model,
      fallbackUsed: result.fallbackUsed,
      providersTried: result.providersTried,
      mergeMode: result.mergeMode,
    });
  } catch (error) {
    const status = error.code === 'RATE_LIMITED' ? 429 : 400;
    res.status(status).json({
      message: error.message || 'Image generation failed',
      code: error.code || 'GENERATE_FAILED',
      retryAfterMs: error.retryAfterMs || 0,
      providersTried: error.providersTried || [],
    });
  }
});

router.delete('/history', requirePermission('aiimage:generate'), async (req, res) => {
  try {
    const items = await AiGeneratedImage.find({ createdBy: req.user._id }).lean();
    for (const item of items) {
      const fullPath = path.join(AI_IMAGES_DIR, item.filename);
      if (fs.existsSync(fullPath)) {
        await fs.promises.unlink(fullPath).catch(() => {});
      }
    }
    const result = await AiGeneratedImage.deleteMany({ createdBy: req.user._id });
    res.json({ message: 'Image history cleared', deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id', requirePermission('aiimage:generate'), async (req, res) => {
  try {
    const item = await AiGeneratedImage.findOne({ _id: req.params.id, createdBy: req.user._id });
    if (!item) return res.status(404).json({ message: 'Image not found' });
    const fullPath = path.join(AI_IMAGES_DIR, item.filename);
    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath).catch(() => {});
    }
    await item.deleteOne();
    res.json({ message: 'Image deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
