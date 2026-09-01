import express from 'express';
import AiCodeWorkspace from '../models/AiCodeWorkspace.js';
import { getAppSettings } from '../models/AppSettings.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { aiCodeGenerateLimiter } from '../middleware/rateLimits.js';
import {
  aiCodeStatus,
  buildHtmlPreview,
  deleteWorkspaceDir,
  executeWorkspace,
  generateCodeWorkspace,
  initWorkspaceDir,
  inspectWorkspace,
  listWorkspaceFiles,
  readWorkspaceFile,
  writeWorkspaceFile,
} from '../services/aiCode.js';

const router = express.Router();

router.use(authenticate);

async function findOwnWorkspace(req, res, next) {
  try {
    const workspace = await AiCodeWorkspace.findOne({
      _id: req.params.id,
      createdBy: req.user._id,
    });
    if (!workspace) return res.status(404).json({ message: 'Workspace not found' });
    req.workspace = workspace;
    return next();
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

router.get('/status', requirePermission('aicode:view'), async (_req, res) => {
  try {
    const settings = await getAppSettings();
    res.json(aiCodeStatus(settings));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/workspaces', requirePermission('aicode:view'), async (req, res) => {
  try {
    const items = await AiCodeWorkspace.find({ createdBy: req.user._id })
      .sort({ updatedAt: -1 })
      .limit(30)
      .lean();
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/workspaces', requirePermission('aicode:run'), async (req, res) => {
  try {
    const name = String(req.body.name || 'Untitled workspace').trim().slice(0, 80) || 'Untitled workspace';
    const workspace = await AiCodeWorkspace.create({
      name,
      createdBy: req.user._id,
    });
    await initWorkspaceDir(workspace);
    res.status(201).json(workspace);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.delete('/workspaces/:id', requirePermission('aicode:run'), findOwnWorkspace, async (req, res) => {
  try {
    await deleteWorkspaceDir(req.workspace);
    await req.workspace.deleteOne();
    res.json({ message: 'Workspace deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/workspaces/:id/files', requirePermission('aicode:view'), findOwnWorkspace, async (req, res) => {
  try {
    const files = await listWorkspaceFiles(req.workspace);
    res.json(files);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/workspaces/:id/file', requirePermission('aicode:view'), findOwnWorkspace, async (req, res) => {
  try {
    const file = await readWorkspaceFile(req.workspace, req.query.path);
    res.json(file);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.put('/workspaces/:id/file', requirePermission('aicode:run'), findOwnWorkspace, async (req, res) => {
  try {
    const file = await writeWorkspaceFile(req.workspace, req.body.path, req.body.content);
    const files = await listWorkspaceFiles(req.workspace);
    req.workspace.filesCount = files.length;
    await req.workspace.save();
    res.json(file);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.get('/workspaces/:id/inspect', requirePermission('aicode:view'), findOwnWorkspace, async (req, res) => {
  try {
    const info = await inspectWorkspace(req.workspace);
    res.json(info);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.get('/workspaces/:id/preview', requirePermission('aicode:view'), findOwnWorkspace, async (req, res) => {
  try {
    const preview = await buildHtmlPreview(req.workspace, req.query.path || '');
    res.json(preview);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/workspaces/:id/execute', requirePermission('aicode:run'), findOwnWorkspace, async (req, res) => {
  try {
    const result = await executeWorkspace(req.workspace, {
      entry: req.body.entry || req.body.path || '',
      timeoutMs: req.body.timeoutMs,
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post(
  '/workspaces/:id/generate',
  aiCodeGenerateLimiter,
  requirePermission('aicode:run'),
  findOwnWorkspace,
  async (req, res) => {
    try {
      const prompt = String(req.body.prompt || '').trim();
      if (!prompt) return res.status(400).json({ message: 'Prompt is required' });
      if (prompt.length > 6000) return res.status(400).json({ message: 'Prompt is too long' });

      const result = await generateCodeWorkspace({
        workspace: req.workspace,
        prompt,
        provider: req.body.provider || 'auto',
        model: req.body.model || '',
      });
      const files = await listWorkspaceFiles(req.workspace);
      req.workspace.prompt = prompt;
      req.workspace.provider = result.provider;
      req.workspace.model = result.model;
      req.workspace.filesCount = files.length;
      req.workspace.lastGeneratedAt = new Date();
      req.workspace.name = req.workspace.name === 'Untitled workspace'
        ? prompt.slice(0, 60)
        : req.workspace.name;
      await req.workspace.save();

      res.json({
        message: 'Workspace generated',
        workspace: req.workspace,
        files,
        ...result,
      });
    } catch (error) {
      res.status(502).json({ message: error.message || 'AI code generation failed' });
    }
  }
);

export default router;
