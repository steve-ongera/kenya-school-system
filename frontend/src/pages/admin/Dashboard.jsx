// src/pages/admin/Dashboard.jsx
import { useEffect, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { dashboardApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";

const KES = (n) =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(n || 0);

const GENDER_COLORS = ["#3b82f6", "#ec4899"];

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await dashboardApi.stats();
        if (alive) setData(res.data);
      } catch (err) {
        if (alive) setError(err.response?.data?.detail || "Failed to load dashboard.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <div>
        <Breadcrumb items={[
          { label: "Dashboard", href: "/admin" },
          { label: "Overview", href: "#" },
        ]} />
        <div className="page-header">
          <div>
            <h1 className="page-title">Dashboard</h1>
            <p className="page-subtitle">Loading your dashboard...</p>
          </div>
        </div>
        <div className="row g-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="col-6 col-md-4 col-xl">
              <div className="stat-card stat-card--skeleton">
                <i className="bi bi-circle"></i>
                <div>
                  <div className="skeleton skeleton-text" style={{ width: "60px", height: "24px" }}></div>
                  <div className="skeleton skeleton-text" style={{ width: "80px", height: "14px", marginTop: "4px" }}></div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="row g-3 mt-1">
          <div className="col-12 col-lg-8">
            <div className="card p-3 h-100">
              <div className="skeleton skeleton-text" style={{ width: "200px", height: "20px", marginBottom: "16px" }}></div>
              <div className="skeleton skeleton-text" style={{ width: "100%", height: "250px" }}></div>
            </div>
          </div>
          <div className="col-12 col-lg-4">
            <div className="card p-3 h-100">
              <div className="skeleton skeleton-text" style={{ width: "150px", height: "20px", marginBottom: "16px" }}></div>
              <div className="skeleton skeleton-text" style={{ width: "100%", height: "250px" }}></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) return (
    <div>
      <Breadcrumb items={[
        { label: "Dashboard", href: "/admin" },
        { label: "Overview", href: "#" },
      ]} />
      <div className="alert alert-danger">{error}</div>
    </div>
  );
  
  if (!data) return null;

  const { stat_cards, revenue_trend, class_population, gender_population, admission_trend, recent_students } = data;

  const genderData = [
    { name: "Boys", value: gender_population.male },
    { name: "Girls", value: gender_population.female },
  ];
  const genderTotal = genderData.reduce((s, g) => s + g.value, 0);

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: "Dashboard", href: "/admin" },
        { label: "Overview", href: "#" },
      ]} />

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Welcome back! Here's an overview of your school</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn btn-outline-primary btn-sm">
            <i className="bi bi-download me-1"></i>Export Report
          </button>
          <button className="btn btn-primary btn-sm">
            <i className="bi bi-refresh me-1"></i>Refresh
          </button>
        </div>
      </div>

      {/* 5 Stat Cards */}
      <div className="row g-3">
        <StatCard 
          icon="bi-people" 
          value={stat_cards.total_students} 
          label="Students Enrolled" 
          variant="primary"
        />
        <StatCard 
          icon="bi-door-open" 
          value={stat_cards.total_classes} 
          label="Active Classes" 
          variant="gold"
        />
        <StatCard 
          icon="bi-person-badge" 
          value={stat_cards.total_teachers} 
          label="Teachers" 
          variant="success"
        />
        <StatCard 
          icon="bi-cash-coin" 
          value={KES(stat_cards.revenue_this_year)} 
          label="Revenue (This Year)" 
          variant="success"
        />
        <StatCard 
          icon="bi-exclamation-circle" 
          value={KES(stat_cards.outstanding_balance)} 
          label="Outstanding Fees" 
          variant="danger"
        />
      </div>

      <div className="row g-3 mt-1">
        {/* Revenue Trend */}
        <div className="col-12 col-lg-8">
          <div className="chart-card h-100">
            <div className="chart-card__header">
              <div>
                <div className="chart-card__title">
                  <i className="bi bi-graph-up-arrow me-2" style={{ color: "var(--blue-700)" }}></i>
                  Fee Revenue — Last 12 Months
                </div>
                <div className="chart-card__subtitle">Monthly fee collection trend</div>
              </div>
              <span className="badge badge-blue">
                <i className="bi bi-arrow-up me-1"></i>
                +{((stat_cards.revenue_this_year / 12) / 1000).toFixed(0)}k avg
              </span>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={revenue_trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--ink-100)" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--ink-400)" }} />
                <YAxis 
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} 
                  tick={{ fontSize: 12, fill: "var(--ink-400)" }}
                />
                <Tooltip 
                  formatter={(v) => KES(v)} 
                  contentStyle={{ 
                    borderRadius: "var(--radius-md)", 
                    border: "1px solid var(--border-color)",
                    boxShadow: "var(--shadow-sm)"
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="var(--blue-700)" 
                  strokeWidth={3} 
                  dot={{ fill: "var(--blue-700)", r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gender Population */}
        <div className="col-12 col-lg-4">
          <div className="chart-card h-100">
            <div className="chart-card__header">
              <div>
                <div className="chart-card__title">
                  <i className="bi bi-gender-ambiguous me-2" style={{ color: "var(--blue-700)" }}></i>
                  Boys vs Girls
                </div>
                <div className="chart-card__subtitle">Total: {genderTotal} students</div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie 
                  data={genderData} 
                  dataKey="value" 
                  nameKey="name" 
                  innerRadius={55} 
                  outerRadius={90} 
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {genderData.map((_, i) => <Cell key={i} fill={GENDER_COLORS[i]} />)}
                </Pie>
                <Tooltip 
                  formatter={(v) => `${v} students`}
                  contentStyle={{ 
                    borderRadius: "var(--radius-md)", 
                    border: "1px solid var(--border-color)",
                    boxShadow: "var(--shadow-sm)"
                  }}
                />
                <Legend 
                  iconType="circle"
                  wrapperStyle={{ fontSize: "var(--fs-xs)", color: "var(--ink-600)" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Class Population */}
        <div className="col-12 col-lg-6">
          <div className="chart-card h-100">
            <div className="chart-card__header">
              <div>
                <div className="chart-card__title">
                  <i className="bi bi-building me-2" style={{ color: "var(--blue-700)" }}></i>
                  Students per Class
                </div>
                <div className="chart-card__subtitle">Current year distribution</div>
              </div>
              <span className="badge badge-neutral">
                {class_population.length} classes
              </span>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={class_population} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--ink-100)" />
                <XAxis 
                  type="number" 
                  allowDecimals={false} 
                  tick={{ fontSize: 12, fill: "var(--ink-400)" }}
                />
                <YAxis 
                  type="category" 
                  dataKey="classroom" 
                  width={110} 
                  tick={{ fontSize: 12, fill: "var(--ink-600)" }}
                />
                <Tooltip 
                  formatter={(v) => `${v} students`}
                  contentStyle={{ 
                    borderRadius: "var(--radius-md)", 
                    border: "1px solid var(--border-color)",
                    boxShadow: "var(--shadow-sm)"
                  }}
                />
                <Bar 
                  dataKey="count" 
                  fill="var(--success-600)" 
                  radius={[0, 4, 4, 0]} 
                  barSize={20}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Admission Trend */}
        <div className="col-12 col-lg-6">
          <div className="chart-card h-100">
            <div className="chart-card__header">
              <div>
                <div className="chart-card__title">
                  <i className="bi bi-person-plus me-2" style={{ color: "var(--blue-700)" }}></i>
                  Admissions Trend
                </div>
                <div className="chart-card__subtitle">Last 5 years</div>
              </div>
              <span className="badge badge-gold">
                <i className="bi bi-arrow-up me-1"></i>
                +{admission_trend.length > 1 ? Math.round((admission_trend[admission_trend.length - 1]?.count - admission_trend[0]?.count) / admission_trend[0]?.count * 100) : 0}%
              </span>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={admission_trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--ink-100)" />
                <XAxis dataKey="year" tick={{ fontSize: 12, fill: "var(--ink-400)" }} />
                <YAxis 
                  allowDecimals={false} 
                  tick={{ fontSize: 12, fill: "var(--ink-400)" }}
                />
                <Tooltip 
                  formatter={(v) => `${v} students`}
                  contentStyle={{ 
                    borderRadius: "var(--radius-md)", 
                    border: "1px solid var(--border-color)",
                    boxShadow: "var(--shadow-sm)"
                  }}
                />
                <Bar 
                  dataKey="count" 
                  fill="var(--gold-500)" 
                  radius={[4, 4, 0, 0]} 
                  barSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Students Table */}
      <div className="table-wrap mt-3">
        <div className="table-wrap__header">
          <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
            <i className="bi bi-clock-history me-2" style={{ color: "var(--blue-700)" }}></i>
            Recently Admitted Students
          </span>
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
            {recent_students.length} recent admission{recent_students.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th>Admission No</th>
                <th>Name</th>
                <th>Gender</th>
                <th>Class</th>
                <th>Status</th>
                <th>Date Admitted</th>
              </tr>
            </thead>
            <tbody>
              {recent_students.map((s) => (
                <tr key={s.id}>
                  <td>
                    <span style={{ fontWeight: 600, color: "var(--blue-700)", fontSize: "var(--fs-sm)" }}>
                      {s.admission_no}
                    </span>
                  </td>
                  <td>
                    <div className="table-avatar-cell">
                      <div className="avatar-sm">
                        {s.name?.split(' ').map(n => n[0]).join('') || 'S'}
                      </div>
                      <span className="cell-name">{s.name}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${s.gender === "M" ? "badge-blue" : "badge-gold"}`}>
                      {s.gender === "M" ? "Male" : "Female"}
                    </span>
                  </td>
                  <td>
                    <span className="badge badge-neutral">{s.classroom || "-"}</span>
                  </td>
                  <td>
                    <span className={`badge ${s.status === "ACTIVE" ? "badge-success" : "badge-danger"}`}>
                      <span className={`status-dot ${s.status === "ACTIVE" ? "status-dot--online" : "status-dot--offline"}`}></span>
                      {s.status || "Active"}
                    </span>
                  </td>
                  <td style={{ color: "var(--ink-600)", fontSize: "var(--fs-sm)" }}>
                    {s.date_admitted}
                  </td>
                </tr>
              ))}
              {recent_students.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-muted-soft" style={{ padding: "2rem" }}>
                    <i className="bi bi-inbox" style={{ fontSize: "1.5rem", display: "block", marginBottom: "0.5rem" }}></i>
                    No students admitted recently
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, value, label, variant = "primary" }) {
  const variantClass = variant === "gold" ? "stat-card--gold" : 
                       variant === "success" ? "stat-card--success" : 
                       variant === "danger" ? "stat-card--danger" : "";

  return (
    <div className="col-6 col-md-4 col-xl">
      <div className={`stat-card ${variantClass}`}>
        <i className={`bi ${icon}`}></i>
        <div>
          <div className="stat-card__value">{value}</div>
          <div className="stat-card__label">{label}</div>
        </div>
      </div>
    </div>
  );
}