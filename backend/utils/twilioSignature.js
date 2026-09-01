import crypto from 'crypto';
import { decryptSecret } from '../utils/secretCrypto.js';

/**
 * Validate Twilio webhook signature (X-Twilio-Signature).
 * Requires the exact public URL Twilio called.
 */
export function validateTwilioSignature(authToken, signature, url, params) {
  if (!authToken || !signature || !url) return false;

  const token = decryptSecret(authToken) || authToken;
  const sortedKeys = Object.keys(params || {}).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + String(params[key] ?? '');
  }

  const expected = crypto.createHmac('sha1', token).update(Buffer.from(data, 'utf8')).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
  } catch {
    return false;
  }
}

export function getPublicRequestUrl(req) {
  const configured = process.env.PUBLIC_BASE_URL || process.env.WEBHOOK_BASE_URL;
  if (configured) {
    return `${configured.replace(/\/$/, '')}${req.originalUrl}`;
  }
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}${req.originalUrl}`;
}
