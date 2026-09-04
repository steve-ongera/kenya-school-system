import { useEffect, useState } from "react";
import { financeApi, academicsApi, calendarApi } from "../../services/api";

export default function AdminFees() {
  const [structures, setStructures] = useState([]);
  const [gradeLevels, setGradeLevels] = useState([]);
  const [terms, setTerms] = useState([]);
  const [message, setMessage] = useState("");

  const [form, setForm] = useState({ grade_level: "", term: "", total_amount: "" });
  const [items, setItems] = useState([{ name: "Tuition", amount: "" }]);

  const loadAll = async () => {
    const [f, g, t] = await Promise.all([
      financeApi.feeStructures(),
      academicsApi.gradeLevels(),
      calendarApi.terms(),
    ]);
    setStructures(f.data.results ?? f.data);
    setGradeLevels(g.data.results ?? g.data);
    setTerms(t.data.results ?? t.data);
  };

  useEffect(() => { loadAll(); }, []);

  const updateItem = (idx, field, value) => {
    const next = [...items];
    next[idx][field] = value;
    setItems(next);
  };

  const addItemRow = () => setItems([...items, { name: "", amount: "" }]);

  const submit = async (e) => {
    e.preventDefault();
    setMessage("");
    const cleanItems = items.filter((i) => i.name && i.amount).map((i) => ({ name: i.name, amount: i.amount }));
    const total = form.total_amount || cleanItems.reduce((sum, i) => sum + Number(i.amount || 0), 0);
    try {
      await financeApi.createFeeStructure({ ...form, total_amount: total, items: cleanItems });
      setForm({ grade_level: "", term: "", total_amount: "" });
      setItems([{ name: "Tuition", amount: "" }]);
      loadAll();
      setMessage("Fee structure saved.");
    } catch (err) {
      setMessage(err.response?.data ? JSON.stringify(err.response.data) : "Could not save fee structure.");
    }
  };

  return (
    <div>
      <h2 className="page-title">Fee Structures</h2>
      <p className="text-muted">Fee structures differ by grade and by term — set one per grade/term combination.</p>
      {message && <div className="alert alert-info">{message}</div>}

      <form className="card p-3 mb-4" onSubmit={submit}>
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label">Grade Level</label>
            <select className="form-select" required value={form.grade_level}
              onChange={(e) => setForm({ ...form, grade_level: e.target.value })}>
              <option value="">Select...</option>
              {gradeLevels.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label">Term</label>
            <select className="form-select" required value={form.term}
              onChange={(e) => setForm({ ...form, term: e.target.value })}>
              <option value="">Select...</option>
              {terms.map((t) => <option key={t.id} value={t.id}>Term {t.term_number} - {t.academic_year_label}</option>)}
            </select>
          </div>
        </div>

        <label className="form-label mt-3">Fee Breakdown (optional line items)</label>
        {items.map((item, idx) => (
          <div className="row g-2 mb-2" key={idx}>
            <div className="col-6">
              <input className="form-control" placeholder="e.g. Tuition, Boarding, Activity"
                value={item.name} onChange={(e) => updateItem(idx, "name", e.target.value)} />
            </div>
            <div className="col-6">
              <input type="number" className="form-control" placeholder="Amount (KES)"
                value={item.amount} onChange={(e) => updateItem(idx, "amount", e.target.value)} />
            </div>
          </div>
        ))}
        <button type="button" className="btn btn-sm btn-outline-secondary mb-3" style={{ width: "fit-content" }} onClick={addItemRow}>
          <i className="bi bi-plus-lg me-1"></i>Add line item
        </button>

        <div className="col-md-4">
          <label className="form-label">Total Amount (KES) — auto-sums items if left blank</label>
          <input type="number" className="form-control" value={form.total_amount}
            onChange={(e) => setForm({ ...form, total_amount: e.target.value })} />
        </div>

        <button className="btn btn-primary mt-3" style={{ width: "fit-content" }}>Save Fee Structure</button>
      </form>

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