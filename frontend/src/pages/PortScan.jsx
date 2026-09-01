import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../utils';

function ScoreRing({ score, grade }) {
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <div className="security-score-ring" style={{ borderColor: color }}>
      <strong style={{ color }}>{score ?? 0}</strong>
      <span>Grade {grade || 'F'}</span>
    </div>
  );
}

function SeverityBadge({ severity }) {
  return <span className={`security-severity security-severity-${severity}`}>{severity}</span>;
}

function ScanReport({ scan }) {
  const report = scan.report || {};
  const findings = (report.findings || []).filter((f) => f.severity !== 'pass');

  return (
    <div className="security-report">
      <div className="loadtest-report-head">
        <div>
          <h3>{scan.name || 'Port scan'}</h3>
          <p className="panel-note">{scan.targetHost}</p>
          <p className="panel-note">{formatDateTime(scan.finishedAt)}</p>
        </div>
        <ScoreRing score={report.securityScore} grade={report.grade} />
      </div>

      <div className="stats-grid">
        <div className="stat-card"><span>Ports scanned</span><strong>{report.portsScanned ?? 0}</strong></div>
        <div className="stat-card"><span>Open ports</span><strong>{report.openPortCount ?? 0}</strong></div>
        <div className="stat-card"><span>Closed</span><strong>{report.closedCount ?? 0}</strong></div>
        <div className="stat-card"><span>Critical</span><strong>{report.summary?.critical ?? 0}</strong></div>
        <div className="stat-card"><span>High</span><strong>{report.summary?.high ?? 0}</strong></div>
      </div>

      {(report.openPorts || []).length > 0 && (
        <section className="panel">
          <h3>Open ports</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Port</th>
                  <th>Service</th>
                  <th>Risk</th>
                  <th>Latency</th>
                </tr>
              </thead>
              <tbody>
                {report.openPorts.map((p) => (
                  <tr key={p.port}>
                    <td>{p.port}</td>
                    <td>{p.service}</td>
                    <td><SeverityBadge severity={p.risk === 'critical' ? 'critical' : p.risk === 'high' ? 'high' : 'medium'} /></td>
                    <td>{p.latencyMs} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel">
        <h3>Findings</h3>
        {findings.length === 0 ? (
          <p className="empty-state">No significant exposure detected.</p>
        ) : (
          <div className="security-findings">
            {findings.map((f) => (
              <div key={f.id} className="security-finding">
                <div className="security-finding-head">
                  <SeverityBadge severity={f.severity} />
                  <strong>{f.title}</strong>
                </div>
                {f.detail && <p>{f.detail}</p>}
                {f.recommendation && <p className="panel-note">→ {f.recommendation}</p>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function PortScan() {
  const { can } = useAuth();
  const [scans, setScans] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [scanning, setScanning] = useState(false);
  const [form, setForm] = useState({ name: '', targetHost: '' });

  const load = async () => {
    try {
      const data = await api.getPortScans();
      setScans(data);
      if (selected) {
        const fresh = data.find((s) => s._id === selected._id);
        if (fresh) setSelected(fresh);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleScan = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setScanning(true);
    try {
      const scan = await api.createPortScan(form);
      setSelected(scan);
      setScans((prev) => [scan, ...prev]);
      setMessage(`Scan complete — ${scan.report?.openPortCount ?? 0} open port(s), score ${scan.report?.securityScore ?? 0}/100`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this port scan?')) return;
    try {
      await api.deletePortScan(id);
      if (selected?._id === id) setSelected(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Port Scan</h2>
          <p>Scan common TCP ports for network exposure — SSH, RDP, databases, and more</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {message && <div className="success-banner">{message}</div>}

      {can('portscan:run') && (
        <section className="panel loadtest-form-panel">
          <h3>Run port scan</h3>
          <p className="panel-note">
            Probes 21 common ports (FTP, SSH, Telnet, SMB, RDP, MySQL, MongoDB, etc.) via TCP connect. Use only on systems you own or have authorization to test.
          </p>
          <form onSubmit={handleScan} className="form-grid">
            <label>
              Scan name (optional)
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Production server audit"
              />
            </label>
            <label>
              Target host (IP or hostname)
              <input
                required
                value={form.targetHost}
                onChange={(e) => setForm({ ...form, targetHost: e.target.value })}
                placeholder="192.168.1.1 or server.example.com"
              />
            </label>
            <div className="modal-actions" style={{ marginTop: 0 }}>
              <button type="submit" className="btn btn-primary" disabled={scanning}>
                {scanning ? 'Scanning ports…' : 'Run port scan'}
              </button>
            </div>
          </form>
        </section>
      )}

      {selected?.status === 'completed' && (
        <div style={{ marginTop: 20 }}>
          <ScanReport scan={selected} />
        </div>
      )}

      <div className="table-wrap" style={{ marginTop: 24 }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Host</th>
              <th>Score</th>
              <th>Open</th>
              <th>Grade</th>
              <th>When</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {scans.length === 0 ? (
              <tr>
                <td colSpan="7">
                  <div className="empty-state">No port scans yet.</div>
                </td>
              </tr>
            ) : (
              scans.map((s) => (
                <tr key={s._id}>
                  <td>{s.name || '—'}</td>
                  <td className="loadtest-url-cell">{s.targetHost}</td>
                  <td>{s.report?.securityScore ?? '—'}</td>
                  <td>{s.report?.openPortCount ?? '—'}</td>
                  <td><strong>{s.report?.grade ?? '—'}</strong></td>
                  <td>{formatDateTime(s.createdAt)}</td>
                  <td>
                    <div className="actions">
                      {s.status === 'completed' && (
                        <button className="btn btn-secondary" onClick={() => setSelected(s)}>Report</button>
                      )}
                      {can('portscan:delete') && (
                        <button className="btn btn-danger" onClick={() => handleDelete(s._id)}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
