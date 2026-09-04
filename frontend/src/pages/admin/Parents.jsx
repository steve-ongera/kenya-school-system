import { useEffect, useState } from "react";
import { guardiansApi, studentsApi } from "../../services/api";

export default function AdminParents() {
  const [guardians, setGuardians] = useState([]);
  const [students, setStudents] = useState([]);
  const [linkForm, setLinkForm] = useState({ parent: "", student: "", relationship: "GUARDIAN" });
  const [error, setError] = useState(null);

  const load = async () => {
    const [g, s] = await Promise.all([guardiansApi.list(), studentsApi.list({ page_size: 200 })]);
    setGuardians(g.data.results ?? g.data ?? []);
    setStudents(s.data.results ?? s.data ?? []);
  };

  useEffect(() => { load(); }, []);

  const submitLink = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await guardiansApi.linkStudent(linkForm);
      setLinkForm({ parent: "", student: "", relationship: "GUARDIAN" });
      load();
    } catch (err) {
      setError(err.response?.data ? JSON.stringify(err.response.data) : "Failed to link.");
    }
  };

  return (
    <div>
      <h2 className="page-title">Parents &amp; Guardians</h2>
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card p-3 mb-3">
        <h6 className="mb-3">Link a Guardian to a Student</h6>
        <form className="row g-2" onSubmit={submitLink}>
          <div className="col-md-4">
            <select className="form-select" value={linkForm.parent}
              onChange={(e) => setLinkForm({ ...linkForm, parent: e.target.value })} required>
              <option value="">Select Guardian</option>
              {guardians.map((g) => <option key={g.id} value={g.id}>{g.full_name}</option>)}
            </select>
          </div>
          <div className="col-md-4">
            <select className="form-select" value={linkForm.student}
              onChange={(e) => setLinkForm({ ...linkForm, student: e.target.value })} required>
              <option value="">Select Student</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.admission_no} - {s.full_name}</option>)}
            </select>
          </div>
          <div className="col-md-3">
            <select className="form-select" value={linkForm.relationship}
              onChange={(e) => setLinkForm({ ...linkForm, relationship: e.target.value })}>
              <option value="MOTHER">Mother</option>
              <option value="FATHER">Father</option>
              <option value="GUARDIAN">Guardian</option>
            </select>
          </div>
          <div className="col-md-1">
            <button className="btn btn-primary w-100" type="submit">Link</button>
          </div>
        </form>
      </div>

      <div className="card p-3">
        <h6 className="mb-3">All Guardians</h6>
        <div className="table-responsive">
          <table className="table table-sm table-hover">
            <thead><tr><th>Name</th><th>Username</th><th>Phone</th><th>Linked Students</th></tr></thead>
            <tbody>
              {guardians.map((g) => (
                <tr key={g.id}>
                  <td>{g.full_name}</td>
                  <td>{g.user}</td>
                  <td>{g.phone_number || "-"}</td>
                  <td>{(g.students ?? []).length}</td>
                </tr>
              ))}
              {guardians.length === 0 && (
                <tr><td colSpan={4} className="text-center text-muted">No guardians yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}