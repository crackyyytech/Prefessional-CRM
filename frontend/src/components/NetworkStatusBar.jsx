import { useNetwork } from '../context/NetworkContext';

function WifiOffIcon() {
  return (
    <svg className="nw-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 8.82a16 16 0 0 1 20 0M5 12.43a11 11 0 0 1 14 0M8.5 16.07a6 6 0 0 1 7 0M12 20h.01"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function SignalIcon() {
  return (
    <svg className="nw-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 14a8 8 0 0 1 16 0" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M7 17a5 5 0 0 1 10 0" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="12" cy="20" r="1.5" fill="currentColor" />
    </svg>
  );
}

export default function NetworkStatusBar() {
  const { online, loading, slow, reconnectFlash, speed } = useNetwork();

  const showProgress = online && loading;
  const showOffline = !online;
  const showReconnect = online && reconnectFlash && !loading;
  const showSpeedChip = online && speed?.downlinkMbps != null && !showOffline;

  return (
    <div className="nw-status-root" role="status" aria-live="polite">
      <div
        className={[
          'nw-progress-track',
          showProgress ? 'is-active' : '',
          slow ? 'is-slow' : '',
          showReconnect ? 'is-reconnect' : '',
        ].filter(Boolean).join(' ')}
        aria-hidden={!showProgress && !showReconnect}
      >
        <div className="nw-progress-glow" />
        <div className="nw-progress-beam" />
      </div>

      {showOffline && (
        <div className="nw-offline-banner">
          <WifiOffIcon />
          <div className="nw-offline-copy">
            <strong>No internet connection</strong>
            <span>You're offline — requests are paused until connection returns</span>
          </div>
        </div>
      )}

      {showProgress && slow && (
        <div className="nw-slow-pill">
          <span className="nw-slow-dot" />
          Slow connection — loading may take longer
        </div>
      )}

      {showSpeedChip && !showProgress && (
        <div className={`nw-speed-chip quality-${speed.quality || 'unknown'}`}>
          <SignalIcon />
          <span>
            {speed.downlinkMbps >= 10
              ? `${speed.downlinkMbps.toFixed(1)} Mbps`
              : `${speed.downlinkMbps.toFixed(2)} Mbps`}
            {speed.latencyMs != null ? ` · ${speed.latencyMs} ms` : ''}
          </span>
        </div>
      )}

      {showReconnect && (
        <div className="nw-reconnect-banner">
          <SignalIcon />
          <span>Back online — connection restored</span>
        </div>
      )}
    </div>
  );
}
