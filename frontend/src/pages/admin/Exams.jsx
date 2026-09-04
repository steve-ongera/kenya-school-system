import { useEffect, useState } from "react";
import api, { examsApi, academicsApi, calendarApi } from "../../services/api";

export default function AdminExams() {
  const [exams, setExams] = useState([]);
  const [examTypes, setExamTypes] = useState([]);
  const [gradeLevels, setGradeLevels] = useState([]);
  const [terms, setTerms] = useState([]);
  const [message, setMessage] = useState("");

  const [typeForm, setTypeForm] = useState({ name: "", weight: 1, order: 1, counts_towards_midterm_rank: false, counts_towards_endterm_rank: true });
  const [examForm, setExamForm] = useState({ term: "", exam_type: "", grade_level: "", name: "", start_date: "", end_date: "" });

  const loadAll = async () => {
    const [e, et, g, t] = await Promise.all([
      examsApi.exams(),
      examsApi.examTypes(),
      academicsApi.gradeLevels(),
      calendarApi.terms(),
    ]);
    setExams(e.data.results ?? e.data);
    setExamTypes(et.data.results ?? et.data);
    setGradeLevels(g.data.results ?? g.data);
    setTerms(t.data.results ?? t.data);
  };

  useEffect(() => { loadAll(); }, []);

  const addExamType = async (e) => {
    e.preventDefault();
    setMessage("");
    try {
      await api.post("/exam-types/", typeForm);
      setTypeForm({ name: "", weight: 1, order: 1, counts_towards_midterm_rank: false, counts_towards_endterm_rank: true });
      loadAll();
      setMessage("Exam type created (e.g. Opening, Midterm, Endterm).");
    } catch (err) {
      setMessage(err.response?.data ? JSON.stringify(err.response.data) : "Could not create exam type.");
    }
  };

  const addExam = async (e) => {
    e.preventDefault();
    setMessage("");
    try {
      await api.post("/exams/", examForm);
      setExamForm({ term: "", exam_type: "", grade_level: "", name: "", start_date: "", end_date: "" });
      loadAll();
      setMessage("Exam scheduled.");
    } catch (err) {
      setMessage(err.response?.data ? JSON.stringify(err.response.data) : "Could not schedule exam.");
    }
  };

  const togglePublish = async (exam) => {
    await api.patch(`/exams/${exam.id}/`, { is_published: !exam.is_published });
    loadAll();
  };

  return (
    <div>
      <h2 className="page-title">Exams</h2>
      {message && <div className="alert alert-info">{message}</div>}

      <div className="row g-3 mb-4">
        <div className="col-md-5">
          <form className="card p-3 h-100" onSubmit={addExamType}>
            <h6>Add Exam Type</h6>
            <input className="form-control mb-2" placeholder="e.g. Midterm Exam"
              value={typeForm.name} onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })} required />
            <div className="row g-2 mb-2">
              <div className="col-6">
                <label className="form-label small">Weight</label>
                <input type="number" step="0.1" className="form-control" value={typeForm.weight}
                  onChange={(e) => setTypeForm({ ...typeForm, weight: e.target.value })} />
              </div>
              <div className="col-6">
                <label className="form-label small">Order in term</label>
                <input type="number" className="form-control" value={typeForm.order}
                  onChange={(e) => setTypeForm({ ...typeForm, order: e.target.value })} />
              </div>
            </div>
            <div className="form-check">
              <input type="checkbox" className="form-check-input" id="midtermFlag"
                checked={typeForm.counts_towards_midterm_rank}
                onChange={(e) => setTypeForm({ ...typeForm, counts_towards_midterm_rank: e.target.checked })} />
              <label className="form-check-label" htmlFor="midtermFlag">Counts toward midterm ranking</label>
            </div>
            <div className="form-check mb-2">
              <input type="checkbox" className="form-check-input" id="endtermFlag"
                checked={typeForm.counts_towards_endterm_rank}
                onChange={(e) => setTypeForm({ ...typeForm, counts_towards_endterm_rank: e.target.checked })} />
              <label className="form-check-label" htmlFor="endtermFlag">Counts toward end-of-term ranking</label>
            </div>
            <button className="btn btn-primary btn-sm">Save Exam Type</button>
          </form>
        </div>

        <div className="col-md-7">
          <form className="card p-3 h-100" onSubmit={addExam}>
            <h6>Schedule an Exam</h6>
            <div className="row g-2">
              <div className="col-md-6">
                <select className="form-select mb-2" required value={examForm.term}
                  onChange={(e) => setExamForm({ ...examForm, term: e.target.value })}>
                  <option value="">Term...</option>
                  {terms.map((t) => <option key={t.id} value={t.id}>Term {t.term_number} - {t.academic_year_label}</option>)}
                </select>
              </div>
              <div className="col-md-6">
                <select className="form-select mb-2" required value={examForm.exam_type}
                  onChange={(e) => setExamForm({ ...examForm, exam_type: e.target.value })}>
                  <option value="">Exam type...</option>
                  {examTypes.map((et) => <option key={et.id} value={et.id}>{et.name}</option>)}
                </select>
              </div>
              <div className="col-md-6">
                <select className="form-select mb-2" required value={examForm.grade_level}
                  onChange={(e) => setExamForm({ ...examForm, grade_level: e.target.value })}>
                  <option value="">Grade level...</option>
                  {gradeLevels.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div className="col-md-6">
                <input className="form-control mb-2" placeholder="Exam name"
                  value={examForm.name} onChange={(e) => setExamForm({ ...examForm, name: e.target.value })} required />
              </div>
              <div className="col-md-6">
                <label className="form-label small">Start date</label>
                <input type="date" className="form-control" value={examForm.start_date}
                  onChange={(e) => setExamForm({ ...examForm, start_date: e.target.value })} required />
              </div>
              <div className="col-md-6">
                <label className="form-label small">End date</label>
                <input type="date" className="form-control" value={examForm.end_date}
                  onChange={(e) => setExamForm({ ...examForm, end_date: e.target.value })} required />
              </div>
            </div>
            <button className="btn btn-primary btn-sm mt-2">Save Exam</button>
          </form>
        </div>
      </div>

      <div className="table-responsive card">
        <table className="table table-hover mb-0">
          <thead><tr><th>Name</th><th>Type</th><th>Grade</th><th>Term</th><th>Dates</th><th>Published</th></tr></thead>
          <tbody>
            {exams.map((ex) => (
              <tr key={ex.id}>
                <td>{ex.name}</td>
                <td>{ex.exam_type_name}</td>
                <td>{ex.grade_level}</td>
                <td>{ex.term_label}</td>
                <td>{ex.start_date} → {ex.end_date}</td>
                <td>
                  <button className={`btn btn-sm ${ex.is_published ? "btn-success" : "btn-outline-secondary"}`}
                    onClick={() => togglePublish(ex)}>
                    {ex.is_published ? "Published" : "Draft"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}