import { useEffect, useState } from "react";
import { teacherApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";

export default function TeacherClasses() {
  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setLoading(true);
    teacherApi
      .myAllocations()
      .then(({ data }) => setAllocations(data.results ?? data))
      .catch((error) => console.error("Failed to load allocations:", error))
      .finally(() => setLoading(false));
  }, []);

  // Filter allocations by search
  const filteredAllocations = allocations.filter((a) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase().trim();
    return (
      a.subject_name?.toLowerCase().includes(query) ||
      a.classroom_label?.toLowerCase().includes(query)
    );
  });

  // Group allocations by classroom for better organization
  const groupedByClassroom = filteredAllocations.reduce((acc, alloc) => {
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
        { label: "My Classes", href: "/teacher/classes" },
        { label: "All Allocations", href: "#" },
      ]} />

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">My Classes</h1>
          <p className="page-subtitle">
            Every subject/classroom pair you're allocated to this academic year.
          </p>
        </div>
        <span className="badge badge-neutral" style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem" }}>
          <i className="bi bi-door-open me-1"></i>
          {allocations.length} allocation{allocations.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Search */}
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
            placeholder="Search by subject or classroom..."
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

      {/* Loading State */}
      {loading ? (
        <div className="row g-4">
          {[1, 2, 3].map((i) => (
            <div className="col-12 col-md-6 col-lg-4" key={i}>
              <div className="card">
                <div className="card-body">
                  <div className="skeleton skeleton-text" style={{ width: "60%", height: "24px", marginBottom: "0.5rem" }}></div>
                  <div className="skeleton skeleton-text" style={{ width: "40%", height: "16px" }}></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredAllocations.length === 0 ? (
        <div className="empty-state">
          <i className="bi bi-door-open"></i>
          <h6>
            {searchQuery ? "No classes match your search" : "No classes allocated yet"}
          </h6>
          <p className="text-muted-soft">
            {searchQuery
              ? "Try adjusting your search criteria."
              : "Your subject/classroom allocations will appear here once assigned by the administrator."}
          </p>
        </div>
      ) : (
        <>
          {/* Grouped by Classroom Cards */}
          <div className="row g-4">
            {Object.entries(groupedByClassroom).map(([classroom, allocs]) => (
              <div className="col-12 col-md-6 col-lg-4" key={classroom}>
                <div className="card h-100">
                  {/* Classroom Header */}
                  <div style={{
                    padding: "1rem 1.25rem",
                    borderBottom: "1px solid var(--border-color)",
                    background: "var(--blue-50)",
                    borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <div style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "var(--radius-md)",
                        background: "var(--blue-700)",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "1.1rem",
                        flexShrink: 0,
                      }}>
                        <i className="bi bi-door-open"></i>
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
                          {classroom}
                        </div>
                        <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-500)" }}>
                          <i className="bi bi-book me-1"></i>
                          {allocs.length} subject{allocs.length !== 1 ? "s" : ""}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Subjects List */}
                  <div className="card-body" style={{ padding: "1rem 1.25rem" }}>
                    <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)", marginBottom: "0.5rem" }}>
                      <i className="bi bi-list-ul me-1"></i> Subjects taught:
                    </div>
                    <div className="d-flex flex-column gap-2">
                      {allocs.map((a) => (
                        <div
                          key={a.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            padding: "0.5rem 0.75rem",
                            background: "var(--bg-app)",
                            borderRadius: "var(--radius-sm)",
                            borderLeft: "3px solid var(--blue-600)",
                          }}
                        >
                          <i className="bi bi-journal-bookmark" style={{ color: "var(--blue-700)", fontSize: "0.9rem" }}></i>
                          <span style={{ fontWeight: 500, fontSize: "var(--fs-sm)", color: "var(--ink-900)" }}>
                            {a.subject_name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Summary Footer */}
          <div className="card mt-4" style={{ background: "var(--bg-app)" }}>
            <div className="card-body" style={{ padding: "0.75rem 1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "var(--fs-sm)", flexWrap: "wrap" }}>
                <i className="bi bi-info-circle" style={{ color: "var(--blue-700)", fontSize: "1.1rem" }}></i>
                <span style={{ color: "var(--ink-600)" }}>
                  You teach <strong>{allocations.length}</strong> subject{allocations.length !== 1 ? "s" : ""} across{" "}
                  <strong>{Object.keys(groupedByClassroom).length}</strong> classroom{Object.keys(groupedByClassroom).length !== 1 ? "s" : ""}.
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}