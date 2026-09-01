import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import Badge from '../components/Badge';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../utils';

const MAX_DURATION = 108000;
const MAX_CONCURRENCY = 10000;
const GOD_MODE_MAX = 10000;

function formatDuration(seconds) {
  const s = Number(seconds) || 0;
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${s}s`;
}

function formatTimelineLabel(second, bucketSeconds = 1) {
  if (bucketSeconds >= 60) return formatDuration(second);
  return `${second}s`;
}

function profileLabel(test, profileMap) {
  if (test.godMode || test.report?.godMode) return 'God Mode (AI Botnet)';
  return profileMap[test.attackProfile]?.label || test.attackProfile;
}

function ResilienceRing({ score, grade }) {
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <div className="ddos-resilience-ring" style={{ borderColor: color }}>
      <strong style={{ color }}>{score ?? 0}</strong>
      <span>Grade {grade || 'F'}</span>
    </div>
  );
}

function BarChart({ title, items, valueKey = 'value', labelKey = 'label', color = '#dc2626', suffix = '' }) {
  const max = Math.max(...items.map((i) => Number(i[valueKey]) || 0), 1);
  return (
    <section className="panel">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="empty-state">No data</p>
      ) : (
        <div className="chart-bars">
          {items.map((item) => (
            <div key={item[labelKey]} className="chart-row">
              <span className="chart-label">{item[labelKey]}</span>
              <div className="chart-track">
                <div
                  className="chart-fill"
                  style={{ width: `${(Number(item[valueKey]) / max) * 100}%`, background: color }}
                />
              </div>
              <strong className="chart-value">{item[valueKey]}{suffix}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DdosReport({ test, profileMap, onDownloadPdf }) {
  const report = test.report || {};
  const canPdf = ['completed', 'cancelled'].includes(test.status) && (report.totalRequests ?? 0) > 0;
  const isGod = test.godMode || report.godMode;

  const statusItems = useMemo(() => Object.entries(report.statusCodes || {}).map(([label, value]) => ({
    label: label === 'ERR' ? 'Network error' : `HTTP ${label}`,
    value,
  })), [report.statusCodes]);

  const errorItems = useMemo(() => Object.entries(report.errorTypes || {}).map(([label, value]) => ({
    label,
    value,
  })), [report.errorTypes]);

  const methodItems = useMemo(() => Object.entries(report.methodCounts || {}).map(([label, value]) => ({
    label,
    value,
  })), [report.methodCounts]);

  const channelItems = useMemo(() => Object.entries(report.channelCounts || {}).map(([label, value]) => ({
    label,
    value,
  })), [report.channelCounts]);

  const bucketSec = report.timelineBucketSeconds || 1;
  const timelineItems = useMemo(() => (report.timeline || []).map((b) => ({
    label: formatTimelineLabel(b.second, bucketSec),
    value: b.requests,
  })), [report.timeline, bucketSec]);

  const errorTimeline = useMemo(() => (report.timeline || []).map((b) => ({
    label: formatTimelineLabel(b.second, bucketSec),
    value: b.errors,
  })), [report.timeline, bucketSec]);

  return (
    <div className="ddos-report">
      <div className="loadtest-report-head">
        <div>
          <h3>{test.name || 'DDoS simulation report'}</h3>
          <p className="panel-note">{test.targetUrl}</p>
          <p className="panel-note">
            <strong>{profileLabel(test, profileMap)}</strong>
            {isGod && (
              <>
                {' · '}
                {report.effectiveConcurrency || test.concurrency} botnet workers · burst ×{report.burstSize || '—'}
                {' · '}
                {report.aiProviderChannels || '—'} AI channels (
                {(report.aiProvidersUsed || []).join(', ') || 'merged'})
              </>
            )}
            {!isGod && (
              <>
                {' · '}
                {test.concurrency} workers · burst ×{report.burstSize ?? '—'}
              </>
            )}
            {' · '}
            {formatDuration(test.durationSeconds)}
            {' · '}
            {formatDateTime(test.startedAt)} → {formatDateTime(test.finishedAt)}
          </p>
          {report.siteDown && (
            <p className="ddos-alert ddos-alert-down">Target appears DOWN under attack</p>
          )}
          {!report.siteDown && report.siteDegraded && (
            <p className="ddos-alert ddos-alert-degraded">Target DEGRADED — high error rate or latency</p>
          )}
          {!report.siteDown && !report.siteDegraded && (
            <p className="ddos-alert ddos-alert-ok">Target held up under attack</p>
          )}
        </div>
        <div className="loadtest-report-actions">
          <ResilienceRing score={report.resilienceScore} grade={report.resilienceGrade} />
          {canPdf && onDownloadPdf && (
            <button type="button" className="btn btn-primary" onClick={() => onDownloadPdf(test)}>
              Download PDF
            </button>
          )}
          <Badge value={test.status} />
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card"><span>Total requests</span><strong>{report.totalRequests ?? 0}</strong></div>
        <div className="stat-card"><span>Success rate</span><strong>{report.successRate ?? 0}%</strong></div>
        <div className="stat-card"><span>Error rate</span><strong>{report.errorRate ?? 0}%</strong></div>
        <div className="stat-card"><span>Avg RPS</span><strong>{report.requestsPerSecond ?? 0}</strong></div>
        <div className="stat-card"><span>Peak RPS</span><strong>{report.peakRequestsPerSecond ?? 0}</strong></div>
        <div className="stat-card"><span>Peak error rate</span><strong>{report.peakErrorRate ?? 0}%</strong></div>
        <div className="stat-card"><span>Peak in-flight</span><strong>{report.peakInFlight ?? '—'}</strong></div>
        <div className="stat-card"><span>Pipeline depth</span><strong>×{report.pipelineDepth ?? 1}</strong></div>
      </div>

      {(report.maxPower || report.godMode) && (
        <p className="panel-note ddos-power-note">
          <strong>Full power mode</strong>
          {' · '}
          Continuous pipeline attack (no batch wait)
          {report.theoreticalPeakRps ? ` · Theoretical peak ~${report.theoreticalPeakRps} req/s` : ''}
          {report.maxPower && !report.godMode ? ' · 16KB payloads · aggressive timeouts' : ''}
        </p>
      )}

      <div className="panel-grid">
        <BarChart title="Requests per bucket" items={timelineItems} color="#dc2626" />
        <BarChart title="Errors per bucket" items={errorTimeline} color="#ef4444" />
        <BarChart title="HTTP status codes" items={statusItems} color="#f97316" />
        {methodItems.length > 0 && (
          <BarChart title="Attack method mix" items={methodItems} color="#8b5cf6" />
        )}
        {channelItems.length > 0 && (
          <BarChart title="AI botnet channels" items={channelItems} color="#ec4899" />
        )}
        {errorItems.length > 0 && (
          <BarChart title="Error types" items={errorItems} color="#b91c1c" />
        )}
        <section className="panel">
          <h3>Latency</h3>
          <div className="loadtest-latency-grid">
            <div><span>Min</span><strong>{report.minLatencyMs ?? 0} ms</strong></div>
            <div><span>Avg</span><strong>{report.avgLatencyMs ?? 0} ms</strong></div>
            <div><span>P95</span><strong>{report.p95LatencyMs ?? 0} ms</strong></div>
            <div><span>Max</span><strong>{report.maxLatencyMs ?? 0} ms</strong></div>
          </div>
          <p className="panel-note" style={{ marginTop: 12 }}>
            Successful: {report.successfulRequests ?? 0} · Failed: {report.failedRequests ?? 0}
          </p>
        </section>
      </div>
    </div>
  );
}

export default function DdosAttack() {
  const { can } = useAuth();
  const [searchParams] = useSearchParams();
  const [tests, setTests] = useState([]);
  const [selected, setSelected] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [running, setRunning] = useState(false);
  const pollRef = useRef(null);
  const prefillDone = useRef(false);
  const [form, setForm] = useState({
    name: '',
    targetUrl: 'http://localhost:5173/',
    attackProfile: 'http_flood',
    godMode: false,
    maxPower: true,
    durationSeconds: 30,
    concurrency: 100,
  });

  useEffect(() => {
    if (prefillDone.current) return;
    const target = String(searchParams.get('target') || '').trim();
    const name = String(searchParams.get('name') || '').trim();
    const from = String(searchParams.get('from') || '').trim();
    if (!target) return;
    prefillDone.current = true;
    setForm((prev) => ({
      ...prev,
      targetUrl: target,
      name: name || prev.name || 'LAN device DDoS',
    }));
    if (from === 'network') {
      setMessage(`Target loaded from Network Devices: ${target}`);
    }
  }, [searchParams]);

  const profileMap = useMemo(() => {
    const map = {};
    (meta?.attackProfiles || []).forEach((p) => { map[p.id] = p; });
    return map;
  }, [meta]);

  const load = async () => {
    try {
      const data = await api.getDdosTests();
      setTests(data);
      if (selected) {
        const fresh = data.find((t) => t._id === selected._id);
        if (fresh) setSelected(fresh);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
    api.getDdosMeta().then(setMeta).catch(() => {});
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startPolling = (testId) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const test = await api.getDdosTest(testId);
        setSelected(test);
        setTests((prev) => prev.map((t) => (t._id === test._id ? test : t)));
        if (!['pending', 'running'].includes(test.status)) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setRunning(false);
          const score = test.report?.resilienceScore ?? 0;
          setMessage(`Simulation complete — resilience ${score}/100 (Grade ${test.report?.resilienceGrade || 'F'})`);
        }
      } catch (err) {
        setError(err.message);
        clearInterval(pollRef.current);
        setRunning(false);
      }
    }, 2000);
  };

  const applyGodMode = () => {
    const plan = meta?.godModePlan;
    setForm((prev) => ({
      ...prev,
      name: prev.name || 'God mode — AI botnet DDoS',
      godMode: true,
      maxPower: true,
      attackProfile: 'apocalypse',
      durationSeconds: MAX_DURATION,
      concurrency: plan?.concurrency || GOD_MODE_MAX,
    }));
    const channels = plan?.aiProvidersUsed?.join(', ') || 'all AI providers';
    setMessage(
      `God mode: ${plan?.concurrency || GOD_MODE_MAX} botnet workers × ${plan?.burstSize || 500} burst · ${plan?.aiProviderChannels || '?'} AI channels (${channels}) · all methods · 30 hours`
    );
  };

  const applyMaxAttack = () => {
    setForm((prev) => ({
      ...prev,
      name: prev.name || 'Apocalypse max attack',
      godMode: false,
      maxPower: true,
      attackProfile: 'apocalypse',
      durationSeconds: MAX_DURATION,
      concurrency: MAX_CONCURRENCY,
    }));
    setMessage('Apocalypse preset: ×400 burst, 10,000 workers, 4KB payloads, 30 hours');
  };

  const handleStart = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setRunning(true);
    try {
      const test = await api.createDdosTest({
        name: form.name,
        targetUrl: form.targetUrl,
        attackProfile: form.godMode ? undefined : form.attackProfile,
        godMode: Boolean(form.godMode),
        durationSeconds: form.durationSeconds,
        concurrency: form.godMode ? undefined : form.concurrency,
      });
      setSelected(test);
      setTests((prev) => [test, ...prev]);
      setMessage(form.godMode ? 'God mode attack launched — AI botnet flooding target...' : 'DDoS simulation started — flooding target...');
      startPolling(test._id);
      load();
    } catch (err) {
      setError(err.message);
      setRunning(false);
    }
  };

  const handleDownloadPdf = async (test) => {
    try {
      const blob = await api.downloadDdosTestPdf(test._id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeName = String(test.name || 'ddos-test').replace(/[^\w\-]+/g, '-').slice(0, 40);
      link.download = `DDoSReport-${safeName}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCancel = async (id) => {
    try {
      await api.cancelDdosTest(id);
      setMessage('Simulation cancelled');
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this DDoS simulation report?')) return;
    try {
      await api.deleteDdosTest(id);
      if (selected?._id === id) setSelected(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const selectedProfile = profileMap[selected?.attackProfile] || profileMap[form.attackProfile];

  return (
    <>
      <div className="page-header">
        <div>
          <h2>DDoS Attack</h2>
          <p>Simulate distributed denial-of-service attacks to test your infrastructure resilience</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {message && <div className="success-banner">{message}</div>}

      <div className="ddos-warning panel">
        <strong>Authorized testing only.</strong> Run simulations only on systems you own or have explicit permission to stress-test.
      </div>

      {can('ddos:run') && (
        <section className="panel loadtest-form-panel">
          <h3>Run DDoS simulation</h3>
          <p className="panel-note">
            <strong>God mode</strong> merges every configured AI provider into up to{' '}
            {meta?.godModeMaxConcurrency || GOD_MODE_MAX} botnet workers (×{meta?.godModeBurstSize || 500} burst, all methods, 4KB payloads).
            {' '}<strong>Apocalypse</strong> profile delivers ×400 burst per worker without AI channels.
          </p>
          <form onSubmit={handleStart} className="form-grid">
            <label>
              Simulation name (optional)
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Homepage flood test"
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
            {!form.godMode && (
              <label>
                Attack profile
                <select
                  value={form.attackProfile}
                  onChange={(e) => setForm({ ...form, attackProfile: e.target.value, godMode: false })}
                >
                  {(meta?.attackProfiles || []).map((p) => (
                    <option key={p.id} value={p.id}>{p.label} (×{p.burstSize} burst)</option>
                  ))}
                  {!meta?.attackProfiles?.length && (
                    <>
                      <option value="http_flood">HTTP Flood</option>
                      <option value="post_flood">POST Flood</option>
                      <option value="mixed_vector">Mixed Vector</option>
                      <option value="burst_wave">Burst Wave</option>
                      <option value="aggressive">Aggressive</option>
                      <option value="apocalypse">Apocalypse</option>
                    </>
                  )}
                </select>
                {profileMap[form.attackProfile]?.description && (
                  <span className="field-hint">{profileMap[form.attackProfile].description}</span>
                )}
              </label>
            )}
            {form.godMode && (
              <div className="panel-note ddos-godmode-active">
                God mode active — {meta?.godModePlan?.concurrency || GOD_MODE_MAX} workers · ×{meta?.godModeBurstSize || 500} burst · all HTTP methods · AI botnet channels
              </div>
            )}
            <div className="form-row">
              <label>
                Duration (seconds)
                <input
                  type="number"
                  min="5"
                  max="108000"
                  required
                  value={form.durationSeconds}
                  onChange={(e) => setForm({ ...form, durationSeconds: Number(e.target.value) })}
                />
                <span className="field-hint">Up to 108000s (30 hours)</span>
              </label>
              {!form.godMode && (
                <label>
                  Concurrent workers
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    required
                    value={form.concurrency}
                    onChange={(e) => setForm({ ...form, concurrency: Number(e.target.value) })}
                  />
                  <span className="field-hint">Max 10,000 parallel attackers</span>
                </label>
              )}
            </div>

            <div className="modal-actions" style={{ marginTop: 0 }}>
              <button
                type="button"
                className="btn btn-danger"
                onClick={applyGodMode}
                disabled={running}
                title="Merge all AI providers into botnet attack streams"
              >
                God mode (AI botnet)
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={applyMaxAttack}
                disabled={running}
              >
                Apocalypse max
              </button>
              {form.godMode && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setForm((prev) => ({ ...prev, godMode: false }))}
                  disabled={running}
                >
                  Disable god mode
                </button>
              )}
              <button type="submit" className="btn btn-primary" disabled={running}>
                {running ? 'Attacking...' : 'Start simulation'}
              </button>
            </div>
          </form>
        </section>
      )}

      {selected && (
        <div style={{ marginTop: 20 }}>
          {['pending', 'running'].includes(selected.status) ? (
            <section className="panel loadtest-running">
              <h3>Simulation in progress</h3>
              <p className="panel-note">
                {selected.godMode ? (
                  <>
                    <strong>God mode</strong> — {selected.concurrency} botnet workers flooding {selected.targetUrl}
                  </>
                ) : (
                  <>
                    Running {selectedProfile?.label || selected.attackProfile} with {selected.concurrency} workers
                    against {selected.targetUrl}
                  </>
                )}
                {' '}for {formatDuration(selected.durationSeconds)}...
              </p>
              <div className="loadtest-spinner ddos-spinner" />
              {can('ddos:run') && (
                <button
                  className="btn btn-secondary"
                  style={{ marginTop: 12 }}
                  onClick={() => handleCancel(selected._id)}
                >
                  Stop attack
                </button>
              )}
            </section>
          ) : (
            <DdosReport
              test={selected}
              profileMap={profileMap}
              onDownloadPdf={handleDownloadPdf}
            />
          )}
        </div>
      )}

      <div className="table-wrap" style={{ marginTop: 24 }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>URL</th>
              <th>Profile</th>
              <th>Workers</th>
              <th>Status</th>
              <th>Resilience</th>
              <th>Peak RPS</th>
              <th>When</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tests.length === 0 ? (
              <tr>
                <td colSpan="9">
                  <div className="empty-state">No simulations yet. Run your first DDoS test above.</div>
                </td>
              </tr>
            ) : (
              tests.map((t) => (
                <tr key={t._id}>
                  <td>{t.name || '—'}</td>
                  <td className="loadtest-url-cell">{t.targetUrl}</td>
                  <td>{profileLabel(t, profileMap)}</td>
                  <td>{t.concurrency}</td>
                  <td><Badge value={t.status} /></td>
                  <td>
                    {t.report?.resilienceScore != null
                      ? `${t.report.resilienceScore}/100 (${t.report.resilienceGrade})`
                      : '—'}
                  </td>
                  <td>{t.report?.peakRequestsPerSecond ?? '—'}</td>
                  <td>{formatDateTime(t.createdAt)}</td>
                  <td>
                    <div className="actions">
                      <button className="btn btn-secondary" onClick={() => setSelected(t)}>Report</button>
                      {['completed', 'cancelled'].includes(t.status) && (t.report?.totalRequests ?? 0) > 0 && (
                        <button className="btn btn-secondary" onClick={() => handleDownloadPdf(t)}>PDF</button>
                      )}
                      {can('ddos:delete') && (
                        <button className="btn btn-danger" onClick={() => handleDelete(t._id)}>Delete</button>
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
