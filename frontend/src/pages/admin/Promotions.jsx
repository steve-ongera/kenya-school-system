import { useEffect, useState } from "react";
import { academicsApi } from "../../services/api";

export default function AdminPromotions() {
  const [classrooms, setClassrooms] = useState([]);
  const [sourceClassroom, setSourceClassroom] = useState("");
  const [force, setForce] = useState(false);
  const [preview, setPreview] = useState(null);
  const [alreadyPromoted, setAlreadyPromoted] = useState(null); // holds the {detail, ...} payload on a 400 "already promoted" response
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    academicsApi.classrooms().then(({ data }) => setClassrooms(data.results ?? data));
  }, []);

  const resetOutputs = () => {
    setPreview(null);
    setAlreadyPromoted(null);
    setResult(null);
    setMessage("");
  };

  const loadPreview = async () => {
    if (!sourceClassroom) return;
    resetOutputs();
    setLoadingPreview(true);
    try {
      const { data } = await academicsApi.promotionPreview(sourceClassroom);
      setPreview(data);
    } catch (err) {
      const data = err.response?.data;
      if (data?.already_promoted) {
        setAlreadyPromoted(data);
      } else {
        setMessage(data?.detail || "Could not load promotion preview.");
      }
    } finally {
      setLoadingPreview(false);
    }
  };

  const confirmPromote = async () => {
    if (!preview) return;
    if (!window.confirm(`Promote all ${preview.student_count} student(s) now? This cannot be undone from here.`)) {
      return;
    }
    setPromoting(true);
    setMessage("");
    try {
      const { data } = await academicsApi.bulkPromoteClassroom(sourceClassroom, { force });
      setResult(data);
      setPreview(null);
      await loadPreview(); // will now come back already_promoted
    } catch (err) {
      setMessage(err.response?.data?.detail || "Could not promote this class.");
    } finally {
      setPromoting(false);
    }
  };

  return (
    <div>
      <h2 className="page-title">Promotions</h2>
      <p className="text-muted">
        Pick a class, preview where it promotes to and who's in it, then confirm. Each class can only
        be bulk-promoted once — the system remembers.
      </p>

      {message && <div className="alert alert-danger">{message}</div>}

      <div className="card p-3 mb-4">
        <div className="row g-3 align-items-end">
          <div className="col-md-6">
            <label className="form-label">Class to promote (grade + stream + year)</label>
            <select
              className="form-select"
              value={sourceClassroom}
              onChange={(e) => {
                setSourceClassroom(e.target.value);
                resetOutputs();
              }}
            >
              <option value="">Select...</option>
              {classrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.grade_level_name} {c.stream_name} ({c.academic_year_year}) — {c.student_count} active
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-2">
            <div className="form-check">
              <input
                type="checkbox"
                className="form-check-input"
                id="forcePromote"
                checked={force}
                onChange={(e) => setForce(e.target.checked)}
              />
              <label className="form-check-label" htmlFor="forcePromote">
                Override minimum marks
              </label>
            </div>
          </div>
          <div className="col-md-2">
            <button
              className="btn btn-outline-primary w-100"
              disabled={!sourceClassroom || loadingPreview}
              onClick={loadPreview}
            >
              {loadingPreview ? "Loading..." : "Preview"}
            </button>
          </div>
        </div>
      </div>

      {alreadyPromoted && (
        <div className="alert alert-warning">
          <strong>This class has already been promoted.</strong>
          <br />
          {alreadyPromoted.detail}
          {alreadyPromoted.target_classroom && (
            <div className="mt-1">
              Target: <strong>{alreadyPromoted.target_classroom}</strong>
              {alreadyPromoted.student_count != null && <> · {alreadyPromoted.student_count} student(s)</>}
            </div>
          )}
        </div>
      )}

      {preview && Array.isArray(preview.students) && (
        <div className="card p-3 mb-4">
          {preview.graduating ? (
            <div className="alert alert-info mb-3">{preview.detail}</div>
          ) : (
            <div className="mb-3">
              Promoting <strong>{preview.source_classroom}</strong> →{" "}
              <strong>
                {preview.target_grade} {preview.target_stream} ({preview.target_academic_year})
              </strong>{" "}
              {preview.target_classroom_exists ? "(existing class)" : "(will be created)"}
              <div className="text-muted">{preview.student_count} active student(s) will be affected.</div>
            </div>
          )}

          <div className="table-responsive" style={{ maxHeight: 480, overflowY: "auto" }}>
            <table className="table table-hover table-sm mb-0">
              <thead className="sticky-top bg-white">
                <tr>
                  <th>#</th>
                  <th>Admission No</th>
                  <th>Full Name</th>
                  <th>Gender</th>
                  <th>Curriculum</th>
                </tr>
              </thead>
              <tbody>
                {preview.students.map((s, i) => (
                  <tr key={s.enrollment_id}>
                    <td>{i + 1}</td>
                    <td>{s.admission_no}</td>
                    <td>{s.full_name}</td>
                    <td>{s.gender}</td>
                    <td>{s.curriculum_type}</td>
                  </tr>
                ))}
                {preview.students.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-muted py-3">
                      No active students in this class.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {preview.students.length > 0 && (
            <button className="btn btn-primary mt-3" disabled={promoting} onClick={confirmPromote}>
              {promoting ? "Promoting..." : `Confirm & Promote All (${preview.student_count})`}
            </button>
          )}
        </div>
      )}

      {result && (
        <div className="card p-3 mb-4">
          {result.graduated_count > 0 ? (
            <strong>Graduated: {result.graduated_count}</strong>
          ) : (
            <>
              <strong>Promoted: {result.promoted.length}</strong> to {result.target_classroom}
              {result.failed.length > 0 && (
                <>
                  <div className="mt-2 mb-1 text-danger">Failed ({result.failed.length}):</div>
                  <ul className="mb-0">
                    {result.failed.map((f, i) => (
                      <li key={i}>
                        {f.student}: {f.reason}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}