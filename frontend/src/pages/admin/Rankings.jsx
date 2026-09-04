import { useEffect, useState } from "react";
import { examsApi, academicsApi, calendarApi } from "../../services/api";

export default function AdminRankings() {
  const [terms, setTerms] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [gradeLevels, setGradeLevels] = useState([]);
  const [rankings, setRankings] = useState([]);
  const [message, setMessage] = useState("");

  const [scope, setScope] = useState("classroom"); // classroom | grade
  const [form, setForm] = useState({ term_id: "", classroom_id: "", grade_level_id: "", checkpoint: "ENDTERM" });

  useEffect(() => {
    (async () => {
      const [t, c, g] = await Promise.all([
        calendarApi.terms(),
        academicsApi.classrooms(),
        academicsApi.gradeLevels(),
      ]);
      setTerms(t.data.results ?? t.data);
      setClassrooms(c.data.results ?? c.data);
      setGradeLevels(g.data.results ?? g.data);
    })();
  }, []);

  const runRanking = async (e) => {
    e.preventDefault();
    setMessage("");
    const payload = {
      term_id: Number(form.term_id),
      checkpoint: form.checkpoint,
      ...(scope === "classroom" ? { classroom_id: Number(form.classroom_id) } : { grade_level_id: Number(form.grade_level_id) }),
    };
    try {
      const { data } = await examsApi.rank(payload);
      setMessage(`Ranked ${data.ranked_count} student(s).`);
      const params = { term: form.term_id, checkpoint: form.checkpoint };
      if (scope === "classroom") params["enrollment__classroom"] = form.classroom_id;
      const res = await examsApi.rankings(params);
      setRankings(res.data.results ?? res.data);
    } catch (err) {
      setMessage(err.response?.data?.detail || "Could not compute ranking.");
    }
  };

  return (
    <div>
      <h2 className="page-title">Rankings</h2>
      <p className="text-muted">
        Midterm ranking combines exams flagged "counts toward midterm"; end-of-term ranking
        combines all exams flagged "counts toward end-of-term" (weighted per exam type).
      </p>
      {message && <div className="alert alert-info">{message}</div>}

      <form className="card p-3 mb-4" onSubmit={runRanking}>
        <div className="row g-3 align-items-end">
          <div className="col-md-3">
            <label className="form-label">Term</label>
            <select className="form-select" required value={form.term_id}
              onChange={(e) => setForm({ ...form, term_id: e.target.value })}>
              <option value="">Select...</option>
              {terms.map((t) => <option key={t.id} value={t.id}>Term {t.term_number} - {t.academic_year_label}</option>)}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">Checkpoint</label>
            <select className="form-select" value={form.checkpoint}
              onChange={(e) => setForm({ ...form, checkpoint: e.target.value })}>
              <option value="MIDTERM">Midterm Ranking</option>
              <option value="ENDTERM">End of Term Ranking</option>
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">Scope</label>
            <select className="form-select" value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="classroom">Single classroom</option>
              <option value="grade">Whole grade (all streams)</option>
            </select>
          </div>
          <div className="col-md-3">
            {scope === "classroom" ? (
              <>
                <label className="form-label">Classroom</label>
                <select className="form-select" required value={form.classroom_id}
                  onChange={(e) => setForm({ ...form, classroom_id: e.target.value })}>
                  <option value="">Select...</option>
                  {classrooms.map((c) => <option key={c.id} value={c.id}>{c.grade_level_name} {c.stream_name}</option>)}
                </select>
              </>
            ) : (
              <>
                <label className="form-label">Grade Level</label>
                <select className="form-select" required value={form.grade_level_id}
                  onChange={(e) => setForm({ ...form, grade_level_id: e.target.value })}>
                  <option value="">Select...</option>
                  {gradeLevels.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </>
            )}
          </div>
        </div>
        <button className="btn btn-primary mt-3" style={{ width: "fit-content" }}>
          <i className="bi bi-bar-chart-line me-1"></i>Compute Ranking
        </button>
      </form>

      <div className="table-responsive card">
        <table className="table table-hover mb-0">
          <thead><tr><th>Position</th><th>Admission No</th><th>Student</th><th>Class</th><th>Average %</th></tr></thead>
          <tbody>
            {rankings
              .slice()
              .sort((a, b) => (a.class_position ?? 999) - (b.class_position ?? 999))
              .map((r) => (
                <tr key={r.id}>
                  <td><strong>#{r.class_position}</strong>{r.grade_position ? ` (Grade #${r.grade_position})` : ""}</td>
                  <td>{r.admission_no}</td>
                  <td>{r.student_name}</td>
                  <td>{r.classroom_label}</td>
                  <td>{r.average_marks}%</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}