import { useEffect, useState } from "react";
import { studentsApi, academicsApi } from "../../services/api";

export default function AdminStudents() {
  const [students, setStudents] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    first_name: "", last_name: "", gender: "M", curriculum_type: "CBC", classroom_id: "",
  });
  const [message, setMessage] = useState("");

  const loadStudents = async () => {
    const { data } = await studentsApi.list();
    setStudents(data.results ?? data);
  };

  useEffect(() => {
    loadStudents();
    academicsApi.classrooms().then(({ data }) => setClassrooms(data.results ?? data));
  }, []);

  const handleAdmit = async (e) => {
    e.preventDefault();
    setMessage("");
    try {
      const { data } = await studentsApi.admit(form);
      setMessage(`Admitted successfully. Admission No: ${data.admission_no}`);
      setShowForm(false);
      loadStudents();
    } catch (err) {
      setMessage(err.response?.data?.detail || "Could not admit student.");
    }
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="page-title mb-0">Students</h2>
        <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
          <i className="bi bi-plus-lg me-1"></i>Admit Student
        </button>
      </div>

      {message && <div className="alert alert-info">{message}</div>}

      {showForm && (
        <form className="card p-3 mb-4" onSubmit={handleAdmit}>
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">First Name</label>
              <input className="form-control" required
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Last Name</label>
              <input className="form-control" required
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Gender</label>
              <select className="form-select" value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label">Curriculum</label>
              <select className="form-select" value={form.curriculum_type}
                onChange={(e) => setForm({ ...form, curriculum_type: e.target.value })}>
                <option value="CBC">CBC</option>
                <option value="8-4-4">8-4-4 (Legacy)</option>
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label">Classroom</label>
              <select className="form-select" required value={form.classroom_id}
                onChange={(e) => setForm({ ...form, classroom_id: e.target.value })}>
                <option value="">Select...</option>
                {classrooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.grade_level_name} {c.stream_name} - {c.academic_year}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button className="btn btn-success mt-3" type="submit">Save Student</button>
        </form>
      )}

      <div className="table-responsive card">
        <table className="table table-hover mb-0">
          <thead>
            <tr>
              <th>Admission No</th>
              <th>Name</th>
              <th>Gender</th>
              <th>Curriculum</th>
              <th>Current Class</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id}>
                <td>{s.admission_no}</td>
                <td>{s.full_name}</td>
                <td>{s.gender}</td>
                <td>{s.curriculum_type}</td>
                <td>{s.current_classroom || "-"}</td>
                <td>
                  <span className={`badge ${s.is_active ? "text-bg-success" : "text-bg-secondary"}`}>
                    {s.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
