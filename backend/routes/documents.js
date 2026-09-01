import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import express from 'express';
import Document from '../models/Document.js';
import { authenticate, requirePermission } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const safeBase = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safeBase}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed. Use PDF, Word, Excel, text, CSV, or images.'));
    }
  },
});

const router = express.Router();

router.use(authenticate);

router.get('/', requirePermission('documents:view'), async (req, res) => {
  try {
    const filter = {};
    if (req.query.contact) filter.contact = req.query.contact;
    if (req.query.deal) filter.deal = req.query.deal;

    const documents = await Document.find(filter)
      .populate('contact', 'firstName lastName')
      .populate('deal', 'title')
      .populate('uploadedBy', 'name email')
      .sort({ createdAt: -1 });

    res.json(documents);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post(
  '/',
  requirePermission('documents:create'),
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ message: err.message });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'File is required' });
      }

      const document = await Document.create({
        originalName: req.file.originalname,
        storedName: req.file.filename,
        mimeType: req.file.mimetype,
        size: req.file.size,
        description: (req.body.description || '').trim(),
        contact: req.body.contact || undefined,
        deal: req.body.deal || undefined,
        uploadedBy: req.user._id,
      });

      await document.populate('contact', 'firstName lastName');
      await document.populate('deal', 'title');
      await document.populate('uploadedBy', 'name email');

      res.status(201).json(document);
    } catch (error) {
      if (req.file) {
        fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
      }
      res.status(400).json({ message: error.message });
    }
  }
);

router.get('/:id/download', requirePermission('documents:view'), async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);
    if (!document) return res.status(404).json({ message: 'Document not found' });

    const filePath = path.join(UPLOADS_DIR, document.storedName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'File missing on server' });
    }

    res.download(filePath, document.originalName);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id', requirePermission('documents:delete'), async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);
    if (!document) return res.status(404).json({ message: 'Document not found' });

    const filePath = path.join(UPLOADS_DIR, document.storedName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await document.deleteOne();
    res.json({ message: 'Document deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
