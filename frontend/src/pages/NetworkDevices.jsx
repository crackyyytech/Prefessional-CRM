import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../utils';

function DeviceBadge({ device }) {
  if (device.isSelf) return <span className="network-badge self">This PC</span>;
  if (device.isGateway) return <span className="network-badge gateway">Gateway</span>;
  if (device.connectionType === 'wifi') return <span className="network-badge wifi">Wi‑Fi</span>;
  if (device.riskLevel === 'high') return <span className="network-badge risk-high">High risk</span>;
  if (device.riskLevel === 'medium') return <span className="network-badge risk-medium">Medium</span>;
  return <span className="network-badge online">Online</span>;
}

function SeverityBadge({ severity }) {
  const s = String(severity || 'info').toLowerCase();
  return <span className={`network-finding-sev ${s}`}>{s}</span>;
}

function deviceLabel(device) {
  return device?.displayName || device?.hostname || device?.vendor || `Host-${String(device?.ip || '').split('.').pop()}` || 'Unknown device';
}

function kindLabel(kind, internal) {
  if (internal) return 'Loopback';
  if (kind === 'wifi') return 'Wi‑Fi';
  if (kind === 'ethernet') return 'Ethernet';
  if (kind === 'virtual') return 'Virtual';
  return 'LAN';
}

