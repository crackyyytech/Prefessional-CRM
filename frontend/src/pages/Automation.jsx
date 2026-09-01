import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { formatDateTime, fullName } from '../utils';

const emptyForm = {
  channel: 'email',
  subject: '',
  message: '',
  contactId: '',
  toEmail: '',
  toPhone: '',
  scheduledAt: '',
};

function toLocalInputValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export default function Automation() {
  const { can } = useAuth();
  const { appName } = useBranding();
  const [items, setItems] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [fromEmail, setFromEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    try {
      const requests = [api.getFollowUps()];
      if (can('contacts:view')) requests.push(api.getContacts());
      else requests.push(Promise.resolve([]));
      if (can('integrations:manage')) requests.push(api.getIntegrations().catch(() => null));
      else requests.push(Promise.resolve(null));

      const [followUps, contactsData, integrations] = await Promise.all(requests);
      setItems(followUps);
      setContacts(contactsData);
      if (integrations) {
        setEmailConfigured(Boolean(integrations.email?.configured));
        setFromEmail(integrations.email?.from || integrations.email?.user || '');
      }
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
    // Refresh so pending schedules flip to sent when worker runs
    const timer = setInterval(load, 20000);
    return () => clearInterval(timer);
  }, []);

  const emailContacts = useMemo(
    () => contacts.filter((c) => Boolean(c.email)),
    [contacts]
  );

  const openCreate = () => {
    const defaultTime = new Date(Date.now() + 5 * 60 * 1000);
    const first = emailContacts[0] || contacts[0];
    setForm({
      ...emptyForm,
      contactId: first?._id || '',
      toEmail: first?.email || '',
      toPhone: first?.phone || '',
      scheduledAt: toLocalInputValue(defaultTime),
      subject: `Follow-up from ${appName}`,
      message: `Hi {{name}},\n\nJust following up from ${appName}. Let us know if you have any questions.\n\nThanks`,
    });
    setModalOpen(true);
  };

  const onContactChange = (contactId) => {
    const contact = contacts.find((c) => c._id === contactId);
    setForm((prev) => ({
      ...prev,
      contactId,
      toEmail: contact?.email || prev.toEmail,
      toPhone: contact?.phone || prev.toPhone,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      if (form.channel === 'email' && !emailConfigured && can('integrations:manage')) {
        // soft warning only — backend will fail clearly if SMTP missing
      }

      const when = new Date(form.scheduledAt);
      const payload = {
        channel: form.channel,
        subject: form.subject,
        message: form.message,
        contactId: form.contactId || undefined,
        toEmail: form.toEmail,
        toPhone: form.toPhone,
        scheduledAt: when.toISOString(),
      };

      const created = await api.createFollowUp(payload);
      setModalOpen(false);
      if (created.status === 'sent') {
        setMessage(`Email sent now to ${created.toEmail || created.contact?.email}`);
      } else {
        setMessage(`Scheduled for ${formatDateTime(created.scheduledAt)} — will auto-send from your mail.`);
      }
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const sendNow = async (id) => {
    try {
      const result = await api.sendFollowUpNow(id);
      setMessage(result.status === 'sent'
        ? `Sent to ${result.toEmail || result.contact?.email || 'recipient'}`
        : result.errorMessage || 'Send finished');
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const cancelItem = async (id) => {
    try {
      await api.cancelFollowUp(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Automation</h2>
          <p>Schedule email from your mailbox to customer To-address — auto-sends at the set time</p>
        </div>
        <div className="actions">
          <Link className="btn btn-secondary" to="/integrations">Configure my email (SMTP)</Link>
          {can('automation:manage') && (
            <button className="btn btn-primary" onClick={openCreate}>Schedule email</button>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <p className="panel-note" style={{ margin: 0 }}>
          From: <strong>{fromEmail || 'Not configured'}</strong>
          {' · '}
          SMTP: <strong>{emailConfigured ? 'Ready' : 'Setup needed in Integrations'}</strong>
          {' · '}
          Server checks every 30 seconds and sends due emails automatically.
        </p>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {message && <div className="success-banner">{message}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Channel</th>
              <th>To</th>
              <th>Message</th>
              <th>Schedule</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan="6">
                  <div className="empty-state">
                    No scheduled emails yet. Add SMTP in Integrations, then Schedule email.
                  </div>
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item._id}>
                  <td><Badge value={item.channel} /></td>
                  <td>
                    <div>{item.toEmail || item.contact?.email || item.toPhone || '—'}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {item.toName || fullName(item.contact)}
                    </div>
                  </td>
                  <td>
                    {item.subject && <strong>{item.subject}<br /></strong>}
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {item.message.slice(0, 80)}{item.message.length > 80 ? '…' : ''}
                    </span>
                  </td>
                  <td>{formatDateTime(item.scheduledAt)}</td>
                  <td>
                    <Badge value={item.status} />
                    {item.sentAt && (
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        Sent {formatDateTime(item.sentAt)}
                      </div>
                    )}
                    {item.errorMessage && (
                      <div style={{ color: '#fca5a5', fontSize: '0.75rem' }}>{item.errorMessage}</div>
                    )}
                  </td>
                  <td>
                    <div className="actions">
                      {can('automation:manage') && item.status !== 'sent' && item.status !== 'cancelled' && (
                        <button className="btn btn-primary" onClick={() => sendNow(item._id)}>Send now</button>
                      )}
                      {can('automation:manage') && item.status === 'pending' && (
                        <button className="btn btn-secondary" onClick={() => cancelItem(item._id)}>Cancel</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <Modal title="Schedule automatic email" onClose={() => setModalOpen(false)}>
          <form onSubmit={handleSubmit} className="form-grid">
            <p className="panel-note">
              Mail will be sent from your Integrations SMTP account
              {fromEmail ? ` (${fromEmail})` : ''} to the To address below at the scheduled time.
            </p>
            <div className="form-row">
              <label>
                Channel
                <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
                  <option value="email">Email</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </label>
              <label>
                Contact (optional)
                <select value={form.contactId} onChange={(e) => onContactChange(e.target.value)}>
                  <option value="">Manual recipient</option>
                  {(form.channel === 'email' ? emailContacts : contacts).map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.firstName} {c.lastName}{c.email ? ` · ${c.email}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {form.channel === 'email' ? (
              <>
                <label>
                  To email
                  <input
                    type="email"
                    required
                    value={form.toEmail}
                    onChange={(e) => setForm({ ...form, toEmail: e.target.value })}
                    placeholder="customer@example.com"
                  />
                </label>
                <label>
                  Subject
                  <input
                    required
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  />
                </label>
              </>
            ) : (
              <label>
                To phone
                <input
                  required
                  value={form.toPhone}
                  onChange={(e) => setForm({ ...form, toPhone: e.target.value })}
                  placeholder="91xxxxxxxxxx"
                />
              </label>
            )}

            <label>
              Message
              <textarea
                required
                rows={5}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
              />
            </label>
            <p className="panel-note">Variables: {'{{name}}'}, {'{{firstName}}'}, {'{{email}}'}, {'{{company}}'}</p>

            <label>
              Schedule at (your local time)
              <input
                type="datetime-local"
                required
                value={form.scheduledAt}
                onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
              />
            </label>

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Schedule auto-send</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
