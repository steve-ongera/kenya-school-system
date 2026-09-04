import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { teacherApi } from "../../services/api";

export default function TeacherDashboard() {
  const [allocations, setAllocations] = useState([]);

  useEffect(() => {
    teacherApi.myAllocations().then(({ data }) => setAllocations(data.results ?? data));
  }, []);

  const classroomCount = new Set(allocations.map((a) => a.classroom_label)).size;
  const subjectCount = new Set(allocations.map((a) => a.subject_name)).size;

  return (
    <div>
      <h2 className="page-title">Teacher Dashboard</h2>
      <div className="row g-3 mb-4">
        <div className="col-6 col-md-3">
          <div className="stat-card">
            <i className="bi bi-door-open"></i>
            <div>
              <div className="stat-card__value">{classroomCount}</div>
              <div className="stat-card__label">Classes Taught</div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="stat-card">
            <i className="bi bi-journal-bookmark"></i>
            <div>
              <div className="stat-card__value">{subjectCount}</div>
              <div className="stat-card__label">Subjects Taught</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card p-3">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <h6 className="mb-0">This year's allocations</h6>
          <Link to="/teacher/marks" className="btn btn-sm btn-primary">
            <i className="bi bi-pencil-square me-1"></i>Enter Marks
          </Link>
        </div>
        <table className="table table-sm mb-0">
          <thead><tr><th>Subject</th><th>Classroom</th></tr></thead>
          <tbody>
            {allocations.map((a) => (
              <tr key={a.id}><td>{a.subject_name}</td><td>{a.classroom_label}</td></tr>
            ))}
            {allocations.length === 0 && (
              <tr><td colSpan={2} className="text-center text-muted py-3">No allocations yet — ask an admin to allocate you a subject/classroom.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
EOF

cat > teacher/Classes.jsx << 'EOF'
import { useEffect, useState } from "react";
import { teacherApi } from "../../services/api";

export default function TeacherClasses() {
  const [allocations, setAllocations] = useState([]);

  useEffect(() => {
    teacherApi.myAllocations().then(({ data }) => setAllocations(data.results ?? data));
  }, []);

  return (
    <div>
      <h2 className="page-title">My Classes</h2>
      <p className="text-muted">Every subject/classroom pair you're allocated to this academic year.</p>
      <div className="table-responsive card">
        <table className="table table-hover mb-0">
          <thead><tr><th>Subject</th><th>Classroom</th></tr></thead>
          <tbody>
            {allocations.map((a) => (
              <tr key={a.id}><td>{a.subject_name}</td><td>{a.classroom_label}</td></tr>
            ))}
            {allocations.length === 0 && (
              <tr><td colSpan={2} className="text-center text-muted py-3">No allocations yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}