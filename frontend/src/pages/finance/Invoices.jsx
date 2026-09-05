import { useEffect, useState } from "react";
import { financeApi, studentsApi, calendarApi } from "../../services/api";

export default function FinanceInvoices() {
  const [invoices, setInvoices] = useState([]);
  const [students, setStudents] = useState([]);
  const [terms, setTerms] = useState([]);
  const [form, setForm] = useState({ enrollment_id: "", term_id: "" });
  const [message, setMessage] = useState("");

  const loadAll = async () => {
    const [inv, st, tm] = await Promise.all([
      financeApi.invoices(),
      studentsApi.enrollments({ status: "ACTIVE" }),
      calendarApi.terms(),
    ]);
    setInvoices(inv.data.results ?? inv.data);
    setStudents(st.data.results ?? st.data);
    setTerms(tm.data.results ?? tm.data);
  };

  useEffect(() => { loadAll(); }, []);

  const generate = async (e) => {
    e.preventDefault();
    setMessage("");
    try {
      await financeApi.generateInvoice(form);
      setForm({ enrollment_id: "", term_id: "" });
      loadAll();
      setMessage("Invoice generated from the grade's fee structure.");
    } catch (err) {
      setMessage(err.response?.data?.detail || "Could not generate invoice — has a fee structure been set for this grade/term?");
    }
  };

  return (
    <div>
      <h2 className="page-title">Invoices</h2>
      {message && <div className="alert alert-info">{message}</div>}

      <form className="card p-3 mb-4" onSubmit={generate}>
        <div className="row g-3 align-items-end">
          <div className="col-md-5">
            <label className="form-label">Student (active enrollment)</label>
            <select className="form-select" required value={form.enrollment_id}
              onChange={(e) => setForm({ ...form, enrollment_id: e.target.value })}>
              <option value="">Select...</option>
              {students.map((e) => <option key={e.id} value={e.id}>{e.admission_no} - {e.student_name} ({e.classroom_label})</option>)}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">Term</label>
            <select className="form-select" required value={form.term_id}
              onChange={(e) => setForm({ ...form, term_id: e.target.value })}>
              <option value="">Select...</option>
              {terms.map((t) => <option key={t.id} value={t.id}>Term {t.term_number} - {t.academic_year_label}</option>)}
            </select>
          </div>
          <div className="col-md-3">
            <button className="btn btn-primary w-100">Generate Invoice</button>
          </div>
        </div>
      </form>

      <div className="table-responsive card">
        <table className="table table-hover mb-0">
          <thead><tr><th>Admission No</th><th>Student</th><th>Due (KES)</th><th>Paid (KES)</th><th>Balance (KES)</th></tr></thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td>{inv.admission_no}</td>
                <td>{inv.student_name}</td>
                <td>{Number(inv.amount_due).toLocaleString()}</td>
                <td>{Number(inv.amount_paid).toLocaleString()}</td>
                <td className={inv.balance > 0 ? "text-danger fw-bold" : "text-success fw-bold"}>
                  {Number(inv.balance).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
