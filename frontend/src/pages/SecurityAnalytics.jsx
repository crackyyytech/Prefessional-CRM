import { useEffect, useState } from 'react';
import { api } from '../api';
import Badge from '../components/Badge';
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

function ScanReport({ scan, onDownloadPdf }) {
  const report = scan.report || {};
  const findings = (report.findings || []).filter((f) => f.severity !== 'pass');

  return (
    <div className="security-report">
      <div className="loadtest-report-head">
        <div>
          <h3>{scan.name || 'Security scan'}</h3>
          <p className="panel-note">{scan.targetUrl}</p>
          <p className="panel-note">{formatDateTime(scan.finishedAt)}</p>
        </div>
        <div className="loadtest-report-actions">
          <ScoreRing score={report.securityScore} grade={report.grade} />
          {onDownloadPdf && (
            <button type="button" className="btn btn-primary" onClick={() => onDownloadPdf(scan)}>
              Download PDF
            </button>
          )}
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card"><span>HTTPS</span><strong>{report.httpsEnabled ? 'Yes' : 'No'}</strong></div>
        <div className="stat-card"><span>HTTP status</span><strong>{report.responseStatus || '—'}</strong></div>
        <div className="stat-card"><span>Response time</span><strong>{report.responseTimeMs ?? 0} ms</strong></div>
        <div className="stat-card"><span>Critical</span><strong>{report.summary?.critical ?? 0}</strong></div>
        <div className="stat-card"><span>High</span><strong>{report.summary?.high ?? 0}</strong></div>
        <div className="stat-card"><span>Medium</span><strong>{report.summary?.medium ?? 0}</strong></div>
      </div>

      {report.tls?.valid && (
        <section className="panel">
          <h3>SSL / TLS certificate</h3>
          <p className="panel-note">
            {report.tls.subject} · Issuer: {report.tls.issuer || '—'} · Expires: {report.tls.validTo} ({report.tls.daysUntilExpiry} days) · {report.tls.protocol}
          </p>
        </section>
      )}

      {(report.cookieIssues || []).length > 0 && (
        <section className="panel">
          <h3>Cookie security issues</h3>
          <ul className="security-cookie-list">
            {report.cookieIssues.map((issue, idx) => (
              <li key={idx}>{issue}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="panel-grid">
        <section className="panel">
          <h3>Security headers</h3>
          {(report.headers || []).length === 0 ? (
            <p className="empty-state">No header data</p>
          ) : (
            <div className="security-header-list">
              {report.headers.map((h) => (
                <div key={h.name} className={`security-header-row security-header-${h.status}`}>
                  <span>{h.present ? '✓' : '✗'}</span>
                  <div>
                    <strong>{h.name}</strong>
                    {h.value && <div className="panel-note">{h.value}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <h3>Findings & recommendations</h3>
          {findings.length === 0 ? (
            <p className="empty-state">No issues found — excellent security posture.</p>
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
    </div>
  );
}

export default function SecurityAnalytics() {
  const { can } = useAuth();
  const [scans, setScans] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [scanning, setScanning] = useState(false);
  const [form, setForm] = useState({
    name: '',
    targetUrl: 'https://',
  });

  const load = async () => {
    try {
      const data = await api.getSecurityScans();
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
      const scan = await api.createSecurityScan(form);
      setSelected(scan);
      setScans((prev) => [scan, ...prev]);
      setMessage(`Scan complete — score ${scan.report?.securityScore ?? 0}/100 (Grade ${scan.report?.grade || 'F'})`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  };

  const handleDownloadPdf = async (scan) => {
    try {
      const blob = await api.downloadSecurityScanPdf(scan._id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `SecurityReport-${String(scan.name || 'scan').replace(/[^\w\-]+/g, '-')}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this security scan?')) return;
    try {
      await api.deleteSecurityScan(id);
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
          <h2>Security Analytics</h2>
          <p>Scan websites for HTTPS, SSL/TLS, security headers, cookies, and vulnerabilities</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {message && <div className="success-banner">{message}</div>}

      {can('security:scan') && (
        <section className="panel loadtest-form-panel">
          <h3>Run security scan</h3>
          <p className="panel-note">
            Checks HTTPS, certificate expiry, HSTS, CSP, X-Frame-Options, cookie flags, and more. Generates a scored report with PDF export.
          </p>
          <form onSubmit={handleScan} className="form-grid">
            <label>
              Scan name (optional)
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Production site audit"
              />
            </label>
            <label>
              Target URL
              <input
                required
                type="url"
                value={form.targetUrl}
                onChange={(e) => setForm({ ...form, targetUrl: e.target.value })}
                placeholder="https://yourwebsite.com"
              />
            </label>
            <div className="modal-actions" style={{ marginTop: 0 }}>
              <button type="submit" className="btn btn-primary" disabled={scanning}>
                {scanning ? 'Scanning...' : 'Run security scan'}
              </button>
            </div>
          </form>
        </section>
      )}

      {selected?.status === 'completed' && (
        <div style={{ marginTop: 20 }}>
          <ScanReport scan={selected} onDownloadPdf={handleDownloadPdf} />
        </div>
      )}

      <div className="table-wrap" style={{ marginTop: 24 }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>URL</th>
              <th>Score</th>
              <th>Grade</th>
              <th>HTTPS</th>
              <th>Critical</th>
              <th>When</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {scans.length === 0 ? (
              <tr>
                <td colSpan="8">
                  <div className="empty-state">No scans yet. Run your first security scan above.</div>
                </td>
              </tr>
            ) : (
              scans.map((s) => (
                <tr key={s._id}>
                  <td>{s.name || '—'}</td>
                  <td className="loadtest-url-cell">{s.targetUrl}</td>
                  <td>{s.report?.securityScore ?? '—'}</td>
                  <td><strong>{s.report?.grade ?? '—'}</strong></td>
                  <td>{s.report?.httpsEnabled ? 'Yes' : 'No'}</td>
                  <td>{s.report?.summary?.critical ?? '—'}</td>
                  <td>{formatDateTime(s.createdAt)}</td>
                  <td>
                    <div className="actions">
                      {s.status === 'completed' && (
                        <>
                          <button className="btn btn-secondary" onClick={() => setSelected(s)}>Report</button>
                          <button className="btn btn-secondary" onClick={() => handleDownloadPdf(s)}>PDF</button>
                        </>
                      )}
                      {can('security:delete') && (
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
