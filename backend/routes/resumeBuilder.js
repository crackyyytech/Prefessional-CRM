import express from 'express';
import ResumeDraft from '../models/ResumeDraft.js';
import { getAppSettings, resolveAiRuntime, listReadyAiProviders } from '../models/AppSettings.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import {
  buildAndAnalyzeResume,
  buildOptimizeAndAnalyze,
  composeResumeText,
  emptyResumeData,
  sanitizeResumeData,
} from '../services/resumeBuilder.js';
import { getResumeTemplate, listResumeTemplates } from '../services/resumeTemplates.js';

const router = express.Router();
router.use(authenticate);

async function resolveRuntime(providerId) {
  const settingsDoc = await getAppSettings();
  let runtime = resolveAiRuntime(settingsDoc, providerId);
  if (!runtime) {
    for (const item of listReadyAiProviders(settingsDoc)) {
      runtime = resolveAiRuntime(settingsDoc, item.id);
      if (runtime) break;
    }
  }
  return runtime || {};
}

function applyReportToDraft(doc, report) {
  doc.overallScore = report.overallScore;
  doc.ruleScore = report.ruleScore;
  doc.aiScore = report.aiScore;
  doc.grade = report.grade;
  doc.verdict = report.verdict;
  doc.atsPassProbability = report.atsPassProbability;
  doc.fresherOrExperienced = report.fresherOrExperienced;
  doc.categories = report.categories;
  doc.criticalIssues = report.criticalIssues;
  doc.recommendations = report.recommendations;
  doc.keywordsFound = report.keywordsFound;
  doc.keywordsMissing = report.keywordsMissing;
  doc.strengths = report.strengths;
  doc.aiAnalysis = report.aiAnalysis;
  doc.scanMode = report.scanMode;
}

