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

function CheckRow({ label, ok, detail }) {
  return (
    <div className={`security-header-row ${ok ? 'security-header-pass' : 'security-header-fail'}`}>
      <span>{ok ? '✓' : '✗'}</span>
      <div>
        <strong>{label}</strong>
        {detail && <div className="panel-note">{detail}</div>}
      </div>
    </div>
  );
}

function ScanReport({ scan }) {
  const report = scan.report || {};
  const checks = report.checks || {};
  const findings = (report.findings || []).filter((f) => f.severity !== 'pass' && f.severity !== 'info');

  return (
    <div className="security-report">
      <div className="loadtest-report-head">
        <div>
          <h3>{scan.name || 'DNS scan'}</h3>
          <p className="panel-note">{scan.targetDomain}</p>
          <p className="panel-note">{formatDateTime(scan.finishedAt)}</p>
        </div>
        <ScoreRing score={report.securityScore} grade={report.grade} />
      </div>

      <div className="stats-grid">
        <div className="stat-card"><span>SPF</span><strong>{checks.hasSpf ? 'Yes' : 'No'}</strong></div>
        <div className="stat-card"><span>DMARC</span><strong>{checks.hasDmarc ? 'Yes' : 'No'}</strong></div>
        <div className="stat-card"><span>DKIM</span><strong>{checks.hasDkim ? 'Yes' : 'No'}</strong></div>
        <div className="stat-card"><span>MX records</span><strong>{checks.mxRecords?.length ?? 0}</strong></div>
        <div className="stat-card"><span>Critical</span><strong>{report.summary?.critical ?? 0}</strong></div>
        <div className="stat-card"><span>High</span><strong>{report.summary?.high ?? 0}</strong></div>
      </div>

      <div className="panel-grid">
        <section className="panel">
          <h3>DNS records</h3>
          <div className="security-header-list">
            <CheckRow label="SPF record" ok={checks.hasSpf} detail={checks.spfRecord?.slice(0, 100)} />
            <CheckRow label="DMARC record" ok={checks.hasDmarc} detail={checks.dmarcRecord?.slice(0, 100) || (checks.dmarcPolicy ? `p=${checks.dmarcPolicy}` : '')} />
            <CheckRow label="DKIM (default selector)" ok={checks.hasDkim} detail={checks.dkimHint?.slice(0, 80)} />
            <CheckRow label="MX records" ok={(checks.mxRecords?.length ?? 0) > 0} detail={(checks.mxRecords || []).join(', ')} />
          </div>
        </section>

        <section className="panel">
          <h3>Findings & recommendations</h3>
          {findings.length === 0 ? (
            <p className="empty-state">Strong email authentication posture.</p>
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

export default function DnsSecurity() {
  const { can } = useAuth();
  const [scans, setScans] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [scanning, setScanning] = useState(false);
  const [form, setForm] = useState({ name: '', targetDomain: '' });

  const load = async () => {
    try {
      const data = await api.getDnsScans();
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
      const scan = await api.createDnsScan(form);
      setSelected(scan);
      setScans((prev) => [scan, ...prev]);
      setMessage(`DNS scan complete — score ${scan.report?.securityScore ?? 0}/100 (Grade ${scan.report?.grade || 'F'})`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this DNS scan?')) return;
    try {
      await api.deleteDnsScan(id);
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
          <h2>DNS Security</h2>
          <p>Check SPF, DMARC, DKIM, and MX records to assess email spoofing protection</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {message && <div className="success-banner">{message}</div>}

      {can('dnssec:run') && (
        <section className="panel loadtest-form-panel">
          <h3>Run DNS security scan</h3>
          <p className="panel-note">
            Validates email authentication records that protect against phishing and domain spoofing.
          </p>
          <form onSubmit={handleScan} className="form-grid">
            <label>
              Scan name (optional)
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Company domain audit"
              />
            </label>
            <label>
              Domain
              <input
                required
                value={form.targetDomain}
                onChange={(e) => setForm({ ...form, targetDomain: e.target.value })}
                placeholder="example.com"
              />
            </label>
            <div className="modal-actions" style={{ marginTop: 0 }}>
              <button type="submit" className="btn btn-primary" disabled={scanning}>
                {scanning ? 'Checking DNS…' : 'Run DNS scan'}
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
              <th>Domain</th>
              <th>Score</th>
              <th>Grade</th>
              <th>SPF</th>
              <th>DMARC</th>
              <th>When</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {scans.length === 0 ? (
              <tr>
                <td colSpan="8">
                  <div className="empty-state">No DNS scans yet.</div>
                </td>
              </tr>
            ) : (
              scans.map((s) => (
                <tr key={s._id}>
                  <td>{s.name || '—'}</td>
                  <td>{s.targetDomain}</td>
                  <td>{s.report?.securityScore ?? '—'}</td>
                  <td><strong>{s.report?.grade ?? '—'}</strong></td>
                  <td>{s.report?.checks?.hasSpf ? 'Yes' : 'No'}</td>
                  <td>{s.report?.checks?.hasDmarc ? 'Yes' : 'No'}</td>
                  <td>{formatDateTime(s.createdAt)}</td>
                  <td>
                    <div className="actions">
                      {s.status === 'completed' && (
                        <button className="btn btn-secondary" onClick={() => setSelected(s)}>Report</button>
                      )}
                      {can('dnssec:delete') && (
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
