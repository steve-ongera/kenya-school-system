import { useEffect, useState } from "react";
import { studentsApi, examsApi, calendarApi } from "../../services/api";

export default function StudentResults() {
  const [enrollment, setEnrollment] = useState(null);
  const [terms, setTerms] = useState([]);
  const [selectedTerm, setSelectedTerm] = useState("");
  const [checkpoint, setCheckpoint] = useState("ENDTERM");
  const [results, setResults] = useState([]);
  const [ranking, setRanking] = useState(null);

  useEffect(() => {
    (async () => {
      const [enrollRes, termsRes] = await Promise.all([
        studentsApi.enrollments({ status: "ACTIVE" }),
        calendarApi.terms({ is_current: true }),
      ]);
      const list = enrollRes.data.results ?? enrollRes.data;
      setEnrollment(list[0] || null);
      const termList = termsRes.data.results ?? termsRes.data;
      setTerms(termList);
      if (termList[0]) setSelectedTerm(termList[0].id);
    })();
  }, []);

  useEffect(() => {
    if (!enrollment || !selectedTerm) return;
    (async () => {
      const { data } = await examsApi.results({ enrollment: enrollment.id });
      setResults((data.results ?? data).filter((r) => true));
      const { data: rankData } = await examsApi.rankings({ enrollment: enrollment.id, term: selectedTerm, checkpoint });
      const rankList = rankData.results ?? rankData;
      setRanking(rankList[0] || null);
    })();
  }, [enrollment, selectedTerm, checkpoint]);

  return (
    <div>
      <h2 className="page-title">My Results</h2>

      <div className="card p-3 mb-4">
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label">Term</label>
            <select className="form-select" value={selectedTerm} onChange={(e) => setSelectedTerm(e.target.value)}>
              {terms.map((t) => <option key={t.id} value={t.id}>Term {t.term_number} - {t.academic_year_label}</option>)}
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label">Checkpoint</label>
            <select className="form-select" value={checkpoint} onChange={(e) => setCheckpoint(e.target.value)}>
              <option value="MIDTERM">Midterm</option>
              <option value="ENDTERM">End of Term</option>
            </select>
          </div>
        </div>
      </div>

      {ranking && (
        <div className="alert alert-success">
          Class Position: <strong>#{ranking.class_position}</strong>
          {ranking.grade_position ? ` (Grade-wide #${ranking.grade_position})` : ""} — Average: <strong>{ranking.average_marks}%</strong>
        </div>
      )}

      <div className="table-responsive card">
        <table className="table table-hover mb-0">
          <thead><tr><th>Subject</th><th>Marks</th><th>Out of</th><th>%</th></tr></thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.id}>
                <td>{r.subject_name}</td>
                <td>{r.is_absent ? "Absent" : r.marks_obtained}</td>
                <td>{r.max_marks}</td>
                <td>{r.percentage ?? "-"}</td>
              </tr>
            ))}
            {results.length === 0 && (
              <tr><td colSpan={4} className="text-center text-muted py-3">No results published yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
