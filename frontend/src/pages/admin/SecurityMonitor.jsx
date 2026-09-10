// pages/admin/SecurityMonitor.jsx
import { useEffect, useState, useCallback } from "react";
import { securityApi } from "../../services/api";

const RESULT_BADGE = {
  SUCCESS: "bg-success",
  OTP_SUCCESS: "bg-success",
  OTP_SENT: "bg-info text-dark",
  BAD_PASSWORD: "bg-warning text-dark",
  UNKNOWN_USER: "bg-warning text-dark",
  INVALID_FORMAT: "bg-warning text-dark",
  OTP_FAILED: "bg-warning text-dark",
  ACCOUNT_LOCKED: "bg-danger",
};

const RESULT_LABEL = {
  SUCCESS: "Success",
  OTP_SUCCESS: "OTP Verified",
  OTP_SENT: "OTP Sent",
  BAD_PASSWORD: "Bad Password",
  UNKNOWN_USER: "Unknown Username",
  INVALID_FORMAT: "Invalid Format",
  OTP_FAILED: "OTP Failed",
  ACCOUNT_LOCKED: "Account Locked",
};

export default function SecurityMonitor() {
  const [summary, setSummary] = useState(null);
  const [lockedUsers, setLockedUsers] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unlockingId, setUnlockingId] = useState(null);
  const [resultFilter, setResultFilter] = useState("");
  const [search, setSearch] = useState("");

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

  return (
    <div className="p-3 p-md-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h4 className="mb-0">Security Monitor</h4>
          <p className="text-muted mb-0" style={{ fontSize: "var(--fs-sm)" }}>
            Login attempts, account lockouts, and account recovery
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="row g-3 mb-4">
        <div className="col-12 col-md-4">
          <div className="card p-3 h-100">
            <div className="text-muted" style={{ fontSize: "var(--fs-xs)" }}>Failed attempts (24h)</div>
            <div className="fs-3 fw-bold text-warning">{summary?.failed_last_24h ?? "—"}</div>
          </div>
        </div>
        <div className="col-12 col-md-4">
          <div className="card p-3 h-100">
            <div className="text-muted" style={{ fontSize: "var(--fs-xs)" }}>Locked accounts</div>
            <div className="fs-3 fw-bold text-danger">{summary?.locked_accounts ?? "—"}</div>
          </div>
        </div>
        <div className="col-12 col-md-4">
          <div className="card p-3 h-100">
            <div className="text-muted" style={{ fontSize: "var(--fs-xs)" }}>Successful logins (24h)</div>
            <div className="fs-3 fw-bold text-success">{summary?.successful_last_24h ?? "—"}</div>
          </div>
        </div>
      </div>

      {/* Locked accounts */}
      <div className="card mb-4">
        <div className="card-header fw-semibold">Locked Accounts</div>
        <div className="table-responsive">
          <table className="table mb-0 align-middle">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Failed Attempts</th>
                <th>Locked Until</th>
                <th className="text-end">Action</th>
              </tr>
            </thead>
            <tbody>
              {lockedUsers.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-muted py-4">
                    No locked accounts right now.
                  </td>
                </tr>
              )}
              {lockedUsers.map((u) => (
                <tr key={u.id}>
                  <td>{u.first_name} {u.last_name} <span className="text-muted">({u.username})</span></td>
                  <td><span className="badge bg-secondary">{u.role}</span></td>
                  <td>{u.failed_login_attempts}</td>
                  <td>{u.locked_until ? new Date(u.locked_until).toLocaleString() : "—"}</td>
                  <td className="text-end">
                    <button
                      className="btn btn-sm btn-outline-danger"
                      disabled={unlockingId === u.id}
                      onClick={() => handleUnlock(u.id)}
                    >
                      {unlockingId === u.id ? "Unlocking..." : "Unlock"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Login attempt log */}
      <div className="card">
        <div className="card-header d-flex flex-wrap gap-2 justify-content-between align-items-center">
          <span className="fw-semibold">Login Attempt Log</span>
          <div className="d-flex gap-2">
            <input
              className="form-control form-control-sm"
              placeholder="Search username or IP"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "200px" }}
            />
            <select
              className="form-select form-select-sm"
              value={resultFilter}
              onChange={(e) => setResultFilter(e.target.value)}
              style={{ width: "180px" }}
            >
              <option value="">All results</option>
              {Object.entries(RESULT_LABEL).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="table-responsive">
          <table className="table mb-0 align-middle">
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
              {loading ? (
                <tr><td colSpan={5} className="text-center py-4 text-muted">Loading...</td></tr>
              ) : attempts.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-4 text-muted">No attempts found.</td></tr>
              ) : (
                attempts.map((a) => (
                  <tr key={a.id}>
                    <td>{new Date(a.created_at).toLocaleString()}</td>
                    <td>{a.username_attempted}</td>
                    <td>{a.user_full_name ? `${a.user_full_name} (${a.user_role})` : "—"}</td>
                    <td>{a.ip_address || "—"}</td>
                    <td>
                      <span className={`badge ${RESULT_BADGE[a.result] || "bg-secondary"}`}>
                        {RESULT_LABEL[a.result] || a.result}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}