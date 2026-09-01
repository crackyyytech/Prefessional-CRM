import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { formatDate, fullName } from '../utils';

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Documents() {
  const { can } = useAuth();
  const fileInputRef = useRef(null);
  const [documents, setDocuments] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [deals, setDeals] = useState([]);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [form, setForm] = useState({
    file: null,
    description: '',
    contact: '',
    deal: '',
  });

  const load = async () => {
    try {
      const requests = [api.getDocuments()];
      if (can('contacts:view')) requests.push(api.getContacts());
      else requests.push(Promise.resolve([]));
      if (can('deals:view')) requests.push(api.getDeals());
      else requests.push(Promise.resolve([]));

      const [docsData, contactsData, dealsData] = await Promise.all(requests);
      setDocuments(docsData);
      setContacts(contactsData);
      setDeals(dealsData);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openUpload = () => {
    setForm({ file: null, description: '', contact: '', deal: '' });
    setModalOpen(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.file) {
      setError('Please choose a file to upload');
      return;
    }

    const data = new FormData();
    data.append('file', form.file);
    if (form.description) data.append('description', form.description);
    if (form.contact) data.append('contact', form.contact);
    if (form.deal) data.append('deal', form.deal);

    setUploading(true);
    setError('');
    try {
      await api.uploadDocument(data);
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc) => {
    try {
      const blob = await api.downloadDocument(doc._id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.originalName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this document?')) return;
    try {
      await api.deleteDocument(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const setFile = (file) => {
    if (!file) return;
    setForm((prev) => ({ ...prev, file }));
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Documents</h2>
          <p>Upload and manage files linked to contacts or deals</p>
        </div>
        {can('documents:create') && (
          <button className="btn btn-primary" onClick={openUpload}>Upload Document</button>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>File</th>
              <th>Size</th>
              <th>Contact</th>
              <th>Deal</th>
              <th>Uploaded by</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {documents.length === 0 ? (
              <tr>
                <td colSpan="7">
                  <div className="empty-state">No documents yet. Upload your first file.</div>
                </td>
              </tr>
            ) : (
              documents.map((doc) => (
                <tr key={doc._id}>
                  <td>
                    <strong>{doc.originalName}</strong>
                    {doc.description && (
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{doc.description}</div>
                    )}
                  </td>
                  <td>{formatSize(doc.size)}</td>
                  <td>{fullName(doc.contact)}</td>
                  <td>{doc.deal?.title || '—'}</td>
                  <td>{doc.uploadedBy?.name || '—'}</td>
                  <td>{formatDate(doc.createdAt)}</td>
                  <td>
                    <div className="actions">
                      <button className="btn btn-secondary" onClick={() => handleDownload(doc)}>Download</button>
                      {can('documents:delete') && (
                        <button className="btn btn-danger" onClick={() => handleDelete(doc._id)}>Delete</button>
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
        <Modal title="Upload Document" onClose={() => !uploading && setModalOpen(false)}>
          <form onSubmit={handleSubmit} className="form-grid">
            <div
              className={`upload-dropzone${dragOver ? ' drag-over' : ''}${form.file ? ' has-file' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                setFile(e.dataTransfer.files?.[0]);
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                hidden
                onChange={(e) => setFile(e.target.files?.[0])}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.png,.jpg,.jpeg,.gif,.webp"
              />
              {form.file ? (
                <>
                  <strong>{form.file.name}</strong>
                  <span>{formatSize(form.file.size)} — click to change</span>
                </>
              ) : (
                <>
                  <strong>Drop a file here</strong>
                  <span>or click to browse (max 10 MB)</span>
                  <span className="upload-types">PDF, Word, Excel, text, CSV, images</span>
                </>
              )}
            </div>

            <label>
              Description
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional note"
              />
            </label>

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
                Deal
                <select value={form.deal} onChange={(e) => setForm({ ...form, deal: e.target.value })}>
                  <option value="">None</option>
                  {deals.map((deal) => (
                    <option key={deal._id} value={deal._id}>{deal.title}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" disabled={uploading} onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={uploading || !form.file}>
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
