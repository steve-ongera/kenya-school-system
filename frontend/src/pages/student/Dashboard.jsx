import { useEffect, useState } from "react";
import { studentsApi, examsApi } from "../../services/api";
import { useAuth } from "../../hooks/useAuth";
import Breadcrumb from "../../components/Breadcrumb";

export default function StudentDashboard() {
  const { user } = useAuth();
  const [enrollment, setEnrollment] = useState(null);
  const [ranking, setRanking] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await studentsApi.enrollments({ status: "ACTIVE" });
        const list = data.results ?? data;
        const current = list[0];
        setEnrollment(current);
        if (current) {
          const { data: rankData } = await examsApi.rankings({ 
            enrollment: current.id, 
            checkpoint: "ENDTERM" 
          });
          const rankList = rankData.results ?? rankData;
          setRanking(rankList[rankList.length - 1] || null);
        }
      } catch (error) {
        console.error("Failed to load dashboard:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Get student initials
  const getInitials = () => {
    if (!user) return "S";
    return `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}` || "S";
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
        { label: "Dashboard", href: "/student" },
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
                {getGreeting()}, {user?.first_name || "Student"}! 👋
              </h1>
              <p className="page-subtitle" style={{ marginBottom: "0" }}>
                Welcome to your student dashboard
              </p>
            </div>
          </div>
        </div>
        <div style={{ fontSize: "var(--fs-sm)", color: "var(--ink-400)" }}>
          <i className="bi bi-calendar3 me-1"></i>
          {new Date().toLocaleDateString('en-KE', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="row g-3">
        <div className="col-md-4">
          <div className="stat-card">
            <i className="bi bi-door-open"></i>
            <div>
              <div className="stat-card__value">
                {loading ? (
                  <div className="skeleton skeleton-text" style={{ width: "80px", height: "24px" }}></div>
                ) : (
                  enrollment?.classroom_label || "-"
                )}
              </div>
              <div className="stat-card__label">Current Class</div>
            </div>
          </div>
        </div>

        <div className="col-md-4">
          <div className="stat-card stat-card--gold">
            <i className="bi bi-trophy"></i>
            <div>
              <div className="stat-card__value">
                {loading ? (
                  <div className="skeleton skeleton-text" style={{ width: "60px", height: "24px" }}></div>
                ) : (
                  ranking ? `#${ranking.class_position}` : "-"
                )}
              </div>
              <div className="stat-card__label">Latest Class Position</div>
            </div>
          </div>
        </div>

        <div className="col-md-4">
          <div className="stat-card stat-card--success">
            <i className="bi bi-graph-up-arrow"></i>
            <div>
              <div className="stat-card__value">
                {loading ? (
                  <div className="skeleton skeleton-text" style={{ width: "70px", height: "24px" }}></div>
                ) : (
                  ranking ? `${ranking.average_marks}%` : "-"
                )}
              </div>
              <div className="stat-card__label">Latest Average</div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Links / Actions */}
      <div className="row g-3 mt-2">
        <div className="col-12">
          <h6 className="mb-3" style={{ fontWeight: 600, color: "var(--ink-600)" }}>
            <i className="bi bi-grid-3x3-gap me-2"></i>
            Quick Actions
          </h6>
          <div className="row g-3">
            <div className="col-6 col-md-3">
              <div className="card card--interactive p-3 text-center" 
                   style={{ cursor: "pointer" }}
                   onClick={() => window.location.href = "/student/results"}>
                <i className="bi bi-journal-text" style={{ fontSize: "1.8rem", color: "var(--blue-700)" }}></i>
                <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, marginTop: "0.5rem", color: "var(--ink-700)" }}>
                  My Results
                </div>
              </div>
            </div>
            <div className="col-6 col-md-3">
              <div className="card card--interactive p-3 text-center"
                   style={{ cursor: "pointer" }}
                   onClick={() => window.location.href = "/student/subjects"}>
                <i className="bi bi-journal-bookmark" style={{ fontSize: "1.8rem", color: "var(--gold-600)" }}></i>
                <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, marginTop: "0.5rem", color: "var(--ink-700)" }}>
                  My Subjects
                </div>
              </div>
            </div>
            <div className="col-6 col-md-3">
              <div className="card card--interactive p-3 text-center"
                   style={{ cursor: "pointer" }}
                   onClick={() => window.location.href = "/student/fees"}>
                <i className="bi bi-cash-coin" style={{ fontSize: "1.8rem", color: "var(--success-600)" }}></i>
                <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, marginTop: "0.5rem", color: "var(--ink-700)" }}>
                  Fee Statement
                </div>
              </div>
            </div>
            <div className="col-6 col-md-3">
              <div className="card card--interactive p-3 text-center"
                   style={{ cursor: "pointer" }}
                   onClick={() => window.location.href = "/student/profile"}>
                <i className="bi bi-person" style={{ fontSize: "1.8rem", color: "var(--blue-700)" }}></i>
                <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, marginTop: "0.5rem", color: "var(--ink-700)" }}>
                  My Profile
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Performance Info */}
      {ranking && !loading && (
        <div className="row g-3 mt-2">
          <div className="col-12">
            <div className="card">
              <div className="card-header" style={{
                background: "transparent",
                borderBottom: "1px solid var(--border-color)",
                padding: "1rem 1.25rem",
                fontWeight: 600,
                color: "var(--ink-700)"
              }}>
                <i className="bi bi-bar-chart-line me-2" style={{ color: "var(--blue-700)" }}></i>
                Latest Performance Summary
              </div>
              <div className="card-body">
                <div className="row g-3">
                  <div className="col-6 col-md-3">
                    <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>Position</div>
                    <div style={{ fontSize: "var(--fs-lg)", fontWeight: 700, color: "var(--ink-900)" }}>
                      #{ranking.class_position}
                    </div>
                  </div>
                  <div className="col-6 col-md-3">
                    <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>Average</div>
                    <div style={{ fontSize: "var(--fs-lg)", fontWeight: 700, color: "var(--ink-900)" }}>
                      {ranking.average_marks}%
                    </div>
                  </div>
                  <div className="col-6 col-md-3">
                    <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>Total Students</div>
                    <div style={{ fontSize: "var(--fs-lg)", fontWeight: 700, color: "var(--ink-900)" }}>
                      {ranking.total_students || "-"}
                    </div>
                  </div>
                  <div className="col-6 col-md-3">
                    <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>Ranking</div>
                    <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600 }}>
                      <span className={`badge ${ranking.class_position <= 3 ? "badge-gold" : ranking.class_position <= 10 ? "badge-blue" : "badge-neutral"}`}>
                        {ranking.class_position <= 3 ? "🏆 Top 3" : 
                         ranking.class_position <= 10 ? "🌟 Top 10" : 
                         `${Math.round((ranking.class_position / ranking.total_students) * 100)}th Percentile`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty State for No Data */}
      {!loading && !enrollment && (
        <div className="card mt-3">
          <div className="empty-state">
            <i className="bi bi-person-x"></i>
            <h6>No Enrollment Found</h6>
            <p className="text-muted-soft">
              You are not currently enrolled in any active class.
              Please contact the school administration for assistance.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}