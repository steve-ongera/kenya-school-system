// pages/admin/SecurityMonitor.jsx
import { useEffect, useState, useCallback } from "react";
import { securityApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";

const RESULT_CONFIG = {
  SUCCESS: { className: "badge-success", label: "Success", icon: "bi-check-circle" },
  OTP_SUCCESS: { className: "badge-success", label: "OTP Verified", icon: "bi-shield-check" },
  OTP_SENT: { className: "badge-blue", label: "OTP Sent", icon: "bi-send" },
  BAD_PASSWORD: { className: "badge-warning", label: "Bad Password", icon: "bi-x-circle" },
  UNKNOWN_USER: { className: "badge-warning", label: "Unknown Username", icon: "bi-question-circle" },
  INVALID_FORMAT: { className: "badge-warning", label: "Invalid Format", icon: "bi-exclamation-circle" },
  OTP_FAILED: { className: "badge-warning", label: "OTP Failed", icon: "bi-shield-x" },
  ACCOUNT_LOCKED: { className: "badge-danger", label: "Account Locked", icon: "bi-lock" },
};

const ROLE_BADGE = {
  ADMIN: "badge-danger",
  TEACHER: "badge-blue",
  STUDENT: "badge-success",
  PARENT: "badge-gold",
  FINANCE: "badge-neutral",
};

const ROLE_ICON = {
  ADMIN: "bi-shield-lock",
  TEACHER: "bi-person-workspace",
  STUDENT: "bi-person",
  PARENT: "bi-people",
  FINANCE: "bi-cash-stack",
};

export default function SecurityMonitor() {
  const [summary, setSummary] = useState(null);
  const [lockedUsers, setLockedUsers] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unlockingId, setUnlockingId] = useState(null);
  const [resultFilter, setResultFilter] = useState("");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("attempts"); // 'locked' | 'attempts'

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, lockedRes, attemptsRes] = await Promise.all([
        securityApi.loginAttemptsSummary(),
        securityApi.lockedUsers(),
        securityApi.loginAttempts({
          ...(resultFilter ? { result: resultFilter } : {}),
          ...(search ? { search } : {}),
        }),
      ]);
      setSummary(summaryRes.data);
      setLockedUsers(lockedRes.data);
      setAttempts(attemptsRes.data.results || attemptsRes.data);
    } catch (error) {
      console.error("Failed to load security data:", error);
    } finally {
      setLoading(false);
    }
  }, [resultFilter, search]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleUnlock = async (userId) => {
    if (!window.confirm("Unlock this account? The user will be able to log in again immediately.")) return;
    setUnlockingId(userId);
    try {
      await securityApi.unlockUser(userId);
      await loadAll();
    } finally {
      setUnlockingId(null);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setResultFilter("");
  };

  const hasActiveFilters = search || resultFilter;

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: "Dashboard", href: "/admin" },
        { label: "Security", href: "/admin/security" },
        { label: "Security Monitor", href: "#" },
      ]} />

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Security Monitor</h1>
          <p className="page-subtitle">
            Login attempts, account lockouts, and account recovery
          </p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="row g-3 mb-4">
        <div className="col-12 col-md-4">
          <div className="stat-card stat-card--danger">
            <i className="bi bi-x-circle"></i>
            <div>
              <div className="stat-card__value">
                {loading ? (
                  <div className="skeleton skeleton-text" style={{ width: "60px", height: "28px" }}></div>
                ) : (
                  summary?.failed_last_24h ?? "—"
                )}
              </div>
              <div className="stat-card__label">Failed Attempts (24h)</div>
            </div>
          </div>
        </div>
        <div className="col-12 col-md-4">
          <div className="stat-card stat-card--gold">
            <i className="bi bi-lock"></i>
            <div>
              <div className="stat-card__value">
                {loading ? (
                  <div className="skeleton skeleton-text" style={{ width: "60px", height: "28px" }}></div>
                ) : (
                  summary?.locked_accounts ?? "—"
                )}
              </div>
              <div className="stat-card__label">Locked Accounts</div>
            </div>
          </div>
        </div>
        <div className="col-12 col-md-4">
          <div className="stat-card stat-card--success">
            <i className="bi bi-check-circle"></i>
            <div>
              <div className="stat-card__value">
                {loading ? (
                  <div className="skeleton skeleton-text" style={{ width: "60px", height: "28px" }}></div>
                ) : (
                  summary?.successful_last_24h ?? "—"
                )}
              </div>
              <div className="stat-card__label">Successful Logins (24h)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs + Table */}
      <div className="table-wrap">
        {/* Tab Navigation */}
        <div style={{
          display: "flex",
          borderBottom: "1px solid var(--border-color)",
          background: "var(--bg-app)",
          borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
        }}>
          <button
            type="button"
            onClick={() => setActiveTab("attempts")}
            style={{
              flex: 1,
              padding: "0.85rem 1.25rem",
              border: "none",
              background: "transparent",
              borderBottom: activeTab === "attempts" ? "3px solid var(--blue-700)" : "3px solid transparent",
              color: activeTab === "attempts" ? "var(--blue-700)" : "var(--ink-600)",
              fontWeight: 600,
              fontSize: "var(--fs-sm)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              transition: "all 0.15s ease",
            }}
          >
            <i className="bi bi-clock-history"></i>
            Login Attempt Log
            {attempts.length > 0 && (
              <span className={`badge ${activeTab === "attempts" ? "badge-blue" : "badge-neutral"}`}>
                {attempts.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("locked")}
            style={{
              flex: 1,
              padding: "0.85rem 1.25rem",
              border: "none",
              background: "transparent",
              borderBottom: activeTab === "locked" ? "3px solid var(--blue-700)" : "3px solid transparent",
              color: activeTab === "locked" ? "var(--blue-700)" : "var(--ink-600)",
              fontWeight: 600,
              fontSize: "var(--fs-sm)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              transition: "all 0.15s ease",
            }}
          >
            <i className="bi bi-lock"></i>
            Locked Accounts
            {lockedUsers.length > 0 && (
              <span className={`badge ${activeTab === "locked" ? "badge-danger" : "badge-danger"}`}>
                {lockedUsers.length}
              </span>
            )}
          </button>
        </div>

        {/* ---- Login Attempts Tab ---- */}
        {activeTab === "attempts" && (
          <>
            {/* Filters for attempts */}
            <div style={{
              padding: "1rem 1.25rem",
              borderBottom: "1px solid var(--border-color)",
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem",
              alignItems: "center",
            }}>
              <div style={{ flex: 1, minWidth: "200px", position: "relative" }}>
                <i className="bi bi-search" style={{
                  position: "absolute",
                  left: "0.85rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--ink-400)",
                }}></i>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search username or IP..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ paddingLeft: "2.4rem" }}
                />
              </div>
              <select
                className="form-select"
                value={resultFilter}
                onChange={(e) => setResultFilter(e.target.value)}
                style={{ width: "auto", minWidth: "180px" }}
              >
                <option value="">All results</option>
                {Object.entries(RESULT_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
              {hasActiveFilters && (
                <button className="btn btn-sm btn-light" onClick={clearFilters}>
                  <i className="bi bi-x-lg"></i> Clear
                </button>
              )}
            </div>

            {/* Active filter chips */}
            {hasActiveFilters && (
              <div style={{ padding: "0.5rem 1.25rem", borderBottom: "1px solid var(--border-color)" }}>
                <div className="d-flex flex-wrap gap-1">
                  {search && (
                    <span className="filter-chip">
                      Search: "{search}"
                      <button onClick={() => setSearch("")}><i className="bi bi-x"></i></button>
                    </span>
                  )}
                  {resultFilter && (
                    <span className="filter-chip">
                      Result: {RESULT_CONFIG[resultFilter]?.label || resultFilter}
                      <button onClick={() => setResultFilter("")}><i className="bi bi-x"></i></button>
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Attempts Table */}
            {loading ? (
              <TableSkeleton rows={5} columns={5} />
            ) : attempts.length === 0 ? (
              <div className="empty-state">
                <i className="bi bi-shield-check"></i>
                <h6>No login attempts found</h6>
                <p className="text-muted-soft">
                  {hasActiveFilters 
                    ? "No attempts match your filters. Try adjusting your search criteria." 
                    : "Login attempts will appear here."}
                </p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Username Attempted</th>
                      <th>Matched User</th>
                      <th>IP Address</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attempts.map((a) => {
                      const cfg = RESULT_CONFIG[a.result] || { className: "badge-neutral", label: a.result, icon: "bi-question" };
                      return (
                        <tr key={a.id}>
                          <td style={{ fontSize: "var(--fs-sm)", color: "var(--ink-600)" }}>
                            {new Date(a.created_at).toLocaleString('en-KE', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td>
                            <span style={{ fontWeight: 600, color: "var(--ink-900)", fontSize: "var(--fs-sm)" }}>
                              {a.username_attempted}
                            </span>
                          </td>
                          <td>
                            {a.user_full_name ? (
                              <div>
                                <span style={{ fontWeight: 500, color: "var(--ink-900)" }}>
                                  {a.user_full_name}
                                </span>
                                <span className={`badge ${ROLE_BADGE[a.user_role] || "badge-neutral"} ms-2`}>
                                  <i className={`bi ${ROLE_ICON[a.user_role] || "bi-person"} me-1`}></i>
                                  {a.user_role}
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-soft">—</span>
                            )}
                          </td>
                          <td>
                            {a.ip_address ? (
                              <span style={{ fontFamily: "monospace", fontSize: "var(--fs-sm)", color: "var(--ink-600)" }}>
                                {a.ip_address}
                              </span>
                            ) : (
                              <span className="text-muted-soft">—</span>
                            )}
                          </td>
                          <td>
                            <span className={`badge ${cfg.className}`}>
                              <i className={`bi ${cfg.icon} me-1`}></i>
                              {cfg.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Footer */}
            {!loading && attempts.length > 0 && (
              <div className="table-wrap__footer">
                <span className="table-wrap__footer-info">
                  Showing <strong>{attempts.length}</strong> attempt{attempts.length !== 1 ? "s" : ""}
                </span>
                <div style={{ display: "flex", gap: "1rem", fontSize: "var(--fs-xs)" }}>
                  <span style={{ color: "var(--success-600)" }}>
                    <i className="bi bi-check-circle me-1"></i>
                    Success: {attempts.filter(a => a.result === "SUCCESS" || a.result === "OTP_SUCCESS").length}
                  </span>
                  <span style={{ color: "var(--danger-600)" }}>
                    <i className="bi bi-x-circle me-1"></i>
                    Failed: {attempts.filter(a => a.result !== "SUCCESS" && a.result !== "OTP_SUCCESS" && a.result !== "OTP_SENT").length}
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {/* ---- Locked Accounts Tab ---- */}
        {activeTab === "locked" && (
          <>
            {loading ? (
              <TableSkeleton rows={3} columns={5} />
            ) : lockedUsers.length === 0 ? (
              <div className="empty-state">
                <i className="bi bi-shield-check" style={{ color: "var(--success-600)" }}></i>
                <h6>No locked accounts</h6>
                <p className="text-muted-soft">
                  All user accounts are currently accessible. No action needed.
                </p>
              </div>
            ) : (
              <>
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Role</th>
                        <th className="text-center">Failed Attempts</th>
                        <th>Locked Until</th>
                        <th className="text-end">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lockedUsers.map((u) => (
                        <tr key={u.id}>
                          <td>
                            <div className="table-avatar-cell">
                              <div className="avatar-sm">
                                {u.first_name?.[0]}{u.last_name?.[0]}
                              </div>
                              <div>
                                <div className="cell-name">{u.first_name} {u.last_name}</div>
                                <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
                                  @{u.username}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`badge ${ROLE_BADGE[u.role] || "badge-neutral"}`}>
                              <i className={`bi ${ROLE_ICON[u.role] || "bi-person"} me-1`}></i>
                              {u.role}
                            </span>
                          </td>
                          <td className="text-center">
                            <span className="badge badge-danger">
                              <i className="bi bi-x-circle me-1"></i>
                              {u.failed_login_attempts}
                            </span>
                          </td>
                          <td style={{ fontSize: "var(--fs-sm)", color: "var(--ink-600)" }}>
                            {u.locked_until ? (
                              <span>
                                <i className="bi bi-clock me-1"></i>
                                {new Date(u.locked_until).toLocaleString('en-KE', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            ) : (
                              <span className="text-muted-soft">—</span>
                            )}
                          </td>
                          <td className="text-end">
                            <button
                              className="btn btn-sm btn-outline-danger"
                              disabled={unlockingId === u.id}
                              onClick={() => handleUnlock(u.id)}
                            >
                              {unlockingId === u.id ? (
                                <>
                                  <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                                  Unlocking...
                                </>
                              ) : (
                                <>
                                  <i className="bi bi-unlock me-1"></i>
                                  Unlock
                                </>
                              )}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Footer */}
                <div className="table-wrap__footer">
                  <span className="table-wrap__footer-info">
                    Showing <strong>{lockedUsers.length}</strong> locked account{lockedUsers.length !== 1 ? "s" : ""}
                  </span>
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--danger-600)" }}>
                    <i className="bi bi-exclamation-triangle me-1"></i>
                    Users will be able to log in after unlocking
                  </span>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Info Card */}
      <div className="card mt-3" style={{ background: "var(--bg-app)" }}>
        <div className="card-body" style={{ padding: "0.75rem 1.25rem" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", fontSize: "var(--fs-sm)", flexWrap: "wrap" }}>
            <i className="bi bi-info-circle" style={{ color: "var(--blue-700)", fontSize: "1.1rem", marginTop: "0.1rem" }}></i>
            <span style={{ color: "var(--ink-600)" }}>
              <strong>About this page:</strong> This monitor tracks all login attempts including OTP verification. 
              Accounts are automatically locked after multiple failed attempts. Use the <strong>Locked Accounts</strong> tab 
              to manually unlock users when needed.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}