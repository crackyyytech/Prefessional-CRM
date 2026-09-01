import { useEffect, useState } from 'react';
import PasswordInput from '../components/PasswordInput';
import { api } from '../api';

const empty = {
  email: { host: '', port: 587, secure: false, user: '', pass: '', from: '' },
  whatsapp: { phoneNumberId: '', token: '' },
  sms: {
    accountSid: '',
    authToken: '',
    fromNumber: '',
    messagingServiceSid: '',
    statusCallbackUrl: '',
    dailyLimit: 100,
  },
  social: {
    facebookPageUrl: '',
    instagramUrl: '',
    linkedinUrl: '',
    twitterUrl: '',
    facebookPixelId: '',
  },
  payments: {
    razorpayKeyId: '',
    razorpayKeySecret: '',
    stripePublishableKey: '',
    stripeSecretKey: '',
    paymentWebhookUrl: '/api/integrations/payments/webhook',
  },
  secrets: {},
};

export default function Integrations() {
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testingSms, setTestingSms] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [smsTestTo, setSmsTestTo] = useState('');

  useEffect(() => {
    api.getIntegrations()
      .then((data) => {
        setForm({
          email: {
            host: data.email.host || '',
            port: data.email.port || 587,
            secure: Boolean(data.email.secure),
            user: data.email.user || '',
            pass: '',
            from: data.email.from || '',
          },
          whatsapp: {
            phoneNumberId: data.whatsapp.phoneNumberId || '',
            token: '',
          },
          sms: {
            accountSid: data.sms?.accountSidMasked ? '' : (data.sms?.accountSid || ''),
            accountSidSet: Boolean(data.sms?.accountSidSet),
            authToken: '',
            fromNumber: data.sms?.fromNumber || '',
            messagingServiceSid: data.sms?.messagingServiceSid || '',
            statusCallbackUrl: data.sms?.statusCallbackUrl || '',
            dailyLimit: data.sms?.dailyLimit || 100,
          },
          social: { ...empty.social, ...data.social },
          payments: {
            razorpayKeyId: data.payments.razorpayKeyId || '',
            razorpayKeySecret: '',
            stripePublishableKey: data.payments.stripePublishableKey || '',
            stripeSecretKey: '',
            paymentWebhookUrl: data.payments.paymentWebhookUrl || '/api/integrations/payments/webhook',
          },
          secrets: data.secrets || {},
          meta: data,
        });
        setTestTo(data.email.user || data.email.from || '');
      })
      .catch((err) => setError(err.message));
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await api.saveIntegrations({
        email: form.email,
        whatsapp: form.whatsapp,
        sms: form.sms,
        social: form.social,
        payments: form.payments,
      });
      setMessage(result.message);
      setForm((prev) => ({
        ...prev,
        email: { ...prev.email, pass: '' },
        whatsapp: { ...prev.whatsapp, token: '' },
        sms: { ...prev.sms, authToken: '' },
        payments: { ...prev.payments, razorpayKeySecret: '', stripeSecretKey: '' },
        secrets: result.settings.secrets,
        meta: result.settings,
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTestSms = async () => {
    setTestingSms(true);
    setError('');
    setMessage('');
    try {
      if (form.sms.authToken?.trim() || form.sms.accountSid?.trim() || form.sms.fromNumber?.trim()) {
        await api.saveIntegrations({
          email: form.email,
          whatsapp: form.whatsapp,
          sms: form.sms,
          social: form.social,
          payments: form.payments,
        });
        setForm((prev) => ({ ...prev, sms: { ...prev.sms, authToken: '', accountSid: '' } }));
      }
      const result = await api.testSmsIntegration({ to: smsTestTo.trim() || undefined });
      setMessage(result.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setTestingSms(false);
    }
  };

  const handleTestEmail = async () => {
    setTestingEmail(true);
    setError('');
    setMessage('');
    try {
      const to = (testTo || form.email.user || '').trim();
      if (!to || !to.includes('@')) {
        throw new Error('Enter a full Test To email (example: you@gmail.com)');
      }

      // Do NOT overwrite the saved App Password with browser autofill.
      // Save password only via "Save integrations".
      if (form.email.pass?.trim()) {
        const clean = form.email.pass.replace(/\s+/g, '');
        if (clean.length < 16) {
          throw new Error(
            'Password field looks incomplete (Gmail App Password is 16 characters). Clear the password box and use the already saved key, or paste the full App Password and click Save integrations first.'
          );
        }
        await api.saveIntegrations({
          email: { ...form.email, pass: clean },
          whatsapp: form.whatsapp,
          sms: form.sms,
          social: form.social,
          payments: form.payments,
        });
        setForm((prev) => ({ ...prev, email: { ...prev.email, pass: '' } }));
      }

      const result = await api.testEmailIntegration({ to });
      setMessage(result.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setTestingEmail(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Integrations</h2>
          <p>Connect email, WhatsApp, SMS, social profiles, and payment gateways</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {message && <div className="success-banner">{message}</div>}

      <form onSubmit={handleSubmit} className="panel-grid settings-grid">
        <section className="panel">
          <h3>Email (SMTP) — your From mailbox</h3>
          <p className="panel-note">
            Status: {form.meta?.email?.configured ? 'Configured' : 'Not configured'}
            {form.secrets?.hasEmailPass ? ` · saved ${form.secrets.emailPassMasked}` : ''}
            <br />
            Scheduled Automation emails are sent from this account to the customer To address.
            Gmail tip: Host `smtp.gmail.com`, Port `587`, App Password (not normal password).
          </p>
          <div className="form-grid">
            <label>Host<input value={form.email.host} onChange={(e) => setForm({ ...form, email: { ...form.email, host: e.target.value } })} placeholder="smtp.gmail.com" /></label>
            <div className="form-row">
              <label>Port<input type="number" value={form.email.port} onChange={(e) => setForm({ ...form, email: { ...form.email, port: e.target.value } })} /></label>
              <label className="permission-item"><input type="checkbox" checked={form.email.secure} onChange={(e) => setForm({ ...form, email: { ...form.email, secure: e.target.checked } })} /> Secure (SSL / port 465)</label>
            </div>
            <label>User (your email)<input value={form.email.user} onChange={(e) => setForm({ ...form, email: { ...form.email, user: e.target.value } })} placeholder="you@gmail.com" /></label>
            <label>From name/email<input value={form.email.from} onChange={(e) => setForm({ ...form, email: { ...form.email, from: e.target.value } })} placeholder="you@gmail.com" /></label>
            <label>Password / App password
              <PasswordInput
                value={form.email.pass}
                onChange={(e) => setForm({ ...form, email: { ...form.email, pass: e.target.value } })}
                placeholder="Leave blank to keep saved App Password"
                autoComplete="new-password"
              />
            </label>
            <p className="panel-note" style={{ marginTop: -6 }}>
              If Status already shows a saved key, leave Password blank. Do not let the browser autofill a short password — that overwrites your App Password and causes 535 BadCredentials.
            </p>
            <div className="form-row">
              <label>
                Test To email
                <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="send-test-here@example.com" />
              </label>
              <div className="nearby-actions" style={{ alignSelf: 'end' }}>
                <button type="button" className="btn btn-secondary" onClick={handleTestEmail} disabled={testingEmail}>
                  {testingEmail ? 'Sending...' : 'Send test email'}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="panel">
          <h3>WhatsApp Cloud API</h3>
          <p className="panel-note">
            Status: {form.meta?.whatsapp?.configured ? 'Configured' : 'Not configured'}
            {form.secrets?.hasWhatsappToken ? ` · saved ${form.secrets.whatsappTokenMasked}` : ''}
          </p>
          <p className="panel-note">
            Test / sandbox numbers can only message recipients you add in Meta Developer → WhatsApp → API Setup → To → Manage phone number list (use country code, e.g. 91…).
          </p>
          <div className="form-grid">
            <label>Phone Number ID<input value={form.whatsapp.phoneNumberId} onChange={(e) => setForm({ ...form, whatsapp: { ...form.whatsapp, phoneNumberId: e.target.value } })} /></label>
            <label>Access Token
              <PasswordInput value={form.whatsapp.token} onChange={(e) => setForm({ ...form, whatsapp: { ...form.whatsapp, token: e.target.value } })} placeholder="Leave blank to keep saved" autoComplete="off" />
            </label>
          </div>
        </section>

        <section className="panel">
          <h3>SMS (Twilio)</h3>
          <p className="panel-note">
            Status: {form.meta?.sms?.configured ? 'Configured' : 'Not configured'}
            {form.secrets?.hasSmsAuthToken ? ` · saved ${form.secrets.smsAuthTokenMasked}` : ''}
            {form.meta?.sms?.accountSidMasked ? ` · SID ${form.meta.sms.accountSidMasked}` : ''}
            <br />
            Prefer Messaging Service SID for production. Trial accounts can only SMS verified numbers.
            Set status callback to your public HTTPS URL + <code>/api/webhooks/twilio/sms/status</code>.
            Rotate Auth Token if it was ever pasted in chat or committed.
          </p>
          <div className="form-grid">
            <label>
              Account SID
              <input
                value={form.sms.accountSid}
                onChange={(e) => setForm({ ...form, sms: { ...form.sms, accountSid: e.target.value } })}
                placeholder={form.sms.accountSidSet || form.meta?.sms?.accountSidSet ? 'Leave blank to keep saved' : 'ACxxxxxxxx'}
              />
            </label>
            <label>
              From number
              <input
                value={form.sms.fromNumber}
                onChange={(e) => setForm({ ...form, sms: { ...form.sms, fromNumber: e.target.value } })}
                placeholder="+15551234567"
              />
            </label>
            <label>
              Messaging Service SID (recommended)
              <input
                value={form.sms.messagingServiceSid}
                onChange={(e) => setForm({ ...form, sms: { ...form.sms, messagingServiceSid: e.target.value } })}
                placeholder="MGxxxxxxxx"
              />
            </label>
            <label>
              Status callback URL
              <input
                value={form.sms.statusCallbackUrl}
                onChange={(e) => setForm({ ...form, sms: { ...form.sms, statusCallbackUrl: e.target.value } })}
                placeholder="https://your-domain/api/webhooks/twilio/sms/status"
              />
            </label>
            <label>
              Daily send limit
              <input
                type="number"
                min="1"
                max="10000"
                value={form.sms.dailyLimit}
                onChange={(e) => setForm({ ...form, sms: { ...form.sms, dailyLimit: e.target.value } })}
              />
            </label>
            <label>
              Auth Token
              <PasswordInput
                value={form.sms.authToken}
                onChange={(e) => setForm({ ...form, sms: { ...form.sms, authToken: e.target.value } })}
                placeholder="Leave blank to keep saved"
                autoComplete="off"
              />
            </label>
            <div className="form-row">
              <label>
                Test To phone (optional)
                <input value={smsTestTo} onChange={(e) => setSmsTestTo(e.target.value)} placeholder="+9198XXXXXXXX" />
              </label>
              <div className="nearby-actions" style={{ alignSelf: 'end' }}>
                <button type="button" className="btn btn-secondary" onClick={handleTestSms} disabled={testingSms}>
                  {testingSms ? 'Testing…' : 'Test Twilio'}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="panel">
          <h3>Social Media</h3>
          <div className="form-grid">
            <label>Facebook Page URL<input value={form.social.facebookPageUrl} onChange={(e) => setForm({ ...form, social: { ...form.social, facebookPageUrl: e.target.value } })} /></label>
            <label>Instagram URL<input value={form.social.instagramUrl} onChange={(e) => setForm({ ...form, social: { ...form.social, instagramUrl: e.target.value } })} /></label>
            <label>LinkedIn URL<input value={form.social.linkedinUrl} onChange={(e) => setForm({ ...form, social: { ...form.social, linkedinUrl: e.target.value } })} /></label>
            <label>X / Twitter URL<input value={form.social.twitterUrl} onChange={(e) => setForm({ ...form, social: { ...form.social, twitterUrl: e.target.value } })} /></label>
            <label>Facebook Pixel ID<input value={form.social.facebookPixelId} onChange={(e) => setForm({ ...form, social: { ...form.social, facebookPixelId: e.target.value } })} /></label>
          </div>
        </section>

        <section className="panel">
          <h3>Payment Gateways</h3>
          <p className="panel-note">
            Razorpay: {form.meta?.payments?.razorpayConfigured ? 'Configured' : 'Not configured'} ·
            Stripe: {form.meta?.payments?.stripeConfigured ? 'Configured' : 'Not configured'}
          </p>
          <div className="form-grid">
            <label>Razorpay Key ID<input value={form.payments.razorpayKeyId} onChange={(e) => setForm({ ...form, payments: { ...form.payments, razorpayKeyId: e.target.value } })} /></label>
            <label>Razorpay Key Secret
              <PasswordInput value={form.payments.razorpayKeySecret} onChange={(e) => setForm({ ...form, payments: { ...form.payments, razorpayKeySecret: e.target.value } })} placeholder="Leave blank to keep saved" autoComplete="off" />
            </label>
            <label>Stripe Publishable Key<input value={form.payments.stripePublishableKey} onChange={(e) => setForm({ ...form, payments: { ...form.payments, stripePublishableKey: e.target.value } })} /></label>
            <label>Stripe Secret Key
              <PasswordInput value={form.payments.stripeSecretKey} onChange={(e) => setForm({ ...form, payments: { ...form.payments, stripeSecretKey: e.target.value } })} placeholder="Leave blank to keep saved" autoComplete="off" />
            </label>
            <label>Payment webhook path<input value={form.payments.paymentWebhookUrl} onChange={(e) => setForm({ ...form, payments: { ...form.payments, paymentWebhookUrl: e.target.value } })} /></label>
          </div>
        </section>

        <div className="modal-actions" style={{ gridColumn: '1 / -1' }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Integrations'}
          </button>
        </div>
      </form>
    </>
  );
}
