import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import Badge from '../components/Badge';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../utils';

const ALL_HTTP_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const MAX_DURATION = 108000;
const MAX_CONCURRENCY = 10000;
const GOD_MODE_MAX = 10000;

function formatMethodsLabel(test) {
  if (test.mixedMethods || test.method === 'MIXED') {
    return `Mixed: ${(test.methods || ALL_HTTP_METHODS).join(', ')}`;
  }
  return test.method || 'GET';
}

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

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function BarChart({ title, items, valueKey = 'value', labelKey = 'label', color = '#3b82f6', suffix = '' }) {
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

function LoadTestReport({ test, onDownloadPdf }) {
  const report = test.report || {};
  const canPdf = ['completed', 'cancelled'].includes(test.status) && (report.totalRequests ?? 0) > 0;
  const statusItems = useMemo(() => Object.entries(report.statusCodes || {}).map(([label, value]) => ({
    label: label === 'ERR' ? 'Network error' : `HTTP ${label}`,
    value,
  })), [report.statusCodes]);

  const errorItems = useMemo(() => Object.entries(report.errors || {}).map(([label, value]) => ({
    label,
    value,
  })), [report.errors]);

  const channelItems = useMemo(() => Object.entries(report.channelCounts || {}).map(([label, value]) => ({
    label,
    value,
  })), [report.channelCounts]);

  const methodItems = useMemo(() => Object.entries(report.methodCounts || {}).map(([label, value]) => ({
    label,
    value,
  })), [report.methodCounts]);

  const bucketSec = report.timelineBucketSeconds || 1;
  const timelineItems = useMemo(() => (report.timeline || []).map((b) => ({
    label: formatTimelineLabel(b.second, bucketSec),
    value: b.requests,
    avgLatency: b.avgLatencyMs,
    errors: b.errors,
  })), [report.timeline, bucketSec]);

  const latencyTimeline = useMemo(() => (report.timeline || []).map((b) => ({
    label: formatTimelineLabel(b.second, bucketSec),
    value: b.avgLatencyMs,
  })), [report.timeline, bucketSec]);

  return (
    <div className="loadtest-report">
      <div className="loadtest-report-head">
        <div>
          <h3>{test.name || 'Load test report'}</h3>
          <p className="panel-note">{test.targetUrl}</p>
          <p className="panel-note">
            {test.godMode || report.godMode ? (
              <>
                <strong>God mode</strong> · {report.effectiveConcurrency || test.concurrency} workers ·{' '}
                burst ×{report.burstSize || 5} · {report.aiProviderChannels || '—'} AI channels (
                {(report.aiProvidersUsed || []).join(', ') || 'merged'})
                {' · '}
              </>
            ) : null}
            {test.concurrency} workers · {formatDuration(test.durationSeconds)} · {formatMethodsLabel(test)}
            {' · '}
            {formatDateTime(test.startedAt)} → {formatDateTime(test.finishedAt)}
          </p>
        </div>
        <div className="loadtest-report-actions">
          {canPdf && onDownloadPdf && (
            <button type="button" className="btn btn-primary" onClick={() => onDownloadPdf(test)}>
              Download PDF report
            </button>
          )}
          <Badge value={test.status} />
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card"><span>Total requests</span><strong>{report.totalRequests ?? 0}</strong></div>
        <div className="stat-card"><span>Success rate</span><strong>{report.successRate ?? 0}%</strong></div>
        <div className="stat-card"><span>Req / sec</span><strong>{report.requestsPerSecond ?? 0}</strong></div>
        <div className="stat-card"><span>Avg latency</span><strong>{report.avgLatencyMs ?? 0} ms</strong></div>
        <div className="stat-card"><span>P95 latency</span><strong>{report.p95LatencyMs ?? 0} ms</strong></div>
        <div className="stat-card"><span>Data transferred</span><strong>{formatBytes(report.bytesTransferred)}</strong></div>
      </div>

      <div className="panel-grid">
        <BarChart title="Requests per second (timeline)" items={timelineItems} color="#3b82f6" />
        <BarChart title="Avg latency per second (ms)" items={latencyTimeline} color="#f59e0b" suffix=" ms" />
        <BarChart title="HTTP status codes" items={statusItems} color="#22c55e" />
        {methodItems.length > 0 && (
          <BarChart title="HTTP method mix" items={methodItems} color="#8b5cf6" />
        )}
        {channelItems.length > 0 && (
          <BarChart title="AI provider channels (packet streams)" items={channelItems} color="#ec4899" />
        )}
        {errorItems.length > 0 && (
          <BarChart title="Errors" items={errorItems} color="#ef4444" />
        )}

        <section className="panel">
          <h3>Latency breakdown</h3>
          <div className="loadtest-latency-grid">
            <div><span>Min</span><strong>{report.minLatencyMs ?? 0} ms</strong></div>
            <div><span>P50</span><strong>{report.p50LatencyMs ?? 0} ms</strong></div>
            <div><span>P95</span><strong>{report.p95LatencyMs ?? 0} ms</strong></div>
            <div><span>P99</span><strong>{report.p99LatencyMs ?? 0} ms</strong></div>
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

export default function LoadTesting() {
  const { can } = useAuth();
  const [tests, setTests] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [running, setRunning] = useState(false);
  const [loadMeta, setLoadMeta] = useState(null);
  const pollRef = useRef(null);
  const [form, setForm] = useState({
    name: '',
    targetUrl: 'http://localhost:5173/',
    mixedMethods: true,
    godMode: false,
    methods: [...ALL_HTTP_METHODS],
    durationSeconds: 30,
    concurrency: 10,
  });

  const toggleMethod = (method) => {
    setForm((prev) => {
      const has = prev.methods.includes(method);
      const methods = has
        ? prev.methods.filter((m) => m !== method)
        : [...prev.methods, method];
      return {
        ...prev,
        methods: methods.length ? methods : [method],
        mixedMethods: methods.length > 1,
      };
    });
  };

  const applyMaxPower = () => {
    setForm((prev) => ({
      ...prev,
      name: prev.name || 'Max power load test',
      durationSeconds: MAX_DURATION,
      concurrency: MAX_CONCURRENCY,
      mixedMethods: true,
      godMode: false,
      methods: [...ALL_HTTP_METHODS],
    }));
    setMessage('Max power preset: 30 hours, 10,000 users, all HTTP methods mixed');
  };

  const applyGodMode = () => {
    const plan = loadMeta?.godModePlan;
    setForm((prev) => ({
      ...prev,
      name: prev.name || 'God mode — AI merge load',
      durationSeconds: MAX_DURATION,
      concurrency: plan?.concurrency || GOD_MODE_MAX,
      mixedMethods: true,
      godMode: true,
      methods: [...ALL_HTTP_METHODS],
    }));
    const channels = plan?.aiProvidersUsed?.join(', ') || 'all AI providers';
    setMessage(
      `God mode: ${plan?.concurrency || GOD_MODE_MAX} workers × 5 burst · ${plan?.aiProviderChannels || '?'} AI channels (${channels}) · 30 hours · all methods`
    );
  };

  const load = async () => {
    try {
      const data = await api.getLoadTests();
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
    api.getLoadTestMeta().then(setLoadMeta).catch(() => {});
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startPolling = (testId) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const test = await api.getLoadTest(testId);
        setSelected(test);
        setTests((prev) => prev.map((t) => (t._id === test._id ? test : t)));
        if (!['pending', 'running'].includes(test.status)) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setRunning(false);
          setMessage(test.status === 'completed' ? 'Load test completed — report ready' : `Load test ${test.status}`);
        }
      } catch (err) {
        setError(err.message);
        clearInterval(pollRef.current);
        setRunning(false);
      }
    }, 2000);
  };

  const handleStart = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setRunning(true);
    try {
      const payload = {
        name: form.name,
        targetUrl: form.targetUrl,
        durationSeconds: form.durationSeconds,
        concurrency: form.godMode ? undefined : form.concurrency,
        mixedMethods: form.mixedMethods || form.methods.length > 1,
        methods: form.mixedMethods ? ALL_HTTP_METHODS : form.methods,
        godMode: Boolean(form.godMode),
      };
      const test = await api.createLoadTest(payload);
      setSelected(test);
      setTests((prev) => [test, ...prev]);
      setMessage('Load test started — sending parallel requests...');
      startPolling(test._id);
      load();
    } catch (err) {
      setError(err.message);
      setRunning(false);
    }
  };

  const handleDownloadPdf = async (test) => {
    try {
      const blob = await api.downloadLoadTestPdf(test._id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeName = String(test.name || 'load-test').replace(/[^\w\-]+/g, '-').slice(0, 40);
      link.download = `LoadTest-${safeName}.pdf`;
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
      await api.cancelLoadTest(id);
      setMessage('Load test cancelled');
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this load test report?')) return;
    try {
      await api.deleteLoadTest(id);
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
          <h2>Load Testing</h2>
          <p>Send parallel HTTP requests to a URL for a set duration and view performance analytics</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {message && <div className="success-banner">{message}</div>}

      {can('loadtest:run') && (
        <section className="panel loadtest-form-panel">
          <h3>Run load test</h3>
          <p className="panel-note">
            Mix all HTTP methods. <strong>God mode</strong> merges every configured AI provider into up to{' '}
            {loadMeta?.godModeMaxConcurrency || GOD_MODE_MAX} parallel packet streams (×{loadMeta?.godModeBurstSize || 5} burst).
          </p>
          <form onSubmit={handleStart} className="form-grid">
            <label>
              Test name (optional)
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Homepage stress test"
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
              <label>
                Concurrent users
                <input
                  type="number"
                  min="1"
                  max="10000"
                  required
                  value={form.concurrency}
                  onChange={(e) => setForm({ ...form, concurrency: Number(e.target.value) })}
                />
                <span className="field-hint">Max 10,000 parallel requests</span>
              </label>
            </div>

            <div className="loadtest-methods">
              <div className="loadtest-methods-head">
                <strong>HTTP methods</strong>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={form.mixedMethods}
                    onChange={(e) => setForm({
                      ...form,
                      mixedMethods: e.target.checked,
                      methods: e.target.checked ? [...ALL_HTTP_METHODS] : form.methods,
                    })}
                  />
                  All methods mixed (max stress)
                </label>
              </div>
              {!form.mixedMethods && (
                <div className="loadtest-method-grid">
                  {ALL_HTTP_METHODS.map((method) => (
                    <label key={method} className="checkbox-row loadtest-method-chip">
                      <input
                        type="checkbox"
                        checked={form.methods.includes(method)}
                        onChange={() => toggleMethod(method)}
                      />
                      {method}
                    </label>
                  ))}
                </div>
              )}
              {form.mixedMethods && (
                <p className="panel-note" style={{ margin: 0 }}>
                  Rotating mix: {ALL_HTTP_METHODS.join(', ')}
                </p>
              )}
            </div>

            <div className="modal-actions" style={{ marginTop: 0 }}>
              <button
                type="button"
                className="btn btn-danger"
                onClick={applyGodMode}
                disabled={running}
                title="Merge all AI providers — max packets"
              >
                God mode (AI merge)
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={applyMaxPower}
                disabled={running}
              >
                Max power load
              </button>
              <button type="submit" className="btn btn-primary" disabled={running}>
                {running ? 'Running...' : 'Start load test'}
              </button>
            </div>
          </form>
        </section>
      )}

      {selected && (
        <div style={{ marginTop: 20 }}>
          {['pending', 'running'].includes(selected.status) ? (
            <section className="panel loadtest-running">
              <h3>Test in progress</h3>
              <p className="panel-note">
                Sending {selected.concurrency} parallel {formatMethodsLabel(selected)} requests to{' '}
                {selected.targetUrl} for {formatDuration(selected.durationSeconds)}...
              </p>
              <div className="loadtest-spinner" />
              {can('loadtest:run') && (
                <button
                  className="btn btn-secondary"
                  style={{ marginTop: 12 }}
                  onClick={() => handleCancel(selected._id)}
                >
                  Cancel
                </button>
              )}
            </section>
          ) : (
            <LoadTestReport test={selected} onDownloadPdf={handleDownloadPdf} />
          )}
        </div>
      )}

      <div className="table-wrap" style={{ marginTop: 24 }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>URL</th>
              <th>Duration</th>
              <th>Concurrency</th>
              <th>Status</th>
              <th>Req/sec</th>
              <th>Success</th>
              <th>When</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tests.length === 0 ? (
              <tr>
                <td colSpan="9">
                  <div className="empty-state">No load tests yet. Run your first test above.</div>
                </td>
              </tr>
            ) : (
              tests.map((t) => (
                <tr key={t._id}>
                  <td>{t.name || '—'}</td>
                  <td className="loadtest-url-cell">{t.targetUrl}</td>
                  <td>{formatDuration(t.durationSeconds)}</td>
                  <td>{t.concurrency}</td>
                  <td><Badge value={t.status} /></td>
                  <td>{t.report?.requestsPerSecond ?? '—'}</td>
                  <td>{t.report?.successRate != null ? `${t.report.successRate}%` : '—'}</td>
                  <td>{formatDateTime(t.createdAt)}</td>
                  <td>
                    <div className="actions">
                      <button className="btn btn-secondary" onClick={() => setSelected(t)}>Report</button>
                      {['completed', 'cancelled'].includes(t.status) && (t.report?.totalRequests ?? 0) > 0 && (
                        <button className="btn btn-secondary" onClick={() => handleDownloadPdf(t)}>PDF</button>
                      )}
                      {can('loadtest:delete') && (
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
