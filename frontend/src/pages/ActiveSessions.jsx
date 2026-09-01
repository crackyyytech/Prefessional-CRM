import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils';

function parseDevice(ua = '') {
  if (/mobile/i.test(ua)) return 'Mobile';
  if (/windows/i.test(ua)) return 'Windows';
  if (/mac/i.test(ua)) return 'Mac';
  if (/linux/i.test(ua)) return 'Linux';
  return 'Browser';
}

export default function ActiveSessions() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');

  const load = () => {
    api.getActiveSessions()
      .then(setSessions)
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, []);

  const logoutSession = async (sessionId) => {
    if (!window.confirm('Force logout this session? The user will be signed out automatically.')) return;
    setBusy(sessionId);
    setError('');
    try {
      const result = await api.forceLogoutSession(sessionId);
      setMessage(result.message);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const onlineCount = sessions.filter((s) => s.isOnline).length;
  const uniqueUsers = new Set(sessions.map((s) => s.user?.id)).size;

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Active Sessions</h2>
          <p>Original login only — one session per user per device, duplicates auto-removed</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={load}>Refresh</button>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {message && <div className="success-banner">{message}</div>}

      <div className="lead-analysis-grid session-stats">
        <div className="lead-analysis-card">
          <span>Original sessions</span>
          <strong>{sessions.length}</strong>
        </div>
        <div className="lead-analysis-card">
          <span>Online now</span>
          <strong>{onlineCount}</strong>
        </div>
        <div className="lead-analysis-card">
          <span>Unique users</span>
          <strong>{uniqueUsers}</strong>
        </div>
      </div>

      <section className="panel">
        <h3>Logged-in users (original sessions only)</h3>
        {sessions.length === 0 ? (
          <p className="empty-state">No active login sessions.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>User</th>
                  <th>Device</th>
                  <th>IP</th>
                  <th>Login time</th>
                  <th>Last active</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className={`session-status ${row.isOnline ? 'online' : 'idle'}`}>
                        {row.isOnline ? 'Online' : 'Idle'}
                      </span>
                    </td>
                    <td>
                      <strong>{row.user?.name || '—'}</strong>
                      <div className="panel-note">{row.user?.email}</div>
                      {row.isOriginal && (
                        <span className="original-badge" style={{ marginTop: 4, display: 'inline-block' }}>Original</span>
                      )}
                    </td>
                    <td>{parseDevice(row.userAgent)}</td>
                    <td>{row.ipAddress || '—'}</td>
                    <td>{formatDate(row.loginAt)}</td>
                    <td>{formatDate(row.lastActiveAt)}</td>
                    <td>
                      <div className="actions">
                        <button
                          type="button"
                          className="btn btn-danger"
                          disabled={busy === row.id || row.user?.id === user?.id}
                          onClick={() => logoutSession(row.id)}
                        >
                          {busy === row.id ? 'Logging out…' : 'Force logout'}
                        </button>
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
