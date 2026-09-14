// components/LicenseLockOverlay.jsx
import { useContext } from "react";
import { Link, useLocation } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { useLicense } from "../context/LicenseContext";

export default function LicenseLockOverlay({ children }) {
  const { locked, status, loading } = useLicense();
  const { user } = useContext(AuthContext);
  const location = useLocation();

  const isAdmin = user?.role === "ADMIN";
  const onLicensePage = location.pathname === "/admin/license";

  // Not locked, still checking, or the admin is already on the one
  // page that's allowed to stay usable - render normally.
  if (loading || !locked || (isAdmin && onLicensePage)) {
    return children;
  }

  const reason = status?.is_suspended
    ? "This account has been suspended."
    : "Your license has expired.";

  return (
    <div style={{ position: "relative", minHeight: "60vh" }}>
      <div aria-hidden="true" style={{ filter: "blur(6px)", pointerEvents: "none", userSelect: "none" }}>
        {children}
      </div>

      <div
        style={{
          position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.45)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1050,
        }}
      >
        <div className="card p-4 text-center" style={{ maxWidth: 420 }}>
          <div
            style={{
              width: 56, height: 56, borderRadius: "50%", background: "var(--blue-100)",
              color: "var(--blue-700)", display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: "1.6rem", margin: "0 auto 1rem",
            }}
          >
            <i className="bi bi-lock-fill"></i>
          </div>
          <h5 style={{ fontWeight: 700 }}>{reason}</h5>
          <p className="text-muted-soft mb-3" style={{ fontSize: "var(--fs-sm)" }}>
            {isAdmin
              ? "Redeem an upgrade code on the License page to restore access."
              : "Access is temporarily locked. Please contact your school administrator to renew the subscription."}
          </p>
          {isAdmin && (
            <Link to="/admin/license" className="btn btn-primary">
              <i className="bi bi-key me-1"></i> Go to License &amp; Plan
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}