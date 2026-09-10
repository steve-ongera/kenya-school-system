import { useEffect, useState } from "react";
import { studentsApi } from "../../services/api";
import { useAuth } from "../../hooks/useAuth";
import { Link } from "react-router-dom";
import Breadcrumb from "../../components/Breadcrumb";

export default function ParentDashboard() {
  const { user } = useAuth();
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    studentsApi
      .list()
      .then(({ data }) => setChildren(data.results ?? data))
      .catch((error) => console.error("Failed to load children:", error))
      .finally(() => setLoading(false));
  }, []);

  // Get user initials
  const getInitials = () => {
    if (!user) return "P";
    return `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}` || "P";
  };

  // Get child initials
  const getChildInitials = (child) => {
    return `${child.first_name?.[0] || ''}${child.last_name?.[0] || ''}` || "S";
  };

  // Get greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  };

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: "Dashboard", href: "/parent" },
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
                {getGreeting()}, {user?.first_name || "Parent"}! 👋
              </h1>
              <p className="page-subtitle" style={{ marginBottom: "0" }}>
                Welcome to your parent portal
              </p>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Link to="/parent/results" className="btn btn-primary btn-sm">
            <i className="bi bi-journal-text me-1"></i>
            View Results
          </Link>
          <Link to="/parent/fees" className="btn btn-outline-primary btn-sm">
            <i className="bi bi-cash-coin me-1"></i>
            Fee Statements
          </Link>
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="row g-4">
          {[1, 2].map((i) => (
            <div className="col-12 col-md-6 col-lg-4" key={i}>
              <div className="card">
                <div className="card-body">
                  <div className="skeleton skeleton-text" style={{ width: "60%", height: "24px", marginBottom: "0.5rem" }}></div>
                  <div className="skeleton skeleton-text" style={{ width: "40%", height: "16px", marginBottom: "0.5rem" }}></div>
                  <div className="skeleton skeleton-text" style={{ width: "50%", height: "16px" }}></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : children.length === 0 ? (
        <div className="empty-state">
          <i className="bi bi-people"></i>
          <h6>No children linked to your account yet</h6>
          <p className="text-muted-soft">
            Please contact the school administration to link your children to your account.
          </p>
        </div>
      ) : (
        <>
          {/* Children Cards */}
          <div className="row g-4">
            {children.map((c) => (
              <div className="col-12 col-md-6 col-lg-4" key={c.id}>
                <div className="card h-100">
                  {/* Child Header */}
                  <div style={{
                    padding: "1.25rem",
                    borderBottom: "1px solid var(--border-color)",
                    background: "var(--blue-50)",
                    borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                  }}>
                    <div style={{
                      width: "52px",
                      height: "52px",
                      borderRadius: "50%",
                      background: "var(--blue-700)",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.2rem",
                      fontWeight: 700,
                      flexShrink: 0,
                      border: "3px solid var(--blue-100)",
                    }}>
                      {getChildInitials(c)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontWeight: 700,
                        fontSize: "var(--fs-md)",
                        color: "var(--blue-900)",
                        fontFamily: "var(--font-display)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>
                        {c.full_name}
                      </div>
                      <div style={{
                        fontSize: "var(--fs-xs)",
                        color: "var(--blue-700)",
                        fontWeight: 600,
                      }}>
                        <i className="bi bi-hash me-1"></i>
                        {c.admission_no}
                      </div>
                    </div>
                  </div>

                  {/* Child Details */}
                  <div className="card-body" style={{ padding: "1rem 1.25rem" }}>
                    <div className="profile-info-row">
                      <span>Current Class</span>
                      <span>
                        {c.current_classroom ? (
                          <span className="badge badge-blue">
                            <i className="bi bi-door-open me-1"></i>
                            {c.current_classroom}
                          </span>
                        ) : (
                          <span className="text-muted-soft">Not assigned</span>
                        )}
                      </span>
                    </div>
                    {c.gender && (
                      <div className="profile-info-row">
                        <span>Gender</span>
                        <span>
                          <span className={`badge ${c.gender === "M" ? "badge-blue" : "badge-gold"}`}>
                            <i className={`bi ${c.gender === "M" ? "bi-gender-male" : "bi-gender-female"} me-1`}></i>
                            {c.gender === "M" ? "Male" : "Female"}
                          </span>
                        </span>
                      </div>
                    )}
                    {c.curriculum_type && (
                      <div className="profile-info-row">
                        <span>Curriculum</span>
                        <span>
                          <span className="badge badge-neutral">{c.curriculum_type}</span>
                        </span>
                      </div>
                    )}
                    <div className="profile-info-row" style={{ borderBottom: "none" }}>
                      <span>Status</span>
                      <span>
                        <span className={`badge ${c.is_active ? "badge-success" : "badge-danger"}`}>
                          <span className={`status-dot ${c.is_active ? "status-dot--online" : "status-dot--offline"}`}></span>
                          {c.is_active ? "Active" : "Inactive"}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Child Actions */}
                  <div className="card-footer" style={{
                    background: "transparent",
                    borderTop: "1px solid var(--border-color)",
                    padding: "0.75rem 1rem",
                    display: "flex",
                    gap: "0.5rem",
                  }}>
                    <Link 
                      to="/parent/results" 
                      className="btn btn-sm btn-outline-primary flex-fill"
                    >
                      <i className="bi bi-journal-text me-1"></i>
                      Results
                    </Link>
                    <Link 
                      to="/parent/fees" 
                      className="btn btn-sm btn-outline-primary flex-fill"
                    >
                      <i className="bi bi-cash-coin me-1"></i>
                      Fees
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Summary Card */}
          <div className="card mt-4" style={{ background: "var(--bg-app)" }}>
            <div className="card-body" style={{ padding: "0.75rem 1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "var(--fs-sm)", flexWrap: "wrap" }}>
                <i className="bi bi-info-circle" style={{ color: "var(--blue-700)", fontSize: "1.1rem" }}></i>
                <span style={{ color: "var(--ink-600)" }}>
                  You have <strong>{children.length}</strong> child{children.length !== 1 ? "ren" : ""} enrolled. 
                  Click on any card to view their results and fee statements.
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}