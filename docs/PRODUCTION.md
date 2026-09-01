# Production rollout — Vistawin CRM

## Required environment variables

```bash
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://...
JWT_SECRET=<long-random-string>
SECRETS_ENCRYPTION_KEY=<long-random-string>   # preferred for secret encryption
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=<strong-password>
CORS_ORIGINS=https://app.yourdomain.com
PUBLIC_BASE_URL=https://api.yourdomain.com    # used for Twilio signature URLs
# TWILIO_SKIP_SIGNATURE=1                     # local only — never in production
# SMTP_INSECURE_TLS=1                         # local only
```

## Twilio setup

1. Open **Integrations → SMS (Twilio)**.
2. Save Account SID, Auth Token (encrypted at rest), and either:
   - From number (`+E.164`), or
   - Messaging Service SID (`MG...`) — recommended for production.
3. Set Status callback URL to:
   - `https://api.yourdomain.com/api/webhooks/twilio/sms/status`
4. Point the Twilio number / Messaging Service inbound webhook to:
   - `https://api.yourdomain.com/api/webhooks/twilio/sms/inbound`
5. Click **Test Twilio** (optional verified trial recipient).
6. **Rotate** any Auth Token that was pasted in chat or committed.

### Trial accounts

- Can only SMS **verified** recipient numbers.
- Upgrade or verify numbers before production traffic.

### Compliance built into Alert SMS

- Max **3** recipients per send
- Max **320** characters
- **60s** cooldown between batches
- Daily per-user budget (default 100)
- AI drafts only — human must review/send
- Contact SMS opt-in required; STOP keywords auto-opt-out
- Quiet hours for marketing consent type (8am–9pm local)

## Security notes

- Sales role no longer includes `alertsms:send` or security tooling by default.
- Payment webhooks require Stripe/Razorpay signatures.
- JWT tokens without `jti` are rejected; password changes revoke all sessions.
- In-memory MongoDB fallback is disabled when `NODE_ENV=production`.

## Rollback

1. Redeploy previous backend/frontend builds.
2. Keep MongoDB as-is (new fields are additive).
3. Soft-deleted Alert SMS logs use `deletedAt` — not hard-deleted.

## Smoke checklist

- [ ] `GET /api/health` → ok
- [ ] Login works; rate limit after many failures
- [ ] Integrations → Test Twilio
- [ ] Alert SMS draft with merged AI
- [ ] Alert SMS send blocked without consent / over 3 recipients
- [ ] STOP inbound webhook marks contact opted out
- [ ] Analytics loads without crash; SMS metrics visible
- [ ] Dashboard network speed only probes when toggle is on
