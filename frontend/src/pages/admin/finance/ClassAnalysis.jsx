// pages/admin/finance/ClassAnalysis.jsx
import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { financeReportsApi } from "../../../services/api";
import Breadcrumb from "../../../components/Breadcrumb";
import TableSkeleton from "../../../components/TableSkeleton";

const formatKES = (n) =>
  `KES ${Number(n || 0).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;

const PIE_COLORS = [
  "var(--blue-700, #1a4fa0)",
  "var(--gold-500, #f5a524)",
  "var(--success-600, #1f9d63)",
  "var(--blue-400, #6fa4ea)",
  "var(--danger-600, #dc3d43)",
];

function TrendTooltip({ active, payload, label }) {
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
      <div style={{ fontWeight: 700, color: "var(--ink-900)", marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color, marginTop: 2 }}>
          {p.name}: {p.dataKey === "invoice_count" ? p.value : formatKES(p.value)}
        </div>
      ))}
    </div>
  );
}

function PieTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
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
      <div style={{ fontWeight: 700, color: "var(--ink-900)" }}>{p.name}</div>
      <div>{formatKES(p.value)}</div>
      <div className="text-muted-soft">{p.payload.count} payment(s)</div>
    </div>
  );
}

/**
 * Admin - Page 2 of the finance reports suite: everything scoped to one
 * academic year (tab strip at the top, same pattern as Collections).
 *   - classroom_outstanding: worst-first table of unpaid balances by class
 *   - monthly_trend: 4 series (due, paid, outstanding, invoice count) -
 *     money series on the left axis, count on the right
 *   - payment_method_breakdown: pie of amount collected per method
 *   - gender_balance_analysis: side-by-side male/female balance cards
 */
export default function AdminFinanceClassAnalysis() {
  const [data, setData] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState(null);

  const load = (yearId) => {
    const isInitial = yearId === undefined;
    if (isInitial) setLoading(true);
    else setSwitching(true);
    setError(null);
    financeReportsApi
      .classAnalysis(isInitial ? undefined : { academic_year: yearId })
      .then(({ data: res }) => {
        setData(res);
        setSelectedYear(res.selected_academic_year);
      })
      .catch(() => setError("Could not load the class analysis report."))
      .finally(() => {
        setLoading(false);
        setSwitching(false);
      });
  };

  useEffect(() => {
    load(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTabClick = (yearId) => {
    if (yearId === selectedYear) return;
    load(yearId);
  };

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: "Dashboard", href: "/admin" },
        { label: "Finance", href: "/admin/finance" },
        { label: "Class Analysis", href: "#" },
      ]} />

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Class Analysis</h1>
          <p className="page-subtitle">
            Which classes are carrying the most unpaid fees, how collection has moved through the year, and
            how payments break down by method and gender.
          </p>
        </div>
        {!loading && data?.academic_years?.length > 0 && (
          <ul className="nav nav-pills" style={{ marginBottom: 0 }}>
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

      {error && (
        <div className="alert alert-danger alert-dismissible fade show" role="alert">
          <i className="bi bi-exclamation-circle me-2"></i>
          {error}
          <button type="button" className="btn-close" onClick={() => setError(null)}></button>
        </div>
      )}

      {loading ? (
        <>
          <div style={{ marginBottom: "1.5rem" }}>
            <TableSkeleton rows={5} columns={5} />
          </div>
          <div className="chart-card mb-4">
            <div className="chart-card__header">
              <div className="skeleton skeleton-text" style={{ width: "200px", height: "20px" }}></div>
            </div>
            <div className="skeleton skeleton-text" style={{ width: "100%", height: "250px" }}></div>
          </div>
          <div className="row g-4 mb-4">
            <div className="col-12 col-lg-6">
              <div className="chart-card">
                <div className="chart-card__header">
                  <div className="skeleton skeleton-text" style={{ width: "180px", height: "20px" }}></div>
                </div>
                <div className="skeleton skeleton-text" style={{ width: "100%", height: "200px" }}></div>
              </div>
            </div>
            <div className="col-12 col-lg-6">
              <div className="chart-card">
                <div className="chart-card__header">
                  <div className="skeleton skeleton-text" style={{ width: "180px", height: "20px" }}></div>
                </div>
                <div className="skeleton skeleton-text" style={{ width: "100%", height: "200px" }}></div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div style={{ position: "relative" }}>
          {switching && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(255,255,255,0.6)",
                zIndex: 10,
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "center",
                paddingTop: "3rem",
                borderRadius: "var(--radius-lg)",
              }}
            >
              <div className="loading-overlay__spinner" />
            </div>
          )}

          {/* Classroom outstanding, worst-first */}
          <div className="table-wrap mb-4">
            <div className="table-wrap__header">
              <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                <i className="bi bi-building me-2" style={{ color: "var(--blue-700)" }}></i>
                Classroom Outstanding Balances
              </span>
              {data.classroom_outstanding.length > 0 && (
                <span className="badge badge-neutral">
                  {data.classroom_outstanding.length} classes
                </span>
              )}
            </div>
            {data.classroom_outstanding.length === 0 ? (
              <div className="empty-state">
                <i className="bi bi-check2-circle" style={{ color: "var(--success-600)" }}></i>
                <h6>All clear!</h6>
                <p className="text-muted-soft">No outstanding balances for this academic year.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead>
                    <tr>
                      <th>Class</th>
                      <th className="text-end">Total Due</th>
                      <th className="text-end">Total Paid</th>
                      <th className="text-end">Outstanding</th>
                      <th style={{ width: "30%" }}>Collected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.classroom_outstanding.map((c) => {
                      const pctCollected = c.due > 0 ? Math.round((c.paid / c.due) * 100) : 100;
                      return (
                        <tr key={c.classroom_id}>
                          <td data-label="Class">
                            <span className="cell-name">{c.classroom}</span>
                          </td>
                          <td data-label="Total due" className="text-end">
                            {formatKES(c.due)}
                          </td>
                          <td data-label="Total paid" className="text-end">
                            <span style={{ color: "var(--success-600)" }}>{formatKES(c.paid)}</span>
                          </td>
                          <td data-label="Outstanding" className="text-end">
                            <span className={c.outstanding > 0 ? "text-danger fw-semibold" : "cell-muted"}>
                              {formatKES(c.outstanding)}
                            </span>
                          </td>
                          <td data-label="Collected">
                            <div className="progress-label">
                              <span>{pctCollected}%</span>
                            </div>
                            <div className="progress-track">
                              <div
                                className={`progress-fill ${pctCollected < 50 ? "progress-fill--danger" : pctCollected < 100 ? "progress-fill--gold" : "progress-fill--success"}`}
                                style={{ width: `${Math.min(pctCollected, 100)}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 4-line monthly trend: due / paid / outstanding (money) + invoice count */}
          <div className="chart-card mb-4">
            <div className="chart-card__header">
              <div>
                <div className="chart-card__title">
                  <i className="bi bi-graph-up-arrow me-2" style={{ color: "var(--blue-700)" }}></i>
                  Monthly Trend
                </div>
                <div className="chart-card__subtitle">Invoiced, collected, outstanding, and invoice count per month</div>
              </div>
            </div>
            {data.monthly_trend.months.length === 0 ? (
              <div className="empty-state">
                <i className="bi bi-graph-up"></i>
                <h6>Nothing to show yet</h6>
                <p className="text-muted-soft">No data available for the selected period</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart
                  data={data.monthly_trend.months.map((m, i) => ({
                    label: m,
                    total_due: data.monthly_trend.total_due[i],
                    total_paid: data.monthly_trend.total_paid[i],
                    outstanding: data.monthly_trend.outstanding[i],
                    invoice_count: data.monthly_trend.invoice_count[i],
                  }))}
                  margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid stroke="var(--ink-100)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12, fill: "var(--ink-400)" }}
                    axisLine={{ stroke: "var(--border-color)" }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="money"
                    tick={{ fontSize: 12, fill: "var(--ink-400)" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                    width={44}
                  />
                  <YAxis
                    yAxisId="count"
                    orientation="right"
                    tick={{ fontSize: 12, fill: "var(--ink-400)" }}
                    axisLine={false}
                    tickLine={false}
                    width={32}
                  />
                  <Tooltip content={<TrendTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: "var(--fs-xs)" }}
                    formatter={(value) => <span style={{ color: "var(--ink-700)" }}>{value}</span>}
                  />
                  <Line 
                    yAxisId="money" 
                    type="monotone" 
                    dataKey="total_due" 
                    name="Invoiced" 
                    stroke="var(--blue-700)" 
                    strokeWidth={2.5} 
                    dot={{ r: 3, fill: "var(--blue-700)" }} 
                  />
                  <Line 
                    yAxisId="money" 
                    type="monotone" 
                    dataKey="total_paid" 
                    name="Collected" 
                    stroke="var(--success-600)" 
                    strokeWidth={2.5} 
                    dot={{ r: 3, fill: "var(--success-600)" }} 
                  />
                  <Line 
                    yAxisId="money" 
                    type="monotone" 
                    dataKey="outstanding" 
                    name="Outstanding" 
                    stroke="var(--danger-600)" 
                    strokeWidth={2.5} 
                    dot={{ r: 3, fill: "var(--danger-600)" }} 
                  />
                  <Line 
                    yAxisId="count" 
                    type="monotone" 
                    dataKey="invoice_count" 
                    name="Invoices issued" 
                    stroke="var(--gold-500)" 
                    strokeWidth={2} 
                    strokeDasharray="4 3" 
                    dot={{ r: 3, fill: "var(--gold-500)" }} 
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="row g-4 mb-4">
            {/* Payment method pie */}
            <div className="col-12 col-lg-6">
              <div className="chart-card h-100">
                <div className="chart-card__header">
                  <div>
                    <div className="chart-card__title">
                      <i className="bi bi-pie-chart me-2" style={{ color: "var(--blue-700)" }}></i>
                      Payments by Method
                    </div>
                    <div className="chart-card__subtitle">Amount collected per payment channel</div>
                  </div>
                </div>
                {data.payment_method_breakdown.length === 0 ? (
                  <div className="empty-state">
                    <i className="bi bi-pie-chart"></i>
                    <h6>No payments recorded</h6>
                    <p className="text-muted-soft">Payment data will appear here once available</p>
                  </div>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie
                          data={data.payment_method_breakdown}
                          dataKey="amount"
                          nameKey="method"
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={90}
                          paddingAngle={2}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          labelLine={false}
                        >
                          {data.payment_method_breakdown.map((entry, i) => (
                            <Cell key={entry.method} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<PieTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="chart-legend" style={{ justifyContent: "center" }}>
                      {data.payment_method_breakdown.map((entry, i) => (
                        <div className="chart-legend__item" key={entry.method}>
                          <span
                            className="chart-legend__swatch"
                            style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                          />
                          {entry.method} · {formatKES(entry.amount)}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Gender balance analysis */}
            <div className="col-12 col-lg-6">
              <div className="chart-card h-100">
                <div className="chart-card__header">
                  <div>
                    <div className="chart-card__title">
                      <i className="bi bi-gender-ambiguous me-2" style={{ color: "var(--blue-700)" }}></i>
                      Balances by Gender
                    </div>
                    <div className="chart-card__subtitle">Who's carrying more outstanding fees</div>
                  </div>
                </div>
                {!data.gender_balance_analysis.male && !data.gender_balance_analysis.female ? (
                  <div className="empty-state">
                    <i className="bi bi-people"></i>
                    <h6>No data yet</h6>
                    <p className="text-muted-soft">Gender data will appear here once available</p>
                  </div>
                ) : (
                  <div className="d-flex flex-column gap-3">
                    {["male", "female"].map((key) => {
                      const g = data.gender_balance_analysis[key];
                      if (!g) return null;
                      const isMale = key === "male";
                      return (
                        <div
                          key={key}
                          style={{
                            border: "1px solid var(--border-color)",
                            borderRadius: "var(--radius-md)",
                            padding: "0.9rem 1rem",
                            background: isMale ? "var(--blue-50)" : "var(--gold-100)",
                          }}
                        >
                          <div className="d-flex align-items-center justify-content-between mb-2">
                            <span className="fw-semibold" style={{ color: "var(--ink-900)" }}>
                              <i className={`bi ${isMale ? "bi-gender-male" : "bi-gender-female"} me-2`}></i>
                              {g.label}
                            </span>
                            <span className="badge badge-neutral">{g.invoice_count} invoices</span>
                          </div>
                          <div className="row g-2" style={{ fontSize: "var(--fs-sm)" }}>
                            <div className="col-6">
                              <div className="text-muted-soft" style={{ fontSize: "var(--fs-xs)" }}>Total due</div>
                              <div style={{ fontWeight: 600 }}>{formatKES(g.total_due)}</div>
                            </div>
                            <div className="col-6">
                              <div className="text-muted-soft" style={{ fontSize: "var(--fs-xs)" }}>Total paid</div>
                              <div style={{ fontWeight: 600, color: "var(--success-600)" }}>{formatKES(g.total_paid)}</div>
                            </div>
                            <div className="col-6">
                              <div className="text-muted-soft" style={{ fontSize: "var(--fs-xs)" }}>Outstanding</div>
                              <div className="text-danger fw-semibold">{formatKES(g.total_outstanding)}</div>
                            </div>
                            <div className="col-6">
                              <div className="text-muted-soft" style={{ fontSize: "var(--fs-xs)" }}>Avg. per student</div>
                              <div style={{ fontWeight: 600 }}>{formatKES(g.average_outstanding)}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}