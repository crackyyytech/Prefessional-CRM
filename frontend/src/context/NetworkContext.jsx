import { createContext, useContext, useEffect, useState } from 'react';
import { setBrowserConnectionHint, setOnlineStatus, subscribe } from '../network/networkBus';

const NetworkContext = createContext({
  online: true,
  loading: false,
  slow: false,
  pending: 0,
  reconnectFlash: false,
  avgRttMs: null,
  speed: {
    downlinkMbps: null,
    latencyMs: null,
    quality: 'unknown',
    effectiveType: null,
    measuredAt: null,
    measuring: false,
  },
});

export function NetworkProvider({ children }) {
  const [state, setState] = useState({
    online: navigator.onLine,
    loading: false,
    slow: false,
    pending: 0,
    reconnectFlash: false,
    avgRttMs: null,
    speed: {
      downlinkMbps: null,
      latencyMs: null,
      quality: 'unknown',
      effectiveType: null,
      measuredAt: null,
      measuring: false,
    },
  });

  useEffect(() => {
    const onOnline = () => setOnlineStatus(true);
    const onOffline = () => setOnlineStatus(false);
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

    const syncConnection = () => setBrowserConnectionHint(connection);
    if (connection) {
      syncConnection();
      connection.addEventListener?.('change', syncConnection);
    }

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const unsubscribe = subscribe(setState);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      connection?.removeEventListener?.('change', syncConnection);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle('is-offline', !state.online);
    document.body.classList.toggle('is-network-loading', state.loading);
    document.body.classList.toggle('is-network-slow', state.slow);
  }, [state.online, state.loading, state.slow]);

  return (
    <NetworkContext.Provider value={state}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}
