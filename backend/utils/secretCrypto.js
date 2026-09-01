import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const PREFIX = 'enc:v1:';

function getKey() {
  const raw = process.env.SECRETS_ENCRYPTION_KEY || process.env.JWT_SECRET || 'crm-dev-secret-change-me';
  return crypto.createHash('sha256').update(String(raw)).digest();
}

export function encryptSecret(value) {
  const text = String(value || '');
  if (!text) return '';
  if (text.startsWith(PREFIX)) return text;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(value) {
  const text = String(value || '');
  if (!text) return '';
  if (!text.startsWith(PREFIX)) return text;

  try {
    const payload = text.slice(PREFIX.length);
    const [ivB64, tagB64, dataB64] = payload.split(':');
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');
    const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

export function isEncryptedSecret(value) {
  return String(value || '').startsWith(PREFIX);
}
