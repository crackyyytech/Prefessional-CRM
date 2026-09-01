import { useEffect, useState } from 'react';
import { api } from '../api';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils';

const emptyForm = {
  studentName: '',
  email: '',
  college: '',
  internshipRole: '',
  duration: '',
  startDate: new Date().toISOString().slice(0, 10),
  notes: '',
};

export default function Internships() {
  const { can } = useAuth();
  const [internships, setInternships] = useState([]);
  const [roles, setRoles] = useState([]);
  const [durations, setDurations] = useState([]);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [list, meta] = await Promise.all([
        api.getInternships(),
        api.getInternshipMeta(),
      ]);
      setInternships(list);
      setRoles(meta.roles || []);
      setDurations(meta.durations || []);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...emptyForm,
      internshipRole: roles[0] || '',
      duration: durations[0] || '',
      startDate: new Date().toISOString().slice(0, 10),
    });
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      studentName: item.studentName || '',
      email: item.email || '',
      college: item.college || '',
      internshipRole: item.internshipRole || '',
      duration: item.duration || '',
      startDate: item.startDate ? item.startDate.slice(0, 10) : '',
      notes: item.notes || '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await api.updateInternship(editing._id, form);
      } else {
        await api.createInternship(form);
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this internship record?')) return;
    try {
      await api.deleteInternship(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCertificate = async (item) => {
    try {
      const blob = await api.downloadInternshipCertificate(item._id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Vistawin-Internship-${item.certificateId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Internships</h2>
          <p>Add students, select role & duration, then generate a professional certificate</p>
        </div>
        {can('internships:create') && (
          <button className="btn btn-primary" onClick={openCreate}>Add Internship</button>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Role</th>
              <th>Duration</th>
              <th>Period</th>
              <th>Certificate ID</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {internships.length === 0 ? (
              <tr>
                <td colSpan="6">
                  <div className="empty-state">No internships yet. Add a student to generate a certificate.</div>
                </td>
              </tr>
            ) : (
              internships.map((item) => (
                <tr key={item._id}>
                  <td>
                    <strong>{item.studentName}</strong>
                    {item.email && (
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{item.email}</div>
                    )}
                  </td>
                  <td>{item.internshipRole}</td>
                  <td>{item.duration}</td>
                  <td>{formatDate(item.startDate)} – {formatDate(item.endDate)}</td>
                  <td>{item.certificateId}</td>
                  <td>
                    <div className="actions">
                      <button className="btn btn-primary" onClick={() => handleCertificate(item)}>
                        Certificate
                      </button>
                      {can('internships:update') && (
                        <button className="btn btn-secondary" onClick={() => openEdit(item)}>Edit</button>
                      )}
                      {can('internships:delete') && (
                        <button className="btn btn-danger" onClick={() => handleDelete(item._id)}>Delete</button>
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
        <Modal
          title={editing ? 'Edit Internship' : 'Add Internship'}
          onClose={() => !saving && setModalOpen(false)}
        >
          <form onSubmit={handleSubmit} className="form-grid">
            <label>
              Student name
              <input
                required
                value={form.studentName}
                onChange={(e) => setForm({ ...form, studentName: e.target.value })}
                placeholder="Enter full student name"
              />
            </label>

            <label>
              Email (optional)
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>

            <label>
              College / Institution (optional)
              <input
                value={form.college}
                onChange={(e) => setForm({ ...form, college: e.target.value })}
                placeholder="Appears on the certificate"
              />
            </label>

            <div className="form-row">
              <label>
                Internship role
                <select
                  required
                  value={form.internshipRole}
                  onChange={(e) => setForm({ ...form, internshipRole: e.target.value })}
                >
                  <option value="">Select role</option>
                  {roles.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </label>
              <label>
                Duration
                <select
                  required
                  value={form.duration}
                  onChange={(e) => setForm({ ...form, duration: e.target.value })}
                >
                  <option value="">Select duration</option>
                  {durations.map((duration) => (
                    <option key={duration} value={duration}>{duration}</option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              Start date
              <input
                type="date"
                required
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </label>

            <label>
              Performance remarks (optional)
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Shown on the certificate. Leave blank for standard professional text."
              />
            </label>

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : editing ? 'Save' : 'Create & ready certificate'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
