// src/pages/principal/Dashboard.jsx

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
    purple: { bg: "#f5f3ff", fg: "#6d28d9", icon: "bi-graph-up-arrow" },
    red: { bg: "#fef2f2", fg: "#b91c1c", icon: "bi-award" },
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

export default function PrincipalDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    dashboardApi
      .principalStats()
      .then((res) => setData(res.data))
      .catch(() => setError("Could not load the principal dashboard."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageLoader inline />;
  if (error) {
    return (
      <div>
        <Breadcrumb items={[
          { label: "Dashboard", href: "/principal" },
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
    stat_cards, admission_trend, class_population_by_grade,
    curriculum_split, top_classrooms,
  } = data;

  return (
    <div>
      <Breadcrumb items={[
        { label: "Dashboard", href: "/principal" },
        { label: "Overview", href: "#" },
      ]} />

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Principal Dashboard</h1>
          <p className="page-subtitle">
            A high-level view of enrollment, staffing, curriculum balance, and academic performance
            across the school.
          </p>
        </div>
        <span className="badge badge-neutral" style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem" }}>
          <i className="bi bi-calendar3 me-1"></i>
          Current Term
        </span>
      </div>

      {/* Stat Cards */}
      <div className="row g-3 mb-4">
        <div className="col-6 col-md-4 col-xl">
          <StatCard label="Total Students" value={stat_cards.total_students} icon="bi-people" tone="blue" />
        </div>
        <div className="col-6 col-md-4 col-xl">
          <StatCard label="Total Teachers" value={stat_cards.total_teachers} icon="bi-person-badge" tone="green" />
        </div>
        <div className="col-6 col-md-4 col-xl">
          <StatCard label="Total Classes" value={stat_cards.total_classes} icon="bi-building" tone="gold" />
        </div>
        <div className="col-6 col-md-6 col-xl">
          <StatCard label="Overall Average" value={stat_cards.overall_average} suffix="%" icon="bi-graph-up-arrow" tone="purple" />
        </div>
        <div className="col-12 col-md-6 col-xl">
          <StatCard label="Overall Pass Rate" value={stat_cards.overall_pass_rate} suffix="%" icon="bi-award" tone="red" />
        </div>
      </div>

      {/* Charts row 1 */}
      <div className="row g-3 mb-3">
        <div className="col-12 col-lg-6">
          <ChartCard title="Admission Trend (5 Years)" icon="bi-graph-up">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={admission_trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" name="Admissions" stroke="#4f46e5" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="col-12 col-lg-6">
          <ChartCard title="Class Population by Grade" icon="bi-bar-chart">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={class_population_by_grade}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="grade" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" name="Students" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>

      {/* Charts row 2 + table */}
      <div className="row g-3">
        <div className="col-12 col-lg-6">
          <ChartCard title="Curriculum Split" icon="bi-pie-chart">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={curriculum_split}
                  dataKey="count"
                  nameKey="curriculum"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                >
                  {curriculum_split.map((_, i) => (
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
                <i className="bi bi-trophy me-2" style={{ color: "var(--blue-700)" }}></i>
                Top Classrooms (Current Term)
              </span>
              <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
                {top_classrooms.length} class{top_classrooms.length !== 1 ? "es" : ""}
              </span>
            </div>

            {top_classrooms.length === 0 ? (
              <div className="empty-state">
                <i className="bi bi-bar-chart-line"></i>
                <h6>No marks recorded yet</h6>
                <p className="text-muted-soft">
                  Once teachers submit marks for the current term, the top classrooms will appear here.
                </p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead>
                    <tr>
                      <th style={{ width: 60 }}>#</th>
                      <th>Classroom</th>
                      <th className="text-end">Average %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top_classrooms.map((row, i) => (
                      <tr key={row.classroom}>
                        <td>
                          <span className="badge badge-neutral">{i + 1}</span>
                        </td>
                        <td className="cell-name">{row.classroom}</td>
                        <td className="text-end fw-bold" style={{ color: "var(--success-600, #059669)" }}>
                          {row.average}%
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