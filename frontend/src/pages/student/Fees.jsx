import { useEffect, useState } from "react";
import { financeApi, paymentsApi, profileApi } from "../../services/api";
import ReceiptCard from "../../components/Receiptcard";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";


const POLL_INTERVAL_MS = 3000;
const POLL_MAX_TRIES = 20; // ~1 minute

export default function StudentFees() {
  const [invoices, setInvoices] = useState([]);
  const [defaultPhone, setDefaultPhone] = useState("");
  const [loading, setLoading] = useState(true);

  // pay modal state
  const [payInvoice, setPayInvoice] = useState(null);
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [payError, setPayError] = useState("");
  const [payStatus, setPayStatus] = useState(""); // "", "SUBMITTING", "PENDING", "COMPLETED", "FAILED"

  // receipt viewer state
  const [receipt, setReceipt] = useState(null);
  const [receiptLoading, setReceiptLoading] = useState(false);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const { data } = await financeApi.invoices();
      const list = (data.results ?? data).sort((a, b) => new Date(b.issued_at) - new Date(a.issued_at));
      setInvoices(list);
    } catch (error) {
      console.error("Failed to load invoices:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();
    profileApi.me().then(({ data }) => setDefaultPhone(data.phone_number || ""));
  }, []);

  const totalDue = invoices.reduce((s, i) => s + Number(i.amount_due), 0);
  const totalPaid = invoices.reduce((s, i) => s + Number(i.amount_paid), 0);
  const netBalance = totalDue - totalPaid;

  const openPayModal = (invoice) => {
    setPayInvoice(invoice);
    setPhone(defaultPhone);
    setAmount(invoice.balance > 0 ? String(invoice.balance) : "");
    setPayError("");
    setPayStatus("");
  };

  const closePayModal = () => {
    setPayInvoice(null);
    setPayStatus("");
    setPayError("");
  };

  const pollStatus = async (checkoutRequestId, triesLeft) => {
    if (triesLeft <= 0) {
      setPayStatus("FAILED");
      setPayError("We didn't get a confirmation in time. If you completed the M-Pesa prompt, your balance will update shortly - check back on this page.");
      return;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    try {
      const { data } = await paymentsApi.status(checkoutRequestId);
      if (data.status === "COMPLETED") {
        setPayStatus("COMPLETED");
        await loadInvoices();
        if (data.payment) await viewReceipt(data.payment.id);
      } else if (data.status === "FAILED" || data.status === "CANCELLED") {
        setPayStatus("FAILED");
        setPayError(data.result_description || "Payment was not completed.");
      } else {
        pollStatus(checkoutRequestId, triesLeft - 1);
      }
    } catch {
      pollStatus(checkoutRequestId, triesLeft - 1);
    }
  };

  const submitPayment = async (e) => {
    e.preventDefault();
    setPayError("");
    setPayStatus("SUBMITTING");
    try {
      const { data } = await paymentsApi.initiate({
        invoice_id: payInvoice.id,
        phone_number: phone,
        amount: Number(amount),
      });
      if (data.status === "COMPLETED") {
        setPayStatus("COMPLETED");
        await loadInvoices();
        if (data.payment) await viewReceipt(data.payment.id);
      } else {
        setPayStatus("PENDING");
        pollStatus(data.checkout_request_id, POLL_MAX_TRIES);
      }
    } catch (err) {
      setPayStatus("FAILED");
      const detail = err.response?.data?.detail || err.response?.data;
      setPayError(typeof detail === "object" ? Object.values(detail).flat().join(" ") : (detail || "Could not start payment."));
    }
  };

  const viewReceipt = async (paymentId) => {
    setReceiptLoading(true);
    try {
      const { data } = await paymentsApi.receipt(paymentId);
      setReceipt(data);
    } finally {
      setReceiptLoading(false);
    }
  };

  // Get all payments from invoices
  const allPayments = invoices.flatMap((inv) => 
    (inv.payments || []).map((p) => ({ ...p, term_label: inv.term_label }))
  );

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: "Dashboard", href: "/student" },
        { label: "Fees", href: "/student/fees" },
        { label: "Fee Payment", href: "#" },
      ]} />

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Fee Payment</h1>
          <p className="page-subtitle">
            View your fee statements and make payments
          </p>
        </div>
        {!loading && (
          <span className={`badge ${netBalance > 0 ? "badge-danger" : "badge-success"}`} style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem" }}>
            <i className={`bi ${netBalance > 0 ? "bi-exclamation-circle" : "bi-check-circle"} me-1`}></i>
            Balance: KES {netBalance.toLocaleString()}
          </span>
        )}
      </div>

      {/* Balance Banners */}
      {!loading && netBalance > 0 && (
        <div className="alert alert-warning mb-4" style={{ 
          display: "flex", 
          alignItems: "center", 
          gap: "0.5rem",
          flexWrap: "wrap"
        }}>
          <i className="bi bi-exclamation-circle" style={{ fontSize: "1.2rem" }}></i>
          <span>
            You have an outstanding balance of <strong>KES {netBalance.toLocaleString()}</strong> across
            your fee statements. You don't need to pay it all at once — partial payments are accepted.
          </span>
        </div>
      )}
      {!loading && netBalance < 0 && (
        <div className="alert alert-success mb-4" style={{ 
          display: "flex", 
          alignItems: "center", 
          gap: "0.5rem",
          flexWrap: "wrap"
        }}>
          <i className="bi bi-piggy-bank" style={{ fontSize: "1.2rem" }}></i>
          <span>
            You have a credit balance of <strong>KES {Math.abs(netBalance).toLocaleString()}</strong> from
            a previous overpayment. It will be applied automatically to your next term's fees.
          </span>
        </div>
      )}

      {/* Invoices Table */}
      {loading ? (
        <TableSkeleton rows={5} columns={8} />
      ) : invoices.length === 0 ? (
        <div className="table-wrap mb-4">
          <div className="empty-state">
            <i className="bi bi-cash-stack"></i>
            <h6>No Fee Statements</h6>
            <p className="text-muted-soft">
              You don't have any fee statements at the moment.
              Please contact the finance office for assistance.
            </p>
          </div>
        </div>
      ) : (
        <div className="table-wrap mb-4">
          <div className="table-wrap__header">
            <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
              <i className="bi bi-receipt me-2"></i>
              Fee Statements
              <span className="badge badge-neutral ms-2">{invoices.length}</span>
            </span>
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
              <i className="bi bi-calendar3 me-1"></i>
              {invoices.length} invoice{invoices.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0 align-middle">
              <thead>
                <tr>
                  <th>Term</th>
                  <th>Grade</th>
                  <th className="text-end">Brought Fwd</th>
                  <th className="text-end">Term Fee</th>
                  <th className="text-end">Total Due</th>
                  <th className="text-end">Paid</th>
                  <th className="text-end">Balance</th>
                  <th style={{ width: "100px" }}></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <span style={{ fontWeight: 500, color: "var(--ink-900)" }}>
                        {inv.term_label}
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-blue">{inv.grade_level_name}</span>
                    </td>
                    <td className={`text-end ${inv.brought_forward < 0 ? "text-success" : inv.brought_forward > 0 ? "text-danger" : ""}`}>
                      {Number(inv.brought_forward).toLocaleString()}
                    </td>
                    <td className="text-end">{Number(inv.term_charge).toLocaleString()}</td>
                    <td className="text-end">{Number(inv.amount_due).toLocaleString()}</td>
                    <td className="text-end text-success">{Number(inv.amount_paid).toLocaleString()}</td>
                    <td className={`text-end fw-bold ${inv.balance > 0 ? "text-danger" : "text-success"}`}>
                      {Number(inv.balance).toLocaleString()}
                    </td>
                    <td className="text-end">
                      <button 
                        className={`btn btn-sm ${inv.balance > 0 ? "btn-primary" : "btn-outline-secondary"}`} 
                        onClick={() => openPayModal(inv)}
                        style={{ width: "100%" }}
                      >
                        <i className={`bi ${inv.balance > 0 ? "bi-phone" : "bi-plus-circle"} me-1`}></i>
                        {inv.balance > 0 ? "Pay" : "Top Up"}
                      </button>
                    </td>
                  </tr>
                ))}
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

      {/* Payment History */}
      {!loading && allPayments.length > 0 && (
        <>
          <h6 className="mb-2" style={{ fontWeight: 600, color: "var(--ink-700)" }}>
            <i className="bi bi-clock-history me-2" style={{ color: "var(--blue-700)" }}></i>
            Payment History
          </h6>
          <div className="table-wrap">
            <div className="table-wrap__header">
              <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                <i className="bi bi-list-ul me-2"></i>
                All Payments
                <span className="badge badge-neutral ms-2">{allPayments.length}</span>
              </span>
            </div>
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th>Receipt No</th>
                    <th>Term</th>
                    <th className="text-end">Amount (KES)</th>
                    <th>Method</th>
                    <th>Date</th>
                    <th style={{ width: "100px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {allPayments.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <span style={{ fontWeight: 600, color: "var(--blue-700)", fontSize: "var(--fs-sm)" }}>
                          {p.receipt_no}
                        </span>
                      </td>
                      <td>{p.term_label}</td>
                      <td className="text-end fw-bold text-success">
                        KES {Number(p.amount).toLocaleString()}
                      </td>
                      <td>
                        <span className="badge badge-neutral">
                          <i className="bi bi-phone me-1"></i>
                          {p.method}
                        </span>
                      </td>
                      <td style={{ fontSize: "var(--fs-sm)", color: "var(--ink-600)" }}>
                        {new Date(p.paid_at).toLocaleDateString('en-KE', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </td>
                      <td>
                        <button 
                          className="btn btn-sm btn-outline-primary" 
                          onClick={() => viewReceipt(p.id)}
                          style={{ width: "100%" }}
                        >
                          <i className="bi bi-receipt me-1"></i>Receipt
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Payment Modal */}
      {payInvoice && (
        <div className="simple-modal-backdrop" onClick={payStatus === "SUBMITTING" || payStatus === "PENDING" ? undefined : closePayModal}>
          <div className="simple-modal" onClick={(e) => e.stopPropagation()}>
            {payStatus === "COMPLETED" ? (
              <div className="text-center py-3">
                <i className="bi bi-check-circle-fill text-success" style={{ fontSize: "3rem" }}></i>
                <h5 className="mt-3" style={{ fontWeight: 700 }}>Payment Successful</h5>
                <p className="text-muted">Your fee statement has been updated.</p>
                <button className="btn btn-primary" onClick={closePayModal}>
                  <i className="bi bi-check2 me-2"></i>Close
                </button>
              </div>
            ) : payStatus === "FAILED" ? (
              <div className="text-center py-3">
                <i className="bi bi-x-circle-fill text-danger" style={{ fontSize: "3rem" }}></i>
                <h5 className="mt-3" style={{ fontWeight: 700 }}>Payment Failed</h5>
                <p className="text-danger">{payError}</p>
                <button className="btn btn-primary" onClick={() => setPayStatus("")}>
                  <i className="bi bi-arrow-repeat me-2"></i>Try Again
                </button>
              </div>
            ) : payStatus === "PENDING" ? (
              <div className="text-center py-3">
                <div className="spinner-border text-primary mb-3" role="status" style={{ width: "3rem", height: "3rem" }}></div>
                <h5 style={{ fontWeight: 700 }}>Check your phone</h5>
                <p className="text-muted">
                  An M-Pesa prompt has been sent to <strong>{phone}</strong>. Enter your PIN to
                  complete the payment of <strong>KES {Number(amount).toLocaleString()}</strong>.
                </p>
                <div className="text-muted small">
                  <i className="bi bi-clock me-1"></i>
                  Waiting for confirmation...
                </div>
              </div>
            ) : (
              <form onSubmit={submitPayment}>
                <h5 className="mb-1" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
                  <i className="bi bi-credit-card me-2" style={{ color: "var(--blue-700)" }}></i>
                  Pay School Fees
                </h5>
                <p className="text-muted small mb-3">
                  {payInvoice.term_label} — {payInvoice.grade_level_name}
                </p>

                {payError && (
                  <div className="alert alert-danger py-2">
                    <i className="bi bi-exclamation-circle me-2"></i>
                    {payError}
                  </div>
                )}

                <div className="mb-3">
                  <label className="form-label">Amount (KES)</label>
                  <input
                    type="number" 
                    min="1" 
                    step="1" 
                    className="form-control" 
                    required
                    value={amount} 
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Enter amount to pay"
                  />
                  <div className="form-text-hint">
                    Balance owed: <strong>KES {Number(payInvoice.balance).toLocaleString()}</strong>. 
                    You may pay less (partial) or more (the extra becomes a credit for next term).
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label">
                    <i className="bi bi-phone me-1" style={{ color: "var(--blue-700)" }}></i>
                    M-Pesa Phone Number
                  </label>
                  <input
                    className="form-control" 
                    required 
                    placeholder="07XXXXXXXX"
                    value={phone} 
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>

                <div className="d-flex gap-2">
                  <button type="submit" className="btn btn-primary flex-fill" disabled={payStatus === "SUBMITTING"}>
                    {payStatus === "SUBMITTING" ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        Sending...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-send me-2"></i>
                        Pay with M-Pesa
                      </>
                    )}
                  </button>
                  <button type="button" className="btn btn-outline-secondary" onClick={closePayModal}>
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {(receipt || receiptLoading) && (
        <div className="simple-modal-backdrop" onClick={() => setReceipt(null)}>
          <div className="simple-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "500px" }}>
            {receiptLoading ? (
              <div className="text-center py-4">
                <div className="spinner-border text-primary" role="status" style={{ width: "3rem", height: "3rem" }}></div>
                <p className="mt-2 text-muted">Loading receipt...</p>
              </div>
            ) : (
              <>
                <ReceiptCard receipt={receipt} />
                <div className="d-flex gap-2 mt-3">
                  <button className="btn btn-primary flex-fill" onClick={() => window.print()}>
                    <i className="bi bi-printer me-2"></i>Print
                  </button>
                  <button className="btn btn-outline-secondary" onClick={() => setReceipt(null)}>
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}