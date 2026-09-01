import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import Badge from '../components/Badge';
import { useAuth } from '../context/AuthContext';
import { formatDateTime, fullName } from '../utils';

const emptyForm = {
  phones: '',
  contactIds: [],
  purpose: '',
  message: '',
  consentConfirmed: false,
  scheduledAt: '',
  templateId: '',
};

export default function AlertSms() {
  const { can } = useAuth();
  const [logs, setLogs] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [smsConfigured, setSmsConfigured] = useState(false);
  const [limits, setLimits] = useState({ maxRecipients: 3, maxMessageChars: 320, cooldownSeconds: 60, dailyLimit: 100 });
  const [todayCount, setTodayCount] = useState(0);
  const [usage, setUsage] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [templateForm, setTemplateForm] = useState({ name: '', purpose: '', body: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [aiMeta, setAiMeta] = useState(null);

  const load = useCallback(async () => {
    try {
      const requests = [api.getAlertSms()];
      if (can('alertsms:view')) requests.push(api.getAlertSmsTemplates().catch(() => []));
      else requests.push(Promise.resolve([]));
      if (can('contacts:view')) {
        requests.push(
          api.getContacts().then((data) => (Array.isArray(data) ? data : data?.items || []))
            .catch(() => [])
        );
      } else {
        requests.push(Promise.resolve([]));
      }

      const [data, templateData, contactsData] = await Promise.all(requests);
      setLogs(data.logs || []);
      setSmsConfigured(Boolean(data.smsConfigured));
      setLimits({
        maxRecipients: data.maxRecipients || 3,
        maxMessageChars: data.maxMessageChars || 320,
        cooldownSeconds: data.cooldownSeconds || 60,
        dailyLimit: data.dailyLimit || 100,
      });
      setTodayCount(data.todayCount || 0);
      setUsage(data.usage || []);
      setTemplates(templateData || []);
      setContacts(contactsData || []);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [can]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 20000);
    return () => clearInterval(timer);
  }, [load]);

  const optedInContacts = useMemo(
    () => contacts.filter((c) => c.phone && c.smsOptIn && !c.smsOptedOut),
    [contacts]
  );

  const selectedCount = (form.contactIds?.length || 0)
    + form.phones.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean).length;

  const handleDraft = async () => {
    setDrafting(true);
    setError('');
    setMessage('');
    try {
      const result = await api.draftAlertSms({
        purpose: form.purpose,
        recipientHint: form.phones.split(/[\n,;]+/)[0] || '',
      });
      setForm((prev) => ({ ...prev, message: result.message || '' }));
      setAiMeta({ provider: result.provider, model: result.model });
      setMessage(`AI draft ready via ${result.provider || 'merged AI'}. Review before sending.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setDrafting(false);
    }
  };

  const applyTemplate = (id) => {
    const template = templates.find((t) => t._id === id);
    if (!template) return;
    setForm((prev) => ({
      ...prev,
      templateId: id,
      purpose: template.purpose || prev.purpose,
      message: template.body,
    }));
  };

  const handleSend = async (event) => {
    event.preventDefault();
    if (!can('alertsms:send')) return;
    if (selectedCount > limits.maxRecipients) {
      setError(`Maximum ${limits.maxRecipients} recipients per send.`);
      return;
    }

    setSending(true);
    setError('');
    setMessage('');
    try {
      const phones = form.phones
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      const result = await api.sendAlertSms({
        phones,
        contactIds: form.contactIds,
        message: form.message,
        purpose: form.purpose,
        consentConfirmed: form.consentConfirmed,
        scheduledAt: form.scheduledAt || undefined,
        templateId: form.templateId || undefined,
        templateName: templates.find((t) => t._id === form.templateId)?.name || '',
        aiDrafted: Boolean(aiMeta),
        aiProvider: aiMeta?.provider || '',
      });
      setMessage(result.message);
      setForm(emptyForm);
      setAiMeta(null);
      await load();
    } catch (err) {
      setError(err.message);
      await load();
    } finally {
      setSending(false);
    }
  };

  const saveTemplate = async (event) => {
    event.preventDefault();
    try {
      await api.createAlertSmsTemplate(templateForm);
      setTemplateForm({ name: '', purpose: '', body: '' });
      setMessage('Template saved');
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!can('alertsms:delete')) return;
    try {
      await api.deleteAlertSms(id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCancel = async (id) => {
    try {
      await api.cancelAlertSms(id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Alert SMS</h2>
          <p>Consent-based operational alerts via Twilio. AI drafts only — you review and send.</p>
        </div>
        {can('integrations:manage') && (
          <Link className="btn btn-secondary" to="/integrations">SMS settings</Link>
        )}
      </div>

      <div className={`panel ${smsConfigured ? '' : 'warn-panel'}`} style={{ marginBottom: 16 }}>
        <strong>SMS status:</strong>{' '}
        {smsConfigured ? 'Twilio configured' : 'Not configured — connect Twilio in Integrations before sending.'}
        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: 6 }}>
          Limits: max {limits.maxRecipients} recipients · {limits.maxMessageChars} chars ·
          {' '}{limits.cooldownSeconds}s cooldown · {todayCount}/{limits.dailyLimit} today
        </div>
        {usage.length > 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 6 }}>
            30-day usage:{' '}
            {usage.map((u) => `${u._id}:${u.count}`).join(' · ')}
          </div>
        )}
        <p className="panel-note" style={{ marginTop: 8 }}>
          Trial Twilio accounts can only message verified numbers. Prefer a Messaging Service SID for production.
          Webhooks: <code>/api/webhooks/twilio/sms/status</code> and <code>/api/webhooks/twilio/sms/inbound</code>
        </p>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {message && <div className="success-banner">{message}</div>}

      {can('alertsms:send') && (
        <form className="panel" onSubmit={handleSend} style={{ marginBottom: 20 }}>
          <h3>Compose alert</h3>
          <div className="form-grid">
            <label>
              Opted-in contacts
              <select
                multiple
                value={form.contactIds}
                onChange={(e) => setForm({
                  ...form,
                  contactIds: Array.from(e.target.selectedOptions).map((o) => o.value),
                })}
                size={Math.min(6, Math.max(3, optedInContacts.length || 3))}
              >
                {optedInContacts.length === 0 ? (
                  <option disabled value="">No consented contacts with phone</option>
                ) : (
                  optedInContacts.map((c) => (
                    <option key={c._id} value={c._id}>
                      {fullName(c)} · {c.phone}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label>
              Manual phones (max {limits.maxRecipients} total)
              <textarea
                rows={3}
                value={form.phones}
                onChange={(e) => setForm({ ...form, phones: e.target.value })}
                placeholder={'+9198XXXXXXXX\nor 9198XXXXXXXX'}
              />
            </label>
            <label className="permission-item">
              <input
                type="checkbox"
                checked={form.consentConfirmed}
                onChange={(e) => setForm({ ...form, consentConfirmed: e.target.checked })}
              />
              I confirm recipients consented to transactional/informational SMS
            </label>
            <label>
              Template
              <select
                value={form.templateId}
                onChange={(e) => applyTemplate(e.target.value)}
              >
                <option value="">None</option>
                {templates.map((t) => (
                  <option key={t._id} value={t._id}>{t.name}</option>
                ))}
              </select>
            </label>
            <label>
              Purpose / alert reason
              <input
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                placeholder="e.g. Payment due reminder, appointment tomorrow"
              />
            </label>
            <label>
              Schedule (optional)
              <input
                type="datetime-local"
                value={form.scheduledAt}
                onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
              />
            </label>
            <label>
              Message ({form.message.length}/{limits.maxMessageChars}) · recipients {selectedCount}/{limits.maxRecipients}
              <textarea
                rows={4}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value.slice(0, limits.maxMessageChars) })}
                placeholder="Write the alert, or draft with merged AI"
                required
                maxLength={limits.maxMessageChars}
              />
            </label>
          </div>
          {aiMeta && (
            <p className="panel-note">Drafted by {aiMeta.provider}{aiMeta.model ? ` · ${aiMeta.model}` : ''}</p>
          )}
          <div className="nearby-actions" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleDraft}
              disabled={drafting || !form.purpose.trim()}
            >
              {drafting ? 'Drafting…' : 'Draft with merged AI'}
            </button>
            <button type="submit" className="btn btn-primary" disabled={sending || !smsConfigured}>
              {sending ? 'Sending…' : form.scheduledAt ? 'Schedule alert' : 'Send alert SMS'}
            </button>
          </div>
        </form>
      )}

      {can('alertsms:send') && (
        <form className="panel" onSubmit={saveTemplate} style={{ marginBottom: 20 }}>
          <h3>Save template</h3>
          <div className="form-grid">
            <label>Name<input value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} required /></label>
            <label>Purpose<input value={templateForm.purpose} onChange={(e) => setTemplateForm({ ...templateForm, purpose: e.target.value })} /></label>
            <label>Body<textarea rows={3} value={templateForm.body} onChange={(e) => setTemplateForm({ ...templateForm, body: e.target.value.slice(0, limits.maxMessageChars) })} required /></label>
          </div>
          <button type="submit" className="btn btn-secondary" style={{ marginTop: 12 }}>Save template</button>
        </form>
      )}

      <section className="panel">
        <h3>Send log</h3>
        {logs.length === 0 ? (
          <p className="empty-state">No alert SMS sent yet</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Recipients</th>
                  <th>Message</th>
                  <th>Status</th>
                  <th>Cost</th>
                  <th>By</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log._id}>
                    <td>
                      {formatDateTime(log.sentAt || log.scheduledAt || log.createdAt)}
                      {log.scheduledAt && log.status === 'scheduled' ? (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Scheduled</div>
                      ) : null}
                    </td>
                    <td>
                      {(log.phones || []).join(', ')}
                      {log.aiDrafted ? <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>AI drafted</div> : null}
                    </td>
                    <td style={{ maxWidth: 280 }}>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{log.message}</div>
                      {log.errorMessage ? (
                        <div style={{ color: 'var(--danger, #dc2626)', fontSize: '0.8rem', marginTop: 4 }}>
                          {log.errorMessage}
                        </div>
                      ) : null}
                      {(log.deliveries || []).map((d) => (
                        <div key={`${log._id}-${d.phone}`} style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {d.phone}: {d.providerStatus || d.status}
                          {d.providerMessageId ? ` · ${d.providerMessageId}` : ''}
                        </div>
                      ))}
                    </td>
                    <td><Badge value={log.status} /></td>
                    <td>
                      {log.totalSegments || 0} seg
                      {log.totalPrice ? ` · ${log.totalPrice}` : ''}
                    </td>
                    <td>{log.createdBy?.name || '—'}</td>
                    <td>
                      <div className="nearby-actions">
                        {log.status === 'scheduled' && can('alertsms:send') && (
                          <button type="button" className="btn btn-secondary" onClick={() => handleCancel(log._id)}>Cancel</button>
                        )}
                        {can('alertsms:delete') && (
                          <button type="button" className="btn btn-secondary" onClick={() => handleDelete(log._id)}>Archive</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
