import { useEffect, useState } from "react";
import api, { academicsApi } from "../../services/api";

export default function AdminSubjects() {
  const [subjects, setSubjects] = useState([]);
  const [gradeLevels, setGradeLevels] = useState([]);
  const [gradeSubjects, setGradeSubjects] = useState([]);
  const [message, setMessage] = useState("");

  const [subjectForm, setSubjectForm] = useState({ name: "", code: "", curriculum_type: "CBC", has_papers: false });
  const [linkForm, setLinkForm] = useState({ grade_level: "", subject: "", is_compulsory: true });
  const [ruleForm, setRuleForm] = useState({ grade_level: "", min_optional_subjects: 0, max_optional_subjects: 0, min_total_subjects: 7, max_total_subjects: 9 });

  const loadAll = async () => {
    const [s, g, gs] = await Promise.all([
      academicsApi.subjects(),
      academicsApi.gradeLevels(),
      academicsApi.gradeSubjects(),
    ]);
    setSubjects(s.data.results ?? s.data);
    setGradeLevels(g.data.results ?? g.data);
    setGradeSubjects(gs.data.results ?? gs.data);
  };

  useEffect(() => { loadAll(); }, []);

  const addSubject = async (e) => {
    e.preventDefault();
    setMessage("");
    try {
      await api.post("/subjects/", subjectForm);
      setSubjectForm({ name: "", code: "", curriculum_type: "CBC", has_papers: false });
      loadAll();
      setMessage("Subject created.");
    } catch (err) {
      setMessage(err.response?.data ? JSON.stringify(err.response.data) : "Could not create subject.");
    }
  };

  const linkSubjectToGrade = async (e) => {
    e.preventDefault();
    setMessage("");
    try {
      await api.post("/grade-subjects/", linkForm);
      loadAll();
      setMessage("Subject linked to grade.");
    } catch (err) {
      setMessage(err.response?.data ? JSON.stringify(err.response.data) : "Could not link subject.");
    }
  };

  const saveSelectionRule = async (e) => {
    e.preventDefault();
    setMessage("");
    try {
      await api.post("/selection-rules/", ruleForm);
      setMessage("Selection rule saved.");
    } catch (err) {
      setMessage(err.response?.data ? JSON.stringify(err.response.data) : "Could not save rule.");
    }
  };

  return (
    <div>
      <h2 className="page-title">Subjects</h2>
      {message && <div className="alert alert-info">{message}</div>}

      <div className="row g-3 mb-4">
        <div className="col-md-4">
          <form className="card p-3 h-100" onSubmit={addSubject}>
            <h6>Add Subject</h6>
            <input className="form-control mb-2" placeholder="Name e.g. Mathematics"
              value={subjectForm.name} onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })} required />
            <input className="form-control mb-2" placeholder="Code e.g. MATH"
              value={subjectForm.code} onChange={(e) => setSubjectForm({ ...subjectForm, code: e.target.value })} required />
            <select className="form-select mb-2" value={subjectForm.curriculum_type}
              onChange={(e) => setSubjectForm({ ...subjectForm, curriculum_type: e.target.value })}>
              <option value="CBC">CBC</option>
              <option value="8-4-4">8-4-4 (Legacy)</option>
            </select>
            <div className="form-check mb-2">
              <input type="checkbox" className="form-check-input" id="hasPapers"
                checked={subjectForm.has_papers}
                onChange={(e) => setSubjectForm({ ...subjectForm, has_papers: e.target.checked })} />
              <label className="form-check-label" htmlFor="hasPapers">Has papers (PP1/PP2)</label>
            </div>
            <button className="btn btn-primary btn-sm">Save Subject</button>
          </form>
        </div>

        <div className="col-md-4">
          <form className="card p-3 h-100" onSubmit={linkSubjectToGrade}>
            <h6>Offer Subject at a Grade</h6>
            <select className="form-select mb-2" required value={linkForm.grade_level}
              onChange={(e) => setLinkForm({ ...linkForm, grade_level: e.target.value })}>
              <option value="">Grade level...</option>
              {gradeLevels.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <select className="form-select mb-2" required value={linkForm.subject}
              onChange={(e) => setLinkForm({ ...linkForm, subject: e.target.value })}>
              <option value="">Subject...</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div className="form-check mb-2">
              <input type="checkbox" className="form-check-input" id="isCompulsory"
                checked={linkForm.is_compulsory}
                onChange={(e) => setLinkForm({ ...linkForm, is_compulsory: e.target.checked })} />
              <label className="form-check-label" htmlFor="isCompulsory">Compulsory</label>
            </div>
            <button className="btn btn-primary btn-sm">Save</button>
          </form>
        </div>

        <div className="col-md-4">
          <form className="card p-3 h-100" onSubmit={saveSelectionRule}>
            <h6>Selection Rule for a Grade</h6>
            <select className="form-select mb-2" required value={ruleForm.grade_level}
              onChange={(e) => setRuleForm({ ...ruleForm, grade_level: e.target.value })}>
              <option value="">Grade level...</option>
              {gradeLevels.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <div className="row g-2">
              <div className="col-6">
                <label className="form-label small">Min optional</label>
                <input type="number" className="form-control" value={ruleForm.min_optional_subjects}
                  onChange={(e) => setRuleForm({ ...ruleForm, min_optional_subjects: Number(e.target.value) })} />
              </div>
              <div className="col-6">
                <label className="form-label small">Max optional</label>
                <input type="number" className="form-control" value={ruleForm.max_optional_subjects}
                  onChange={(e) => setRuleForm({ ...ruleForm, max_optional_subjects: Number(e.target.value) })} />
              </div>
              <div className="col-6">
                <label className="form-label small">Min total</label>
                <input type="number" className="form-control" value={ruleForm.min_total_subjects}
                  onChange={(e) => setRuleForm({ ...ruleForm, min_total_subjects: Number(e.target.value) })} />
              </div>
              <div className="col-6">
                <label className="form-label small">Max total</label>
                <input type="number" className="form-control" value={ruleForm.max_total_subjects}
                  onChange={(e) => setRuleForm({ ...ruleForm, max_total_subjects: Number(e.target.value) })} />
              </div>
            </div>
            <button className="btn btn-primary btn-sm mt-2">Save Rule</button>
          </form>
        </div>
      </div>

      <div className="table-responsive card mb-4">
        <table className="table table-hover mb-0">
          <thead><tr><th>Code</th><th>Name</th><th>Curriculum</th><th>Papers</th></tr></thead>
          <tbody>
            {subjects.map((s) => (
              <tr key={s.id}>
                <td>{s.code}</td>
                <td>{s.name}</td>
                <td>{s.curriculum_type}</td>
                <td>{s.has_papers ? (s.papers || []).map((p) => p.name).join(", ") || "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="table-responsive card">
        <table className="table table-hover mb-0">
          <thead><tr><th>Grade</th><th>Subject</th><th>Type</th></tr></thead>
          <tbody>
            {gradeSubjects.map((gs) => (
              <tr key={gs.id}>
                <td>{gs.grade_level}</td>
                <td>{gs.subject_name}</td>
                <td>{gs.is_compulsory ? <span className="badge text-bg-success">Compulsory</span> : <span className="badge text-bg-secondary">Optional</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}