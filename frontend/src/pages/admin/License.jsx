import { useEffect, useState } from "react";
import { licenseApi, packagesApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import { useLicense } from "../../context/LicenseContext.jsx"; // adjust path to match your admin pages folder depth

const TIER_BADGE = {
  TRIAL: "badge-neutral",
  GO: "badge-blue",
  STANDARD: "badge-blue",
  PREMIUM: "badge-gold",
  PRO: "badge-success",
};

function UsageBar({ label, used, limit, unlimited }) {
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const danger = !unlimited && pct >= 90;
  return (
    <div className="mb-3">
      <div className="progress-label">
        <span style={{ fontWeight: 600, color: "var(--ink-700)" }}>{label}</span>
        <span>{used}{unlimited ? " (Unlimited)" : ` / ${limit}`}</span>
      </div>
      {!unlimited && (
        <div className="progress-track">
          <div
            className={`progress-fill ${danger ? "progress-fill--danger" : "progress-fill--success"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function PackageCard({ pkg, isCurrent }) {
  return (
    <div className="col-md-4">
      <div
        className="card p-4 h-100 d-flex flex-column"
        style={isCurrent ? { border: "2px solid var(--blue-700)" } : {}}
      >
        <div className="d-flex justify-content-between align-items-start mb-2">
          <span className={`badge ${TIER_BADGE[pkg.tier] || "badge-neutral"}`}>{pkg.tier_display}</span>
          {isCurrent && <span className="badge badge-success">Current Plan</span>}
        </div>

        <div className="mb-3">
          <span style={{ fontSize: "1.8rem", fontWeight: 700, color: "var(--ink-900)" }}>
            KES {Number(pkg.monthly_price).toLocaleString()}
          </span>
          <span className="text-muted-soft"> /month</span>
        </div>

        <ul className="list-unstyled mb-3" style={{ fontSize: "var(--fs-sm)" }}>
          <li className="mb-2">
            <i className="bi bi-people me-2" style={{ color: "var(--blue-700)" }}></i>
            {pkg.max_students ? `${pkg.max_students} students` : "Unlimited students"}
          </li>
          <li className="mb-2">
            <i className="bi bi-door-open me-2" style={{ color: "var(--blue-700)" }}></i>
            {pkg.max_classrooms_per_year ? `${pkg.max_classrooms_per_year} classrooms/year` : "Unlimited classrooms"}
          </li>
          <li className="mb-2">
            <i className="bi bi-person-badge me-2" style={{ color: "var(--blue-700)" }}></i>
            {pkg.max_teachers ? `${pkg.max_teachers} teachers` : "Unlimited teachers"}
          </li>
          {(pkg.features || []).map((f, i) => (
            <li className="mb-2" key={i}>
              <i className="bi bi-check2 me-2" style={{ color: "var(--blue-700)" }}></i>
              {f}
            </li>
          ))}
        </ul>

        {!isCurrent && (
          <p className="text-muted-soft mt-auto mb-0" style={{ fontSize: "var(--fs-xs)" }}>
            Contact your software provider to switch to this plan.
          </p>
        )}
      </div>
    </div>
  );
}

export default function License() {
  const [activeTab, setActiveTab] = useState("current"); // "current" | "packages"

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState(null);

  const [packages, setPackages] = useState([]);
  const [packagesLoading, setPackagesLoading] = useState(true);
  const [packagesError, setPackagesError] = useState("");

  const { refresh: refreshLicenseStatus } = useLicense();

  const load = () => {
    setLoading(true);
    licenseApi
      .me()
      .then((res) => setData(res.data))
      .catch(() => setError("Could not load license information."))
      .finally(() => setLoading(false));
  };

  const loadPackages = () => {
    setPackagesLoading(true);
    packagesApi
      .list()
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : res.data?.results || [];
        setPackages(list);
      })
      .catch(() => setPackagesError("Could not load available packages."))
      .finally(() => setPackagesLoading(false));
  };

  useEffect(() => {
    load();
    loadPackages();
  }, []);

  const handleRedeem = async (e) => {
    e.preventDefault();
    if (!token.trim()) return;
    setRedeeming(true);
    setRedeemMsg(null);
    try {
      const res = await licenseApi.redeem(token.trim());
      setData(res.data);
      setToken("");
      setRedeemMsg({ type: "success", text: "License upgraded successfully!" });
      refreshLicenseStatus(); // clears the app-wide lock overlay immediately
    } catch (err) {
      setRedeemMsg({
        type: "error",
        text: err.response?.data?.detail || "Could not redeem this code.",
      });
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <div>
      <Breadcrumb items={[
        { label: "Dashboard", href: "/admin" },
        { label: "Settings", href: "/admin/settings" },
        { label: "License & Plan", href: "#" },
      ]} />

      <div className="page-header">
        <div>
          <h1 className="page-title">License &amp; Plan</h1>
          <p className="page-subtitle">
            Manage your subscription, monitor usage limits, and redeem upgrade codes.
          </p>
        </div>
        {data && (
          <span
            className={`badge ${TIER_BADGE[data.tier] || "badge-neutral"}`}
            style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem" }}
          >
            <i className="bi bi-award me-1"></i>
            {data.tier_display}
          </span>
        )}
      </div>

      {/* -------- Tabs -------- */}
      <ul className="nav nav-tabs mb-4">
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === "current" ? "active" : ""}`}
            onClick={() => setActiveTab("current")}
          >
            <i className="bi bi-patch-check me-1"></i> Current Plan
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === "packages" ? "active" : ""}`}
            onClick={() => setActiveTab("packages")}
          >
            <i className="bi bi-box-seam me-1"></i> Available Packages
          </button>
        </li>
      </ul>

      {/* -------- CURRENT PLAN TAB -------- */}
      {activeTab === "current" && (
        <>
          {loading && (
            <div className="card p-4">
              <div className="d-flex align-items-center text-muted-soft">
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                Loading license details...
              </div>
            </div>
          )}

          {!loading && error && (
            <div className="alert alert-danger" role="alert">
              <i className="bi bi-exclamation-circle me-2"></i>
              {error}
            </div>
          )}

          {!loading && !error && data && (
            <>
              <div className="card p-4 mb-4">
                <h6 className="mb-3" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
                  <i className="bi bi-patch-check me-2" style={{ color: "var(--blue-700)" }}></i>
                  Current Plan
                </h6>

                <div className="row g-3 align-items-center">
                  <div className="col-md-6">
                    <div className="d-flex align-items-center gap-3">
                      <div
                        style={{
                          width: 56, height: 56, borderRadius: "var(--radius-md)",
                          background: "var(--blue-100)", color: "var(--blue-700)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "1.6rem",
                        }}
                      >
                        <i className="bi bi-shield-check"></i>
                      </div>
                      <div>
                        <div
                          className={`badge ${TIER_BADGE[data.tier] || "badge-neutral"}`}
                          style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem", fontWeight: 700 }}
                        >
                          {data.tier_display}
                        </div>
                        {data.current_package && (
                          <div style={{ fontSize: "var(--fs-sm)", color: "var(--ink-600)", marginTop: 4 }}>
                            <i className="bi bi-cash-coin me-1"></i>
                            KES {Number(data.current_package.monthly_price).toLocaleString()}/month
                          </div>
                        )}
                        {data.valid_until && (
                          <div style={{ fontSize: "var(--fs-sm)", color: "var(--ink-600)", marginTop: 4 }}>
                            <i className="bi bi-calendar3 me-1"></i>
                            Valid until{" "}
                            <strong style={{ color: "var(--ink-900)" }}>
                              {new Date(data.valid_until).toLocaleDateString("en-KE", {
                                year: "numeric", month: "long", day: "numeric",
                              })}
                            </strong>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="col-md-6">
                    {data.is_expired && (
                      <div className="alert alert-danger mb-2 py-2" style={{ fontSize: "var(--fs-sm)" }}>
                        <i className="bi bi-exclamation-triangle me-1"></i>
                        Your license has expired. Redeem an upgrade code to continue.
                      </div>
                    )}
                    {data.is_suspended && (
                      <div className="alert alert-danger mb-0 py-2" style={{ fontSize: "var(--fs-sm)" }}>
                        <i className="bi bi-slash-circle me-1"></i>
                        This account is suspended. Contact your software provider.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="card p-4 mb-4">
                <h6 className="mb-3" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
                  <i className="bi bi-bar-chart-line me-2" style={{ color: "var(--blue-700)" }}></i>
                  Usage This Year
                </h6>
                <UsageBar label="Students" {...data.usage.students} />
                <UsageBar label="Classrooms" {...data.usage.classrooms_this_year} />
                <UsageBar label="Teachers" {...data.usage.teachers} />
                <div
                  className="mt-3 pt-3"
                  style={{ borderTop: "1px solid var(--border-color)", fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}
                >
                  <i className="bi bi-info-circle me-1"></i>
                  Limits reset at the start of each academic year.
                </div>
              </div>

              <div className="card p-4">
                <h6 className="mb-2" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
                  <i className="bi bi-key me-2" style={{ color: "var(--gold-500)" }}></i>
                  Upgrade Your Plan
                </h6>
                <p className="text-muted-soft mb-3" style={{ fontSize: "var(--fs-sm)" }}>
                  Contact your software provider to arrange payment. Once paid, they'll send you an upgrade
                  code — paste it below to activate. See the Available Packages tab for pricing.
                </p>

                <form onSubmit={handleRedeem}>
                  <div className="row g-2 align-items-end">
                    <div className="col-md-8">
                      <label className="form-label">Upgrade Code</label>
                      <div className="input-icon-group">
                        <i className="bi bi-key input-icon-leading"></i>
                        <input
                          type="text"
                          className="form-control"
                          value={token}
                          onChange={(e) => setToken(e.target.value)}
                          placeholder="Paste upgrade code here"
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <button type="submit" className="btn btn-primary w-100" disabled={redeeming || !token.trim()}>
                        {redeeming ? (
                          <>
                            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                            Redeeming...
                          </>
                        ) : (
                          <>
                            <i className="bi bi-check2-circle me-1"></i>
                            Redeem Code
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </form>

                {redeemMsg && (
                  <div
                    className={`alert mt-3 mb-0 py-2 ${redeemMsg.type === "success" ? "alert-success" : "alert-danger"}`}
                    style={{ fontSize: "var(--fs-sm)" }}
                  >
                    <i className={`bi ${redeemMsg.type === "success" ? "bi-check-circle" : "bi-exclamation-circle"} me-1`}></i>
                    {redeemMsg.text}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* -------- AVAILABLE PACKAGES TAB -------- */}
      {activeTab === "packages" && (
        <div>
          {packagesLoading && (
            <div className="card p-4">
              <div className="d-flex align-items-center text-muted-soft">
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                Loading packages...
              </div>
            </div>
          )}

          {!packagesLoading && packagesError && (
            <div className="alert alert-danger" role="alert">
              <i className="bi bi-exclamation-circle me-2"></i>
              {packagesError}
            </div>
          )}

          {!packagesLoading && !packagesError && (
            <div className="row g-3">
              {packages.map((pkg) => (
                <PackageCard key={pkg.id} pkg={pkg} isCurrent={data?.tier === pkg.tier} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}