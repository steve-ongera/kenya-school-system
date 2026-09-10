import { useEffect, useState } from "react";
import { studentsApi, financeApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";

export default function ParentFees() {
  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState("");
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  useEffect(() => {
    setLoading(true);
    studentsApi
      .list()
      .then(({ data }) => {
        const list = data.results ?? data;
        setChildren(list);
        if (list[0]) setSelectedChild(list[0].id);
      })
      .catch((error) => console.error("Failed to load children:", error))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedChild) return;
    setLoadingInvoices(true);
    financeApi
      .invoices()
      .then(({ data }) => {
        const list = data.results ?? data;
        setInvoices(list);
      })
      .catch((error) => console.error("Failed to load invoices:", error))
      .finally(() => setLoadingInvoices(false));
  }, [selectedChild]);

  // Filter invoices for the selected child
  const childInvoices = invoices.filter((inv) => {
    const child = children.find(c => String(c.id) === String(selectedChild));
    return !child || inv.student_name === child.full_name || inv.admission_no === child.admission_no;
  });

  // Calculate totals
  const totals = childInvoices.reduce(
    (acc, inv) => ({
      totalDue: acc.totalDue + Number(inv.amount_due || 0),
      totalPaid: acc.totalPaid + Number(inv.amount_paid || 0),
      totalBalance: acc.totalBalance + Number(inv.balance || 0),
    }),
    { totalDue: 0, totalPaid: 0, totalBalance: 0 }
  );

  // Get status badge
  const getStatusBadge = (balance) => {
    if (balance === 0) return { className: "badge-success", label: "Paid", icon: "bi-check-circle" };
    if (balance < 0) return { className: "badge-gold", label: "Credit", icon: "bi-arrow-down-circle" };
    return { className: "badge-danger", label: "Outstanding", icon: "bi-exclamation-circle" };
  };

  const selectedChildData = children.find(c => String(c.id) === String(selectedChild));

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: "Dashboard", href: "/parent" },
        { label: "Fees", href: "/parent/fees" },
        { label: "Fee Statements", href: "#" },
      ]} />

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Fee Statements</h1>
          <p className="page-subtitle">
            View fee statements and payment history for your children
          </p>
        </div>
        {!loading && childInvoices.length > 0 && (
          <span className={`badge ${totals.totalBalance > 0 ? "badge-danger" : "badge-success"}`} style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem" }}>
            <i className={`bi ${totals.totalBalance > 0 ? "bi-exclamation-circle" : "bi-check-circle"} me-1`}></i>
            Balance: KES {totals.totalBalance.toLocaleString()}
          </span>
        )}
      </div>

      {/* Child Selector */}
      <div className="card p-4 mb-4">
        <div className="row g-3 align-items-end">
          <div className="col-md-6">
            <label className="form-label">
              <i className="bi bi-person me-1" style={{ color: "var(--blue-700)" }}></i>
              Select Child
            </label>
            <select 
              className="form-select" 
              value={selectedChild} 
              onChange={(e) => setSelectedChild(e.target.value)}
            >
              {children.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name} ({c.admission_no})
                </option>
              ))}
              {children.length === 0 && (
                <option value="">No children linked</option>
              )}
            </select>
          </div>
          {selectedChildData && (
            <div className="col-md-6">
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: "0.75rem",
                padding: "0.5rem 1rem",
                background: "var(--blue-50)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--blue-200)",
              }}>
                <div className="avatar-sm" style={{ background: "var(--blue-700)", color: "#fff" }}>
                  {selectedChildData.first_name?.[0]}{selectedChildData.last_name?.[0]}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "var(--fs-sm)", color: "var(--blue-900)" }}>
                    {selectedChildData.full_name}
                  </div>
                  <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-600)" }}>
                    <i className="bi bi-door-open me-1"></i>
                    {selectedChildData.current_classroom || "No class assigned"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Loading State */}
      {loading || loadingInvoices ? (
        <>
          <div className="row g-3 mb-4">
            {[1, 2, 3].map((i) => (
              <div className="col-6 col-md-4" key={i}>
                <div className="stat-card stat-card--skeleton">
                  <i className="bi bi-circle"></i>
                  <div>
                    <div className="skeleton skeleton-text" style={{ width: "80px", height: "24px" }}></div>
                    <div className="skeleton skeleton-text" style={{ width: "100px", height: "14px", marginTop: "4px" }}></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <TableSkeleton rows={5} columns={5} />
        </>
      ) : children.length === 0 ? (
        <div className="empty-state">
          <i className="bi bi-people"></i>
          <h6>No children linked</h6>
          <p className="text-muted-soft">
            Please contact the school administration to link your children to your account.
          </p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          {childInvoices.length > 0 && (
            <div className="row g-3 mb-4">
              <div className="col-6 col-md-4">
                <div className="stat-card">
                  <i className="bi bi-cash"></i>
                  <div>
                    <div className="stat-card__value" style={{ fontSize: "1.2rem" }}>
                      KES {totals.totalDue.toLocaleString()}
                    </div>
                    <div className="stat-card__label">Total Amount Due</div>
                  </div>
                </div>
              </div>
              <div className="col-6 col-md-4">
                <div className="stat-card stat-card--success">
                  <i className="bi bi-check-circle"></i>
                  <div>
                    <div className="stat-card__value" style={{ fontSize: "1.2rem" }}>
                      KES {totals.totalPaid.toLocaleString()}
                    </div>
                    <div className="stat-card__label">Total Amount Paid</div>
                  </div>
                </div>
              </div>
              <div className="col-12 col-md-4">
                <div className={`stat-card ${totals.totalBalance > 0 ? "stat-card--danger" : "stat-card--success"}`}>
                  <i className={`bi ${totals.totalBalance > 0 ? "bi-exclamation-circle" : "bi-check-circle"}`}></i>
                  <div>
                    <div className="stat-card__value" style={{ 
                      fontSize: "1.2rem",
                      color: totals.totalBalance > 0 ? "var(--danger-600)" : "var(--success-600)"
                    }}>
                      KES {totals.totalBalance.toLocaleString()}
                    </div>
                    <div className="stat-card__label">
                      {totals.totalBalance > 0 ? "Outstanding Balance" : "All Paid"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Invoices Table */}
          <div className="table-wrap">
            <div className="table-wrap__header">
              <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                <i className="bi bi-receipt me-2" style={{ color: "var(--blue-700)" }}></i>
                Fee Statements for {selectedChildData?.full_name || "Child"}
              </span>
              <span className="badge badge-neutral">
                {childInvoices.length} invoice{childInvoices.length !== 1 ? "s" : ""}
              </span>
            </div>

            {childInvoices.length === 0 ? (
              <div className="empty-state">
                <i className="bi bi-cash-stack"></i>
                <h6>No fee statements yet</h6>
                <p className="text-muted-soft">
                  Fee statements for {selectedChildData?.full_name || "this child"} will appear here once generated.
                </p>
              </div>
            ) : (
              <>
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th className="text-end">Amount Due (KES)</th>
                        <th className="text-end">Amount Paid (KES)</th>
                        <th className="text-end">Balance (KES)</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {childInvoices.map((inv) => {
                        const balance = Number(inv.balance || 0);
                        const status = getStatusBadge(balance);
                        return (
                          <tr key={inv.id}>
                            <td>
                              <div className="table-avatar-cell">
                                <div className="avatar-sm">
                                  {inv.student_name?.split(' ').map(n => n[0]).join('') || 'S'}
                                </div>
                                <div>
                                  <span className="cell-name">{inv.student_name}</span>
                                  {inv.term_label && (
                                    <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
                                      <i className="bi bi-calendar3 me-1"></i>
                                      {inv.term_label}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="text-end" style={{ fontWeight: 600, color: "var(--ink-700)" }}>
                              {Number(inv.amount_due).toLocaleString()}
                            </td>
                            <td className="text-end" style={{ fontWeight: 600, color: "var(--success-600)" }}>
                              {Number(inv.amount_paid).toLocaleString()}
                            </td>
                            <td className="text-end" style={{ 
                              fontWeight: 700,
                              color: balance > 0 ? "var(--danger-600)" : balance < 0 ? "var(--gold-600)" : "var(--success-600)"
                            }}>
                              {Number(inv.balance).toLocaleString()}
                            </td>
                            <td>
                              <span className={`badge ${status.className}`}>
                                <i className={`bi ${status.icon} me-1`}></i>
                                {status.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Footer Summary */}
                <div className="table-wrap__footer">
                  <span className="table-wrap__footer-info">
                    Showing <strong>{childInvoices.length}</strong> invoice{childInvoices.length !== 1 ? "s" : ""}
                  </span>
                  <div style={{ display: "flex", gap: "1rem", fontSize: "var(--fs-xs)" }}>
                    <span style={{ color: "var(--success-600)" }}>
                      <i className="bi bi-check-circle me-1"></i>
                      Paid: {childInvoices.filter(i => Number(i.balance || 0) === 0).length}
                    </span>
                    <span style={{ color: "var(--danger-600)" }}>
                      <i className="bi bi-exclamation-circle me-1"></i>
                      Outstanding: {childInvoices.filter(i => Number(i.balance || 0) > 0).length}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Payment Tip */}
          {totals.totalBalance > 0 && (
            <div className="card mt-4" style={{ background: "var(--warning-100)", border: "1px solid #f2ddaa" }}>
              <div className="card-body" style={{ padding: "0.75rem 1.25rem" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", fontSize: "var(--fs-sm)" }}>
                  <i className="bi bi-info-circle" style={{ color: "var(--warning-600)", fontSize: "1.1rem", marginTop: "0.1rem" }}></i>
                  <div style={{ color: "var(--ink-700)" }}>
                    <strong>Outstanding Balance:</strong> {selectedChildData?.full_name || "Your child"} has an outstanding
                    balance of <strong style={{ color: "var(--danger-600)" }}>KES {totals.totalBalance.toLocaleString()}</strong>.
                    <div style={{ marginTop: "0.25rem", fontSize: "var(--fs-xs)", color: "var(--ink-600)" }}>
                      Please contact the school finance office for payment options, or log in as a student to make a payment.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* All Paid Message */}
          {totals.totalBalance <= 0 && childInvoices.length > 0 && (
            <div className="card mt-4" style={{ background: "var(--success-100)", border: "1px solid #bfe8d2" }}>
              <div className="card-body" style={{ padding: "0.75rem 1.25rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "var(--fs-sm)" }}>
                  <i className="bi bi-check-circle" style={{ color: "var(--success-600)", fontSize: "1.2rem" }}></i>
                  <span style={{ color: "var(--success-600)", fontWeight: 600 }}>
                    All fees are fully paid for {selectedChildData?.full_name || "this child"}. Thank you!
                  </span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}