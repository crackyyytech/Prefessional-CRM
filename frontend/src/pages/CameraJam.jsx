import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../utils';

const MAX_DURATION = 108000;
const MAX_CONCURRENCY = 10000;

function formatDuration(seconds) {
  const s = Number(seconds) || 0;
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${s}s`;
}

function JamRing({ score, grade }) {
  const color = score >= 80 ? '#6366f1' : score >= 60 ? '#f59e0b' : '#94a3b8';
  return (
    <div className="camjam-ring" style={{ borderColor: color }}>
      <strong style={{ color }}>{score ?? 0}</strong>
      <span>Grade {grade || 'F'}</span>
    </div>
  );
}

function BarChart({ title, items, color = '#6366f1' }) {
  const max = Math.max(...items.map((i) => Number(i.value) || 0), 1);
  return (
    <section className="panel">
      <h3>{title}</h3>
      {items.length === 0 ? <p className="empty-state">No data</p> : (
        <div className="chart-bars">
          {items.map((item) => (
            <div key={item.label} className="chart-row">
              <span className="chart-label">{item.label}</span>
              <div className="chart-track">
                <div className="chart-fill" style={{ width: `${(item.value / max) * 100}%`, background: color }} />
              </div>
              <strong className="chart-value">{item.value}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CameraViewPanel({ host, intel, username, password, onCredentialsChange, compact = false, liveLabel = 'Live view' }) {
  const [selectedUrl, setSelectedUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const blobRef = useRef(null);

  const viewOptions = useMemo(() => {
    const working = intel?.viewProbe?.working || [];
    const candidates = intel?.viewUrls || [];
    if (working.length) return working;
    return candidates;
  }, [intel]);

  useEffect(() => {
    const best = intel?.viewProbe?.bestUrl || viewOptions[0]?.url || '';
    setSelectedUrl(best);
  }, [intel, viewOptions]);

  const refreshPreview = useCallback(async () => {
    if (!host || !selectedUrl) return;
    setLoading(true);
    setError('');
    try {
      const blob = await api.getCameraPreview({
        targetHost: host,
        viewUrl: selectedUrl,
        username,
        password,
      });
      if (blobRef.current) URL.revokeObjectURL(blobRef.current);
      const url = URL.createObjectURL(blob);
      blobRef.current = url;
      setImageUrl(url);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [host, selectedUrl, username, password]);

  useEffect(() => {
    if (!selectedUrl) return undefined;
    refreshPreview();
    if (!autoRefresh) return undefined;
    const timer = setInterval(refreshPreview, 2500);
    return () => clearInterval(timer);
  }, [selectedUrl, autoRefresh, refreshPreview]);

  useEffect(() => () => {
    if (blobRef.current) URL.revokeObjectURL(blobRef.current);
  }, []);

  const handleProbe = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.probeCameraView({
        targetHost: host,
        viewUrls: intel?.viewUrls,
        username,
        password,
      });
      if (result.bestUrl) {
        setSelectedUrl(result.bestUrl);
        setError('');
      } else {
        setError('No working snapshot URL found — try credentials or open in VLC for RTSP');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className={`panel camview-panel${compact ? ' camview-panel-compact' : ''}`}>
      <div className="camview-head">
        <div>
          <h3>{liveLabel}</h3>
          <p className="panel-note">
            {host}
            {intel?.summary?.liveViewAvailable === false && viewOptions.length === 0
              ? ' · No HTTP snapshot detected — use RTSP in VLC'
              : intel?.viewProbe?.workingCount
                ? ` · ${intel.viewProbe.workingCount} working snapshot URL(s)`
                : viewOptions.length
                  ? ` · ${viewOptions.length} candidate URL(s)`
                  : ''}
          </p>
        </div>
        <div className="camview-actions">
          <label className="checkbox-row camview-auto">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto refresh
          </label>
          <button type="button" className="btn btn-secondary" onClick={refreshPreview} disabled={loading || !selectedUrl}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          {viewOptions.length > 0 && (
            <button type="button" className="btn btn-secondary" onClick={handleProbe} disabled={loading}>
              Find stream
            </button>
          )}
        </div>
      </div>

      {onCredentialsChange && (
        <div className="camview-creds form-row">
          <label>
            Username (optional)
            <input value={username || ''} onChange={(e) => onCredentialsChange({ username: e.target.value })} placeholder="admin" />
          </label>
          <label>
            Password (optional)
            <input type="password" value={password || ''} onChange={(e) => onCredentialsChange({ password: e.target.value })} placeholder="••••••" />
          </label>
        </div>
      )}

      {viewOptions.length > 0 && (
        <label className="camview-select">
          Snapshot URL
          <select value={selectedUrl} onChange={(e) => setSelectedUrl(e.target.value)}>
            {viewOptions.map((v) => (
              <option key={v.url} value={v.url}>{v.label || v.url}</option>
            ))}
          </select>
        </label>
      )}

      <div className="camview-frame">
        {imageUrl ? (
          <img src={imageUrl} alt={`Camera ${host}`} className="camview-image" />
        ) : (
          <div className="camview-placeholder">
            {loading ? 'Connecting to camera...' : 'Select a snapshot URL or gather camera info first'}
          </div>
        )}
        {loading && imageUrl && <div className="camview-loading-badge">Updating...</div>}
      </div>

      {error && <p className="camview-error">{error}</p>}
      {lastRefresh && <p className="panel-note camview-ts">Last frame: {formatDateTime(lastRefresh)}</p>}

      {(intel?.rtspUrls || []).length > 0 && (
        <div className="camview-rtsp">
          <strong>RTSP (use VLC / ffplay)</strong>
          {intel.rtspUrls.map((r) => (
            <code key={r.url}>{r.url}</code>
          ))}
        </div>
      )}
    </section>
  );
}

function CameraIntelPanel({ intel, onApplyProfile, showView = false, host, viewCreds, onCredentialsChange }) {
  if (!intel) return null;
  const mfr = intel.manufacturer || {};

  return (
    <section className="panel camintel-panel">
      <div className="camintel-head">
        <div>
          <h3>Camera intelligence — {intel.host}</h3>
          <p className="panel-note">
            Scanned in {intel.scanDurationMs ?? 0} ms · Exposure score {intel.exposureScore ?? 0}/100
            {intel.online ? ' · ONLINE' : ' · OFFLINE / filtered'}
          </p>
        </div>
        {intel.recommendedProfile && onApplyProfile && (
          <button type="button" className="btn btn-primary" onClick={() => onApplyProfile(intel.recommendedProfile)}>
            Use recommended: {intel.recommendedProfileLabel}
          </button>
        )}
      </div>

      <div className="stats-grid">
        <div className="stat-card"><span>Manufacturer</span><strong>{mfr.brand || 'Unknown'}</strong></div>
        <div className="stat-card"><span>Model</span><strong>{mfr.model || '—'}</strong></div>
        <div className="stat-card"><span>Confidence</span><strong>{mfr.confidence || '—'}</strong></div>
        <div className="stat-card"><span>Open ports</span><strong>{intel.openPorts?.length ?? 0}</strong></div>
        <div className="stat-card"><span>HTTP endpoints</span><strong>{intel.summary?.httpEndpointsFound ?? 0}</strong></div>
        <div className="stat-card"><span>Attack vectors</span><strong>{intel.summary?.attackVectorCount ?? 0}</strong></div>
        <div className="stat-card"><span>Live view</span><strong>{intel.summary?.liveViewAvailable ? 'Yes' : 'No'}</strong></div>
      </div>

      {showView && host && (
        <CameraViewPanel
          host={host}
          intel={intel}
          username={viewCreds?.username}
          password={viewCreds?.password}
          onCredentialsChange={onCredentialsChange}
        />
      )}

      <div className="panel-grid">
        <section className="panel">
          <h3>Open services</h3>
          {(intel.services || []).length === 0 ? (
            <p className="empty-state">No open camera ports detected</p>
          ) : (
            <div className="camintel-services">
              {intel.services.map((s) => (
                <div key={s.port} className="camintel-service open">
                  <strong>Port {s.port}</strong>
                  <span>{s.service}</span>
                  <span>{s.latencyMs} ms</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <h3>RTSP stream URLs</h3>
          {(intel.rtspUrls || []).length === 0 ? (
            <p className="empty-state">No RTSP port open</p>
          ) : (
            intel.rtspUrls.map((r) => (
              <div key={r.port} className="camintel-url">
                <code>{r.url}</code>
                <code className="panel-note">{r.alt}</code>
              </div>
            ))
          )}
        </section>

        <section className="panel">
          <h3>HTTP probes</h3>
          {(intel.httpProbes || []).filter((p) => p.ok).length === 0 ? (
            <p className="empty-state">No HTTP responses</p>
          ) : (
            <div className="camintel-probes">
              {intel.httpProbes.filter((p) => p.ok).map((p) => (
                <div key={p.url} className="camintel-probe">
                  <strong>{p.label}</strong>
                  <span>HTTP {p.status} · {p.latencyMs} ms</span>
                  {p.title && <span>{p.title}</span>}
                  <code>{p.url}</code>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <h3>Recommended attack</h3>
          <p className="panel-note">
            Profile: <strong>{intel.recommendedProfileLabel}</strong>
            {' · '}Ports: {(intel.recommendedPorts || []).join(', ')}
            {' · '}Burst ×{intel.recommendedBurst}
          </p>
          <h4 style={{ marginTop: 12, fontSize: '0.9rem' }}>Attack vectors</h4>
          {(intel.attackVectors || []).length === 0 ? (
            <p className="empty-state">Scan did not find attack vectors</p>
          ) : (
            <div className="camintel-vectors">
              {intel.attackVectors.map((v) => (
                <div key={v.target} className={`camintel-vector camintel-priority-${v.priority}`}>
                  <strong>{v.type}</strong>
                  <span className="camintel-priority-badge">{v.priority}</span>
                  <code>{v.target}</code>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function JamReport({ test, profileMap, onDownloadPdf, viewCreds, onCredentialsChange }) {
  const report = test.report || {};
  const canPdf = ['completed', 'cancelled'].includes(test.status) && (report.totalPackets ?? 0) > 0;

  const portItems = useMemo(() => Object.entries(report.portCounts || {}).map(([label, value]) => ({
    label: `Port ${label}`, value,
  })), [report.portCounts]);

  const typeItems = useMemo(() => Object.entries(report.packetTypes || {}).map(([label, value]) => ({
    label: label.toUpperCase(), value,
  })), [report.packetTypes]);

  return (
    <div className="camjam-report">
      <div className="loadtest-report-head">
        <div>
          <h3>{test.name || 'Camera jam report'}</h3>
          <p className="panel-note">{test.targetHost}</p>
          <p className="panel-note">
            <strong>{test.godMode ? 'God Mode' : (profileMap[test.jamProfile]?.label || test.jamProfile)}</strong>
            {' · '}{test.concurrency} workers · burst ×{report.burstSize ?? '—'} · {formatDuration(test.durationSeconds)}
          </p>
          {report.cameraDisrupted && <p className="camjam-alert camjam-alert-down">Camera appears DISRUPTED</p>}
          {!report.cameraDisrupted && report.cameraDegraded && <p className="camjam-alert camjam-alert-warn">Camera DEGRADED</p>}
          {!report.cameraDisrupted && !report.cameraDegraded && <p className="camjam-alert camjam-alert-ok">Camera stream held up</p>}
        </div>
        <div className="loadtest-report-actions">
          <JamRing score={report.jamScore} grade={report.jamGrade} />
          {canPdf && onDownloadPdf && (
            <button type="button" className="btn btn-primary" onClick={() => onDownloadPdf(test)}>Download PDF</button>
          )}
          <Badge value={test.status} />
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card"><span>Total packets</span><strong>{report.totalPackets ?? 0}</strong></div>
        <div className="stat-card"><span>Packets/sec</span><strong>{report.packetsPerSecond ?? 0}</strong></div>
        <div className="stat-card"><span>Peak PPS</span><strong>{report.peakPacketsPerSecond ?? 0}</strong></div>
        <div className="stat-card"><span>Peak in-flight</span><strong>{report.peakInFlight ?? '—'}</strong></div>
        <div className="stat-card"><span>Success rate</span><strong>{report.successRate ?? 0}%</strong></div>
        <div className="stat-card"><span>Avg latency</span><strong>{report.avgLatencyMs ?? 0} ms</strong></div>
      </div>

      {(report.maxPower || report.godMode) && (
        <p className="panel-note camjam-power-note">
          <strong>Full power pipeline</strong> — continuous TCP/HTTP packet flood · ports {(report.portsTargeted || []).join(', ')}
        </p>
      )}

      <div className="panel-grid">
        <BarChart title="Packets by port" items={portItems} color="#6366f1" />
        <BarChart title="Packet types" items={typeItems} color="#8b5cf6" />
      </div>

      {test.cameraIntel && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ marginBottom: 12 }}>Pre-attack camera intel</h3>
          <CameraIntelPanel
            intel={test.cameraIntel}
            showView
            host={test.targetHost}
            viewCreds={viewCreds}
            onCredentialsChange={onCredentialsChange}
          />
        </div>
      )}
    </div>
  );
}

export default function CameraJam() {
  const { can } = useAuth();
  const [tests, setTests] = useState([]);
  const [selected, setSelected] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [running, setRunning] = useState(false);
  const [gathering, setGathering] = useState(false);
  const [cameraIntel, setCameraIntel] = useState(null);
  const [viewCreds, setViewCreds] = useState({ username: '', password: '' });
  const [viewModal, setViewModal] = useState(null);
  const [viewHost, setViewHost] = useState('192.168.1.100');
  const pollRef = useRef(null);
  const [form, setForm] = useState({
    name: '',
    targetHost: '192.168.1.100',
    jamProfile: 'rtsp_flood',
    godMode: false,
    maxPower: true,
    durationSeconds: 30,
    concurrency: 100,
  });

  const profileMap = useMemo(() => {
    const map = {};
    (meta?.jamProfiles || []).forEach((p) => { map[p.id] = p; });
    return map;
  }, [meta]);

  const load = async () => {
    try {
      const data = await api.getCameraJamTests();
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
    api.getCameraJamMeta().then(setMeta).catch(() => {});
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const startPolling = (id) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const test = await api.getCameraJamTest(id);
        setSelected(test);
        setTests((prev) => prev.map((t) => (t._id === test._id ? test : t)));
        if (!['pending', 'running'].includes(test.status)) {
          clearInterval(pollRef.current);
          setRunning(false);
          setMessage(`Jam complete — score ${test.report?.jamScore ?? 0}/100 (Grade ${test.report?.jamGrade || 'F'})`);
        }
      } catch (err) {
        setError(err.message);
        setRunning(false);
      }
    }, 2000);
  };

  const applyGodMode = () => {
    setForm((p) => ({
      ...p,
      name: p.name || 'God mode camera jam',
      godMode: true,
      maxPower: true,
      durationSeconds: MAX_DURATION,
      concurrency: MAX_CONCURRENCY,
      jamProfile: 'apocalypse_jam',
    }));
    setMessage(`God mode: ${MAX_CONCURRENCY} workers × ${meta?.godModeBurstSize || 500} burst · all camera ports · AI channels`);
  };

  const applyMaxJam = () => {
    setForm((p) => ({
      ...p,
      name: p.name || 'Apocalypse camera jam',
      godMode: false,
      maxPower: true,
      jamProfile: 'apocalypse_jam',
      durationSeconds: 300,
      concurrency: MAX_CONCURRENCY,
    }));
    setMessage('Apocalypse jam: all ports (554, 80, 8080, 8000, 37777…), ×400 burst, 10,000 workers');
  };

  const normalizeHost = (value) => value.replace(/^https?:\/\//, '').split(':')[0].split('/')[0];

  const handleOpenView = async (targetHost, existingIntel = null) => {
    setError('');
    setViewModal({ host: targetHost, intel: existingIntel, loading: !existingIntel });
    if (existingIntel) return;
    try {
      const intel = await api.gatherCameraIntel({ targetHost });
      setViewModal({ host: targetHost, intel, loading: false });
    } catch (err) {
      setError(err.message);
      setViewModal(null);
    }
  };

  const handleGatherIntel = async (hostOverride) => {
    const target = hostOverride || form.targetHost;
    setError('');
    setMessage('');
    setGathering(true);
    try {
      const intel = await api.gatherCameraIntel({ targetHost: target });
      setCameraIntel(intel);
      setViewHost(target);
      if (intel.recommendedProfile && !form.godMode && !hostOverride) {
        setForm((p) => ({ ...p, jamProfile: intel.recommendedProfile }));
      }
      setMessage(
        intel.online
          ? `Camera found — ${intel.manufacturer?.brand || 'Unknown'} · ${intel.openPorts?.length || 0} open ports · ${intel.summary?.liveViewAvailable ? 'live view ready' : 'no snapshot yet'}`
          : 'No open camera ports detected — camera may be offline or firewalled'
      );
      return intel;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setGathering(false);
    }
  };

  const applyRecommendedProfile = (profileId) => {
    setForm((p) => ({ ...p, jamProfile: profileId, godMode: false }));
    setMessage(`Jam profile set to ${profileMap[profileId]?.label || profileId}`);
  };

  const handleStart = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setRunning(true);
    try {
      const test = await api.createCameraJamTest({
        name: form.name,
        targetHost: form.targetHost,
        jamProfile: form.godMode ? undefined : form.jamProfile,
        godMode: form.godMode,
        maxPower: form.maxPower || form.godMode,
        durationSeconds: form.durationSeconds,
        concurrency: form.godMode ? undefined : form.concurrency,
        cameraIntel: cameraIntel?.host === normalizeHost(form.targetHost) ? cameraIntel : undefined,
        gatherIntel: !cameraIntel,
      });
      setSelected(test);
      setTests((prev) => [test, ...prev]);
      setMessage('Camera IP jam started — flooding packets...');
      startPolling(test._id);
    } catch (err) {
      setError(err.message);
      setRunning(false);
    }
  };

  const handleDownloadPdf = async (test) => {
    try {
      const blob = await api.downloadCameraJamPdf(test._id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `CameraJam-${test.targetHost}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCancel = async (id) => {
    await api.cancelCameraJamTest(id);
    setMessage('Jam stopped');
    load();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this camera jam test?')) return;
    await api.deleteCameraJamTest(id);
    if (selected?._id === id) setSelected(null);
    load();
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Camera IP Jam</h2>
          <p>Flood IP camera ports with TCP/HTTP packets to test stream resilience and bandwidth limits</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {message && <div className="success-banner">{message}</div>}

      <div className="camjam-warning panel">
        <strong>Authorized testing only.</strong> Test only cameras and networks you own or have explicit permission to stress-test.
      </div>

      {can('camjam:view') && (
        <section className="panel camview-section">
          <h3>Camera view & recon</h3>
          <p className="panel-note">
            Scan the camera, view live snapshots, and review open ports before running a jam test.
          </p>
          <div className="camintel-input-row">
            <input
              value={viewHost}
              onChange={(e) => setViewHost(e.target.value)}
              placeholder="192.168.1.100"
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => handleGatherIntel(viewHost)}
              disabled={gathering}
            >
              {gathering ? 'Scanning...' : 'Gather info'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleOpenView(viewHost, cameraIntel?.host === normalizeHost(viewHost) ? cameraIntel : null)}
              disabled={gathering}
            >
              View camera
            </button>
          </div>

          {cameraIntel?.host === normalizeHost(viewHost) && (
            <div style={{ marginTop: 16 }}>
              <CameraIntelPanel
                intel={cameraIntel}
                onApplyProfile={can('camjam:run') ? applyRecommendedProfile : undefined}
                showView
                host={cameraIntel.host}
                viewCreds={viewCreds}
                onCredentialsChange={(patch) => setViewCreds((p) => ({ ...p, ...patch }))}
              />
            </div>
          )}
        </section>
      )}

      {can('camjam:run') && (
        <section className="panel loadtest-form-panel">
          <h3>Run camera IP jam</h3>
          <p className="panel-note">
            Targets RTSP (554), HTTP admin (80/8080), Hikvision (8000), Dahua (37777), ONVIF (8899).
            Full power mode uses continuous pipeline — no batch wait, up to 200K in-flight packets.
          </p>
          <form onSubmit={handleStart} className="form-grid">
            <label>
              Test name (optional)
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Lobby camera jam" />
            </label>
            <label>
              Camera IP / hostname
              <div className="camintel-input-row">
                <input required value={form.targetHost} onChange={(e) => { setForm({ ...form, targetHost: e.target.value }); setCameraIntel(null); }} placeholder="192.168.1.100" />
                <button type="button" className="btn btn-secondary" onClick={() => handleGatherIntel()} disabled={gathering || running}>
                  {gathering ? 'Scanning...' : 'Gather camera info'}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleOpenView(form.targetHost, cameraIntel?.host === normalizeHost(form.targetHost) ? cameraIntel : null)}
                  disabled={gathering || running}
                >
                  View camera
                </button>
              </div>
              <span className="field-hint">Scan ports, detect manufacturer, find RTSP/HTTP/ONVIF endpoints before attack</span>
            </label>

            {cameraIntel && (
              <CameraIntelPanel
                intel={cameraIntel}
                onApplyProfile={applyRecommendedProfile}
                showView
                host={cameraIntel.host}
                viewCreds={viewCreds}
                onCredentialsChange={(patch) => setViewCreds((p) => ({ ...p, ...patch }))}
              />
            )}
            {!form.godMode && (
              <label>
                Jam profile
                <select value={form.jamProfile} onChange={(e) => setForm({ ...form, jamProfile: e.target.value, godMode: false })}>
                  {(meta?.jamProfiles || []).map((p) => (
                    <option key={p.id} value={p.id}>{p.label} (×{p.burstSize} · ports {p.ports.join(',')})</option>
                  ))}
                </select>
                {profileMap[form.jamProfile]?.description && (
                  <span className="field-hint">{profileMap[form.jamProfile].description}</span>
                )}
              </label>
            )}
            {form.godMode && (
              <div className="panel-note ddos-godmode-active">
                God mode — {MAX_CONCURRENCY} workers · ×{meta?.godModeBurstSize || 500} burst · all camera ports · AI channels
              </div>
            )}
            <div className="form-row">
              <label>
                Duration (seconds)
                <input type="number" min="5" max="108000" required value={form.durationSeconds}
                  onChange={(e) => setForm({ ...form, durationSeconds: Number(e.target.value) })} />
              </label>
              {!form.godMode && (
                <label>
                  Workers
                  <input type="number" min="1" max="10000" required value={form.concurrency}
                    onChange={(e) => setForm({ ...form, concurrency: Number(e.target.value) })} />
                </label>
              )}
            </div>
            {!form.godMode && (
              <label className="checkbox-row">
                <input type="checkbox" checked={form.maxPower} onChange={(e) => setForm({ ...form, maxPower: e.target.checked })} />
                Full power (continuous pipeline, aggressive timeouts)
              </label>
            )}
            <div className="modal-actions" style={{ marginTop: 0 }}>
              <button type="button" className="btn btn-danger" onClick={applyGodMode} disabled={running}>God mode jam</button>
              <button type="button" className="btn btn-danger" onClick={applyMaxJam} disabled={running}>Apocalypse jam</button>
              {form.godMode && (
                <button type="button" className="btn btn-secondary" onClick={() => setForm((p) => ({ ...p, godMode: false }))} disabled={running}>Disable god mode</button>
              )}
              <button type="submit" className="btn btn-primary" disabled={running}>{running ? 'Jamming...' : 'Start jam'}</button>
            </div>
          </form>
        </section>
      )}

      {selected && (
        <div style={{ marginTop: 20 }}>
          {['pending', 'running'].includes(selected.status) ? (
            <>
              <section className="panel loadtest-running">
                <h3>Jam in progress</h3>
                <p className="panel-note">Flooding {selected.targetHost} with IP packets...</p>
                <div className="loadtest-spinner camjam-spinner" />
                {can('camjam:run') && (
                  <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => handleCancel(selected._id)}>Stop jam</button>
                )}
              </section>
              {selected.cameraIntel && (
                <div style={{ marginTop: 16 }}>
                  <CameraViewPanel
                    host={selected.targetHost}
                    intel={selected.cameraIntel}
                    username={viewCreds.username}
                    password={viewCreds.password}
                    onCredentialsChange={(patch) => setViewCreds((p) => ({ ...p, ...patch }))}
                    liveLabel="Live view during jam"
                    compact
                  />
                </div>
              )}
            </>
          ) : (
            <JamReport
              test={selected}
              profileMap={profileMap}
              onDownloadPdf={handleDownloadPdf}
              viewCreds={viewCreds}
              onCredentialsChange={(patch) => setViewCreds((p) => ({ ...p, ...patch }))}
            />
          )}
        </div>
      )}

      <div className="table-wrap" style={{ marginTop: 24 }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Camera IP</th>
              <th>Profile</th>
              <th>Workers</th>
              <th>Status</th>
              <th>Jam score</th>
              <th>Peak PPS</th>
              <th>When</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tests.length === 0 ? (
              <tr><td colSpan="9"><div className="empty-state">No jam tests yet.</div></td></tr>
            ) : tests.map((t) => (
              <tr key={t._id}>
                <td>{t.name || '—'}</td>
                <td>{t.targetHost}</td>
                <td>{t.godMode ? 'God Mode' : (profileMap[t.jamProfile]?.label || t.jamProfile)}</td>
                <td>{t.concurrency}</td>
                <td><Badge value={t.status} /></td>
                <td>{t.report?.jamScore != null ? `${t.report.jamScore}/100 (${t.report.jamGrade})` : '—'}</td>
                <td>{t.report?.peakPacketsPerSecond ?? '—'}</td>
                <td>{formatDateTime(t.createdAt)}</td>
                <td>
                  <div className="actions">
                    <button className="btn btn-secondary" onClick={() => handleOpenView(t.targetHost, t.cameraIntel)}>View</button>
                    <button className="btn btn-secondary" onClick={() => { setSelected(t); if (t.cameraIntel) setCameraIntel(t.cameraIntel); }}>Report</button>
                    {['completed', 'cancelled'].includes(t.status) && (t.report?.totalPackets ?? 0) > 0 && (
                      <button className="btn btn-secondary" onClick={() => handleDownloadPdf(t)}>PDF</button>
                    )}
                    {can('camjam:delete') && <button className="btn btn-danger" onClick={() => handleDelete(t._id)}>Delete</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {viewModal && (
        <Modal title={`Camera view — ${viewModal.host}`} onClose={() => setViewModal(null)} wide>
          {viewModal.loading ? (
            <div className="camview-modal-loading">
              <div className="loadtest-spinner camjam-spinner" />
              <p className="panel-note">Scanning camera and probing snapshot URLs...</p>
            </div>
          ) : (
            <>
              {viewModal.intel && (
                <CameraIntelPanel
                  intel={viewModal.intel}
                  showView
                  host={viewModal.host}
                  viewCreds={viewCreds}
                  onCredentialsChange={(patch) => setViewCreds((p) => ({ ...p, ...patch }))}
                />
              )}
              {!viewModal.intel && (
                <CameraViewPanel
                  host={viewModal.host}
                  username={viewCreds.username}
                  password={viewCreds.password}
                  onCredentialsChange={(patch) => setViewCreds((p) => ({ ...p, ...patch }))}
                />
              )}
            </>
          )}
        </Modal>
      )}
    </>
  );
}
