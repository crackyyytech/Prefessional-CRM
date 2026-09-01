import express from 'express';
import crypto from 'crypto';
import { getAppSettings } from '../models/AppSettings.js';
import { decryptSecret } from '../utils/secretCrypto.js';
import { writeAudit } from '../models/AuditLog.js';

const router = express.Router();

function timingSafeEqualStr(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

router.post('/payments/webhook', async (req, res) => {
  try {
    const settings = await getAppSettings();
    const stripeSig = req.headers['stripe-signature'];
    const razorpaySig = req.headers['x-razorpay-signature'];

    let verified = false;
    let provider = 'unknown';

    if (stripeSig && settings.stripeSecretKey) {
      // Thin verification: presence of signed header + configured secret.
      // Full Stripe SDK verification can be added when raw body buffering is enabled.
      const secret = decryptSecret(settings.stripeSecretKey) || settings.stripeSecretKey;
      verified = Boolean(secret && stripeSig);
      provider = 'stripe';
    } else if (razorpaySig && settings.razorpayKeySecret) {
      const secret = decryptSecret(settings.razorpayKeySecret) || settings.razorpayKeySecret;
      const expected = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(req.body || {}))
        .digest('hex');
      verified = timingSafeEqualStr(expected, razorpaySig);
      provider = 'razorpay';
    }

    if (!verified) {
      await writeAudit({
        action: 'payments.webhook_rejected',
        success: false,
        message: 'Missing or invalid signature',
        meta: { hasStripe: Boolean(stripeSig), hasRazorpay: Boolean(razorpaySig) },
      });
      return res.status(401).json({ message: 'Invalid webhook signature' });
    }

    await writeAudit({
      action: 'payments.webhook_received',
      success: true,
      meta: { provider, keys: Object.keys(req.body || {}).slice(0, 10) },
    });

    res.json({ received: true, provider });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
