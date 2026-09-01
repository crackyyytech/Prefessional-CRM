import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatInr, fullName } from '../utils';

const DEFAULT_TERMS =
  '1. Payment as per the agreed schedule; work begins after advance clearance.\n'
  + '2. Scope changes may revise timeline and cost with written approval.\n'
  + '3. Intellectual property transfers to the client after full payment.\n'
  + '4. Free support window as specified in the scope; AMC thereafter is optional.\n'
  + '5. This quotation is valid until the stated validity date.';

const emptyItem = () => ({
  description: '',
  itemType: 'service',
  hsnSac: '998314',
  qty: 1,
  unit: 'nos',
  rate: '',
  gstPercent: 18,
});

const emptyForm = () => {
  const issue = new Date();
  const valid = new Date();
  valid.setDate(valid.getDate() + 30);
  return {
    status: 'draft',
    issueDate: issue.toISOString().slice(0, 10),
    validUntil: valid.toISOString().slice(0, 10),
    contact: '',
    deal: '',
    projectTitle: '',
    scopeSummary: '',
    placeOfSupply: '',
    taxMode: 'cgst_sgst',
    clientSnapshot: {
      name: '',
      company: '',
      address: '',
      phone: '',
      email: '',
      gstin: '',
    },
    items: [emptyItem()],
    paymentTerms: '50% advance on acceptance; 50% on delivery / go-live.',
    termsAndConditions: DEFAULT_TERMS,
    notes: '',
  };
};

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function computeLiveTotals(items, taxMode) {
  let subtotal = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  (items || []).forEach((item) => {
    const amount = round2((Number(item.qty) || 0) * (Number(item.rate) || 0));
    subtotal = round2(subtotal + amount);
    const tax = round2((amount * (Number(item.gstPercent) || 0)) / 100);
    if (taxMode === 'igst') igst = round2(igst + tax);
    else {
      const half = round2(tax / 2);
      cgst = round2(cgst + half);
      sgst = round2(sgst + (tax - half));
    }
  });
  return {
    subtotal,
    cgstAmount: cgst,
    sgstAmount: sgst,
    igstAmount: igst,
    grandTotal: round2(subtotal + cgst + sgst + igst),
  };
}

function clientLabel(q) {
  return q.clientSnapshot?.company
    || q.clientSnapshot?.name
    || fullName(q.contact)
    || '—';
}

