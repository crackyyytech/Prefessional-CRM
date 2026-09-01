import { useEffect, useState } from 'react';
import { api } from '../api';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';

const emptyForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  company: '',
  status: 'lead',
  source: 'manual',
  campaign: '',
  notes: '',
  smsOptIn: false,
  smsConsentType: 'transactional',
};

export default function Contacts() {
  const { can } = useAuth();
  const [contacts, setContacts] = useState([]);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const load = () => {
    api.getContacts()
      .then((data) => setContacts(Array.isArray(data) ? data : data?.items || []))
      .catch((err) => setError(err.message));
  };

  useEffect(load, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (contact) => {
    setEditing(contact);
    setForm({
      firstName: contact.firstName || '',
      lastName: contact.lastName || '',
      email: contact.email || '',
      phone: contact.phone || '',
      company: contact.company || '',
      status: contact.status || 'lead',
      source: contact.source || 'manual',
      campaign: contact.campaign || '',
      notes: contact.notes || '',
      smsOptIn: Boolean(contact.smsOptIn),
      smsConsentType: contact.smsConsentType || 'transactional',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      if (editing) {
        await api.updateContact(editing._id, form);
      } else {
        await api.createContact(form);
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this contact?')) return;
    try {
      await api.deleteContact(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Contacts</h2>
          <p>Manage leads, prospects, and customers</p>
        </div>
        {can('contacts:create') && (
          <button className="btn btn-primary" onClick={openCreate}>Add Contact</button>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Company</th>
              <th>Status</th>
              <th>Source</th>
              <th>Lead Score</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 ? (
              <tr>
                <td colSpan="7">
                  <div className="empty-state">No contacts yet. Add your first one.</div>
                </td>
              </tr>
            ) : (
              contacts.map((contact) => (
                <tr key={contact._id}>
                  <td>{contact.firstName} {contact.lastName}</td>
                  <td>{contact.email || '—'}</td>
                  <td>{contact.company || '—'}</td>
                  <td><Badge value={contact.status} /></td>
                  <td><Badge value={contact.source || 'manual'} /></td>
                  <td>
                    <span className="score-pill" data-score={contact.leadScoreLabel || 'Cold'}>
                      {contact.leadScore ?? 0} · {contact.leadScoreLabel || 'Cold'}
                    </span>
                  </td>
                  <td>
                    <div className="actions">
                      {can('contacts:update') && (
                        <button className="btn btn-secondary" onClick={() => openEdit(contact)}>Edit</button>
                      )}
                      {can('contacts:delete') && (
                        <button className="btn btn-danger" onClick={() => handleDelete(contact._id)}>Delete</button>
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
        <Modal title={editing ? 'Edit Contact' : 'Add Contact'} onClose={() => setModalOpen(false)}>
          <form onSubmit={handleSubmit} className="form-grid">
            <div className="form-row">
              <label>
                First name
                <input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              </label>
              <label>
                Last name
                <input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              </label>
            </div>
            <div className="form-row">
              <label>
                Email
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </label>
              <label>
                Phone
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </label>
            </div>
            <label>
              Company
              <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </label>
            <label>
              Status
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="lead">Lead</option>
                <option value="prospect">Prospect</option>
                <option value="customer">Customer</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <div className="form-row">
              <label>
                Source
                <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                  <option value="manual">Manual</option>
                  <option value="website">Website</option>
                  <option value="referral">Referral</option>
                  <option value="social">Social</option>
                  <option value="ads">Ads</option>
                  <option value="import">Import</option>
                  <option value="form">Form</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label>
                Campaign
                <input value={form.campaign} onChange={(e) => setForm({ ...form, campaign: e.target.value })} />
              </label>
            </div>
            <label>
              Notes
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
            <label className="permission-item">
              <input
                type="checkbox"
                checked={form.smsOptIn}
                onChange={(e) => setForm({
                  ...form,
                  smsOptIn: e.target.checked,
                  smsConsentMethod: 'manual',
                  smsConsentSource: 'contacts_ui',
                })}
              />
              SMS opt-in (transactional / informational alerts)
            </label>
            {form.smsOptIn && (
              <label>
                Consent type
                <select value={form.smsConsentType} onChange={(e) => setForm({ ...form, smsConsentType: e.target.value })}>
                  <option value="transactional">Transactional</option>
                  <option value="informational">Informational</option>
                  <option value="marketing">Marketing</option>
                </select>
              </label>
            )}
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">{editing ? 'Save' : 'Create'}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
