import { useEffect, useState } from "react";
import { clearanceApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";

const PAGE_SIZE = 25;

const currency = (v) => Number(v || 0).toLocaleString();
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" }) : "-";

const statusBadge = (app) => {
  if (app.status === "CLEARED") {
    return app.is_collected
      ? { cls: "badge-blue", text: "Collected" }
      : { cls: "badge-success", text: "Cleared" };
  }
  if (app.status === "REJECTED") return { cls: "badge-danger", text: "Not cleared" };
  return { cls: "badge-gold", text: "Pending" };
};

export default function AdminClearance() {
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState(null); // { type, text }

  // review modal
  const [modal, setModal] = useState(null); // { app, mode: "clear" | "reject" }
  const [remarks, setRemarks] = useState("");
  const [force, setForce] = useState(false);
  const [modalError, setModalError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [listRes, sumRes] = await Promise.all([
        clearanceApi.list({
          page,
          status: statusFilter || undefined,
          search: search.trim() || undefined,
        }),
        clearanceApi.summary(),
      ]);
      const list = listRes.data.results ?? listRes.data;
      setRows(list);
      setCount(listRes.data.count ?? list.length);
      setSummary(sumRes.data);
    } catch (err) {
      console.error("Failed to load clearance applications:", err);
      setError(err.response?.data?.detail || "Could not load clearance applications.");
    } finally {
      setLoading(false);
    }
  };

  // reload on page / filter change; wait a moment while typing in the search box
  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter, search]);

  const openModal = (app, mode) => {
    setModal({ app, mode });
    setRemarks("");
    setForce(false);
    setModalError("");
  };
  const closeModal = () => {
    if (!busy) setModal(null);
  };

  const submitDecision = async () => {
    if (modal.mode === "reject" && !remarks.trim()) {
      setModalError("Please give the reason, so the student knows what to fix.");
      return;
    }
    setBusy(true);
    setModalError("");
    try {
      if (modal.mode === "clear") {
        await clearanceApi.clear(modal.app.id, { remarks, force });
        setMessage({ type: "success", text: `${modal.app.student_name} has been cleared.` });
      } else {
        await clearanceApi.reject(modal.app.id, { remarks });
        setMessage({ type: "success", text: `${modal.app.student_name} was marked as not cleared.` });
      }
      setModal(null);
      await load();
    } catch (err) {
      setModalError(err.response?.data?.detail || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const quickAction = async (app, kind) => {
    if (kind === "reopen" && !window.confirm(`Send ${app.student_name}'s application back to Pending?`)) return;
    if (kind === "collected" && !window.confirm(`Confirm ${app.student_name} has collected their certificate?`)) return;
    try {
      if (kind === "reopen") await clearanceApi.reopen(app.id);
      else await clearanceApi.markCollected(app.id);
      setMessage({
        type: "success",
        text: kind === "reopen"
          ? `${app.student_name}'s application is pending again.`
          : `${app.student_name}'s certificate was marked as collected.`,
      });
      await load();
    } catch (err) {
      setMessage({ type: "danger", text: err.response?.data?.detail || "Something went wrong." });
    }
  };

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  const cards = summary && [
    { label: "Pending review", value: summary.pending, cls: "stat-card--gold" },
    { label: "Cleared, awaiting collection", value: summary.awaiting_collection, cls: "stat-card--success" },
    { label: "Certificates collected", value: summary.collected, cls: "stat-card--blue" },
    { label: "Not cleared", value: summary.rejected, cls: "" },
  ];

  return (
    <div>
      <Breadcrumb items={[
        { label: "Dashboard", href: "/admin" },
        { label: "Academics", href: "/admin" },
        { label: "Student Clearance", href: "#" },
      ]} />

      <div className="page-header">
        <div>
          <h1 className="page-title">Student Clearance</h1>
          <p className="page-subtitle">
            Review final-year students' clearance applications. Cleared students then collect their certificate in person.
          </p>
        </div>
      </div>

      {message && (
        <div className={`alert alert-${message.type} d-flex justify-content-between align-items-center`}>
          <span>{message.text}</span>
          <button type="button" className="btn-close" onClick={() => setMessage(null)}></button>
        </div>
      )}

      {/* ---- Stat cards ---- */}
      {cards && (
        <div className="row g-3 mb-4">
          {cards.map((c) => (
            <div className="col-6 col-md-3" key={c.label}>
              <div className={`stat-card ${c.cls}`} style={{ padding: "0.75rem 1rem" }}>
                <div>
                  <div className="stat-card__value" style={{ fontSize: "1.2rem" }}>{c.value}</div>
                  <div className="stat-card__label">{c.label}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---- Filters ---- */}
      <div className="card p-3 mb-3">
        <div className="row g-2">
          <div className="col-md-5">
            <input
              className="form-control"
              placeholder="Search by name, admission no or clearance no"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <div className="col-md-3">
            <select
              className="form-select"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            >
              <option value="">All statuses</option>
              <option value="PENDING">Pending review</option>
              <option value="CLEARED">Cleared</option>
              <option value="REJECTED">Not cleared</option>
            </select>
          </div>
        </div>
      </div>

      {/* ---- Table ---- */}
      {loading ? (
        <TableSkeleton rows={6} columns={6} />
      ) : error ? (
        <div className="alert alert-danger">
          <i className="bi bi-exclamation-circle me-2"></i>
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="table-wrap">
          <div className="empty-state">
            <i className="bi bi-patch-check"></i>
            <h6>No clearance applications</h6>
            <p className="text-muted-soft">
              {search || statusFilter
                ? "Nothing matches these filters."
                : "Applications appear here when final-year students apply for clearance."}
            </p>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <div className="table-wrap__header">
            <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
              <i className="bi bi-patch-check me-2"></i>
              Applications
              <span className="badge badge-neutral ms-2">{count}</span>
            </span>
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0 align-middle">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Applied</th>
                  <th className="text-end">Fee balance (KES)</th>
                  <th>Status</th>
                  <th style={{ width: "250px" }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((app) => {
                  const badge = statusBadge(app);
                  const balance = Number(app.current_balance);
                  return (
                    <tr key={app.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: "var(--ink-900)" }}>{app.student_name}</div>
                        <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
                          {app.admission_no}
                          {app.student_phone ? ` · ${app.student_phone}` : ""}
                        </div>
                        {app.student_remarks && (
                          <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-600)" }}>
                            <i className="bi bi-chat-left-text me-1"></i>{app.student_remarks}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="badge badge-blue">{app.classroom_label}</span>
                      </td>
                      <td style={{ fontSize: "var(--fs-sm)", color: "var(--ink-600)" }}>{fmtDate(app.submitted_at)}</td>
                      <td className={`text-end fw-bold ${balance > 0 ? "text-danger" : "text-success"}`}>
                        {balance > 0 ? currency(balance) : balance < 0 ? `${currency(Math.abs(balance))} prepaid` : "0"}
                      </td>
                      <td>
                        <span className={`badge ${badge.cls}`}>{badge.text}</span>
                        {app.clearance_no && (
                          <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>{app.clearance_no}</div>
                        )}
                        {app.cleared_with_balance && (
                          <div style={{ fontSize: "var(--fs-xs)", color: "var(--danger-600)" }}>Cleared with balance</div>
                        )}
                        {app.status === "REJECTED" && app.admin_remarks && (
                          <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-600)" }}>{app.admin_remarks}</div>
                        )}
                        {app.is_collected && (
                          <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>{fmtDate(app.collected_at)}</div>
                        )}
                      </td>
                      <td className="text-end">
                        <div className="d-flex gap-2 justify-content-end flex-wrap">
                          {app.status === "PENDING" && (
                            <>
                              <button className="btn btn-sm btn-primary" onClick={() => openModal(app, "clear")}>
                                <i className="bi bi-check2-circle me-1"></i>Clear
                              </button>
                              <button className="btn btn-sm btn-outline-danger" onClick={() => openModal(app, "reject")}>
                                <i className="bi bi-x-circle me-1"></i>Not cleared
                              </button>
                            </>
                          )}
                          {app.status === "CLEARED" && !app.is_collected && (
                            <>
                              <button className="btn btn-sm btn-primary" onClick={() => quickAction(app, "collected")}>
                                <i className="bi bi-mortarboard me-1"></i>Mark collected
                              </button>
                              <button className="btn btn-sm btn-outline-secondary" onClick={() => quickAction(app, "reopen")}>
                                Reopen
                              </button>
                            </>
                          )}
                          {app.status === "REJECTED" && (
                            <button className="btn btn-sm btn-outline-secondary" onClick={() => quickAction(app, "reopen")}>
                              Reopen
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="table-wrap__footer">
            <span className="table-wrap__footer-info">
              Page <strong>{page}</strong> of <strong>{totalPages}</strong>
            </span>
            <div className="d-flex gap-2">
              <button
                className="btn btn-sm btn-outline-secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <i className="bi bi-chevron-left"></i> Prev
              </button>
              <button
                className="btn btn-sm btn-outline-secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <i className="bi bi-chevron-right"></i>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Review modal ---- */}
      {modal && (
        <div className="modal show d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} tabIndex="-1" role="dialog">
          <div className="modal-dialog modal-dialog-centered" role="document">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
                  {modal.mode === "clear" ? (
                    <><i className="bi bi-check2-circle me-2" style={{ color: "var(--success-600)" }}></i>Clear student</>
                  ) : (
                    <><i className="bi bi-x-circle me-2" style={{ color: "var(--danger-600)" }}></i>Mark as not cleared</>
                  )}
                </h5>
                <button type="button" className="btn-close" onClick={closeModal}></button>
              </div>
              <div className="modal-body">
                <p className="mb-3">
                  <strong>{modal.app.student_name}</strong> ({modal.app.admission_no}) · {modal.app.classroom_label}
                </p>

                {modalError && (
                  <div className="alert alert-danger py-2">
                    <i className="bi bi-exclamation-circle me-2"></i>
                    {modalError}
                  </div>
                )}

                {modal.mode === "clear" && Number(modal.app.current_balance) > 0 && (
                  <div className="alert alert-warning py-2">
                    <i className="bi bi-exclamation-triangle me-2"></i>
                    This student still owes <strong>KES {currency(modal.app.current_balance)}</strong>.
                    <div className="form-check mt-2">
                      <input
                        id="force-clear"
                        type="checkbox"
                        className="form-check-input"
                        checked={force}
                        onChange={(e) => setForce(e.target.checked)}
                      />
                      <label htmlFor="force-clear" className="form-check-label">
                        Clear anyway (this is recorded on the application)
                      </label>
                    </div>
                  </div>
                )}

                <label className="form-label">
                  {modal.mode === "clear" ? "Note for the student (optional)" : "Reason (the student will see this)"}
                </label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder={
                    modal.mode === "clear"
                      ? "e.g. Collect your certificate from the office on weekdays"
                      : "e.g. Outstanding library books - please return them"
                  }
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline-secondary" onClick={closeModal} disabled={busy}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={`btn ${modal.mode === "clear" ? "btn-primary" : "btn-danger"}`}
                  onClick={submitDecision}
                  disabled={busy || (modal.mode === "clear" && Number(modal.app.current_balance) > 0 && !force)}
                >
                  {busy ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      Saving...
                    </>
                  ) : modal.mode === "clear" ? (
                    "Clear student"
                  ) : (
                    "Mark as not cleared"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}