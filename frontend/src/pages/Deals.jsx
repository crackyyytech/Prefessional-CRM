import { useEffect, useState } from 'react';
import { api } from '../api';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, formatDate, fullName } from '../utils';

const emptyForm = {
  title: '',
  value: '',
  stage: 'lead',
  contact: '',
  expectedCloseDate: '',
  notes: '',
};

export default function Deals() {
  const { can } = useAuth();
  const [deals, setDeals] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    try {
      const requests = [api.getDeals()];
      requests.push(can('contacts:view') ? api.getContacts() : Promise.resolve([]));
      const [dealsData, contactsData] = await Promise.all(requests);
      setDeals(dealsData);
      setContacts(Array.isArray(contactsData) ? contactsData : contactsData?.items || []);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (deal) => {
    setEditing(deal);
    setForm({
      title: deal.title || '',
      value: deal.value ?? '',
      stage: deal.stage || 'lead',
      contact: deal.contact?._id || deal.contact || '',
      expectedCloseDate: deal.expectedCloseDate ? deal.expectedCloseDate.slice(0, 10) : '',
      notes: deal.notes || '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      const payload = {
        ...form,
        value: Number(form.value) || 0,
        contact: form.contact || undefined,
        expectedCloseDate: form.expectedCloseDate || undefined,
      };
      if (editing) {
        await api.updateDeal(editing._id, payload);
      } else {
        await api.createDeal(payload);
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this deal?')) return;
    try {
      await api.deleteDeal(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Deals</h2>
          <p>Track opportunities through your sales pipeline</p>
        </div>
        {can('deals:create') && (
          <button className="btn btn-primary" onClick={openCreate}>Add Deal</button>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Contact</th>
              <th>Value</th>
              <th>Stage</th>
              <th>Close Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {deals.length === 0 ? (
              <tr>
                <td colSpan="6">
                  <div className="empty-state">No deals yet. Create your first opportunity.</div>
                </td>
              </tr>
            ) : (
              deals.map((deal) => (
                <tr key={deal._id}>
                  <td>{deal.title}</td>
                  <td>{fullName(deal.contact)}</td>
                  <td>{formatCurrency(deal.value)}</td>
                  <td><Badge value={deal.stage} /></td>
                  <td>{formatDate(deal.expectedCloseDate)}</td>
                  <td>
                    <div className="actions">
                      {can('deals:update') && (
                        <button className="btn btn-secondary" onClick={() => openEdit(deal)}>Edit</button>
                      )}
                      {can('deals:delete') && (
                        <button className="btn btn-danger" onClick={() => handleDelete(deal._id)}>Delete</button>
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
        <Modal title={editing ? 'Edit Deal' : 'Add Deal'} onClose={() => setModalOpen(false)}>
          <form onSubmit={handleSubmit} className="form-grid">
            <label>
              Title
              <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <div className="form-row">
              <label>
                Value ($)
                <input type="number" min="0" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
              </label>
              <label>
                Stage
                <select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
                  <option value="lead">Lead</option>
                  <option value="qualified">Qualified</option>
                  <option value="proposal">Proposal</option>
                  <option value="negotiation">Negotiation</option>
                  <option value="won">Won</option>
                  <option value="lost">Lost</option>
                </select>
              </label>
            </div>
            <div className="form-row">
              <label>
                Contact
                <select value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })}>
                  <option value="">None</option>
                  {contacts.map((contact) => (
                    <option key={contact._id} value={contact._id}>
                      {contact.firstName} {contact.lastName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Expected close date
                <input type="date" value={form.expectedCloseDate} onChange={(e) => setForm({ ...form, expectedCloseDate: e.target.value })} />
              </label>
            </div>
            <label>
              Notes
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
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
