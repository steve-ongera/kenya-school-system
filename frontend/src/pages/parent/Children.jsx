import { useEffect, useState } from "react";
import { studentsApi } from "../../services/api";
import { Link } from "react-router-dom";
import Breadcrumb from "../../components/Breadcrumb";

export default function ParentChildren() {
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setLoading(true);
    studentsApi
      .list()
      .then(({ data }) => setChildren(data.results ?? data))
      .catch((error) => console.error("Failed to load children:", error))
      .finally(() => setLoading(false));
  }, []);

  // Get child initials
  const getChildInitials = (child) => {
    return `${child.first_name?.[0] || ''}${child.last_name?.[0] || ''}` || "S";
  };

  // Filter children by search
  const filteredChildren = children.filter((c) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase().trim();
    return (
      c.full_name?.toLowerCase().includes(query) ||
      c.admission_no?.toLowerCase().includes(query) ||
      c.current_classroom?.toLowerCase().includes(query)
    );
  });

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: "Dashboard", href: "/parent" },
        { label: "My Children", href: "/parent/children" },
        { label: "All Children", href: "#" },
      ]} />

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">My Children</h1>
          <p className="page-subtitle">
            View your children's enrollment details and academic information
          </p>
        </div>
        <span className="badge badge-neutral" style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem" }}>
          <i className="bi bi-people me-1"></i>
          {children.length} child{children.length !== 1 ? "ren" : ""}
        </span>
      </div>

      {/* Search */}
      {children.length > 0 && (
        <div className="card p-4 mb-4">
          <div style={{ position: "relative" }}>
            <i className="bi bi-search" style={{
              position: "absolute",
              left: "0.85rem",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--ink-400)",
            }}></i>
            <input
              type="text"
              className="form-control"
              placeholder="Search by name, admission no., or class..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: "2.4rem" }}
            />
            {searchQuery && (
              <button
                type="button"
                className="btn btn-sm btn-light"
                onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute",
                  right: "0.5rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                }}
              >
                <i className="bi bi-x-lg"></i>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="row g-4">
          {[1, 2, 3].map((i) => (
            <div className="col-12 col-md-6 col-lg-4" key={i}>
              <div className="card">
                <div className="card-body">
                  <div className="skeleton skeleton-avatar" style={{ width: "60px", height: "60px", marginBottom: "1rem" }}></div>
                  <div className="skeleton skeleton-text" style={{ width: "60%", height: "20px", marginBottom: "0.5rem" }}></div>
                  <div className="skeleton skeleton-text" style={{ width: "40%", height: "16px", marginBottom: "0.5rem" }}></div>
                  <div className="skeleton skeleton-text" style={{ width: "50%", height: "16px" }}></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredChildren.length === 0 ? (
        <div className="empty-state">
          <i className="bi bi-people"></i>
          <h6>
            {searchQuery ? "No children match your search" : "No children linked yet"}
          </h6>
          <p className="text-muted-soft">
            {searchQuery
              ? "Try adjusting your search criteria."
              : "Please contact the school administration to link your children to your account."}
          </p>
        </div>
      ) : (
        <>
          {/* Children Cards */}
          <div className="row g-4">
            {filteredChildren.map((c) => (
              <div className="col-12 col-md-6 col-lg-4" key={c.id}>
                <div className="card h-100">
                  {/* Child Header */}
                  <div style={{
                    padding: "1.5rem 1.25rem 1rem",
                    borderBottom: "1px solid var(--border-color)",
                    background: "linear-gradient(135deg, var(--blue-50) 0%, var(--blue-100) 100%)",
                    borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
                    textAlign: "center",
                  }}>
                    <div style={{
                      width: "72px",
                      height: "72px",
                      borderRadius: "50%",
                      background: "var(--blue-700)",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.5rem",
                      fontWeight: 700,
                      margin: "0 auto 0.75rem",
                      border: "4px solid #fff",
                      boxShadow: "var(--shadow-sm)",
                    }}>
                      {getChildInitials(c)}
                    </div>
                    <div style={{
                      fontWeight: 700,
                      fontSize: "1.05rem",
                      color: "var(--blue-900)",
                      fontFamily: "var(--font-display)",
                      marginBottom: "0.25rem",
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
                    <div className="profile-info-row">
                      <span>Curriculum</span>
                      <span>
                        <span className={`badge ${c.curriculum_type === "CBC" ? "badge-blue" : "badge-gold"}`}>
                          {c.curriculum_type || "N/A"}
                        </span>
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
                  Click on the buttons above each card to view their results or fee statements.
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}