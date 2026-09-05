import { useEffect, useState } from "react";
import { financeApi } from "../../services/api";

export default function FinanceStructures() {
  const [structures, setStructures] = useState([]);

  useEffect(() => {
    financeApi.feeStructures().then(({ data }) => setStructures(data.results ?? data));
  }, []);

  return (
    <div>
      <h2 className="page-title">Fee Structures</h2>
      <p className="text-muted">Read-only view for Finance. Admins manage/create structures under Admin → Fee Structures.</p>
      <div className="table-responsive card">
        <table className="table table-hover mb-0">
          <thead><tr><th>Grade</th><th>Term</th><th>Total (KES)</th><th>Breakdown</th></tr></thead>
          <tbody>
            {structures.map((f) => (
              <tr key={f.id}>
                <td>{f.grade_level_name}</td>
                <td>{f.term_label}</td>
                <td>{Number(f.total_amount).toLocaleString()}</td>
                <td>{(f.items || []).map((i) => `${i.name}: ${Number(i.amount).toLocaleString()}`).join(", ") || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
