// pages/admin/finance/Collections.jsx
import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { financeReportsApi } from "../../../services/api";
import Breadcrumb from "../../../components/Breadcrumb";

const formatKES = (n) =>
  `KES ${Number(n || 0).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;

function StatCard({ icon, variant, value, label }) {
  const variantClass = variant === "gold" ? "stat-card--gold" : 
                       variant === "success" ? "stat-card--success" : 
                       variant === "danger" ? "stat-card--danger" : "";
  return (
    <div className={`stat-card ${variantClass}`}>
      <i className={`bi ${icon}`}></i>
      <div>
        <div className="stat-card__value">{value}</div>
        <div className="stat-card__label">{label}</div>
      </div>
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="stat-card stat-card--skeleton">
      <i className="bi bi-cash-stack"></i>
      <div style={{ flex: 1 }}>
        <div className="skeleton skeleton-text" style={{ width: "60%", height: 24 }} />
        <div className="skeleton skeleton-text" style={{ width: "80%", height: 14, marginTop: 4 }} />
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-color)",
        borderRadius: "var(--radius-md)",
        padding: "0.6rem 0.8rem",
        boxShadow: "var(--shadow-sm)",
        fontSize: "var(--fs-xs)",
      }}
    >
      <div style={{ fontWeight: 700, color: "var(--ink-900)", marginBottom: 2 }}>{label}</div>
      <div style={{ color: "var(--blue-700)", fontWeight: 600 }}>{formatKES(payload[0].value)}</div>
    </div>
  );
}

/**
 * Admin - Page 1 of the finance reports suite: lifetime collection
 * totals as 5 stat cards, plus a per-academic-year monthly revenue
 * trend. Switching the academic-year tab only re-fetches the trend
 * line - the stat cards stay lifetime totals, since "how much have I
 * collected since students started paying" isn't scoped to one year.
 */
export default function AdminFinanceCollections() {
  const [data, setData] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);
  const [loading, setLoading] = useState(true);
  const [trendLoading, setTrendLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    financeReportsApi
      .collections()
      .then(({ data: res }) => {
        if (cancelled) return;
        setData(res);
        setSelectedYear(res.selected_academic_year);
      })
      .catch(() => !cancelled && setError("Could not load the collections report."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const handleTabClick = (yearId) => {
    if (yearId === selectedYear) return;
    setSelectedYear(yearId);
    setTrendLoading(true);
    financeReportsApi
      .collections({ academic_year: yearId })
      .then(({ data: res }) => setData((prev) => ({ ...prev, monthly_trend: res.monthly_trend })))
      .catch(() => setError("Could not load that academic year's trend."))
      .finally(() => setTrendLoading(false));
  };

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: "Dashboard", href: "/admin" },
        { label: "Finance", href: "/admin/finance" },
        { label: "Collections Report", href: "#" },
      ]} />

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Collections Report</h1>
          <p className="page-subtitle">
            Lifetime fee collection totals and how revenue has moved through each academic year.
          </p>
        </div>
        {!loading && data && (
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn btn-outline-primary btn-sm">
              <i className="bi bi-download me-1"></i>Export
            </button>
            <button className="btn btn-primary btn-sm">
              <i className="bi bi-printer me-1"></i>Print
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="alert alert-danger alert-dismissible fade show" role="alert">
          <i className="bi bi-exclamation-circle me-2"></i>
          {error}
          <button type="button" className="btn-close" onClick={() => setError(null)}></button>
        </div>
      )}

      {/* Stat Cards Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: "0.9rem",
          marginBottom: "1.5rem",
        }}
      >
        {loading || !data ? (
          Array.from({ length: 5 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              icon="bi-cash-stack"
              value={formatKES(data.stat_cards.total_collected)}
              label="Total collected (all time)"
            />
            <StatCard
              icon="bi-exclamation-circle"
              variant="danger"
              value={formatKES(data.stat_cards.outstanding_balance)}
              label="Outstanding balance"
            />
            <StatCard
              icon="bi-check-circle"
              variant="success"
              value={data.stat_cards.fully_paid_invoices}
              label="Fully paid invoices"
            />
            <StatCard
              icon="bi-hourglass-split"
              variant="gold"
              value={data.stat_cards.partially_paid_invoices}
              label="Partially paid invoices"
            />
            <StatCard
              icon="bi-x-circle"
              variant="danger"
              value={data.stat_cards.unpaid_invoices}
              label="Unpaid invoices"
            />
          </>
        )}
      </div>

      {/* Monthly Revenue Chart */}
      <div className="chart-card">
        <div className="chart-card__header" style={{ 
          flexDirection: window.innerWidth < 768 ? "column" : "row",
          alignItems: window.innerWidth < 768 ? "stretch" : "flex-start",
          gap: "0.75rem"
        }}>
          <div>
            <div className="chart-card__title">
              <i className="bi bi-graph-up-arrow me-2" style={{ color: "var(--blue-700)" }}></i>
              Monthly Revenue
            </div>
            <div className="chart-card__subtitle">Payments received, by month, for the selected year</div>
          </div>
          {!loading && data?.academic_years?.length > 0 && (
            <ul className="nav nav-pills" style={{ marginBottom: 0, flexWrap: "wrap", gap: "0.15rem" }}>
              {data.academic_years.map((ay) => (
                <li className="nav-item" key={ay.id}>
                  <button
                    type="button"
                    className={`nav-link ${selectedYear === ay.id ? "active" : ""}`}
                    onClick={() => handleTabClick(ay.id)}
                    style={{
                      cursor: "pointer",
                      border: "none",
                      background: "transparent",
                      padding: "0.3rem 0.7rem",
                      fontSize: "var(--fs-sm)",
                      fontWeight: 500,
                      borderRadius: "var(--radius-pill)",
                      transition: "all 0.15s ease",
                      color: selectedYear === ay.id ? "#fff" : "var(--ink-600)",
                      backgroundColor: selectedYear === ay.id ? "var(--blue-700)" : "transparent",
                    }}
                    onMouseEnter={(e) => {
                      if (selectedYear !== ay.id) {
                        e.currentTarget.style.backgroundColor = "var(--bg-app)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedYear !== ay.id) {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }
                    }}
                  >
                    {ay.year}
                    {ay.is_current && <span className="ms-1" style={{ color: "var(--gold-500)" }}>•</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {loading ? (
          <div className="skeleton" style={{ height: 280, width: "100%", borderRadius: "var(--radius-md)" }} />
        ) : !data?.monthly_trend?.length ? (
          <div className="empty-state">
            <i className="bi bi-graph-up"></i>
            <h6>No payments recorded yet</h6>
            <p className="text-muted-soft mb-0">Nothing has been collected for this academic year.</p>
          </div>
        ) : (
          <div style={{ position: "relative" }}>
            {trendLoading && (
              <div 
                className="loading-overlay"
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(255,255,255,0.7)",
                  backdropFilter: "blur(1px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "var(--radius-md)",
                  zIndex: 5,
                }}
              >
                <div className="loading-overlay__spinner" />
              </div>
            )}
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={data.monthly_trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--ink-100)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: "var(--ink-400)" }}
                  axisLine={{ stroke: "var(--border-color)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "var(--ink-400)" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  width={44}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--blue-700)"
                  strokeWidth={3}
                  dot={{ r: 4, fill: "var(--blue-700)", stroke: "var(--blue-700)", strokeWidth: 2 }}
                  activeDot={{ r: 7, fill: "var(--blue-700)", stroke: "var(--blue-700)", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
            
            {/* Summary stats below chart */}
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              flexWrap: "wrap",
              gap: "0.5rem",
              marginTop: "0.75rem",
              paddingTop: "0.75rem",
              borderTop: "1px solid var(--border-color)",
              fontSize: "var(--fs-xs)",
              color: "var(--ink-400)"
            }}>
              <span>
                Total collected this year: <strong style={{ color: "var(--ink-700)" }}>
                  {formatKES(data.monthly_trend.reduce((sum, m) => sum + Number(m.revenue || 0), 0))}
                </strong>
              </span>
              <span>
                Average per month: <strong style={{ color: "var(--ink-700)" }}>
                  {formatKES(data.monthly_trend.reduce((sum, m) => sum + Number(m.revenue || 0), 0) / data.monthly_trend.length)}
                </strong>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Additional Info Card */}
      {!loading && data && (
        <div className="card mt-3" style={{ background: "var(--bg-app)" }}>
          <div className="card-body" style={{ padding: "0.75rem 1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "var(--fs-sm)", flexWrap: "wrap" }}>
              <i className="bi bi-info-circle" style={{ color: "var(--blue-700)", fontSize: "1.1rem" }}></i>
              <span style={{ color: "var(--ink-600)" }}>
                <strong>Note:</strong> Stat cards show <strong>lifetime</strong> totals across all academic years. 
                The monthly trend chart updates when you switch years.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}