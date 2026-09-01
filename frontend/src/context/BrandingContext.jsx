import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api';

const DEFAULT_BRANDING = {
  appName: 'Vistawin CRM',
  appTagline: 'Customer relationships',
  appInitial: 'V',
};

const BrandingContext = createContext(DEFAULT_BRANDING);

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState(DEFAULT_BRANDING);

  const refreshBranding = useCallback(async () => {
    try {
      const data = await api.getBranding();
      const next = {
        appName: data.appName || DEFAULT_BRANDING.appName,
        appTagline: data.appTagline || DEFAULT_BRANDING.appTagline,
        appInitial: data.appInitial || (data.appName || 'V').charAt(0).toUpperCase(),
      };
      setBranding(next);
      document.title = next.appName;
      const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
      if (appleTitle) appleTitle.setAttribute('content', next.appName);
      return next;
    } catch {
      document.title = DEFAULT_BRANDING.appName;
      return DEFAULT_BRANDING;
    }
  }, []);

  useEffect(() => {
    refreshBranding();
  }, [refreshBranding]);

  return (
    <BrandingContext.Provider value={{ ...branding, refreshBranding, setBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}