router.get('/', requirePermission('resumebuilder:view'), async (req, res) => {
  try {
    const filter = req.user.role?.name === 'Admin' ? {} : { createdBy: req.user._id };
    const drafts = await ResumeDraft.find(filter)
      .populate('createdBy', 'name email')
      .sort({ updatedAt: -1 })
      .limit(50)
      .select('-resumeData -resumeText -aiAnalysis');
    res.json(drafts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/templates', requirePermission('resumebuilder:view'), (_req, res) => {
  res.json(listResumeTemplates());
});

router.get('/templates/:templateId', requirePermission('resumebuilder:view'), (req, res) => {
  const template = getResumeTemplate(req.params.templateId);
  if (!template) return res.status(404).json({ message: 'Template not found' });
  res.json(template);
});

router.get('/template', requirePermission('resumebuilder:view'), (_req, res) => {
  res.json({ template: emptyResumeData() });
});

router.get('/:id', requirePermission('resumebuilder:view'), async (req, res) => {
  try {
    const draft = await ResumeDraft.findById(req.params.id).populate('createdBy', 'name email');
    if (!draft) return res.status(404).json({ message: 'Resume draft not found' });
    res.json(draft);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', requirePermission('resumebuilder:build'), async (req, res) => {
  try {
    const resumeData = sanitizeResumeData(req.body.resumeData || emptyResumeData());
    const draft = await ResumeDraft.create({
      name: String(req.body.name || resumeData.name || 'Untitled Resume').trim(),
      targetRole: resumeData.targetRole,
      resumeData,
      resumeText: composeResumeText(resumeData),
      createdBy: req.user._id,
    });
    res.status(201).json({ message: 'Resume draft saved', draft });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.put('/:id', requirePermission('resumebuilder:build'), async (req, res) => {
  try {
    const draft = await ResumeDraft.findById(req.params.id);
    if (!draft) return res.status(404).json({ message: 'Resume draft not found' });

    if (req.body.name) draft.name = String(req.body.name).trim();
    if (req.body.resumeData) {
      draft.resumeData = sanitizeResumeData(req.body.resumeData);
      draft.targetRole = draft.resumeData.targetRole || draft.targetRole;
      draft.resumeText = composeResumeText(draft.resumeData);
    }

    await draft.save();
    res.json({ message: 'Draft updated', draft });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/analyze', requirePermission('resumebuilder:build'), async (req, res) => {
  try {
    const resumeData = sanitizeResumeData(req.body.resumeData || {});
    const runtime = await resolveRuntime(req.body.provider);
    const { resumeText, report } = await buildAndAnalyzeResume({
      resumeData,
      settings: runtime,
      useAi: Boolean(runtime?.aiApiKey),
    });

    res.json({
      message: `ATS analysis complete — ${report.overallScore}/100 (${report.grade})`,
      resumeData,
      resumeText,
      report,
    });
  } catch (error) {
    res.status(502).json({ message: error.message || 'Analysis failed' });
  }
});

router.post('/:id/analyze', requirePermission('resumebuilder:build'), async (req, res) => {
  try {
    const draft = await ResumeDraft.findById(req.params.id);
    if (!draft) return res.status(404).json({ message: 'Resume draft not found' });

    const resumeData = sanitizeResumeData(req.body.resumeData || draft.resumeData);
    const runtime = await resolveRuntime(req.body.provider);
    const { resumeText, report } = await buildAndAnalyzeResume({
      resumeData,
      settings: runtime,
      useAi: Boolean(runtime?.aiApiKey),
    });

    draft.resumeData = resumeData;
    draft.resumeText = resumeText;
    draft.targetRole = resumeData.targetRole;
    applyReportToDraft(draft, report);
    draft.status = 'analyzed';
    await draft.save();

    res.json({
      message: `ATS analysis complete — ${report.overallScore}/100 (${report.grade})`,
      draft,
      report,
    });
  } catch (error) {
    res.status(502).json({ message: error.message || 'Analysis failed' });
  }
});

router.post('/:id/optimize', requirePermission('resumebuilder:build'), async (req, res) => {
  try {
    const draft = await ResumeDraft.findById(req.params.id);
    if (!draft) return res.status(404).json({ message: 'Resume draft not found' });

    const runtime = await resolveRuntime(req.body.provider);
    if (!runtime?.aiApiKey) {
      return res.status(400).json({ message: 'Configure an AI provider in Settings to optimize resumes.' });
    }

    const resumeData = sanitizeResumeData(req.body.resumeData || draft.resumeData);
    const currentReport = req.body.report || {
      overallScore: draft.overallScore,
      criticalIssues: draft.criticalIssues,
      keywordsMissing: draft.keywordsMissing,
      recommendations: draft.recommendations,
    };

    const result = await buildOptimizeAndAnalyze({
      resumeData,
      settings: runtime,
      report: currentReport,
      useAi: true,
    });

    draft.resumeData = result.resumeData;
    draft.resumeText = result.resumeText;
    draft.targetRole = result.resumeData.targetRole;
    applyReportToDraft(draft, result.report);
    draft.optimizationNotes = result.optimizationNotes;
    draft.keywordAdditions = result.keywordAdditions;
    draft.lastOptimizedAt = new Date();
    draft.status = 'optimized';
    await draft.save();

    res.json({
      message: `Resume optimized — score ${result.scoreBefore ?? '?'} → ${result.scoreAfter}/100`,
      draft,
      report: result.report,
      optimizationNotes: result.optimizationNotes,
      keywordAdditions: result.keywordAdditions,
      expectedImprovements: result.expectedImprovements,
      scoreBefore: result.scoreBefore,
      scoreAfter: result.scoreAfter,
    });
  } catch (error) {
    res.status(502).json({ message: error.message || 'Optimization failed' });
  }
});

router.post('/optimize', requirePermission('resumebuilder:build'), async (req, res) => {
  try {
    const runtime = await resolveRuntime(req.body.provider);
    if (!runtime?.aiApiKey) {
      return res.status(400).json({ message: 'Configure an AI provider in Settings to optimize resumes.' });
    }

    const resumeData = sanitizeResumeData(req.body.resumeData || {});
    const report = req.body.report;
    if (!report) {
      return res.status(400).json({ message: 'Run ATS analysis first before optimization.' });
    }

    const result = await buildOptimizeAndAnalyze({
      resumeData,
      settings: runtime,
      report,
      useAi: true,
    });

    res.json({
      message: `Resume optimized — score ${result.scoreBefore ?? '?'} → ${result.scoreAfter}/100`,
      resumeData: result.resumeData,
      resumeText: result.resumeText,
      report: result.report,
      optimizationNotes: result.optimizationNotes,
      keywordAdditions: result.keywordAdditions,
      expectedImprovements: result.expectedImprovements,
      scoreBefore: result.scoreBefore,
      scoreAfter: result.scoreAfter,
    });
  } catch (error) {
    res.status(502).json({ message: error.message || 'Optimization failed' });
  }
});

router.delete('/:id', requirePermission('resumebuilder:build'), async (req, res) => {
  try {
    const draft = await ResumeDraft.findByIdAndDelete(req.params.id);
    if (!draft) return res.status(404).json({ message: 'Resume draft not found' });
    res.json({ message: 'Resume draft deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
