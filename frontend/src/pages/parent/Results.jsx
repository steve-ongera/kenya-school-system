import { useEffect, useState } from "react";
import { studentsApi, examsApi } from "../../services/api";

export default function ParentResults() {
  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState("");
  const [enrollment, setEnrollment] = useState(null);
  const [results, setResults] = useState([]);
  const [ranking, setRanking] = useState(null);

  useEffect(() => {
    studentsApi.list().then(({ data }) => {
      const list = data.results ?? data;
      setChildren(list);
      if (list[0]) setSelectedChild(list[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedChild) return;
    (async () => {
      const { data } = await studentsApi.enrollments({ student: selectedChild, status: "ACTIVE" });
      const list = data.results ?? data;
      const current = list[0] || null;
      setEnrollment(current);
      if (current) {
        const [resultsRes, rankRes] = await Promise.all([
          examsApi.results({ enrollment: current.id }),
          examsApi.rankings({ enrollment: current.id, checkpoint: "ENDTERM" }),
        ]);
        setResults(resultsRes.data.results ?? resultsRes.data);
        const rankList = rankRes.data.results ?? rankRes.data;
        setRanking(rankList[rankList.length - 1] || null);
      }
    })();
  }, [selectedChild]);

  return (
    <div>
      <h2 className="page-title">Results</h2>

      <div className="card p-3 mb-4">
        <label className="form-label">Child</label>
        <select className="form-select" value={selectedChild} onChange={(e) => setSelectedChild(e.target.value)}>
          {children.map((c) => <option key={c.id} value={c.id}>{c.full_name} ({c.admission_no})</option>)}
        </select>
      </div>

      {enrollment && (
        <p className="text-muted">Current class: <strong>{enrollment.classroom_label}</strong></p>
      )}
      {ranking && (
        <div className="alert alert-success">
          Class Position: <strong>#{ranking.class_position}</strong> — Average: <strong>{ranking.average_marks}%</strong>
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
