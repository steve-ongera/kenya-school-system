import { useEffect, useState } from "react";
import { studentsApi, academicsApi } from "../../services/api";

export default function AdminPromotions() {
  const [classrooms, setClassrooms] = useState([]);
  const [sourceClassroom, setSourceClassroom] = useState("");
  const [targetClassroom, setTargetClassroom] = useState("");
  const [force, setForce] = useState(false);
  const [enrollments, setEnrollments] = useState([]);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    academicsApi.classrooms().then(({ data }) => setClassrooms(data.results ?? data));
  }, []);

  useEffect(() => {
    if (!sourceClassroom) { setEnrollments([]); return; }
    studentsApi.enrollments({ classroom: sourceClassroom, status: "ACTIVE" })
      .then(({ data }) => setEnrollments(data.results ?? data));
  }, [sourceClassroom]);

  const promoteOne = async (enrollmentId) => {
    setMessage("");
    try {
      await studentsApi.promote(enrollmentId, { target_classroom_id: Number(targetClassroom), force });
      setMessage("Student promoted.");
      const { data } = await studentsApi.enrollments({ classroom: sourceClassroom, status: "ACTIVE" });
      setEnrollments(data.results ?? data);
    } catch (err) {
      setMessage(err.response?.data?.detail || "Could not promote student.");
    }
  };

  const bulkPromote = async (e) => {
    e.preventDefault();
    setMessage("");
    setResult(null);
    try {
      const { data } = await studentsApi.bulkPromote({
        source_classroom_id: Number(sourceClassroom),
        target_classroom_id: Number(targetClassroom),
        force,
      });
      setResult(data);
      const { data: refreshed } = await studentsApi.enrollments({ classroom: sourceClassroom, status: "ACTIVE" });
      setEnrollments(refreshed.results ?? refreshed);
    } catch (err) {
      setMessage(err.response?.data?.detail || "Could not bulk promote.");
    }
  };

  return (
    <div>
      <h2 className="page-title">Promotions</h2>
      <p className="text-muted">
        Promoting a student creates a brand-new enrollment in the target classroom for the new
        academic year. Nothing in the old classroom — marks, fees, rankings — is touched.
      </p>
      {message && <div className="alert alert-info">{message}</div>}

      <form className="card p-3 mb-4" onSubmit={bulkPromote}>
        <div className="row g-3 align-items-end">
          <div className="col-md-4">
            <label className="form-label">From classroom</label>
            <select className="form-select" required value={sourceClassroom}
              onChange={(e) => setSourceClassroom(e.target.value)}>
              <option value="">Select...</option>
              {classrooms.map((c) => <option key={c.id} value={c.id}>{c.grade_level_name} {c.stream_name} ({c.academic_year})</option>)}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">To classroom</label>
            <select className="form-select" required value={targetClassroom}
              onChange={(e) => setTargetClassroom(e.target.value)}>
              <option value="">Select...</option>
              {classrooms.map((c) => <option key={c.id} value={c.id}>{c.grade_level_name} {c.stream_name} ({c.academic_year})</option>)}
            </select>
          </div>
          <div className="col-md-2">
            <div className="form-check">
              <input type="checkbox" className="form-check-input" id="forcePromote"
                checked={force} onChange={(e) => setForce(e.target.checked)} />
              <label className="form-check-label" htmlFor="forcePromote">Override minimum marks</label>
            </div>
          </div>
          <div className="col-md-2">
            <button className="btn btn-primary w-100">Bulk Promote All</button>
          </div>
        </div>
      </form>

      {result && (
        <div className="card p-3 mb-4">
          <strong>Promoted: {result.promoted.length}</strong>
          {result.failed.length > 0 && (
            <>
              <div className="mt-2 mb-1 text-danger">Failed ({result.failed.length}):</div>
              <ul className="mb-0">
                {result.failed.map((f, i) => <li key={i}>{f.student}: {f.reason}</li>)}
              </ul>
            </>
          )}
        </div>
      )}

      <div className="table-responsive card">
        <table className="table table-hover mb-0">
          <thead><tr><th>Admission No</th><th>Student</th><th></th></tr></thead>
          <tbody>
            {enrollments.map((e) => (
              <tr key={e.id}>
                <td>{e.admission_no}</td>
                <td>{e.student_name}</td>
                <td>
                  <button className="btn btn-sm btn-outline-primary" disabled={!targetClassroom}
                    onClick={() => promoteOne(e.id)}>
                    Promote individually
                  </button>
                </td>
              </tr>
            ))}
            {sourceClassroom && enrollments.length === 0 && (
              <tr><td colSpan={3} className="text-center text-muted py-3">No active students in this classroom.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}