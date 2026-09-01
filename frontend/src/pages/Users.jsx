import { useEffect, useState } from 'react';
import { api } from '../api';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import PasswordInput from '../components/PasswordInput';

const emptyForm = {
  name: '',
  email: '',
  password: '',
  roleId: '',
  isActive: true,
};

function generatePassword(length = 10) {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export default function Users() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [passwordModal, setPasswordModal] = useState(null);
  const [passwordForm, setPasswordForm] = useState({ newPassword: '', showInfo: '' });
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    try {
      const [usersData, rolesData] = await Promise.all([api.getUsers(), api.getRoles()]);
      setUsers(usersData);
      setRoles(rolesData);
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
      roleId: roles.find((r) => r.name === 'Sales')?._id || roles[0]?._id || '',
    });
    setModalOpen(true);
  };

  const openEdit = (user) => {
    setEditing(user);
    setForm({
      name: user.name,
      email: user.email,
      password: '',
      roleId: user.role?._id || user.role?.id || '',
      isActive: user.isActive,
    });
    setModalOpen(true);
  };

  const openPasswordModal = async (user) => {
    setError('');
    setMessage('');
    try {
      const info = await api.getUserPasswordInfo(user.id || user._id);
      setPasswordModal(user);
      setPasswordForm({
        newPassword: '',
        showInfo: info.message,
      });
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      const payload = {
        name: form.name,
        email: form.email,
        roleId: form.roleId,
        isActive: form.isActive,
      };
      if (form.password) payload.password = form.password;

      if (editing) {
        await api.updateUser(editing.id || editing._id, payload);
      } else {
        await api.createUser({ ...payload, password: form.password });
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handlePasswordChange = async (event) => {
    event.preventDefault();
    if (!passwordModal) return;
    try {
      const result = await api.adminChangeUserPassword(passwordModal.id || passwordModal._id, {
        newPassword: passwordForm.newPassword,
      });
      setMessage(`${result.message}. New password: ${result.newPassword}`);
      setPasswordModal(null);
      setPasswordForm({ newPassword: '', showInfo: '' });
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (user) => {
    if (!window.confirm(`Delete user "${user.name}"?`)) return;
    try {
      await api.deleteUser(user.id || user._id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const forceLogoutUser = async (user) => {
    if (!window.confirm(`Force logout "${user.name}" from all devices?`)) return;
    try {
      const result = await api.forceLogoutUser(user.id || user._id);
      setMessage(result.message);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Users</h2>
          <p>Manage users, passwords, roles, and force logout</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>Add User</button>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {message && <div className="success-banner">{message}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Password</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id || user._id}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>{user.role?.name || '—'}</td>
                <td>
                  <span className="password-mask">••••••••</span>
                  <span className="panel-note" style={{ display: 'block', fontSize: '0.72rem' }}>Encrypted</span>
                </td>
                <td>
                  <Badge value={user.isActive ? 'customer' : 'inactive'} />
                  <span style={{ marginLeft: 8 }}>{user.isActive ? 'Active' : 'Inactive'}</span>
                </td>
                <td>
                  <div className="actions">
                    <button type="button" className="btn btn-secondary" onClick={() => openEdit(user)}>Edit</button>
                    <button type="button" className="btn btn-secondary" onClick={() => openPasswordModal(user)}>Change password</button>
                    <button type="button" className="btn btn-secondary" onClick={() => forceLogoutUser(user)}>Force logout</button>
                    <button type="button" className="btn btn-danger" onClick={() => handleDelete(user)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <Modal title={editing ? 'Edit User' : 'Add User'} onClose={() => setModalOpen(false)}>
          <form onSubmit={handleSubmit} className="form-grid">
            <label>
              Name
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              Email
              <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label>
              {editing ? 'New password (optional)' : 'Password'}
              <PasswordInput
                required={!editing}
                minLength={6}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="new-password"
              />
            </label>
            <label>
              Role
              <select required value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })}>
                <option value="">Select role</option>
                {roles.map((role) => (
                  <option key={role._id} value={role._id}>{role.name}</option>
                ))}
              </select>
            </label>
            <label className="permission-item">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              Active account
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">{editing ? 'Save' : 'Create'}</button>
            </div>
          </form>
        </Modal>
      )}

      {passwordModal && (
        <Modal title={`Change password — ${passwordModal.name}`} onClose={() => setPasswordModal(null)}>
          <form onSubmit={handlePasswordChange} className="form-grid">
            <p className="panel-note">{passwordForm.showInfo}</p>
            <label>
              New password
              <PasswordInput
                required
                minLength={6}
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                autoComplete="new-password"
              />
            </label>
            <div className="modal-actions" style={{ gridColumn: '1 / -1' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setPasswordForm({ ...passwordForm, newPassword: generatePassword() })}
              >
                Generate password
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setPasswordModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Set new password</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
