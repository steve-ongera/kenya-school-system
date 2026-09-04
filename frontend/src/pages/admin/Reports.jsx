import { useEffect, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { reportsApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";

const PIE_COLORS = ["#0d6efd", "#fd7e14", "#20c997", "#6f42c1"];

export default function AdminReports() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await reportsApi.overview();
        if (alive) setData(res.data);
      } catch (err) {
        if (alive) setError(err.response?.data?.detail || "Failed to load reports.");
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
          { label: "Reports", href: "/admin/reports" },
          { label: "Overview", href: "#" },
        ]} />
        <div className="page-header">
          <div>
            <h1 className="page-title">Reports & Analytics</h1>
            <p className="page-subtitle">Loading reports...</p>
          </div>
        </div>
        <div className="row g-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={`col-12 ${i <= 4 ? 'col-lg-6' : 'col-12'}`}>
              <div className="chart-card">
                <div className="chart-card__header">
                  <div className="skeleton skeleton-text" style={{ width: "200px", height: "20px" }}></div>
                </div>
                <div className="skeleton skeleton-text" style={{ width: "100%", height: "250px" }}></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) return (
    <div>
      <Breadcrumb items={[
        { label: "Dashboard", href: "/admin" },
        { label: "Reports", href: "/admin/reports" },
        { label: "Overview", href: "#" },
      ]} />
      <div className="alert alert-danger">{error}</div>
    </div>
  );
  
  if (!data) return null;

  const { fee_collection, curriculum_split, subject_performance, pass_rates, enrollment_trend } = data;

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: "Dashboard", href: "/admin" },
        { label: "Reports", href: "/admin/reports" },
        { label: "Overview", href: "#" },
      ]} />

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports & Analytics</h1>
          <p className="page-subtitle">
            Comprehensive insights into school performance, finances, and enrollment
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn btn-outline-primary btn-sm">
            <i className="bi bi-download me-1"></i>Export PDF
          </button>
          <button className="btn btn-outline-secondary btn-sm">
            <i className="bi bi-file-spreadsheet me-1"></i>Export Excel
          </button>
          <button className="btn btn-primary btn-sm">
            <i className="bi bi-printer me-1"></i>Print
          </button>
        </div>
      </div>

      <div className="row g-3">
        {/* Fee Collection Rate by Grade */}
        <div className="col-12 col-lg-6">
          <div className="chart-card h-100">
            <div className="chart-card__header">
              <div>
                <div className="chart-card__title">
                  <i className="bi bi-cash-coin me-2" style={{ color: "var(--blue-700)" }}></i>
                  Fee Collection Rate by Grade
                </div>
                <div className="chart-card__subtitle">Percentage of fees collected per grade</div>
              </div>
              <span className="badge badge-success">
                <i className="bi bi-arrow-up me-1"></i>
                {fee_collection.length > 0 ? Math.round(fee_collection.reduce((sum, f) => sum + f.collection_rate, 0) / fee_collection.length) : 0}% avg
              </span>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={fee_collection}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--ink-100)" />
                <XAxis dataKey="grade" tick={{ fontSize: 12, fill: "var(--ink-400)" }} />
                <YAxis 
                  unit="%" 
                  domain={[0, 100]} 
                  tick={{ fontSize: 12, fill: "var(--ink-400)" }}
                />
                <Tooltip 
                  formatter={(v) => `${v}%`}
                  contentStyle={{ 
                    borderRadius: "var(--radius-md)", 
                    border: "1px solid var(--border-color)",
                    boxShadow: "var(--shadow-sm)"
                  }}
                />
                <Bar 
                  dataKey="collection_rate" 
                  fill="var(--blue-700)" 
                  radius={[4, 4, 0, 0]} 
                  barSize={40}
                  name="Collection %"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Curriculum Split */}
        <div className="col-12 col-lg-6">
          <div className="chart-card h-100">
            <div className="chart-card__header">
              <div>
                <div className="chart-card__title">
                  <i className="bi bi-book me-2" style={{ color: "var(--blue-700)" }}></i>
                  Curriculum Split
                </div>
                <div className="chart-card__subtitle">CBC vs 8-4-4 distribution</div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie 
                  data={curriculum_split} 
                  dataKey="count" 
                  nameKey="curriculum" 
                  outerRadius={90} 
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {curriculum_split.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
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

        {/* Subject Performance */}
        <div className="col-12 col-lg-6">
          <div className="chart-card h-100">
            <div className="chart-card__header">
              <div>
                <div className="chart-card__title">
                  <i className="bi bi-graph-up-arrow me-2" style={{ color: "var(--blue-700)" }}></i>
                  Average Score by Subject
                </div>
                <div className="chart-card__subtitle">Current term performance</div>
              </div>
              <span className="badge badge-gold">
                <i className="bi bi-trophy me-1"></i>
                {subject_performance.length > 0 ? Math.round(subject_performance.reduce((sum, s) => sum + s.average, 0) / subject_performance.length) : 0}% avg
              </span>
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={subject_performance} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--ink-100)" />
                <XAxis 
                  type="number" 
                  unit="%" 
                  domain={[0, 100]} 
                  tick={{ fontSize: 12, fill: "var(--ink-400)" }}
                />
                <YAxis 
                  type="category" 
                  dataKey="subject" 
                  width={110} 
                  tick={{ fontSize: 12, fill: "var(--ink-600)" }}
                />
                <Tooltip 
                  formatter={(v) => `${v}%`}
                  contentStyle={{ 
                    borderRadius: "var(--radius-md)", 
                    border: "1px solid var(--border-color)",
                    boxShadow: "var(--shadow-sm)"
                  }}
                />
                <Bar 
                  dataKey="average" 
                  fill="var(--success-600)" 
                  radius={[0, 4, 4, 0]} 
                  barSize={20}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pass Rate by Grade */}
        <div className="col-12 col-lg-6">
          <div className="chart-card h-100">
            <div className="chart-card__header">
              <div>
                <div className="chart-card__title">
                  <i className="bi bi-check-circle me-2" style={{ color: "var(--blue-700)" }}></i>
                  Pass Rate by Grade
                </div>
                <div className="chart-card__subtitle">Current term pass rates</div>
              </div>
              <span className="badge badge-success">
                <i className="bi bi-arrow-up me-1"></i>
                {pass_rates.length > 0 ? Math.round(pass_rates.reduce((sum, p) => sum + p.pass_rate, 0) / pass_rates.length) : 0}% overall
              </span>
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={pass_rates}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--ink-100)" />
                <XAxis dataKey="grade" tick={{ fontSize: 12, fill: "var(--ink-400)" }} />
                <YAxis 
                  unit="%" 
                  domain={[0, 100]} 
                  tick={{ fontSize: 12, fill: "var(--ink-400)" }}
                />
                <Tooltip 
                  formatter={(v) => `${v}%`}
                  contentStyle={{ 
                    borderRadius: "var(--radius-md)", 
                    border: "1px solid var(--border-color)",
                    boxShadow: "var(--shadow-sm)"
                  }}
                />
                <Bar 
                  dataKey="pass_rate" 
                  fill="var(--gold-500)" 
                  radius={[4, 4, 0, 0]} 
                  barSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Enrollment Trend */}
        <div className="col-12">
          <div className="chart-card">
            <div className="chart-card__header">
              <div>
                <div className="chart-card__title">
                  <i className="bi bi-people me-2" style={{ color: "var(--blue-700)" }}></i>
                  Enrollment Trend
                </div>
                <div className="chart-card__subtitle">Across academic years</div>
              </div>
              <span className="badge badge-blue">
                <i className="bi bi-arrow-up me-1"></i>
                {enrollment_trend.length > 1 ? Math.round((enrollment_trend[enrollment_trend.length - 1]?.count - enrollment_trend[0]?.count) / enrollment_trend[0]?.count * 100) : 0}% growth
              </span>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={enrollment_trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--ink-100)" />
                <XAxis 
                  dataKey="year" 
                  tick={{ fontSize: 12, fill: "var(--ink-400)" }}
                />
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
                <Line 
                  type="monotone" 
                  dataKey="count" 
                  stroke="var(--blue-700)" 
                  strokeWidth={3} 
                  name="Enrolled"
                  dot={{ fill: "var(--blue-700)", r: 5 }}
                  activeDot={{ r: 7 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}