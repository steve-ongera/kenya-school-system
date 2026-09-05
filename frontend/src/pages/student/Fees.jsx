import { useEffect, useState } from "react";
import { financeApi } from "../../services/api";

export default function StudentFees() {
  const [invoices, setInvoices] = useState([]);

  useEffect(() => {
    financeApi.invoices().then(({ data }) => setInvoices(data.results ?? data));
  }, []);

  return (
    <div>
      <h2 className="page-title">Fee Statement</h2>
      <div className="table-responsive card">
        <table className="table table-hover mb-0">
          <thead><tr><th>Amount Due (KES)</th><th>Amount Paid (KES)</th><th>Balance (KES)</th></tr></thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td>{Number(inv.amount_due).toLocaleString()}</td>
                <td>{Number(inv.amount_paid).toLocaleString()}</td>
                <td className={inv.balance > 0 ? "text-danger fw-bold" : "text-success fw-bold"}>
                  {Number(inv.balance).toLocaleString()}
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr><td colSpan={3} className="text-center text-muted py-3">No invoices yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