export default function Quotations() {
  const { can } = useAuth();
  const [items, setItems] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [deals, setDeals] = useState([]);
  const [company, setCompany] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const liveTotals = useMemo(
    () => computeLiveTotals(form.items, form.taxMode),
    [form.items, form.taxMode]
  );

  const load = async () => {
    try {
      const requests = [api.getQuotations()];
      if (can('contacts:view')) requests.push(api.getContacts());
      else requests.push(Promise.resolve([]));
      if (can('deals:view')) requests.push(api.getDeals());
      else requests.push(Promise.resolve([]));
      requests.push(api.getBranding().catch(() => null));

      const [quotations, contactsData, dealsData, branding] = await Promise.all(requests);
      setItems(quotations);
      setContacts(contactsData);
      setDeals(dealsData);
      setCompany(branding);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
    setError('');
  };

  const openEdit = (q) => {
    setEditing(q);
    setForm({
      status: q.status || 'draft',
      issueDate: q.issueDate ? q.issueDate.slice(0, 10) : '',
      validUntil: q.validUntil ? q.validUntil.slice(0, 10) : '',
      contact: q.contact?._id || q.contact || '',
      deal: q.deal?._id || q.deal || '',
      projectTitle: q.projectTitle || '',
      scopeSummary: q.scopeSummary || '',
      placeOfSupply: q.placeOfSupply || '',
      taxMode: q.taxMode || 'cgst_sgst',
      clientSnapshot: {
        name: q.clientSnapshot?.name || '',
        company: q.clientSnapshot?.company || '',
        address: q.clientSnapshot?.address || '',
        phone: q.clientSnapshot?.phone || '',
        email: q.clientSnapshot?.email || '',
        gstin: q.clientSnapshot?.gstin || '',
      },
      items: (q.items?.length ? q.items : [emptyItem()]).map((row) => ({
        description: row.description || '',
        itemType: row.itemType || 'service',
        hsnSac: row.hsnSac || '998314',
        qty: row.qty ?? 1,
        unit: row.unit || 'nos',
        rate: row.rate ?? '',
        gstPercent: row.gstPercent ?? 18,
      })),
      paymentTerms: q.paymentTerms || '',
      termsAndConditions: q.termsAndConditions || DEFAULT_TERMS,
      notes: q.notes || '',
    });
    setModalOpen(true);
    setError('');
  };

  const fillFromContact = (contactId) => {
    const contact = contacts.find((c) => c._id === contactId);
    if (!contact) {
      setForm((prev) => ({ ...prev, contact: contactId }));
      return;
    }
    setForm((prev) => ({
      ...prev,
      contact: contactId,
      clientSnapshot: {
        name: fullName(contact) === '—' ? '' : fullName(contact),
        company: contact.company || '',
        address: [contact.address, contact.area, contact.city].filter(Boolean).join(', '),
        phone: contact.phone || '',
        email: contact.email || '',
        gstin: prev.clientSnapshot.gstin || '',
      },
    }));
  };

  const updateItem = (index, patch) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  };

  const addItem = () => {
    setForm((prev) => ({ ...prev, items: [...prev.items, emptyItem()] }));
  };

  const removeItem = (index) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.length <= 1 ? prev.items : prev.items.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const payload = {
        ...form,
        contact: form.contact || undefined,
        deal: form.deal || undefined,
        items: form.items.map((row) => ({
          ...row,
          qty: Number(row.qty) || 0,
          rate: Number(row.rate) || 0,
          gstPercent: Number(row.gstPercent) || 0,
        })),
      };
      if (editing) await api.updateQuotation(editing._id, payload);
      else await api.createQuotation(payload);
      setModalOpen(false);
      setMessage(editing ? 'Quotation updated' : 'Quotation created');
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this quotation?')) return;
    try {
      await api.deleteQuotation(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDownloadPdf = async (q) => {
    try {
      const blob = await api.downloadQuotationPdf(q._id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${q.quoteNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  };

  const handlePrint = (q) => {
    setPreview(q);
    setTimeout(() => window.print(), 250);
  };

  return (
    <>
      <div className="page-header no-print">
        <div>
          <h2>Quotations</h2>
          <p>Software / IT service quotations with GST — create, print, and download PDF</p>
        </div>
        {can('quotations:create') && (
          <button className="btn btn-primary" onClick={openCreate}>New Quotation</button>
        )}
      </div>

      {error && <div className="error-banner no-print">{error}</div>}
      {message && <div className="success-banner no-print">{message}</div>}

      <div className="table-wrap no-print">
        <table>
          <thead>
            <tr>
              <th>Quote No.</th>
              <th>Client</th>
              <th>Project</th>
              <th>Total</th>
              <th>Status</th>
              <th>Valid Until</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan="7">
                  <div className="empty-state">No quotations yet. Create your first software quote.</div>
                </td>
              </tr>
            ) : (
              items.map((q) => (
                <tr key={q._id}>
                  <td>{q.quoteNumber}</td>
                  <td>{clientLabel(q)}</td>
                  <td>{q.projectTitle}</td>
                  <td>{formatInr(q.grandTotal)}</td>
                  <td><Badge value={q.status} /></td>
                  <td>{formatDate(q.validUntil)}</td>
                  <td>
                    <div className="actions">
                      <button className="btn btn-secondary" onClick={() => handlePrint(q)}>Print</button>
                      <button className="btn btn-secondary" onClick={() => handleDownloadPdf(q)}>PDF</button>
                      {can('quotations:update') && (
                        <button className="btn btn-secondary" onClick={() => openEdit(q)}>Edit</button>
                      )}
                      {can('quotations:delete') && (
                        <button className="btn btn-danger" onClick={() => handleDelete(q._id)}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {preview && (
        <div className="quote-print-sheet">
          <div className="quote-doc">
            <div className="quote-doc-header">
              <div>
                <h1>{company?.companyLegalName || company?.appName || 'Company'}</h1>
                {company?.companyAddress && <p>{company.companyAddress}</p>}
                <p>
                  {[company?.companyPhone, company?.companyEmail].filter(Boolean).join(' · ')}
                </p>
                {company?.companyGstin && <p>GSTIN: {company.companyGstin}</p>}
              </div>
              <div className="quote-doc-meta">
                <h2>QUOTATION</h2>
                <p><strong>Quote No:</strong> {preview.quoteNumber}</p>
                <p><strong>Date:</strong> {formatDate(preview.issueDate)}</p>
                <p><strong>Valid Until:</strong> {formatDate(preview.validUntil)}</p>
                {preview.placeOfSupply && <p><strong>Place of Supply:</strong> {preview.placeOfSupply}</p>}
              </div>
            </div>

            <div className="quote-doc-section">
              <h3>Bill To</h3>
              <p>{preview.clientSnapshot?.name || '—'}</p>
              {preview.clientSnapshot?.company && <p>{preview.clientSnapshot.company}</p>}
              {preview.clientSnapshot?.address && <p>{preview.clientSnapshot.address}</p>}
              <p>
                {[preview.clientSnapshot?.phone, preview.clientSnapshot?.email].filter(Boolean).join(' · ')}
              </p>
              {preview.clientSnapshot?.gstin && <p>GSTIN: {preview.clientSnapshot.gstin}</p>}
            </div>

            <div className="quote-doc-section">
              <h3>Project</h3>
              <p className="quote-project-title">{preview.projectTitle}</p>
              {preview.scopeSummary && <p>{preview.scopeSummary}</p>}
            </div>

            <table className="quote-items-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Description</th>
                  <th>Type</th>
                  <th>HSN/SAC</th>
                  <th>Qty</th>
                  <th>Rate</th>
                  <th>GST%</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {(preview.items || []).map((row, i) => (
                  <tr key={`${preview._id}-${i}`}>
                    <td>{i + 1}</td>
                    <td>{row.description}</td>
                    <td>{row.itemType}</td>
                    <td>{row.hsnSac}</td>
                    <td>{row.qty} {row.unit}</td>
                    <td>{formatInr(row.rate)}</td>
                    <td>{row.gstPercent}</td>
                    <td>{formatInr(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="quote-totals">
              <div><span>Taxable</span><strong>{formatInr(preview.subtotal)}</strong></div>
              {preview.taxMode === 'igst' ? (
                <div><span>IGST</span><strong>{formatInr(preview.igstAmount)}</strong></div>
              ) : (
                <>
                  <div><span>CGST</span><strong>{formatInr(preview.cgstAmount)}</strong></div>
                  <div><span>SGST</span><strong>{formatInr(preview.sgstAmount)}</strong></div>
                </>
              )}
              <div className="quote-grand"><span>Grand Total</span><strong>{formatInr(preview.grandTotal)}</strong></div>
            </div>

            <div className="quote-doc-section">
              <h3>Payment Terms</h3>
              <p>{preview.paymentTerms || '—'}</p>
            </div>
            <div className="quote-doc-section">
              <h3>Terms & Conditions</h3>
              <pre className="quote-terms">{preview.termsAndConditions || '—'}</pre>
            </div>
            {preview.notes && (
              <div className="quote-doc-section">
                <h3>Notes</h3>
                <p>{preview.notes}</p>
              </div>
            )}
            <div className="quote-sign">
              <div className="quote-sign-line" />
              <p>Authorized Signatory</p>
            </div>
          </div>
          <div className="no-print" style={{ marginTop: 12 }}>
            <button className="btn btn-secondary" onClick={() => setPreview(null)}>Close preview</button>
          </div>
        </div>
      )}

      {modalOpen && (
        <Modal
          title={editing ? `Edit ${editing.quoteNumber}` : 'New Quotation'}
          onClose={() => setModalOpen(false)}
          wide
        >
          <form onSubmit={handleSubmit} className="form-grid">
            <div className="form-row">
              <label>
                Project title
                <input
                  required
                  value={form.projectTitle}
                  onChange={(e) => setForm({ ...form, projectTitle: e.target.value })}
                  placeholder="e.g. Company website + admin panel"
                />
              </label>
              <label>
                Status
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="accepted">Accepted</option>
                  <option value="rejected">Rejected</option>
                  <option value="expired">Expired</option>
                </select>
              </label>
            </div>

            <label>
              Scope summary
              <textarea
                rows={2}
                value={form.scopeSummary}
                onChange={(e) => setForm({ ...form, scopeSummary: e.target.value })}
                placeholder="Modules, platforms, deliverables..."
              />
            </label>

            <div className="form-row">
              <label>
                Contact
                <select
                  value={form.contact}
                  onChange={(e) => fillFromContact(e.target.value)}
                >
                  <option value="">— Optional —</option>
                  {contacts.map((c) => (
                    <option key={c._id} value={c._id}>
                      {fullName(c)}{c.company ? ` · ${c.company}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Deal
                <select
                  value={form.deal}
                  onChange={(e) => setForm({ ...form, deal: e.target.value })}
                >
                  <option value="">— Optional —</option>
                  {deals.map((d) => (
                    <option key={d._id} value={d._id}>{d.title}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="form-row">
              <label>
                Client name
                <input
                  value={form.clientSnapshot.name}
                  onChange={(e) => setForm({
                    ...form,
                    clientSnapshot: { ...form.clientSnapshot, name: e.target.value },
                  })}
                />
              </label>
              <label>
                Client company
                <input
                  value={form.clientSnapshot.company}
                  onChange={(e) => setForm({
                    ...form,
                    clientSnapshot: { ...form.clientSnapshot, company: e.target.value },
                  })}
                />
              </label>
            </div>

            <label>
              Client address
              <input
                value={form.clientSnapshot.address}
                onChange={(e) => setForm({
                  ...form,
                  clientSnapshot: { ...form.clientSnapshot, address: e.target.value },
                })}
              />
            </label>

            <div className="form-row">
              <label>
                Client phone
                <input
                  value={form.clientSnapshot.phone}
                  onChange={(e) => setForm({
                    ...form,
                    clientSnapshot: { ...form.clientSnapshot, phone: e.target.value },
                  })}
                />
              </label>
              <label>
                Client email
                <input
                  type="email"
                  value={form.clientSnapshot.email}
                  onChange={(e) => setForm({
                    ...form,
                    clientSnapshot: { ...form.clientSnapshot, email: e.target.value },
                  })}
                />
              </label>
            </div>

            <div className="form-row">
              <label>
                Client GSTIN
                <input
                  value={form.clientSnapshot.gstin}
                  onChange={(e) => setForm({
                    ...form,
                    clientSnapshot: { ...form.clientSnapshot, gstin: e.target.value.toUpperCase() },
                  })}
                />
              </label>
              <label>
                Place of supply
                <input
                  value={form.placeOfSupply}
                  onChange={(e) => setForm({ ...form, placeOfSupply: e.target.value })}
                  placeholder="e.g. Tamil Nadu"
                />
              </label>
            </div>

            <div className="form-row">
              <label>
                Issue date
                <input
                  type="date"
                  required
                  value={form.issueDate}
                  onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
                />
              </label>
              <label>
                Valid until
                <input
                  type="date"
                  value={form.validUntil}
                  onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                />
              </label>
            </div>

            <label>
              Tax mode
              <select
                value={form.taxMode}
                onChange={(e) => setForm({ ...form, taxMode: e.target.value })}
              >
                <option value="cgst_sgst">CGST + SGST (intra-state)</option>
                <option value="igst">IGST (inter-state)</option>
              </select>
            </label>

            <div className="quote-line-items">
              <div className="quote-line-head">
                <h4>Line items</h4>
                <button type="button" className="btn btn-secondary" onClick={addItem}>Add row</button>
              </div>
              {form.items.map((row, index) => (
                <div key={index} className="quote-line-row">
                  <label className="quote-line-desc">
                    Description
                    <input
                      required
                      value={row.description}
                      onChange={(e) => updateItem(index, { description: e.target.value })}
                      placeholder="Website development / React frontend / AMC"
                    />
                  </label>
                  <label>
                    Type
                    <select
                      value={row.itemType}
                      onChange={(e) => updateItem(index, { itemType: e.target.value })}
                    >
                      <option value="service">Service</option>
                      <option value="license">License</option>
                      <option value="amc">AMC</option>
                      <option value="hosting">Hosting</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <label>
                    HSN/SAC
                    <input
                      value={row.hsnSac}
                      onChange={(e) => updateItem(index, { hsnSac: e.target.value })}
                    />
                  </label>
                  <label>
                    Qty
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.qty}
                      onChange={(e) => updateItem(index, { qty: e.target.value })}
                    />
                  </label>
                  <label>
                    Unit
                    <select
                      value={row.unit}
                      onChange={(e) => updateItem(index, { unit: e.target.value })}
                    >
                      <option value="nos">Nos</option>
                      <option value="hours">Hours</option>
                      <option value="days">Days</option>
                      <option value="months">Months</option>
                      <option value="years">Years</option>
                    </select>
                  </label>
                  <label>
                    Rate (₹)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.rate}
                      onChange={(e) => updateItem(index, { rate: e.target.value })}
                    />
                  </label>
                  <label>
                    GST %
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={row.gstPercent}
                      onChange={(e) => updateItem(index, { gstPercent: e.target.value })}
                    />
                  </label>
                  <div className="quote-line-amount">
                    <span>Amount</span>
                    <strong>{formatInr((Number(row.qty) || 0) * (Number(row.rate) || 0))}</strong>
                    {form.items.length > 1 && (
                      <button type="button" className="btn btn-danger" onClick={() => removeItem(index)}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="quote-live-totals">
              <div><span>Taxable</span><strong>{formatInr(liveTotals.subtotal)}</strong></div>
              {form.taxMode === 'igst' ? (
                <div><span>IGST</span><strong>{formatInr(liveTotals.igstAmount)}</strong></div>
              ) : (
                <>
                  <div><span>CGST</span><strong>{formatInr(liveTotals.cgstAmount)}</strong></div>
                  <div><span>SGST</span><strong>{formatInr(liveTotals.sgstAmount)}</strong></div>
                </>
              )}
              <div className="quote-grand"><span>Grand Total</span><strong>{formatInr(liveTotals.grandTotal)}</strong></div>
            </div>

            <label>
              Payment terms
              <input
                value={form.paymentTerms}
                onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}
              />
            </label>
            <label>
              Terms & conditions
              <textarea
                rows={5}
                value={form.termsAndConditions}
                onChange={(e) => setForm({ ...form, termsAndConditions: e.target.value })}
              />
            </label>
            <label>
              Notes
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </label>

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                {editing ? 'Save quotation' : 'Create quotation'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
