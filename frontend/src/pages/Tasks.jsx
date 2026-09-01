import { useEffect, useState } from 'react';
import { api } from '../api';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { formatDate, fullName } from '../utils';

const emptyForm = {
  title: '',
  description: '',
  dueDate: '',
  priority: 'medium',
  status: 'pending',
  contact: '',
  deal: '',
};

export default function Tasks() {
  const { can } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [deals, setDeals] = useState([]);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    try {
      const requests = [api.getTasks()];
      requests.push(can('contacts:view') ? api.getContacts() : Promise.resolve([]));
      requests.push(can('deals:view') ? api.getDeals() : Promise.resolve([]));
      const [tasksData, contactsData, dealsData] = await Promise.all(requests);
      setTasks(tasksData);
      setContacts(Array.isArray(contactsData) ? contactsData : contactsData?.items || []);
      setDeals(dealsData);
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

  const openEdit = (task) => {
    setEditing(task);
    setForm({
      title: task.title || '',
      description: task.description || '',
      dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
      priority: task.priority || 'medium',
      status: task.status || 'pending',
      contact: task.contact?._id || task.contact || '',
      deal: task.deal?._id || task.deal || '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      const payload = {
        ...form,
        dueDate: form.dueDate || undefined,
        contact: form.contact || undefined,
        deal: form.deal || undefined,
      };
      if (editing) {
        await api.updateTask(editing._id, payload);
      } else {
        await api.createTask(payload);
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this task?')) return;
    try {
      await api.deleteTask(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Tasks</h2>
          <p>Follow-ups, calls, and to-dos linked to your CRM</p>
        </div>
        {can('tasks:create') && (
          <button className="btn btn-primary" onClick={openCreate}>Add Task</button>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Contact</th>
              <th>Deal</th>
              <th>Due</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr>
                <td colSpan="7">
                  <div className="empty-state">No tasks yet. Add your first follow-up.</div>
                </td>
              </tr>
            ) : (
              tasks.map((task) => (
                <tr key={task._id}>
                  <td>{task.title}</td>
                  <td>{fullName(task.contact)}</td>
                  <td>{task.deal?.title || '—'}</td>
                  <td>{formatDate(task.dueDate)}</td>
                  <td><Badge value={task.priority} /></td>
                  <td><Badge value={task.status} /></td>
                  <td>
                    <div className="actions">
                      {can('tasks:update') && (
                        <button className="btn btn-secondary" onClick={() => openEdit(task)}>Edit</button>
                      )}
                      {can('tasks:delete') && (
                        <button className="btn btn-danger" onClick={() => handleDelete(task._id)}>Delete</button>
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
        <Modal title={editing ? 'Edit Task' : 'Add Task'} onClose={() => setModalOpen(false)}>
          <form onSubmit={handleSubmit} className="form-grid">
            <label>
              Title
              <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label>
              Description
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <div className="form-row">
              <label>
                Due date
                <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </label>
              <label>
                Priority
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
            </div>
            <div className="form-row">
              <label>
                Status
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
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
            </div>
            <label>
              Deal
              <select value={form.deal} onChange={(e) => setForm({ ...form, deal: e.target.value })}>
                <option value="">None</option>
                {deals.map((deal) => (
                  <option key={deal._id} value={deal._id}>{deal.title}</option>
                ))}
              </select>
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