export default function NetworkDevices() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [meta, setMeta] = useState(null);
  const [scans, setScans] = useState([]);
  const [selected, setSelected] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [listFilter, setListFilter] = useState('all');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const [metaData, list] = await Promise.all([
      api.getNetworkScanMeta(),
      api.getNetworkScans(),
    ]);
    setMeta(metaData);
    setScans(list || []);
    if (!selected && list?.[0]) {
      setSelected(list[0]);
      setSelectedDevice(list[0]?.report?.devices?.[0] || null);
    }
  }, [selected]);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  const runScan = async () => {
    if (!can('network:run')) return;
    setScanning(true);
    setError('');
    setMessage('');
    try {
      // Empty subnet → scan all private LAN adapters (Wi‑Fi + Ethernet)
      const scan = await api.createNetworkScan({
        name: `Deep LAN scan ${new Date().toLocaleString('en-IN')}`,
        subnet: '',
      });
      setScans((prev) => [scan, ...prev.filter((item) => item._id !== scan._id)]);
      setSelected(scan);
      setSelectedDevice(scan.report?.devices?.[0] || null);
      const wifiN = scan.report?.wifiDeviceCount ?? 0;
      const ethN = scan.report?.ethernetDeviceCount ?? 0;
      setMessage(
        scan.status === 'completed'
          ? `Found ${scan.report?.onlineCount || 0} devices (${wifiN} Wi‑Fi · ${ethN} Ethernet) on ${scan.subnet}`
          : scan.errorMessage || 'Scan finished with errors'
      );
      setMeta(await api.getNetworkScanMeta());
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  };

  const deleteScan = async (id) => {
    if (!can('network:delete')) return;
    if (!window.confirm('Delete this network scan?')) return;
    try {
      await api.deleteNetworkScan(id);
      const next = scans.filter((item) => item._id !== id);
      setScans(next);
      if (selected?._id === id) {
        setSelected(next[0] || null);
        setSelectedDevice(next[0]?.report?.devices?.[0] || null);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const openDdosForDevice = (device) => {
    if (!device || !can('ddos:run')) return;
    const target = device.attackUrl || `http://${device.ip}/`;
    const name = `LAN DDoS · ${deviceLabel(device)}`;
    navigate(`/ddos-attack?target=${encodeURIComponent(target)}&name=${encodeURIComponent(name)}&from=network`);
  };

  const report = selected?.report || {};
  const devices = report.devices || [];
  const wifiDevices = report.wifiDevices?.length
    ? report.wifiDevices
    : devices.filter((d) => d.connectionType === 'wifi');
  const interfaces = meta?.localInterfaces || report.localInterfaces || [];
  const wifi = meta?.wifi || report.wifi || {};

  const visibleDevices = useMemo(() => {
    if (listFilter === 'wifi') return wifiDevices;
    if (listFilter === 'ethernet') {
      return devices.filter((d) => d.connectionType === 'ethernet');
    }
    return devices;
  }, [devices, wifiDevices, listFilter]);

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Network Devices</h2>
          <p>
            Deep LAN discovery with ICMP + ports + ARP, Wi‑Fi client listing, and per-device analysis.
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={runScan}
            disabled={scanning || !can('network:run')}
          >
            {scanning ? 'Deep scanning…' : 'Scan Wi‑Fi + LAN'}
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {message && <div className="success-banner">{message}</div>}

      <section className="panel">
        <h3>This computer &amp; Wi‑Fi</h3>
        <div className="stats-grid">
          <div className="stat-card">
            <span>Hostname</span>
            <strong>{meta?.hostname || '—'}</strong>
          </div>
          <div className="stat-card">
            <span>Wi‑Fi SSID</span>
            <strong>{wifi.connected ? (wifi.ssid || 'Connected') : 'Not connected'}</strong>
          </div>
          <div className="stat-card">
            <span>Wi‑Fi signal</span>
            <strong>{wifi.signal || '—'}</strong>
          </div>
          <div className="stat-card">
            <span>Primary LAN</span>
            <strong>{meta?.primaryInterface?.address || '—'}</strong>
          </div>
        </div>

        {wifi.connected && (
          <div className="network-wifi-banner">
            <div>
              <strong>Connected to Wi‑Fi</strong>
              <p>
                SSID <em>{wifi.ssid}</em>
                {wifi.radio ? ` · ${wifi.radio}` : ''}
                {wifi.bssid ? ` · AP ${wifi.bssid}` : ''}
                {wifi.interface ? ` · adapter ${wifi.interface}` : ''}
              </p>
            </div>
            <span className="network-badge wifi">Live</span>
          </div>
        )}

        {interfaces.length > 0 && (
          <div className="table-wrap" style={{ marginTop: 14 }}>
            <table>
              <thead>
                <tr>
                  <th>Adapter</th>
                  <th>IP</th>
                  <th>Subnet</th>
                  <th>MAC</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {interfaces.map((iface) => (
                  <tr key={`${iface.name}-${iface.address}`}>
                    <td>{iface.name}</td>
                    <td>{iface.address}</td>
                    <td>{iface.cidr}</td>
                    <td>{iface.mac || '—'}</td>
                    <td>{kindLabel(iface.kind, iface.internal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {wifiDevices.length > 0 && (
        <section className="panel" style={{ marginTop: 16 }}>
          <div className="ai-image-history-header">
            <h3>Wi‑Fi connected devices</h3>
            <span className="panel-note">
              {wifiDevices.length} on Wi‑Fi subnet
              {wifi.ssid ? ` · ${wifi.ssid}` : ''}
            </span>
          </div>
          <div className="network-wifi-grid">
            {wifiDevices.map((device) => (
              <button
                type="button"
                key={`wifi-${device.ip}`}
                className={`network-wifi-card${selectedDevice?.ip === device.ip ? ' active' : ''}`}
                onClick={() => {
                  setListFilter('all');
                  setSelectedDevice(device);
                }}
              >
                <div className="network-wifi-card-top">
                  <strong>{deviceLabel(device)}</strong>
                  <DeviceBadge device={device} />
                </div>
                <span>{device.ip}</span>
                <small>{device.deviceType || 'Wi‑Fi client'} · {device.vendor || 'vendor unknown'}</small>
                <small>{device.serviceSummary || 'Silent / ping only'}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="network-layout">
        <section className="panel">
          <div className="ai-image-history-header">
            <h3>All discovered devices</h3>
            <span className="panel-note">
              {selected?.status === 'completed'
                ? `${devices.length} online · ${report.wifiDeviceCount || 0} Wi‑Fi · ${report.durationMs || 0} ms`
                : 'Run a scan to list devices'}
            </span>
          </div>

          <div className="network-filter-row">
            <button
              type="button"
              className={`btn btn-secondary${listFilter === 'all' ? ' active-filter' : ''}`}
              onClick={() => setListFilter('all')}
            >
              All ({devices.length})
            </button>
            <button
              type="button"
              className={`btn btn-secondary${listFilter === 'wifi' ? ' active-filter' : ''}`}
              onClick={() => setListFilter('wifi')}
            >
              Wi‑Fi ({wifiDevices.length})
            </button>
            <button
              type="button"
              className={`btn btn-secondary${listFilter === 'ethernet' ? ' active-filter' : ''}`}
              onClick={() => setListFilter('ethernet')}
            >
              Ethernet ({report.ethernetDeviceCount ?? devices.filter((d) => d.connectionType === 'ethernet').length})
            </button>
          </div>

          {visibleDevices.length === 0 ? (
            <p className="empty-state">
              No devices yet. Click <strong>Scan Wi‑Fi + LAN</strong> for deep discovery (ping + ports + ARP).
            </p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Device name</th>
                    <th>Link</th>
                    <th>Type</th>
                    <th>IP</th>
                    <th>MAC / Vendor</th>
                    <th>Services</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleDevices.map((device) => (
                    <tr
                      key={device.ip}
                      className={`network-row${selectedDevice?.ip === device.ip ? ' active' : ''}`}
                      onClick={() => setSelectedDevice(device)}
                    >
                      <td>
                        <div className="network-device-name">
                          <strong>{deviceLabel(device)}</strong>
                          <DeviceBadge device={device} />
                          {device.hostname && device.hostname !== device.displayName && (
                            <small>Host: {device.hostname}</small>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="network-device-name">
                          <span>{device.connectionType === 'wifi' ? 'Wi‑Fi' : device.connectionType === 'ethernet' ? 'Ethernet' : 'LAN'}</span>
                          <small>{device.wifiSsid || device.adapter || device.subnet || '—'}</small>
                        </div>
                      </td>
                      <td>
                        <div className="network-device-name">
                          <span>{device.deviceType || 'LAN device'}</span>
                          <small>{device.osHint || 'OS unknown'}</small>
                        </div>
                      </td>
                      <td>{device.ip}</td>
                      <td>
                        <div className="network-device-name">
                          <span>{device.mac || '—'}</span>
                          <small>{device.vendor || 'Vendor unknown'}</small>
                        </div>
                      </td>
                      <td>
                        <span className="network-services-cell">
                          {device.serviceSummary || ((device.openPorts || []).map((p) => p.port).join(', ') || '—')}
                        </span>
                      </td>
                      <td>{device.analysis?.score ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="panel network-detail">
          <h3>Deep analysis</h3>
          {!selectedDevice ? (
            <p className="empty-state">Select a device to gather details</p>
          ) : (
            <div className="network-detail-body">
              <div className="network-detail-hero">
                <strong>{deviceLabel(selectedDevice)}</strong>
                <DeviceBadge device={selectedDevice} />
              </div>

              {selectedDevice.analysis && (
                <div className="network-analysis-score">
                  <div>
                    <span>Analysis score</span>
                    <strong>{selectedDevice.analysis.score}/100</strong>
                  </div>
                  <p>{selectedDevice.analysis.summary}</p>
                </div>
              )}

              <div className="network-detail-row"><span>Device type</span><strong>{selectedDevice.deviceType || 'LAN device'}</strong></div>
              <div className="network-detail-row"><span>Connection</span><strong>{selectedDevice.connectionType === 'wifi' ? `Wi‑Fi${selectedDevice.wifiSsid ? ` · ${selectedDevice.wifiSsid}` : ''}` : selectedDevice.connectionType || 'LAN'}</strong></div>
              <div className="network-detail-row"><span>Hostname</span><strong>{selectedDevice.hostname || 'Not resolved'}</strong></div>
              <div className="network-detail-row"><span>IP address</span><strong>{selectedDevice.ip}</strong></div>
              <div className="network-detail-row"><span>MAC address</span><strong>{selectedDevice.mac || 'Not available'}</strong></div>
              <div className="network-detail-row"><span>Vendor</span><strong>{selectedDevice.vendor || 'Unknown'}</strong></div>
              <div className="network-detail-row"><span>OS / firmware</span><strong>{selectedDevice.osHint || 'Unknown'}</strong></div>
              <div className="network-detail-row"><span>ICMP / TTL</span><strong>{selectedDevice.icmpAlive ? `Alive${selectedDevice.ttl != null ? ` · TTL ${selectedDevice.ttl}` : ''}` : 'No ping'}</strong></div>
              <div className="network-detail-row"><span>HTTP title</span><strong>{selectedDevice.httpTitle || '—'}</strong></div>
              <div className="network-detail-row"><span>HTTP server</span><strong>{selectedDevice.httpServer || '—'}</strong></div>
              <div className="network-detail-row"><span>Latency</span><strong>{selectedDevice.latencyMs == null ? '—' : `${selectedDevice.latencyMs} ms`}</strong></div>
              <div className="network-detail-row"><span>Risk</span><strong>{selectedDevice.riskLevel || 'low'}</strong></div>
              <div className="network-detail-row"><span>Adapter / subnet</span><strong>{[selectedDevice.adapter, selectedDevice.subnet].filter(Boolean).join(' · ') || '—'}</strong></div>
              <div className="network-detail-row"><span>Attack URL</span><strong className="network-attack-url">{selectedDevice.attackUrl || `http://${selectedDevice.ip}/`}</strong></div>

              <h4 style={{ marginTop: 16 }}>Gathered findings</h4>
              {(selectedDevice.analysis?.findings || []).length === 0 ? (
                <p className="panel-note">No structured findings yet — run a new deep scan.</p>
              ) : (
                <ul className="network-findings-list">
                  {selectedDevice.analysis.findings.map((finding) => (
                    <li key={finding.id || finding.title}>
                      <div className="network-finding-head">
                        <SeverityBadge severity={finding.severity} />
                        <strong>{finding.title}</strong>
                      </div>
                      <p>{finding.detail}</p>
                      {finding.recommendation && <small>{finding.recommendation}</small>}
                    </li>
                  ))}
                </ul>
              )}

              <h4 style={{ marginTop: 16 }}>Open services</h4>
              {(selectedDevice.openPorts || []).length === 0 ? (
                <p className="panel-note">No common ports answered (phones often appear via ping/ARP only).</p>
              ) : (
                <ul className="network-port-list">
                  {selectedDevice.openPorts.map((port) => (
                    <li key={port.port}>
                      <strong>{port.port}</strong>
                      <span>{port.service}</span>
                      <em>{port.latencyMs} ms</em>
                    </li>
                  ))}
                </ul>
              )}

              <div className="network-detail-actions">
                {can('ddos:run') ? (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => openDdosForDevice(selectedDevice)}
                    disabled={selectedDevice.isSelf}
                    title={selectedDevice.isSelf ? 'Cannot attack this PC from itself here' : 'Open DDoS Attack with this device target'}
                  >
                    DDoS Attack this device
                  </button>
                ) : (
                  <p className="panel-note">You need DDoS permission to attack a device.</p>
                )}
                {can('ddos:view') && (
                  <Link className="btn btn-secondary" to="/ddos-attack">
                    Open DDoS page
                  </Link>
                )}
              </div>
              {selectedDevice.isSelf && (
                <p className="panel-note">Self-target is blocked. Pick another LAN device for DDoS testing.</p>
              )}
            </div>
          )}
        </aside>
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <h3>Scan history</h3>
        {scans.length === 0 ? (
          <p className="empty-state">No scans yet</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Subnet</th>
                  <th>Devices</th>
                  <th>Wi‑Fi</th>
                  <th>Status</th>
                  <th>When</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {scans.map((scan) => (
                  <tr key={scan._id} className={selected?._id === scan._id ? 'network-row active' : 'network.row'}>
                    <td>
                      <button
                        type="button"
                        className="linkish"
                        onClick={() => {
                          setSelected(scan);
                          setSelectedDevice(scan.report?.devices?.[0] || null);
                        }}
                      >
                        {scan.name}
                      </button>
                    </td>
                    <td>{scan.subnet || '—'}</td>
                    <td>{scan.report?.onlineCount ?? 0}</td>
                    <td>{scan.report?.wifiDeviceCount ?? 0}</td>
                    <td>{scan.status}</td>
                    <td>{formatDateTime(scan.finishedAt || scan.createdAt)}</td>
                    <td>
                      {can('network:delete') && (
                        <button type="button" className="btn btn-danger" onClick={() => deleteScan(scan._id)}>
                          Delete
                        </button>
                      )}
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
