import fs from 'fs/promises';
import path from 'path';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

const RESUME_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

export function isResumeMime(mimetype) {
  return RESUME_MIMES.has(mimetype);
}

export async function extractResumeText(filePath, mimetype) {
  const ext = path.extname(filePath).toLowerCase();

  if (mimetype === 'text/plain' || ext === '.txt') {
    return fs.readFile(filePath, 'utf8');
  }

  if (mimetype === 'application/pdf' || ext === '.pdf') {
    const buffer = await fs.readFile(filePath);
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return String(result?.text || '').trim();
    } finally {
      if (typeof parser.destroy === 'function') await parser.destroy();
    }
  }

  if (
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || ext === '.docx'
  ) {
    const result = await mammoth.extractRawText({ path: filePath });
    return String(result.value || '').trim();
  }

  if (mimetype === 'application/msword' || ext === '.doc') {
    throw new Error('Legacy .doc files are not supported. Save as PDF or DOCX.');
  }

  throw new Error('Unsupported resume format. Upload PDF, DOCX, or TXT.');
}
