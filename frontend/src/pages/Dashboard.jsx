import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useNetwork } from '../context/NetworkContext';
import { refreshNetworkSpeed, startNetworkSpeedMonitor, stopNetworkSpeedMonitor } from '../network/networkSpeed';
import { formatCurrency, formatDate, fullName, titleCase } from '../utils';

const DASHBOARD_CACHE_KEY = 'crm_dashboard_cache_v1';
const SHOW_SPEED_KEY = 'crm_dashboard_show_speed';

function readCachedDashboard() {
  try {
    const raw = sessionStorage.getItem(DASHBOARD_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.data || !parsed?.at) return null;
    if (Date.now() - parsed.at > 60_000) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCachedDashboard(data) {
  try {
    sessionStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // ignore quota errors
  }
}

function qualityLabel(quality) {
  switch (quality) {
    case 'excellent':
      return 'Excellent';
    case 'good':
      return 'Good';
    case 'fair':
      return 'Fair';
    case 'slow':
      return 'Slow';
    case 'offline':
      return 'Offline';
    default:
      return 'Measuring…';
  }
}

function formatMbps(value) {
  if (value == null || Number.isNaN(value)) return '—';
  if (value >= 100) return `${Math.round(value)} Mbps`;
  if (value >= 10) return `${value.toFixed(1)} Mbps`;
  return `${value.toFixed(2)} Mbps`;
}

function DashboardSkeleton() {
  return (
    <div className="stats-grid" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="stat-card skeleton-card">
          <span className="skeleton-line short" />
          <strong className="skeleton-line" />
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { online, slow, avgRttMs, speed } = useNetwork();
  const [data, setData] = useState(() => readCachedDashboard());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!data);
  const [showSpeed, setShowSpeed] = useState(() => {
    try {
      const saved = localStorage.getItem(SHOW_SPEED_KEY);
      return saved == null ? true : saved === '1';
    } catch {
      return true;
    }
  });
  const [testingSpeed, setTestingSpeed] = useState(false);

  const loadDashboard = useCallback(() => {
    setLoading(true);
    setError('');
    return api.getDashboard()
      .then((payload) => {
        setData(payload);
        writeCachedDashboard(payload);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!showSpeed) {
      stopNetworkSpeedMonitor();
      return undefined;
    }
    return startNetworkSpeedMonitor();
  }, [showSpeed]);

  const toggleSpeed = () => {
    setShowSpeed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SHOW_SPEED_KEY, next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  };

  const runSpeedTest = async () => {
    setTestingSpeed(true);
    try {
      await refreshNetworkSpeed();
    } finally {
      setTestingSpeed(false);
    }
  };

  const latency = speed.latencyMs ?? avgRttMs;
  const speedMeta = useMemo(() => {
    const parts = [];
    if (speed.effectiveType) parts.push(String(speed.effectiveType).toUpperCase());
    if (latency != null) parts.push(`${latency} ms`);
    if (!online) parts.push('offline');
    else if (slow) parts.push('slow requests');
    return parts.join(' · ') || 'Live probe';
  }, [speed.effectiveType, latency, online, slow]);

  if (error && !data) {
    return (
      <div className="panel">
        <div className="error-banner">{error}</div>
        <button type="button" className="btn btn-primary" onClick={loadDashboard} style={{ marginTop: 12 }}>
          Retry
        </button>
      </div>
    );
  }

  const totals = data?.totals;
  const dealsByStage = data?.dealsByStage || {};
  const tasksByStatus = data?.tasksByStatus || {};
  const contactsByStatus = data?.contactsByStatus || {};
  const upcomingTasks = data?.upcomingTasks || [];
  const stageMax = Math.max(...Object.values(dealsByStage || { 0: 1 }), 1);

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Dashboard</h2>
          <p>Overview of your pipeline and activity</p>
        </div>
        <div className="page-header-actions">
          <label className="toggle-option">
            <input type="checkbox" checked={showSpeed} onChange={toggleSpeed} />
            <span>Network speed</span>
          </label>
          <Link className="btn btn-secondary" to="/analytics">Open Analytics</Link>
        </div>
      </div>

      {showSpeed && (
        <section className={`panel network-speed-panel quality-${speed.quality || 'unknown'}`}>
          <div className="network-speed-head">
            <div>
              <h3>Network speed</h3>
              <p>{speedMeta}</p>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={runSpeedTest}
              disabled={!online || testingSpeed || speed.measuring}
            >
              {testingSpeed || speed.measuring ? 'Testing…' : 'Test again'}
            </button>
          </div>
          <div className="network-speed-grid">
            <div className="network-speed-metric">
              <span>Download</span>
              <strong>{formatMbps(speed.downlinkMbps)}</strong>
            </div>
            <div className="network-speed-metric">
              <span>Latency</span>
              <strong>{latency != null ? `${latency} ms` : '—'}</strong>
            </div>
            <div className="network-speed-metric">
              <span>Quality</span>
              <strong className={`quality-pill quality-${speed.quality || 'unknown'}`}>
                {qualityLabel(online ? speed.quality : 'offline')}
              </strong>
            </div>
          </div>
        </section>
      )}

      {loading && !data ? (
        <DashboardSkeleton />
      ) : (
        <div className={`stats-grid${loading ? ' is-refreshing' : ''}`}>
          <div className="stat-card"><span>Contacts</span><strong>{totals?.contacts ?? '—'}</strong></div>
          <div className="stat-card"><span>Active Deals</span><strong>{totals?.deals ?? '—'}</strong></div>
          <div className="stat-card"><span>Open Tasks</span><strong>{totals?.tasks ?? '—'}</strong></div>
          <div className="stat-card"><span>Pipeline Value</span><strong>{formatCurrency(totals?.pipelineValue || 0)}</strong></div>
          <div className="stat-card"><span>Won Revenue</span><strong>{formatCurrency(totals?.wonValue || 0)}</strong></div>
          {showSpeed && (
            <div className="stat-card network-stat-card">
              <span>Network</span>
              <strong>{formatMbps(speed.downlinkMbps)}</strong>
              <em>{qualityLabel(online ? speed.quality : 'offline')}</em>
            </div>
          )}
        </div>
      )}

      {error && data && (
        <div className="error-banner" style={{ marginBottom: 16 }}>
          {error}
          <button type="button" className="btn btn-secondary" onClick={loadDashboard} style={{ marginLeft: 12 }}>
            Retry
          </button>
        </div>
      )}

      {data && (
        <div className="panel-grid">
          <section className="panel">
            <h3>Sales Pipeline Chart</h3>
            {Object.keys(dealsByStage).length === 0 ? (
              <p className="empty-state">No deals yet</p>
            ) : (
              <div className="chart-bars">
                {Object.entries(dealsByStage).map(([stage, count]) => (
                  <div key={stage} className="chart-row">
                    <span className="chart-label">{titleCase(stage)}</span>
                    <div className="chart-track">
                      <div className="chart-fill" style={{ width: `${(count / stageMax) * 100}%` }} />
                    </div>
                    <strong className="chart-value">{count}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <h3>Tasks by Status</h3>
            {Object.keys(tasksByStatus).length === 0 ? (
              <p className="empty-state">No tasks yet</p>
            ) : (
              Object.entries(tasksByStatus).map(([status, count]) => (
                <div key={status} className="list-item">
                  <span>{titleCase(status)}</span>
                  <strong>{count}</strong>
                </div>
              ))
            )}
          </section>

          <section className="panel">
            <h3>Contacts by Status</h3>
            {Object.keys(contactsByStatus).length === 0 ? (
              <p className="empty-state">No contacts yet</p>
            ) : (
              Object.entries(contactsByStatus).map(([status, count]) => (
                <div key={status} className="list-item">
                  <span>{titleCase(status)}</span>
                  <strong>{count}</strong>
                </div>
              ))
            )}
          </section>

          <section className="panel">
            <h3>Upcoming Tasks</h3>
            {upcomingTasks.length === 0 ? (
              <p className="empty-state">No upcoming tasks</p>
            ) : (
              upcomingTasks.map((task) => (
                <div key={task._id} className="list-item">
                  <div>
                    <strong>{task.title}</strong>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {fullName(task.contact)} · {formatDate(task.dueDate)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </section>
        </div>
      )}
    </>
  );
}
