/**
 * Lightweight smoke checks for production expansion.
 * Run: node scripts/smoke-production.mjs
 * Requires backend at http://localhost:5000
 */
const BASE = process.env.API_BASE || 'http://localhost:5000/api';

async function req(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const health = await req('/health');
  assert(health.status === 200, 'health failed');

  const login = await req('/auth/login', {
    method: 'POST',
    body: { email: 'admin@crm.local', password: 'admin123' },
  });
  assert(login.status === 200 && login.data.token, 'login failed');
  const token = login.data.token;

  const alert = await req('/alert-sms', { token });
  assert(alert.status === 200, 'alert-sms list failed');
  assert(alert.data.maxRecipients === 3, 'max recipients should be 3');

  const over = await req('/alert-sms/send', {
    method: 'POST',
    token,
    body: {
      phones: ['919111111111', '919222222222', '919333333333', '919444444444'],
      message: 'test',
      consentConfirmed: true,
    },
  });
  assert(over.status === 400, 'should reject >3 recipients');
  assert(/Maximum 3/i.test(over.data.message || ''), over.data.message);

  const analytics = await req('/analytics', { token });
  assert(analytics.status === 200, 'analytics failed');
  assert(analytics.data.totals, 'analytics totals missing');
  assert(analytics.data.sms, 'analytics sms metrics missing');

  const dash = await req('/dashboard', { token });
  assert(dash.status === 200, 'dashboard failed');

  console.log('smoke-production: OK');
}

main().catch((err) => {
  console.error('smoke-production: FAIL', err.message);
  process.exit(1);
});
