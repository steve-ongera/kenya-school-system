import { useEffect, useState } from "react";
import { studentsApi, financeApi } from "../../services/api";

export default function ParentFees() {
  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState("");
  const [invoices, setInvoices] = useState([]);

  useEffect(() => {
    studentsApi.list().then(({ data }) => {
      const list = data.results ?? data;
      setChildren(list);
      if (list[0]) setSelectedChild(list[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedChild) return;
    financeApi.invoices().then(({ data }) => {
      const list = data.results ?? data;
      setInvoices(list); // API already scopes invoices to this parent's linked children
    });
  }, [selectedChild]);

  return (
    <div>
      <h2 className="page-title">Fee Statements</h2>

      <div className="card p-3 mb-4">
        <label className="form-label">Child</label>
        <select className="form-select" value={selectedChild} onChange={(e) => setSelectedChild(e.target.value)}>
          {children.map((c) => <option key={c.id} value={c.id}>{c.full_name} ({c.admission_no})</option>)}
        </select>
      </div>

      <div className="table-responsive card">
        <table className="table table-hover mb-0">
          <thead><tr><th>Student</th><th>Amount Due (KES)</th><th>Amount Paid (KES)</th><th>Balance (KES)</th></tr></thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td>{inv.student_name}</td>
                <td>{Number(inv.amount_due).toLocaleString()}</td>
                <td>{Number(inv.amount_paid).toLocaleString()}</td>
                <td className={inv.balance > 0 ? "text-danger fw-bold" : "text-success fw-bold"}>
                  {Number(inv.balance).toLocaleString()}
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr><td colSpan={4} className="text-center text-muted py-3">No invoices yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
