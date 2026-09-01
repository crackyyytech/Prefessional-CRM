import express from 'express';
import SeoScan from '../models/SeoScan.js';
import { getAppSettings, resolveAiRuntime, listReadyAiProviders } from '../models/AppSettings.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { runSeoScan, validateSeoUrl } from '../services/seoScanner.js';

const router = express.Router();
router.use(authenticate);

router.get('/', requirePermission('seo:view'), async (req, res) => {
  try {
    const filter = req.user.role?.name === 'Admin' ? {} : { scannedBy: req.user._id };
    const scans = await SeoScan.find(filter)
      .populate('scannedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(scans);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', requirePermission('seo:view'), async (req, res) => {
  try {
    const scan = await SeoScan.findById(req.params.id).populate('scannedBy', 'name email');
    if (!scan) return res.status(404).json({ message: 'SEO scan not found' });
    res.json(scan);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/scan', requirePermission('seo:scan'), async (req, res) => {
  try {
    const targetUrl = validateSeoUrl(req.body.targetUrl);
    const targetKeyword = String(req.body.targetKeyword || '').trim();
    const name = String(req.body.name || '').trim();

    const settingsDoc = await getAppSettings();
    let runtime = resolveAiRuntime(settingsDoc, req.body.provider);
    if (!runtime) {
      for (const item of listReadyAiProviders(settingsDoc)) {
        runtime = resolveAiRuntime(settingsDoc, item.id);
        if (runtime) break;
      }
    }

    const report = await runSeoScan(targetUrl, {
      settings: runtime || {},
      targetKeyword,
      useAi: Boolean(runtime?.aiApiKey),
    });

    const scan = await SeoScan.create({
      name: name || `SEO scan ${new Date().toLocaleString('en-IN')}`,
      targetUrl,
      finalUrl: report.finalUrl,
      targetKeyword,
      overallScore: report.overallScore,
      ruleScore: report.ruleScore,
      aiScore: report.aiScore,
      grade: report.grade,
      seoRank: report.seoRank,
      verdict: report.verdict,
      categories: report.categories,
      criticalIssues: report.criticalIssues,
      recommendations: report.recommendations,
      checks: report.checks,
      robotsTxt: report.robotsTxt,
      aiAnalysis: report.aiAnalysis,
      scanMode: report.scanMode,
      status: 'completed',
      scannedBy: req.user._id,
    });

    res.status(201).json({
      message: `SEO score ${report.overallScore}/100 — ${report.seoRank} (${report.grade})`,
      scan,
      report,
    });
  } catch (error) {
    res.status(502).json({ message: error.message || 'SEO scan failed' });
  }
});

router.delete('/:id', requirePermission('seo:scan'), async (req, res) => {
  try {
    const scan = await SeoScan.findByIdAndDelete(req.params.id);
    if (!scan) return res.status(404).json({ message: 'SEO scan not found' });
    res.json({ message: 'SEO scan deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
