import { useEffect, useState } from "react";
import api, { academicsApi, calendarApi } from "../../services/api";

export default function AdminTeacherAllocation() {
  const [allocations, setAllocations] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [years, setYears] = useState([]);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ teacher: "", subject: "", classroom: "", academic_year: "" });

  const loadAll = async () => {
    const [a, u, s, c, y] = await Promise.all([
      api.get("/teacher-allocations/"),
      api.get("/users/", { params: { role: "TEACHER" } }),
      academicsApi.subjects(),
      academicsApi.classrooms(),
      calendarApi.academicYears(),
    ]);
    setAllocations(a.data.results ?? a.data);
    setTeachers(u.data.results ?? u.data);
    setSubjects(s.data.results ?? s.data);
    setClassrooms(c.data.results ?? c.data);
    setYears(y.data.results ?? y.data);
  };

  useEffect(() => { loadAll(); }, []);

  const addAllocation = async (e) => {
    e.preventDefault();
    setMessage("");
    try {
      await api.post("/teacher-allocations/", form);
      setForm({ teacher: "", subject: "", classroom: "", academic_year: "" });
      loadAll();
      setMessage("Allocation saved. This teacher can now enter marks for this subject/classroom.");
    } catch (err) {
      setMessage(err.response?.data ? JSON.stringify(err.response.data) : "Could not save allocation.");
    }
  };

  return (
    <div>
      <h2 className="page-title">Teacher Allocation</h2>
      <p className="text-muted">
        A teacher can be allocated the same subject in multiple classrooms — e.g. Grade 9 Red
        English and Grade 9 Green English are two separate allocations below.
      </p>
      {message && <div className="alert alert-info">{message}</div>}

      <form className="card p-3 mb-4" onSubmit={addAllocation}>
        <div className="row g-3">
          <div className="col-md-3">
            <label className="form-label">Teacher</label>
            <select className="form-select" required value={form.teacher}
              onChange={(e) => setForm({ ...form, teacher: e.target.value })}>
              <option value="">Select...</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">Subject</label>
            <select className="form-select" required value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}>
              <option value="">Select...</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">Classroom</label>
            <select className="form-select" required value={form.classroom}
              onChange={(e) => setForm({ ...form, classroom: e.target.value })}>
              <option value="">Select...</option>
              {classrooms.map((c) => <option key={c.id} value={c.id}>{c.grade_level_name} {c.stream_name} ({c.academic_year})</option>)}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">Academic Year</label>
            <select className="form-select" required value={form.academic_year}
              onChange={(e) => setForm({ ...form, academic_year: e.target.value })}>
              <option value="">Select...</option>
              {years.map((y) => <option key={y.id} value={y.id}>{y.year}</option>)}
            </select>
          </div>
        </div>
        <button className="btn btn-primary mt-3" style={{ width: "fit-content" }}>Save Allocation</button>
      </form>

      <div className="table-responsive card">
        <table className="table table-hover mb-0">
          <thead><tr><th>Teacher</th><th>Subject</th><th>Classroom</th></tr></thead>
          <tbody>
            {allocations.map((a) => (
              <tr key={a.id}>
                <td>{a.teacher_name}</td>
                <td>{a.subject_name}</td>
                <td>{a.classroom_label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}