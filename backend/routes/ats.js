import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import express from 'express';
import AtsScan from '../models/AtsScan.js';
import { getAppSettings, resolveAiRuntime, listReadyAiProviders } from '../models/AppSettings.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { extractResumeText, isResumeMime } from '../services/resumeParser.js';
import { scanResumeStrict } from '../services/atsScanner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ATS_UPLOADS = path.join(__dirname, '..', 'uploads', 'ats');

if (!fs.existsSync(ATS_UPLOADS)) {
  fs.mkdirSync(ATS_UPLOADS, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, ATS_UPLOADS),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (isResumeMime(file.mimetype)) cb(null, true);
    else cb(new Error('Upload PDF, DOCX, or TXT resume only.'));
  },
});

const router = express.Router();
router.use(authenticate);

router.get('/', requirePermission('ats:view'), async (req, res) => {
  try {
    const filter = req.user.role?.name === 'Admin' ? {} : { scannedBy: req.user._id };
    const scans = await AtsScan.find(filter)
      .populate('scannedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(scans);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', requirePermission('ats:view'), async (req, res) => {
  try {
    const scan = await AtsScan.findById(req.params.id).populate('scannedBy', 'name email');
    if (!scan) return res.status(404).json({ message: 'Scan not found' });
    res.json(scan);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/scan', requirePermission('ats:scan'), (req, res) => {
  upload.single('resume')(req, res, async (err) => {
    if (err) return res.status(400).json({ message: err.message });
    if (!req.file) return res.status(400).json({ message: 'Resume file is required' });

    const filePath = req.file.path;
    try {
      const text = await extractResumeText(filePath, req.file.mimetype);
      if (!text || text.length < 50) {
        return res.status(400).json({
          message: 'Could not extract enough text from resume. Use a text-based PDF or DOCX (not scanned image-only PDF).',
        });
      }

      const targetRole = String(req.body.targetRole || '').trim();
      const jobDescription = String(req.body.jobDescription || '').trim();
      const settingsDoc = await getAppSettings();

      let runtime = resolveAiRuntime(settingsDoc, req.body.provider);
      if (!runtime) {
        for (const item of listReadyAiProviders(settingsDoc)) {
          runtime = resolveAiRuntime(settingsDoc, item.id);
          if (runtime) break;
        }
      }

      const report = await scanResumeStrict({
        settings: runtime || {},
        resumeText: text,
        targetRole,
        jobDescription,
        useAi: Boolean(runtime?.aiApiKey),
      });

      const saved = await AtsScan.create({
        fileName: req.file.originalname,
        fileType: req.file.mimetype,
        fileSize: req.file.size,
        targetRole,
        jobDescription: jobDescription.slice(0, 5000),
        wordCount: report.wordCount,
        overallScore: report.overallScore,
        ruleScore: report.ruleScore,
        aiScore: report.aiScore,
        grade: report.grade,
        verdict: report.verdict,
        atsPassProbability: report.atsPassProbability,
        fresherOrExperienced: report.fresherOrExperienced,
        categories: report.categories,
        criticalIssues: report.criticalIssues,
        recommendations: report.recommendations,
        keywordsFound: report.keywordsFound,
        keywordsMissing: report.keywordsMissing,
        strengths: report.strengths,
        aiAnalysis: report.aiAnalysis,
        scanMode: report.scanMode,
        scannedBy: req.user._id,
      });

      res.status(201).json({
        message: `ATS scan complete — score ${report.overallScore}/100 (${report.grade})`,
        scan: saved,
        report,
      });
    } catch (error) {
      res.status(502).json({ message: error.message || 'ATS scan failed' });
    } finally {
      fs.unlink(filePath, () => {});
    }
  });
});

router.delete('/:id', requirePermission('ats:scan'), async (req, res) => {
  try {
    const scan = await AtsScan.findByIdAndDelete(req.params.id);
    if (!scan) return res.status(404).json({ message: 'Scan not found' });
    res.json({ message: 'Scan deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
