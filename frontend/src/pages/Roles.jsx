import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import Modal from '../components/Modal';

const emptyForm = {
  name: '',
  description: '',
  permissions: [],
};

export default function Roles() {
  const [roles, setRoles] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const groups = useMemo(() => {
    return catalog.reduce((acc, item) => {
      if (!acc[item.group]) acc[item.group] = [];
      acc[item.group].push(item);
      return acc;
    }, {});
  }, [catalog]);

  const load = async () => {
    try {
      const [rolesData, permissionsData] = await Promise.all([
        api.getRoles(),
        api.getPermissionsCatalog(),
      ]);
      setRoles(rolesData);
      setCatalog(permissionsData);
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

  const openEdit = (role) => {
    setEditing(role);
    setForm({
      name: role.name,
      description: role.description || '',
      permissions: [...(role.permissions || [])],
    });
    setModalOpen(true);
  };

  const togglePermission = (key) => {
    setForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(key)
        ? prev.permissions.filter((p) => p !== key)
        : [...prev.permissions, key],
    }));
  };

  const toggleGroup = (groupKeys) => {
    const allSelected = groupKeys.every((k) => form.permissions.includes(k));
    setForm((prev) => ({
      ...prev,
      permissions: allSelected
        ? prev.permissions.filter((p) => !groupKeys.includes(p))
        : [...new Set([...prev.permissions, ...groupKeys])],
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      if (editing) {
        await api.updateRole(editing._id, form);
      } else {
        await api.createRole(form);
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (role) => {
    if (!window.confirm(`Delete role "${role.name}"?`)) return;
    try {
      await api.deleteRole(role._id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Roles</h2>
          <p>Create roles and choose which features each role can use</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>Add Role</button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Role</th>
              <th>Description</th>
              <th>Permissions</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role._id}>
                <td>
                  <strong>{role.name}</strong>
                  {role.isSystem && <span className="badge badge-customer" style={{ marginLeft: 8 }}>System</span>}
                </td>
                <td>{role.description || '—'}</td>
                <td>{role.isSystem ? 'All permissions' : `${role.permissions?.length || 0} features`}</td>
                <td>
                  <div className="actions">
                    {!role.isSystem && (
                      <>
                        <button className="btn btn-secondary" onClick={() => openEdit(role)}>Edit</button>
                        <button className="btn btn-danger" onClick={() => handleDelete(role)}>Delete</button>
                      </>
                    )}
                    {role.isSystem && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Locked</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <Modal title={editing ? 'Edit Role' : 'Create Role'} onClose={() => setModalOpen(false)}>
          <form onSubmit={handleSubmit} className="form-grid">
            <label>
              Role name
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              Description
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>

            <div className="permissions-panel">
              <strong>Feature permissions</strong>
              <p className="permissions-hint">Enable only the features this role should access</p>
              {Object.entries(groups).map(([group, items]) => {
                const keys = items.map((i) => i.key);
                const allSelected = keys.every((k) => form.permissions.includes(k));
                return (
                  <div key={group} className="permission-group">
                    <label className="permission-group-title">
                      <input type="checkbox" checked={allSelected} onChange={() => toggleGroup(keys)} />
                      {group}
                    </label>
                    <div className="permission-list">
                      {items.map((item) => (
                        <label key={item.key} className="permission-item">
                          <input
                            type="checkbox"
                            checked={form.permissions.includes(item.key)}
                            onChange={() => togglePermission(item.key)}
                          />
                          {item.label}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

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
