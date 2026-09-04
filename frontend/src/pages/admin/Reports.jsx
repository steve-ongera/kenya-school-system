import { useEffect, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { reportsApi } from "../../services/api";

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

  if (loading) return <div className="p-4">Loading reports…</div>;
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!data) return null;

  const { fee_collection, curriculum_split, subject_performance, pass_rates, enrollment_trend } = data;

  return (
    <div>
      <h2 className="page-title">Reports &amp; Analytics</h2>

      <div className="row g-3">
        {/* fee collection rate by grade */}
        <div className="col-12 col-lg-6">
          <div className="card p-3 h-100">
            <h6 className="mb-3">Fee Collection Rate by Grade</h6>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={fee_collection}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="grade" tick={{ fontSize: 11 }} />
                <YAxis unit="%" domain={[0, 100]} />
                <Tooltip formatter={(v) => `${v}%`} />
                <Bar dataKey="collection_rate" fill="#0d6efd" radius={[4, 4, 0, 0]} name="Collection %" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* curriculum split */}
        <div className="col-12 col-lg-6">
          <div className="card p-3 h-100">
            <h6 className="mb-3">Curriculum Split (CBC vs 8-4-4)</h6>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={curriculum_split} dataKey="count" nameKey="curriculum" outerRadius={90} label>
                  {curriculum_split.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* subject performance */}
        <div className="col-12 col-lg-6">
          <div className="card p-3 h-100">
            <h6 className="mb-3">Average Score by Subject (Current Term)</h6>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={subject_performance} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" unit="%" domain={[0, 100]} />
                <YAxis type="category" dataKey="subject" width={110} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => `${v}%`} />
                <Bar dataKey="average" fill="#20c997" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* pass rate by grade */}
        <div className="col-12 col-lg-6">
          <div className="card p-3 h-100">
            <h6 className="mb-3">Pass Rate by Grade (Current Term)</h6>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={pass_rates}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="grade" tick={{ fontSize: 11 }} />
                <YAxis unit="%" domain={[0, 100]} />
                <Tooltip formatter={(v) => `${v}%`} />
                <Bar dataKey="pass_rate" fill="#fd7e14" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* enrollment trend */}
        <div className="col-12">
          <div className="card p-3">
            <h6 className="mb-3">Enrollment Trend Across Academic Years</h6>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={enrollment_trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#6f42c1" strokeWidth={2} name="Enrolled" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}