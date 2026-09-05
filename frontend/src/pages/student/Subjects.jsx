import { useEffect, useState } from "react";
import { studentsApi, academicsApi } from "../../services/api";

export default function StudentSubjects() {
  const [enrollment, setEnrollment] = useState(null);
  const [availableSubjects, setAvailableSubjects] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [rule, setRule] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await studentsApi.enrollments({ status: "ACTIVE" });
      const list = data.results ?? data;
      const current = list[0];
      setEnrollment(current);
      if (!current) return;

      const [gradeSubjectsRes, selectedRes, rulesRes] = await Promise.all([
        academicsApi.gradeSubjects({ grade_level: current.classroom }), // grade_level id derived server-side; classroom label used as fallback
        studentsApi.getSubjects(current.id),
        academicsApi.selectionRules(),
      ]);
      setAvailableSubjects(gradeSubjectsRes.data.results ?? gradeSubjectsRes.data);
      setSelectedIds((selectedRes.data || []).map((s) => s.subject));
      setRule((rulesRes.data.results ?? rulesRes.data)[0] || null);
    })();
  }, []);

  const toggleSubject = (subjectId) => {
    setSelectedIds((prev) =>
      prev.includes(subjectId) ? prev.filter((id) => id !== subjectId) : [...prev, subjectId]
    );
  };

  const save = async () => {
    setMessage("");
    try {
      await studentsApi.setSubjects(enrollment.id, selectedIds);
      setMessage("Subjects saved.");
    } catch (err) {
      setMessage(err.response?.data?.detail || "Could not save subject selection.");
    }
  };

  return (
    <div>
      <h2 className="page-title">My Subjects</h2>
      {rule && (
        <p className="text-muted">
          You must pick between {rule.min_optional_subjects} and {rule.max_optional_subjects} optional
          subject(s), for a total of {rule.min_total_subjects}–{rule.max_total_subjects} subjects overall.
        </p>
      )}
      {message && <div className="alert alert-info">{message}</div>}

      <div className="card p-3 mb-3">
        {availableSubjects.map((gs) => (
          <div className="form-check" key={gs.id}>
            <input
              type="checkbox"
              className="form-check-input"
              id={`subject-${gs.subject}`}
              checked={gs.is_compulsory || selectedIds.includes(gs.subject)}
              disabled={gs.is_compulsory}
              onChange={() => toggleSubject(gs.subject)}
            />
            <label className="form-check-label" htmlFor={`subject-${gs.subject}`}>
              {gs.subject_name} {gs.is_compulsory && <span className="badge text-bg-success ms-1">Compulsory</span>}
            </label>
          </div>
        ))}
        {availableSubjects.length === 0 && <p className="text-muted mb-0">No subjects configured for your grade yet.</p>}
      </div>

      <button className="btn btn-primary" onClick={save} disabled={!enrollment}>Save Subject Selection</button>
    </div>
  );
}
