// context/LicenseUsageContext.jsx
import { createContext, useContext, useCallback, useEffect, useRef, useState } from "react";
import { licenseApi } from "../services/api";
import { AuthContext } from "./AuthContext";

export const LicenseUsageContext = createContext(null);

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const TOAST_LIFETIME_MS = 12000;
const WARNING_THRESHOLD = 70;
const CRITICAL_THRESHOLD = 90;
const EXPIRY_WARNING_DAYS = 7;
const EXPIRY_CRITICAL_DAYS = 3;

function usageBand(pct) {
  if (pct >= CRITICAL_THRESHOLD) return "critical";
  if (pct >= WARNING_THRESHOLD) return "warning";
  return null;
}

function expiryBand(daysLeft) {
  if (daysLeft <= EXPIRY_CRITICAL_DAYS) return "critical";
  if (daysLeft <= EXPIRY_WARNING_DAYS) return "warning";
  return null;
}

export function LicenseUsageProvider({ children }) {
  const { user } = useContext(AuthContext);
  const isAdmin = user?.role === "ADMIN";

  const [toasts, setToasts] = useState([]);
  // Remembers the last band shown per metric. A "warning" only fires once
  // per crossing (cleared once usage drops back under 70%); "critical" is
  // allowed to re-fire on every poll - that's the every-5-minutes nag.
  const lastBand = useRef({});

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (metric, level, message) => {
      const id = `${metric}-${Date.now()}`;
      setToasts((prev) => [...prev, { id, level, message }]);
      setTimeout(() => dismiss(id), TOAST_LIFETIME_MS);
    },
    [dismiss]
  );

  const evaluate = useCallback(
    (metric, band, message) => {
      const previous = lastBand.current[metric] || null;
      if (!band) {
        lastBand.current[metric] = null;
        return;
      }
      const shouldFire = band === "critical" || previous !== band;
      lastBand.current[metric] = band;
      if (shouldFire) push(metric, band, message);
    },
    [push]
  );

  const check = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const { data } = await licenseApi.me();

      [
        ["students", "Students", data.usage?.students],
        ["classrooms_this_year", "Classrooms", data.usage?.classrooms_this_year],
        ["teachers", "Teachers", data.usage?.teachers],
      ].forEach(([metric, label, block]) => {
        if (!block || block.unlimited || !block.limit) {
          lastBand.current[metric] = null;
          return;
        }
        const pct = Math.round((block.used / block.limit) * 100);
        evaluate(
          metric,
          usageBand(pct),
          `${label} usage is at ${pct}% (${block.used}/${block.limit}) on your ${data.tier_display} plan.`
        );
      });

      if (data.valid_until && !data.is_expired) {
        const daysLeft = Math.ceil((new Date(data.valid_until) - new Date()) / 86400000);
        evaluate(
          "expiry",
          expiryBand(daysLeft),
          daysLeft <= 0
            ? "Your license expires today. Redeem an upgrade code to avoid interruption."
            : `Your license expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`
        );
      } else {
        lastBand.current.expiry = null;
      }
    } catch {
      // silent - this is a background nicety, not a critical path
    }
  }, [isAdmin, evaluate]);

  useEffect(() => {
    if (!isAdmin) {
      setToasts([]);
      lastBand.current = {};
      return;
    }
    check();
    const interval = setInterval(check, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isAdmin, check]);

  return (
    <LicenseUsageContext.Provider value={{ toasts, dismiss }}>
      {children}
    </LicenseUsageContext.Provider>
  );
}

export function useLicenseUsage() {
  const ctx = useContext(LicenseUsageContext);
  if (!ctx) throw new Error("useLicenseUsage must be used inside a LicenseUsageProvider");
  return ctx;
}