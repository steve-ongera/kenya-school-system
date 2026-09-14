// components/LicenseUsageToasts.jsx
import { useLicenseUsage } from "../context/LicenseUsageContext";

const LEVEL_STYLES = {
  warning: { bg: "#fff8e1", border: "#f59f00", icon: "bi-exclamation-triangle-fill", color: "#996a00" },
  critical: { bg: "#fdecea", border: "#e03131", icon: "bi-exclamation-octagon-fill", color: "#c92a2a" },
};

export default function LicenseUsageToasts() {
  const { toasts, dismiss } = useLicenseUsage();

  if (!toasts.length) return null;

  return (
    <div
      style={{
        position: "fixed", top: 16, right: 16, zIndex: 1100,
        display: "flex", flexDirection: "column", gap: 8, maxWidth: 360,
      }}
    >
      {toasts.map((t) => {
        const style = LEVEL_STYLES[t.level] || LEVEL_STYLES.warning;
        return (
          <div
            key={t.id}
            className="card p-3"
            style={{ background: style.bg, border: `1px solid ${style.border}` }}
          >
            <div className="d-flex align-items-start gap-2">
              <i className={`bi ${style.icon}`} style={{ color: style.color, fontSize: "1.1rem", marginTop: 2 }}></i>
              <div style={{ flex: 1, fontSize: "var(--fs-sm)", color: "var(--ink-900)" }}>{t.message}</div>
              <button
                type="button"
                className="btn-close"
                aria-label="Dismiss"
                onClick={() => dismiss(t.id)}
                style={{ fontSize: "0.7rem" }}
              ></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}