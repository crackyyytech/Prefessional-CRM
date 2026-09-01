import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { formatDateTime } from '../utils';

function ScoreBadge({ score }) {
  if (score == null) return <span className="panel-note">—</span>;
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
  return <strong style={{ color }}>{score}</strong>;
}

export default function SecurityHub() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getSecurityHubOverview()
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (!data) return <p className="panel-note">Loading security overview…</p>;

  const { modules, totals, recentActivity } = data;

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Security Hub</h2>
          <p>Central overview of all cybersecurity tools — scores, activity, and quick access</p>
        </div>
      </div>

      <div className="stats-grid sechub-stats">
        <div className="stat-card">
          <span>Active modules</span>
          <strong>{totals.modules}</strong>
        </div>
        <div className="stat-card">
          <span>Completed scans</span>
          <strong>{totals.completedScans}</strong>
        </div>
        <div className="stat-card">
          <span>Average score</span>
          <strong>{totals.avgScore != null ? `${totals.avgScore}/100` : '—'}</strong>
        </div>
      </div>

      <section className="panel" style={{ marginTop: 20 }}>
        <h3>Security modules</h3>
        <div className="sechub-module-grid">
          {modules.map((mod) => (
            <Link key={mod.id} to={mod.route} className="sechub-module-card">
              <div className="sechub-module-head">
                <strong>{mod.label}</strong>
                <ScoreBadge score={mod.lastScore} />
              </div>
              <p className="panel-note">{mod.completedCount} completed</p>
              {mod.lastTarget && (
                <p className="panel-note sechub-target">{mod.lastTarget}</p>
              )}
              {mod.lastAt && (
                <p className="panel-note">Last: {formatDateTime(mod.lastAt)}</p>
              )}
            </Link>
          ))}
        </div>
      </section>

      <section className="panel" style={{ marginTop: 20 }}>
        <h3>Recent activity</h3>
        {recentActivity.length === 0 ? (
          <p className="empty-state">No security activity yet. Run a scan from any module below.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Module</th>
                  <th>Name</th>
                  <th>Target</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {recentActivity.map((item, idx) => (
                  <tr key={`${item.moduleId}-${idx}`}>
                    <td>
                      <Link to={item.route}>{item.moduleLabel}</Link>
                    </td>
                    <td>{item.name || '—'}</td>
                    <td className="loadtest-url-cell">{item.target || '—'}</td>
                    <td>{item.status}</td>
                    <td><ScoreBadge score={item.score} /></td>
                    <td>{formatDateTime(item.createdAt)}</td>
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
