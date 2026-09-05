import { useEffect, useState } from "react";
import { financeApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";

export default function StudentFees() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await financeApi.invoices();
        setInvoices(data.results ?? data);
      } catch (error) {
        console.error("Failed to load invoices:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Calculate totals
  const totals = invoices.reduce(
    (acc, inv) => ({
      totalDue: acc.totalDue + Number(inv.amount_due || 0),
      totalPaid: acc.totalPaid + Number(inv.amount_paid || 0),
      totalBalance: acc.totalBalance + Number(inv.balance || 0),
    }),
    { totalDue: 0, totalPaid: 0, totalBalance: 0 }
  );

  // Get status badge
  const getStatusBadge = (balance) => {
    if (balance === 0) return "badge-success";
    if (balance < 0) return "badge-gold";
    return "badge-danger";
  };

  const getStatusLabel = (balance) => {
    if (balance === 0) return "Paid";
    if (balance < 0) return "Credit";
    return "Outstanding";
  };

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: "Dashboard", href: "/student" },
        { label: "Fees", href: "/student/fees" },
        { label: "Fee Statement", href: "#" },
      ]} />

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Fee Statement</h1>
          <p className="page-subtitle">
            View your fee payment history and outstanding balance
          </p>
        </div>
        {invoices.length > 0 && (
          <span className={`badge ${totals.totalBalance > 0 ? "badge-danger" : "badge-success"}`} style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem" }}>
            <i className={`bi ${totals.totalBalance > 0 ? "bi-exclamation-circle" : "bi-check-circle"} me-1`}></i>
            Balance: KES {totals.totalBalance.toLocaleString()}
          </span>
        )}
      </div>

      {/* Summary Cards */}
      {!loading && invoices.length > 0 && (
        <div className="row g-3 mb-4">
          <div className="col-md-4">
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
          <div className="col-md-4">
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
          <div className="col-md-4">
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
      {loading ? (
        <TableSkeleton rows={5} columns={3} />
      ) : invoices.length === 0 ? (
        <div className="table-wrap">
          <div className="empty-state">
            <i className="bi bi-cash-stack"></i>
            <h6>No Invoices</h6>
            <p className="text-muted-soft">
              You don't have any fee invoices at the moment.
              Please contact the finance office for assistance.
            </p>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <div className="table-wrap__header">
            <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
              <i className="bi bi-receipt me-2"></i>
              Invoice History
              <span className="badge badge-neutral ms-2">{invoices.length}</span>
            </span>
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
              <i className="bi bi-calendar3 me-1"></i>
              {invoices.length} invoice{invoices.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Description</th>
                  <th style={{ width: "160px" }}>Amount Due (KES)</th>
                  <th style={{ width: "160px" }}>Amount Paid (KES)</th>
                  <th style={{ width: "160px" }}>Balance (KES)</th>
                  <th style={{ width: "120px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const balance = Number(inv.balance || 0);
                  return (
                    <tr key={inv.id}>
                      <td>
                        <span style={{ fontWeight: 500, color: "var(--ink-900)" }}>
                          {inv.description || `Invoice #${inv.id}`}
                        </span>
                        {inv.date && (
                          <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
                            <i className="bi bi-calendar3 me-1"></i>
                            {new Date(inv.date).toLocaleDateString('en-KE', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </div>
                        )}
                      </td>
                      <td style={{ fontWeight: 600, color: "var(--ink-700)" }}>
                        KES {Number(inv.amount_due).toLocaleString()}
                      </td>
                      <td style={{ fontWeight: 600, color: "var(--success-600)" }}>
                        KES {Number(inv.amount_paid).toLocaleString()}
                      </td>
                      <td style={{ 
                        fontWeight: 700, 
                        color: balance > 0 ? "var(--danger-600)" : balance < 0 ? "var(--gold-600)" : "var(--success-600)"
                      }}>
                        KES {balance.toLocaleString()}
                      </td>
                      <td>
                        <span className={`badge ${getStatusBadge(balance)}`}>
                          <i className={`bi ${balance === 0 ? "bi-check-circle" : balance < 0 ? "bi-arrow-down-circle" : "bi-exclamation-circle"} me-1`}></i>
                          {getStatusLabel(balance)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="table-wrap__footer">
            <span className="table-wrap__footer-info">
              Showing <strong>{invoices.length}</strong> invoice{invoices.length !== 1 ? "s" : ""}
            </span>
            <div style={{ display: "flex", gap: "1rem", fontSize: "var(--fs-xs)" }}>
              <span style={{ color: "var(--success-600)" }}>
                <i className="bi bi-check-circle me-1"></i>
                Paid: {invoices.filter(i => Number(i.balance || 0) === 0).length}
              </span>
              <span style={{ color: "var(--danger-600)" }}>
                <i className="bi bi-exclamation-circle me-1"></i>
                Outstanding: {invoices.filter(i => Number(i.balance || 0) > 0).length}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Payment Tips */}
      {!loading && invoices.length > 0 && totals.totalBalance > 0 && (
        <div className="card mt-3" style={{ background: "var(--bg-app)" }}>
          <div className="card-body" style={{ padding: "0.75rem 1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "var(--fs-sm)" }}>
              <i className="bi bi-info-circle" style={{ color: "var(--blue-700)", fontSize: "1.2rem" }}></i>
              <span style={{ color: "var(--ink-600)" }}>
                <strong>Tip:</strong> Please clear your outstanding balance of 
                <span style={{ color: "var(--danger-600)", fontWeight: 700, margin: "0 0.25rem" }}>
                  KES {totals.totalBalance.toLocaleString()}
                </span>
                to avoid any penalties. Contact the finance office for payment options.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}