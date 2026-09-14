// src/context/LicenseContext.jsx
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { licenseApi } from "../services/api";

export const LicenseContext = createContext(null);

export function LicenseProvider({ children }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await licenseApi.status();
      setStatus(data);
    } catch {
      // fail OPEN - a network blip or a down endpoint should never lock people out
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // catches a redeem done in another tab, or the trial ticking over,
    // without needing a full page reload
    const interval = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  const locked = Boolean(status && (status.is_suspended || status.is_expired));

  return (
    <LicenseContext.Provider value={{ status, loading, locked, refresh }}>
      {children}
    </LicenseContext.Provider>
  );
}

export function useLicense() {
  const ctx = useContext(LicenseContext);
  if (!ctx) throw new Error("useLicense must be used inside a LicenseProvider");
  return ctx;
}