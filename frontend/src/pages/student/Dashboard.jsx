import { useEffect, useState } from "react";
import { studentsApi, financeApi, performanceApi } from "../../services/api";
import { useAuth } from "../../hooks/useAuth";
import Breadcrumb from "../../components/Breadcrumb";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const PIE_COLORS = ["#1d4ed8", "#d97706", "#16a34a", "#7c3aed", "#dc2626"];

export default function StudentDashboard() {
  const { user } = useAuth();
  const [enrollment, setEnrollment] = useState(null);
  const [loading, setLoading] = useState(true);

  const [netBalance, setNetBalance] = useState(0);
  const [feeLoading, setFeeLoading] = useState(true);

  const [performance, setPerformance] = useState(null);
  const [performanceLoading, setPerformanceLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await studentsApi.enrollments({ status: "ACTIVE" });
        const list = data.results ?? data;
        setEnrollment(list[0] || null);
      } catch (error) {
        console.error("Failed to load dashboard:", error);
      } finally {
        setLoading(false);
      }
    })();

    financeApi.invoices()
      .then(({ data }) => {
        const list = data.results ?? data;
        const totalDue = list.reduce((s, i) => s + Number(i.amount_due), 0);
        const totalPaid = list.reduce((s, i) => s + Number(i.amount_paid), 0);
        setNetBalance(totalDue - totalPaid);
      })
      .catch((error) => console.error("Failed to load fee balance:", error))
      .finally(() => setFeeLoading(false));

    performanceApi.dashboard()
      .then(({ data }) => setPerformance(data))
      .catch((error) => console.error("Failed to load performance dashboard:", error))
      .finally(() => setPerformanceLoading(false));
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

  const subjectsCount = performance?.subjects_summary?.length ?? null;

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
        <div className="col-6 col-md-3">
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

        <div className="col-6 col-md-3">
          <div className="stat-card">
            <i className="bi bi-calendar-week"></i>
            <div>
              <div className="stat-card__value">
                {performanceLoading ? (
                  <div className="skeleton skeleton-text" style={{ width: "70px", height: "24px" }}></div>
                ) : (
                  performance?.current_term || "-"
                )}
              </div>
              <div className="stat-card__label">Current Term</div>
            </div>
          </div>
        </div>

        <div className="col-6 col-md-3">
          <div className="stat-card stat-card--gold">
            <i className="bi bi-journal-bookmark"></i>
            <div>
              <div className="stat-card__value">
                {performanceLoading ? (
                  <div className="skeleton skeleton-text" style={{ width: "40px", height: "24px" }}></div>
                ) : (
                  subjectsCount ?? "-"
                )}
              </div>
              <div className="stat-card__label">Subjects Registered</div>
            </div>
          </div>
        </div>

        <div className="col-6 col-md-3">
          <div className={`stat-card ${netBalance > 0 ? "stat-card--danger" : "stat-card--success"}`}>
            <i className="bi bi-cash-coin"></i>
            <div>
              <div className="stat-card__value">
                {feeLoading ? (
                  <div className="skeleton skeleton-text" style={{ width: "90px", height: "24px" }}></div>
                ) : (
                  `KES ${Math.abs(netBalance).toLocaleString()}`
                )}
              </div>
              <div className="stat-card__label">
                {netBalance > 0 ? "Fee Balance Owed" : netBalance < 0 ? "Fee Credit" : "Fee Balance"}
              </div>
            </div>
          </div>
        </div>
      </div>


      {/* Performance Overview */}
      <div className="row g-3 mt-2">
        <div className="col-12">
          <h6 className="mb-3" style={{ fontWeight: 600, color: "var(--ink-600)" }}>
            <i className="bi bi-bar-chart-line me-2"></i>
            Performance Overview
          </h6>
        </div>

        {/* Line chart: performance within the current term */}
        <div className="col-12 col-lg-6">
          <div className="card">
            <div className="card-header" style={{
              background: "transparent", borderBottom: "1px solid var(--border-color)",
              padding: "1rem 1.25rem", fontWeight: 600, color: "var(--ink-700)"
            }}>
              <i className="bi bi-graph-up me-2" style={{ color: "var(--blue-700)" }}></i>
              Performance This Term{performance?.current_term ? ` — ${performance.current_term}` : ""}
            </div>
            <div className="card-body">
              {performanceLoading ? (
                <div className="skeleton skeleton-text" style={{ width: "100%", height: "220px" }}></div>
              ) : performance?.term_trend?.length ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={performance.term_trend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="exam" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip formatter={(v) => `${v}%`} />
                    <Line type="monotone" dataKey="average" stroke="#1d4ed8" strokeWidth={2} name="Average %" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-soft mb-0">No exam results recorded yet for this term.</p>
              )}
            </div>
          </div>
        </div>

        {/* Bar chart: performance across Term 1, 2, 3 of the academic year */}
        <div className="col-12 col-lg-6">
          <div className="card">
            <div className="card-header" style={{
              background: "transparent", borderBottom: "1px solid var(--border-color)",
              padding: "1rem 1.25rem", fontWeight: 600, color: "var(--ink-700)"
            }}>
              <i className="bi bi-bar-chart-line me-2" style={{ color: "var(--gold-600)" }}></i>
              Performance Across the Academic Year
            </div>
            <div className="card-body">
              {performanceLoading ? (
                <div className="skeleton skeleton-text" style={{ width: "100%", height: "220px" }}></div>
              ) : performance?.academic_year_trend?.some((t) => t.average !== null) ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={performance.academic_year_trend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="term" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip formatter={(v) => (v === null ? "No data" : `${v}%`)} />
                    <Bar dataKey="average" fill="#d97706" name="Average %" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-soft mb-0">No term averages recorded yet for this academic year.</p>
              )}
            </div>
          </div>
        </div>

        {/* Pie chart: best performing subjects this term */}
        <div className="col-12 col-lg-6">
          <div className="card">
            <div className="card-header" style={{
              background: "transparent", borderBottom: "1px solid var(--border-color)",
              padding: "1rem 1.25rem", fontWeight: 600, color: "var(--ink-700)"
            }}>
              <i className="bi bi-pie-chart me-2" style={{ color: "var(--success-600)" }}></i>
              Best Performing Subjects This Term
            </div>
            <div className="card-body">
              {performanceLoading ? (
                <div className="skeleton skeleton-text" style={{ width: "100%", height: "220px" }}></div>
              ) : performance?.subject_performance?.length ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={performance.subject_performance}
                      dataKey="average"
                      nameKey="subject"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ subject, average }) => `${subject}: ${average}%`}
                    >
                      {performance.subject_performance.map((_, index) => (
                        <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => `${v}%`} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-soft mb-0">No subject results recorded yet for this term.</p>
              )}
            </div>
          </div>
        </div>

        {/* Subjects summary table */}
        <div className="col-12 col-lg-6">
          <div className="card">
            <div className="card-header" style={{
              background: "transparent", borderBottom: "1px solid var(--border-color)",
              padding: "1rem 1.25rem", fontWeight: 600, color: "var(--ink-700)"
            }}>
              <i className="bi bi-journal-bookmark me-2" style={{ color: "var(--blue-700)" }}></i>
              My Subjects{performance?.current_class ? ` — ${performance.current_class}` : ""}
            </div>
            <div className="card-body p-0">
              {performanceLoading ? (
                <div className="p-3">
                  <div className="skeleton skeleton-text" style={{ width: "100%", height: "180px" }}></div>
                </div>
              ) : performance?.subjects_summary?.length ? (
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead>
                      <tr>
                        <th>Subject</th>
                        <th className="text-end">Latest Mark</th>
                      </tr>
                    </thead>
                    <tbody>
                      {performance.subjects_summary.map((s) => (
                        <tr key={s.subject}>
                          <td>{s.subject}</td>
                          <td className="text-end">
                            {s.marks !== null ? (
                              <span className="badge badge-blue">{s.marks}%</span>
                            ) : (
                              <span className="text-muted-soft">Not yet examined</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-muted-soft mb-0 p-3">No subjects registered for this class yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>

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