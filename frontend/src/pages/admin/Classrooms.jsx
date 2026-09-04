import { useEffect, useState } from "react";
import api, { academicsApi, calendarApi } from "../../services/api";

export default function AdminClassrooms() {
  const [classrooms, setClassrooms] = useState([]);
  const [gradeLevels, setGradeLevels] = useState([]);
  const [streams, setStreams] = useState([]);
  const [years, setYears] = useState([]);
  const [message, setMessage] = useState("");

  const [gradeForm, setGradeForm] = useState({ name: "", curriculum_type: "CBC", education_level: "JSS", level_order: "" });
  const [streamForm, setStreamForm] = useState({ name: "" });
  const [classForm, setClassForm] = useState({ grade_level: "", stream: "", academic_year: "" });

  const loadAll = async () => {
    const [c, g, s, y] = await Promise.all([
      academicsApi.classrooms(),
      academicsApi.gradeLevels(),
      academicsApi.streams(),
      calendarApi.academicYears(),
    ]);
    setClassrooms(c.data.results ?? c.data);
    setGradeLevels(g.data.results ?? g.data);
    setStreams(s.data.results ?? s.data);
    setYears(y.data.results ?? y.data);
  };

  useEffect(() => { loadAll(); }, []);

  const addGradeLevel = async (e) => {
    e.preventDefault();
    setMessage("");
    try {
      await api.post("/grade-levels/", { ...gradeForm, level_order: Number(gradeForm.level_order) });
      setGradeForm({ name: "", curriculum_type: "CBC", education_level: "JSS", level_order: "" });
      loadAll();
      setMessage("Grade level created.");
    } catch (err) {
      setMessage(err.response?.data ? JSON.stringify(err.response.data) : "Could not create grade level.");
    }
  };

  const addStream = async (e) => {
    e.preventDefault();
    setMessage("");
    try {
      await api.post("/streams/", streamForm);
      setStreamForm({ name: "" });
      loadAll();
      setMessage("Stream created.");
    } catch {
      setMessage("Could not create stream.");
    }
  };

  const addClassroom = async (e) => {
    e.preventDefault();
    setMessage("");
    try {
      await api.post("/classrooms/", classForm);
      setClassForm({ grade_level: "", stream: "", academic_year: "" });
      loadAll();
      setMessage("Classroom created.");
    } catch (err) {
      setMessage(err.response?.data ? JSON.stringify(err.response.data) : "Could not create classroom.");
    }
  };

  return (
    <div>
      <h2 className="page-title">Classes & Streams</h2>
      {message && <div className="alert alert-info">{message}</div>}

      <div className="row g-3 mb-4">
        <div className="col-md-4">
          <form className="card p-3 h-100" onSubmit={addGradeLevel}>
            <h6>Add Grade Level</h6>
            <input className="form-control mb-2" placeholder="Name e.g. Grade 9"
              value={gradeForm.name} onChange={(e) => setGradeForm({ ...gradeForm, name: e.target.value })} required />
            <select className="form-select mb-2" value={gradeForm.curriculum_type}
              onChange={(e) => setGradeForm({ ...gradeForm, curriculum_type: e.target.value })}>
              <option value="CBC">CBC</option>
              <option value="8-4-4">8-4-4 (Legacy)</option>
            </select>
            <select className="form-select mb-2" value={gradeForm.education_level}
              onChange={(e) => setGradeForm({ ...gradeForm, education_level: e.target.value })}>
              <option value="JSS">Junior Secondary</option>
              <option value="SSS">Senior Secondary</option>
              <option value="LEGACY">Secondary (8-4-4)</option>
            </select>
            <input type="number" className="form-control mb-2" placeholder="Level order e.g. 9"
              value={gradeForm.level_order} onChange={(e) => setGradeForm({ ...gradeForm, level_order: e.target.value })} required />
            <button className="btn btn-primary btn-sm">Save Grade Level</button>
          </form>
        </div>

        <div className="col-md-4">
          <form className="card p-3 h-100" onSubmit={addStream}>
            <h6>Add Stream</h6>
            <input className="form-control mb-2" placeholder="e.g. Red"
              value={streamForm.name} onChange={(e) => setStreamForm({ name: e.target.value })} required />
            <button className="btn btn-primary btn-sm">Save Stream</button>
          </form>
        </div>

        <div className="col-md-4">
          <form className="card p-3 h-100" onSubmit={addClassroom}>
            <h6>Create Classroom</h6>
            <select className="form-select mb-2" required value={classForm.grade_level}
              onChange={(e) => setClassForm({ ...classForm, grade_level: e.target.value })}>
              <option value="">Grade level...</option>
              {gradeLevels.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.curriculum_type})</option>)}
            </select>
            <select className="form-select mb-2" required value={classForm.stream}
              onChange={(e) => setClassForm({ ...classForm, stream: e.target.value })}>
              <option value="">Stream...</option>
              {streams.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className="form-select mb-2" required value={classForm.academic_year}
              onChange={(e) => setClassForm({ ...classForm, academic_year: e.target.value })}>
              <option value="">Academic year...</option>
              {years.map((y) => <option key={y.id} value={y.id}>{y.year}</option>)}
            </select>
            <button className="btn btn-primary btn-sm">Save Classroom</button>
          </form>
        </div>
      </div>

      <div className="table-responsive card">
        <table className="table table-hover mb-0">
          <thead><tr><th>Grade</th><th>Stream</th><th>Year</th><th>Students</th><th>Class Teacher</th></tr></thead>
          <tbody>
            {classrooms.map((c) => (
              <tr key={c.id}>
                <td>{c.grade_level_name}</td>
                <td>{c.stream_name}</td>
                <td>{c.academic_year}</td>
                <td>{c.student_count}</td>
                <td>{c.class_teacher_name || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}