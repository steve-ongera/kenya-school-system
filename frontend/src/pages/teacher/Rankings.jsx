import { useEffect, useState } from "react";
import { teacherApi, examsApi, calendarApi } from "../../services/api";

export default function TeacherRankings() {
  const [allocations, setAllocations] = useState([]);
  const [terms, setTerms] = useState([]);
  const [classroom, setClassroom] = useState("");
  const [term, setTerm] = useState("");
  const [checkpoint, setCheckpoint] = useState("ENDTERM");
  const [rankings, setRankings] = useState([]);

  useEffect(() => {
    teacherApi.myAllocations().then(({ data }) => setAllocations(data.results ?? data));
    calendarApi.terms().then(({ data }) => setTerms(data.results ?? data));
  }, []);

  const uniqueClassrooms = [...new Map(allocations.map((a) => [a.classroom, a])).values()];

  const load = async () => {
    if (!classroom || !term) return;
    const { data } = await examsApi.rankings({ "enrollment__classroom": classroom, term, checkpoint });
    setRankings(data.results ?? data);
  };

  useEffect(() => { load(); }, [classroom, term, checkpoint]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <h2 className="page-title">Class Rankings</h2>
      <div className="card p-3 mb-4">
        <div className="row g-3">
          <div className="col-md-4">
            <label className="form-label">Classroom</label>
            <select className="form-select" value={classroom} onChange={(e) => setClassroom(e.target.value)}>
              <option value="">Select...</option>
              {uniqueClassrooms.map((a) => <option key={a.classroom} value={a.classroom}>{a.classroom_label}</option>)}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">Term</label>
            <select className="form-select" value={term} onChange={(e) => setTerm(e.target.value)}>
              <option value="">Select...</option>
              {terms.map((t) => <option key={t.id} value={t.id}>Term {t.term_number} - {t.academic_year_label}</option>)}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">Checkpoint</label>
            <select className="form-select" value={checkpoint} onChange={(e) => setCheckpoint(e.target.value)}>
              <option value="MIDTERM">Midterm</option>
              <option value="ENDTERM">End of Term</option>
            </select>
          </div>
        </div>
      </div>

      <div className="table-responsive card">
        <table className="table table-hover mb-0">
          <thead><tr><th>Position</th><th>Admission No</th><th>Student</th><th>Average %</th></tr></thead>
          <tbody>
            {rankings
              .slice()
              .sort((a, b) => (a.class_position ?? 999) - (b.class_position ?? 999))
              .map((r) => (
                <tr key={r.id}>
                  <td>#{r.class_position}</td>
                  <td>{r.admission_no}</td>
                  <td>{r.student_name}</td>
                  <td>{r.average_marks}%</td>
                </tr>
              ))}
            {rankings.length === 0 && (
              <tr><td colSpan={4} className="text-center text-muted py-3">Select a classroom and term to view rankings.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}