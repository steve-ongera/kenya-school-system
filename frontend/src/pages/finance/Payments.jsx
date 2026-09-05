import { useEffect, useState } from "react";
import { financeApi } from "../../services/api";

export default function FinancePayments() {
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [form, setForm] = useState({ invoice: "", amount: "", method: "MPESA", reference: "" });
  const [message, setMessage] = useState("");

  const loadInvoices = async () => {
    const { data } = await financeApi.invoices();
    setInvoices((data.results ?? data).filter((i) => i.balance > 0));
  };

  useEffect(() => { loadInvoices(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setMessage("");
    try {
      const { data } = await financeApi.recordPayment(form);
      setPayments((prev) => [data, ...prev]);
      setForm({ invoice: "", amount: "", method: "MPESA", reference: "" });
      loadInvoices();
      setMessage("Payment recorded.");
    } catch (err) {
      setMessage(err.response?.data ? JSON.stringify(err.response.data) : "Could not record payment.");
    }
  };

  return (
    <div>
      <h2 className="page-title">Payments</h2>
      {message && <div className="alert alert-info">{message}</div>}

      <form className="card p-3 mb-4" onSubmit={submit}>
        <div className="row g-3 align-items-end">
          <div className="col-md-4">
            <label className="form-label">Invoice (outstanding balance)</label>
            <select className="form-select" required value={form.invoice}
              onChange={(e) => setForm({ ...form, invoice: e.target.value })}>
              <option value="">Select...</option>
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.admission_no} - {inv.student_name} (Bal: KES {Number(inv.balance).toLocaleString()})
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-2">
            <label className="form-label">Amount (KES)</label>
            <input type="number" className="form-control" required value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div className="col-md-2">
            <label className="form-label">Method</label>
            <select className="form-select" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              <option value="MPESA">M-Pesa</option>
              <option value="BANK">Bank</option>
              <option value="CASH">Cash</option>
              <option value="CHEQUE">Cheque</option>
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">Reference</label>
            <input className="form-control" placeholder="M-Pesa code / receipt no."
              value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </div>
          <div className="col-md-1">
            <button className="btn btn-primary w-100">Save</button>
          </div>
        </div>
      </form>

      {payments.length > 0 && (
        <div className="table-responsive card">
          <table className="table table-hover mb-0">
            <thead><tr><th>Amount (KES)</th><th>Method</th><th>Reference</th></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{Number(p.amount).toLocaleString()}</td>
                  <td>{p.method}</td>
                  <td>{p.reference || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
