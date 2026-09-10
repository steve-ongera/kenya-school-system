// src/pages/teacher/Dashboard.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { teacherApi } from "../../services/api";
import { useAuth } from "../../hooks/useAuth";
import Breadcrumb from "../../components/Breadcrumb";

export default function TeacherDashboard() {
  const { user } = useAuth();
  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    teacherApi
      .myAllocations()
      .then(({ data }) => setAllocations(data.results ?? data))
      .catch((error) => console.error("Failed to load allocations:", error))
      .finally(() => setLoading(false));
  }, []);

  const classroomCount = new Set(allocations.map((a) => a.classroom_label)).size;
  const subjectCount = new Set(allocations.map((a) => a.subject_name)).size;

  // Get user initials
  const getInitials = () => {
    if (!user) return "T";
    return `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}` || "T";
  };

  // Get greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  };

  // Group allocations by classroom
  const groupedByClassroom = allocations.reduce((acc, alloc) => {
    const key = alloc.classroom_label || "Unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(alloc);
    return acc;
  }, {});

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: "Dashboard", href: "/teacher" },
        { label: "Overview", href: "#" },
      ]} />

      {/* Page Header with Welcome */}
      <div className="page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              background: "var(--blue-100)",
              color: "var(--blue-700)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.2rem",
              fontWeight: 700,
              flexShrink: 0,
            }}>
              {getInitials()}
            </div>
            <div>
              <h1 className="page-title" style={{ marginBottom: "0.1rem" }}>
                {getGreeting()}, {user?.first_name || "Teacher"}! 👋
              </h1>
              <p className="page-subtitle" style={{ marginBottom: "0" }}>
                Welcome to your teaching dashboard
              </p>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Link to="/teacher/marks" className="btn btn-primary btn-sm">
            <i className="bi bi-pencil-square me-1"></i>
            Enter Marks
          </Link>
          <Link to="/teacher/classes" className="btn btn-outline-primary btn-sm">
            <i className="bi bi-door-open me-1"></i>
            My Classes
          </Link>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="row g-3 mb-4">
        <div className="col-6 col-md-3">
          <div className="stat-card">
            <i className="bi bi-door-open"></i>
            <div>
              <div className="stat-card__value">
                {loading ? (
                  <div className="skeleton skeleton-text" style={{ width: "40px", height: "24px" }}></div>
                ) : classroomCount}
              </div>
              <div className="stat-card__label">Classes Taught</div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="stat-card stat-card--gold">
            <i className="bi bi-journal-bookmark"></i>
            <div>
              <div className="stat-card__value">
                {loading ? (
                  <div className="skeleton skeleton-text" style={{ width: "40px", height: "24px" }}></div>
                ) : subjectCount}
              </div>
              <div className="stat-card__label">Subjects Taught</div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="stat-card stat-card--success">
            <i className="bi bi-people"></i>
            <div>
              <div className="stat-card__value">
                {loading ? (
                  <div className="skeleton skeleton-text" style={{ width: "40px", height: "24px" }}></div>
                ) : allocations.length}
              </div>
              <div className="stat-card__label">Total Allocations</div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="stat-card stat-card--blue">
            <i className="bi bi-calendar3"></i>
            <div>
              <div className="stat-card__value" style={{ fontSize: "1.1rem" }}>
                {new Date().getFullYear()}
              </div>
              <div className="stat-card__label">Academic Year</div>
            </div>
          </div>
        </div>
      </div>

      {/* Allocations Section */}
      <div className="table-wrap">
        <div className="table-wrap__header">
          <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
            <i className="bi bi-list-ul me-2" style={{ color: "var(--blue-700)" }}></i>
            This Year's Allocations
          </span>
          {!loading && allocations.length > 0 && (
            <span className="badge badge-neutral">
              {Object.keys(groupedByClassroom).length} classroom{Object.keys(groupedByClassroom).length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {loading ? (
          <div style={{ padding: "1.5rem" }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton skeleton-text" style={{ height: 18, marginBottom: 14 }} />
            ))}
          </div>
        ) : allocations.length === 0 ? (
          <div className="empty-state">
            <i className="bi bi-inbox"></i>
            <h6>No allocations yet</h6>
            <p className="text-muted-soft">
              Ask an admin to allocate you a subject and classroom.
            </p>
          </div>
        ) : (
          <>
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th style={{ width: "60px" }}>#</th>
                    <th>Subject</th>
                    <th>Classroom</th>
                    <th style={{ width: "100px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.map((a, idx) => (
                    <tr key={a.id}>
                      <td style={{ color: "var(--ink-400)", fontSize: "var(--fs-sm)" }}>
                        {idx + 1}
                      </td>
                      <td>
                        <div className="table-avatar-cell">
                          <div className="avatar-sm" style={{
                            background: "var(--blue-100)",
                            color: "var(--blue-700)",
                          }}>
                            <i className="bi bi-journal-bookmark" style={{ fontSize: "0.75rem" }}></i>
                          </div>
                          <span className="cell-name">{a.subject_name}</span>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-blue">
                          <i className="bi bi-door-open me-1"></i>
                          {a.classroom_label}
                        </span>
                      </td>
                      <td>
                        <Link 
                          to="/teacher/marks" 
                          className="btn btn-sm btn-outline-primary"
                          title="Enter marks for this class"
                        >
                          <i className="bi bi-pencil-square me-1"></i>
                          Marks
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Quick Actions Footer */}
            <div className="table-wrap__footer" style={{ justifyContent: "space-between" }}>
              <span className="table-wrap__footer-info">
                <i className="bi bi-info-circle me-1"></i>
                Showing <strong>{allocations.length}</strong> allocation{allocations.length !== 1 ? "s" : ""} across{" "}
                <strong>{Object.keys(groupedByClassroom).length}</strong> classroom{Object.keys(groupedByClassroom).length !== 1 ? "s" : ""}
              </span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <Link to="/teacher/classes" className="btn btn-sm btn-light">
                  <i className="bi bi-door-open me-1"></i>
                  View All Classes
                </Link>
                <Link to="/teacher/rankings" className="btn btn-sm btn-light">
                  <i className="bi bi-bar-chart-line me-1"></i>
                  Class Rankings
                </Link>
              </div>
            </div>
          </>
        )}
      </div>


    </div>
  );
}