import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import Badge from '../components/Badge';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../utils';

function RiskRing({ score, grade }) {
  const color = score >= 70 ? '#ef4444' : score >= 50 ? '#f59e0b' : '#22c55e';
  return (
    <div className="phishing-risk-ring" style={{ borderColor: color }}>
      <strong style={{ color }}>{score ?? 0}</strong>
      <span>Grade {grade || 'F'}</span>
    </div>
  );
}

function SeverityBadge({ severity }) {
  return <span className={`security-severity security-severity-${severity}`}>{severity}</span>;
}

function CampaignReport({ campaign, profileMap, onDownloadPdf }) {
  const report = campaign.report || {};
  const canPdf = campaign.status === 'completed' && report.riskScore != null;
  const templates = report.templates || [];
  const findings = report.findings || [];

  return (
    <div className="phishing-report">
      <div className="loadtest-report-head">
        <div>
          <h3>{campaign.name || 'Phishing simulation report'}</h3>
          <p className="panel-note">{campaign.targetDomain}</p>
          <p className="panel-note">
            <strong>{campaign.godMode ? 'God Mode (AI Multi-Vector)' : (profileMap[campaign.campaignProfile]?.label || campaign.campaignProfile)}</strong>
            {' · '}
            {formatDateTime(campaign.finishedAt)}
            {report.vulnerabilityLevel && (
              <>
                {' · '}
                <span className={`phishing-vuln phishing-vuln-${report.vulnerabilityLevel}`}>
                  {report.vulnerabilityLevel.toUpperCase()} vulnerability
                </span>
              </>
            )}
          </p>
        </div>
        <div className="loadtest-report-actions">
          <RiskRing score={report.riskScore} grade={report.riskGrade} />
          {canPdf && onDownloadPdf && (
            <button type="button" className="btn btn-primary" onClick={() => onDownloadPdf(campaign)}>
              Download PDF
            </button>
          )}
          <Badge value={campaign.status} />
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card"><span>Effectiveness</span><strong>{report.effectivenessScore ?? 0}%</strong></div>
        <div className="stat-card"><span>Predicted opens</span><strong>{report.predictedOpenRate ?? 0}%</strong></div>
        <div className="stat-card"><span>Predicted clicks</span><strong>{report.predictedClickRate ?? 0}%</strong></div>
        <div className="stat-card"><span>Predicted submits</span><strong>{report.predictedSubmitRate ?? 0}%</strong></div>
        <div className="stat-card"><span>Templates</span><strong>{report.summary?.templatesGenerated ?? templates.length}</strong></div>
        <div className="stat-card"><span>Emails sent</span><strong>{report.emailsSent ?? 0}</strong></div>
      </div>

      <div className="panel-grid">
        <section className="panel">
          <h3>Domain email security</h3>
          <div className="phishing-dns-grid">
            <div className={report.domainChecks?.hasSpf ? 'pass' : 'fail'}>
              <span>SPF</span><strong>{report.domainChecks?.hasSpf ? 'Configured' : 'Missing'}</strong>
            </div>
            <div className={report.domainChecks?.hasDmarc ? 'pass' : 'fail'}>
              <span>DMARC</span><strong>{report.domainChecks?.hasDmarc ? 'Configured' : 'Missing'}</strong>
            </div>
            <div className={report.domainChecks?.hasDkim ? 'pass' : 'fail'}>
              <span>DKIM</span><strong>{report.domainChecks?.hasDkim ? 'Detected' : 'Not found'}</strong>
            </div>
            <div>
              <span>MX records</span><strong>{report.domainChecks?.mxRecords?.length ?? 0}</strong>
            </div>
          </div>
        </section>

        <section className="panel">
          <h3>Findings</h3>
          {findings.length === 0 ? (
            <p className="empty-state">No findings</p>
          ) : (
            <div className="security-findings">
              {findings.map((f, i) => (
                <div key={i} className="security-finding">
                  <div className="security-finding-head">
                    <SeverityBadge severity={f.severity} />
                    <strong>{f.title}</strong>
                  </div>
                  <p>{f.detail}</p>
                  {f.recommendation && <p className="panel-note">{f.recommendation}</p>}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel" style={{ gridColumn: '1 / -1' }}>
          <h3>Generated phishing templates ({templates.length})</h3>
          {templates.length === 0 ? (
            <p className="empty-state">No templates</p>
          ) : (
            <div className="phishing-templates">
              {templates.slice(0, 12).map((t) => (
                <div key={t.id} className="phishing-template-card">
                  <div className="phishing-template-head">
                    <strong>{t.subject}</strong>
                    {t.channel !== 'default' && <span className="phishing-channel">{t.channel}</span>}
                  </div>
                  <p>{t.preview}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default function PhishingAttack() {
  const { can } = useAuth();
  const [campaigns, setCampaigns] = useState([]);
  const [selected, setSelected] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [running, setRunning] = useState(false);
  const [form, setForm] = useState({
    name: '',
    targetDomain: 'example.com',
    targetEmails: '',
    campaignProfile: 'spear_phishing',
    godMode: false,
    maxPower: true,
    sendLive: false,
  });

  const profileMap = useMemo(() => {
    const map = {};
    (meta?.campaignProfiles || []).forEach((p) => { map[p.id] = p; });
    return map;
  }, [meta]);

  const load = async () => {
    try {
      const data = await api.getPhishingCampaigns();
      setCampaigns(data);
      if (selected) {
        const fresh = data.find((c) => c._id === selected._id);
        if (fresh) setSelected(fresh);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
    api.getPhishingMeta().then(setMeta).catch(() => {});
  }, []);

  const applyGodMode = () => {
    setForm((prev) => ({
      ...prev,
      name: prev.name || 'God mode — AI multi-vector phishing',
      godMode: true,
      maxPower: true,
      campaignProfile: 'apocalypse_phish',
    }));
    setMessage(`God mode: ${meta?.godModePlan?.aiProviderChannels || '?'} AI channels · multi-vector templates · max effectiveness`);
  };

  const applyMaxPower = () => {
    setForm((prev) => ({
      ...prev,
      name: prev.name || 'Apocalypse phishing simulation',
      godMode: false,
      maxPower: true,
      campaignProfile: 'apocalypse_phish',
    }));
    setMessage('Apocalypse preset: ×98 effectiveness, all vectors, 5 template variants');
  };

  const handleStart = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setRunning(true);
    try {
      const campaign = await api.createPhishingCampaign({
        name: form.name,
        targetDomain: form.targetDomain,
        targetEmails: form.targetEmails,
        campaignProfile: form.godMode ? undefined : form.campaignProfile,
        godMode: Boolean(form.godMode),
        maxPower: Boolean(form.maxPower || form.godMode),
        sendLive: Boolean(form.sendLive),
      });
      setSelected(campaign);
      setCampaigns((prev) => [campaign, ...prev]);
      setMessage(`Simulation complete — risk score ${campaign.report?.riskScore ?? 0}/100 (Grade ${campaign.report?.riskGrade || 'F'})`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  const handleDownloadPdf = async (campaign) => {
    try {
      const blob = await api.downloadPhishingPdf(campaign._id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeName = String(campaign.name || 'phishing').replace(/[^\w\-]+/g, '-').slice(0, 40);
      link.download = `PhishingReport-${safeName}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this phishing simulation?')) return;
    try {
      await api.deletePhishingCampaign(id);
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
          <h2>Phishing Attack</h2>
          <p>Simulate phishing campaigns to test organizational vulnerability and email security posture</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {message && <div className="success-banner">{message}</div>}

      <div className="phishing-warning panel">
        <strong>Authorized security testing only.</strong> Use only on domains and email addresses you own or have explicit permission to test. Live send requires SMTP in Integrations.
      </div>

      {can('phishing:run') && (
        <section className="panel loadtest-form-panel">
          <h3>Run phishing simulation</h3>
          <p className="panel-note">
            Analyzes SPF/DMARC/DKIM, generates attack templates, and predicts campaign success rates.
            <strong> God mode</strong> uses all AI providers for multi-vector template generation.
          </p>
          <form onSubmit={handleStart} className="form-grid">
            <label>
              Campaign name (optional)
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Q3 awareness test"
              />
            </label>
            <label>
              Target domain
              <input
                required
                value={form.targetDomain}
                onChange={(e) => setForm({ ...form, targetDomain: e.target.value })}
                placeholder="yourcompany.com"
              />
            </label>
            {!form.godMode && (
              <label>
                Campaign profile
                <select
                  value={form.campaignProfile}
                  onChange={(e) => setForm({ ...form, campaignProfile: e.target.value, godMode: false })}
                >
                  {(meta?.campaignProfiles || []).map((p) => (
                    <option key={p.id} value={p.id}>{p.label} (×{p.effectiveness}%)</option>
                  ))}
                </select>
                {profileMap[form.campaignProfile]?.description && (
                  <span className="field-hint">{profileMap[form.campaignProfile].description}</span>
                )}
              </label>
            )}
            {form.godMode && (
              <div className="panel-note ddos-godmode-active">
                God mode — {meta?.godModePlan?.aiProviderChannels || '?'} AI channels · multi-vector apocalypse templates
              </div>
            )}
            <label>
              Target emails (optional, comma-separated)
              <textarea
                rows={3}
                value={form.targetEmails}
                onChange={(e) => setForm({ ...form, targetEmails: e.target.value })}
                placeholder="user1@company.com, user2@company.com"
              />
              <span className="field-hint">Max {meta?.maxTargets || 500}. Required for live send.</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.sendLive}
                onChange={(e) => setForm({ ...form, sendLive: e.target.checked })}
              />
              Send live simulation emails via SMTP (marked [SIMULATION])
            </label>
            {!form.godMode && (
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={form.maxPower}
                  onChange={(e) => setForm({ ...form, maxPower: e.target.checked })}
                />
                Full power mode (+15% effectiveness, extra template variants)
              </label>
            )}
            <div className="modal-actions" style={{ marginTop: 0 }}>
              <button type="button" className="btn btn-danger" onClick={applyGodMode} disabled={running}>
                God mode (AI vectors)
              </button>
              <button type="button" className="btn btn-danger" onClick={applyMaxPower} disabled={running}>
                Apocalypse max
              </button>
              {form.godMode && (
                <button type="button" className="btn btn-secondary" onClick={() => setForm((p) => ({ ...p, godMode: false }))} disabled={running}>
                  Disable god mode
                </button>
              )}
              <button type="submit" className="btn btn-primary" disabled={running}>
                {running ? 'Running...' : 'Run simulation'}
              </button>
            </div>
          </form>
        </section>
      )}

      {selected && selected.status === 'completed' && (
        <div style={{ marginTop: 20 }}>
          <CampaignReport campaign={selected} profileMap={profileMap} onDownloadPdf={handleDownloadPdf} />
        </div>
      )}

      <div className="table-wrap" style={{ marginTop: 24 }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Domain</th>
              <th>Profile</th>
              <th>Status</th>
              <th>Risk</th>
              <th>Effectiveness</th>
              <th>When</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 ? (
              <tr>
                <td colSpan="8">
                  <div className="empty-state">No simulations yet. Run your first phishing test above.</div>
                </td>
              </tr>
            ) : (
              campaigns.map((c) => (
                <tr key={c._id}>
                  <td>{c.name || '—'}</td>
                  <td>{c.targetDomain}</td>
                  <td>{c.godMode ? 'God Mode' : (profileMap[c.campaignProfile]?.label || c.campaignProfile)}</td>
                  <td><Badge value={c.status} /></td>
                  <td>{c.report?.riskScore != null ? `${c.report.riskScore}/100 (${c.report.riskGrade})` : '—'}</td>
                  <td>{c.report?.effectivenessScore != null ? `${c.report.effectivenessScore}%` : '—'}</td>
                  <td>{formatDateTime(c.createdAt)}</td>
                  <td>
                    <div className="actions">
                      <button className="btn btn-secondary" onClick={() => setSelected(c)}>Report</button>
                      {c.status === 'completed' && c.report?.riskScore != null && (
                        <button className="btn btn-secondary" onClick={() => handleDownloadPdf(c)}>PDF</button>
                      )}
                      {can('phishing:delete') && (
                        <button className="btn btn-danger" onClick={() => handleDelete(c._id)}>Delete</button>
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
