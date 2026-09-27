// src/pages/secretary/Dashboard.jsx
import { useEffect, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { dashboardApi } from "../../services/api";
import PageLoader from "../../components/PageLoader";
import Breadcrumb from "../../components/Breadcrumb";

const COLORS = ["#4f46e5", "#06b6d4", "#f59e0b", "#ef4444", "#10b981", "#8b5cf6"];

function StatCard({ label, value, suffix = "", icon, tone = "blue" }) {
  const toneMap = {
    blue: { bg: "var(--blue-50, #eef2ff)", fg: "var(--blue-700, #4338ca)", icon: "bi-people" },
    green: { bg: "var(--success-50, #ecfdf5)", fg: "var(--success-600, #059669)", icon: "bi-person-badge" },
    gold: { bg: "var(--gold-50, #fffbeb)", fg: "var(--gold-600, #b45309)", icon: "bi-building" },
    purple: { bg: "#f5f3ff", fg: "#6d28d9", icon: "bi-person-plus" },
    red: { bg: "#fef2f2", fg: "#b91c1c", icon: "bi-hourglass-split" },
  };
  const t = toneMap[tone] || toneMap.blue;
  return (
    <div className="card p-4 h-100">
      <div className="d-flex justify-content-between align-items-start">
        <div>
          <p className="text-muted-soft mb-1" style={{ fontSize: "var(--fs-sm)" }}>{label}</p>
          <p className="mb-0" style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--ink-900)" }}>
            {value}
            {suffix && <span style={{ fontSize: "var(--fs-md)", fontWeight: 600, color: "var(--ink-400)" }}>{suffix}</span>}
          </p>
        </div>
        <span
          className="d-inline-flex align-items-center justify-content-center"
          style={{
            width: 42, height: 42, borderRadius: 12,
            background: t.bg, color: t.fg, fontSize: "1.1rem",
          }}
        >
          <i className={`bi ${icon || t.icon}`}></i>
        </span>
      </div>
    </div>
  );
}

function ChartCard({ title, icon, children, className = "" }) {
  return (
    <div className={`card p-4 h-100 ${className}`}>
      <h6 className="mb-3 d-flex align-items-center" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
        <i className={`bi ${icon} me-2`} style={{ color: "var(--blue-700)" }}></i>
        {title}
      </h6>
      <div style={{ width: "100%" }}>{children}</div>
    </div>
  );
}

export default function SecretaryDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    dashboardApi
      .secretaryStats()
      .then((res) => setData(res.data))
      .catch(() => setError("Could not load the secretary dashboard."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageLoader inline />;
  if (error) {
    return (
      <div>
        <Breadcrumb items={[
          { label: "Dashboard", href: "/secretary" },
          { label: "Overview", href: "#" },
        ]} />
        <div className="alert alert-danger">
          <i className="bi bi-exclamation-circle me-2"></i>
          {error}
        </div>
      </div>
    );
  }
  if (!data) return null;

  const {
    stat_cards, admission_monthly_trend, admissions_by_grade,
    gender_split, recent_admissions, payment_trend_30_days,
    current_term, current_academic_year,
  } = data;

  return (
    <div>
      <Breadcrumb items={[
        { label: "Dashboard", href: "/secretary" },
        { label: "Overview", href: "#" },
      ]} />

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Secretary Dashboard</h1>
          <p className="page-subtitle">
            Monitor admissions, guardians, and class capacity. Track new enrollments and pending
            clearance requests at a glance.
          </p>
        </div>
        <span className="badge badge-neutral" style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem" }}>
          <i className="bi bi-calendar3 me-1"></i>
          {current_term
            ? `${current_term}${current_academic_year ? ` (${current_academic_year})` : ""}`
            : "No Current Term Set"}
        </span>
      </div>

      {/* Stat Cards */}
      <div className="row g-3 mb-4">
        <div className="col-6 col-md-4 col-xl">
          <StatCard label="Total Students" value={stat_cards.total_students} icon="bi-people" tone="blue" />
        </div>
        <div className="col-6 col-md-4 col-xl">
          <StatCard label="Total Guardians" value={stat_cards.total_guardians} icon="bi-person-badge" tone="green" />
        </div>
        <div className="col-6 col-md-4 col-xl">
          <StatCard label="Total Classes" value={stat_cards.total_classes} icon="bi-building" tone="gold" />
        </div>
        <div className="col-6 col-md-6 col-xl">
          <StatCard label="Admissions This Month" value={stat_cards.admissions_this_month} icon="bi-person-plus" tone="purple" />
        </div>
        <div className="col-12 col-md-6 col-xl">
          <StatCard label="Pending Clearance" value={stat_cards.pending_clearance} icon="bi-hourglass-split" tone="red" />
        </div>
      </div>

      {/* Payments Trend — full width, directly below stat cards */}
      <div className="row g-3 mb-3">
        <div className="col-12">
          <ChartCard title="Payments Received (Last 30 Days)" icon="bi-cash-coin">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={payment_trend_30_days}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={2} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip formatter={(value) => [`KES ${Number(value).toLocaleString()}`, "Amount"]} />
                <Line
                  type="monotone"
                  dataKey="amount"
                  name="Amount (KES)"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>

      {/* Charts row 1 */}
      <div className="row g-3 mb-3">
        <div className="col-12 col-lg-6">
          <ChartCard title="Admissions Trend (12 Months)" icon="bi-graph-up">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={admission_monthly_trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="count"
                  name="Admissions"
                  stroke="#4f46e5"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="col-12 col-lg-6">
          <ChartCard title="Admissions by Grade (This Year)" icon="bi-bar-chart">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={admissions_by_grade}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="grade" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" name="Admissions" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>

      {/* Charts row 2 + table */}
      <div className="row g-3">
        <div className="col-12 col-lg-6">
          <ChartCard title="Gender Split" icon="bi-pie-chart">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={gender_split}
                  dataKey="count"
                  nameKey="gender"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                >
                  {gender_split.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="col-12 col-lg-6">
          <div className="table-wrap h-100">
            <div className="table-wrap__header">
              <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                <i className="bi bi-person-plus me-2" style={{ color: "var(--blue-700)" }}></i>
                Recent Admissions
              </span>
              <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
                {recent_admissions.length} record{recent_admissions.length !== 1 ? "s" : ""}
              </span>
            </div>

            {recent_admissions.length === 0 ? (
              <div className="empty-state">
                <i className="bi bi-person-lines-fill"></i>
                <h6>No admissions yet</h6>
                <p className="text-muted-soft">
                  Newly enrolled students will appear here as soon as they are admitted.
                </p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead>
                    <tr>
                      <th>Admission No</th>
                      <th>Name</th>
                      <th>Class</th>
                      <th className="text-end">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent_admissions.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <span style={{ fontWeight: 600, color: "var(--blue-700)", fontSize: "var(--fs-sm)" }}>
                            {row.admission_no}
                          </span>
                        </td>
                        <td className="cell-name">{row.name}</td>
                        <td>
                          <span className="badge badge-neutral">{row.classroom}</span>
                        </td>
                        <td className="text-end" style={{ fontSize: "var(--fs-sm)", color: "var(--ink-600)" }}>
                          {row.date_admitted}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}