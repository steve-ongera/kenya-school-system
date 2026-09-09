import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import { financeReportsApi } from "../../services/api";
import TableSkeleton from "../../components/TableSkeleton";
import Breadcrumb from "../../components/Breadcrumb";

// Distinct colors per academic year line / pie slice / bar
const PALETTE = ["#4f46e5", "#16a34a", "#f59e0b", "#dc2626", "#0891b2", "#9333ea"];

const currency = (value) =>
  `KES ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const STATUS_BADGE = {
  paid: { className: "badge-success", label: "Fully paid", icon: "bi-check-circle" },
  partial: { className: "badge-warning", label: "Partial", icon: "bi-hourglass-split" },
  unpaid: { className: "badge-danger", label: "Unpaid", icon: "bi-x-circle" },
};

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
      <div style={{ fontWeight: 700, color: "var(--ink-900)", marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color, marginTop: 2 }}>
          {p.name}: {currency(p.value)}
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
      <div style={{ color: "var(--blue-700)" }}>{currency(p.value)}</div>
      <div className="text-muted-soft">{p.payload.count} payment(s)</div>
    </div>
  );
}

export default function FinanceDashboard() {
  const [statCards, setStatCards] = useState(null);
  const [revenueTrend, setRevenueTrend] = useState([]);
  const [yearKeys, setYearKeys] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [classroomPayments, setClassroomPayments] = useState([]);
  const [latestInvoices, setLatestInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data: collections } = await financeReportsApi.collections();
        if (cancelled) return;

        setStatCards(collections.stat_cards);

        const years = [...(collections.academic_years || [])]
          .sort((a, b) => b.year - a.year)
          .slice(0, 5)
          .sort((a, b) => a.year - b.year);

        const perYearTrends = await Promise.all(
          years.map((y) =>
            financeReportsApi
              .collections({ academic_year: y.id })
              .then((res) => ({ year: y.year, monthly_trend: res.data.monthly_trend }))
          )
        );
        if (cancelled) return;

        const monthCount = Math.max(0, ...perYearTrends.map((t) => t.monthly_trend.length));
        const merged = Array.from({ length: monthCount }, (_, i) => {
          const row = { period: perYearTrends[0]?.monthly_trend[i]?.label ?? "" };
          perYearTrends.forEach(({ year, monthly_trend }) => {
            row[year] = monthly_trend[i]?.revenue ?? 0;
          });
          return row;
        });
        setRevenueTrend(merged);
        setYearKeys(years.map((y) => String(y.year)));

        const { data: classAnalysis } = await financeReportsApi.classAnalysis();
        if (cancelled) return;
        setPaymentMethods(classAnalysis.payment_method_breakdown || []);
        setClassroomPayments(classAnalysis.classroom_outstanding || []);

        const { data: detailed } = await financeReportsApi.detailed({ page_size: 10 });
        if (cancelled) return;
        setLatestInvoices(detailed.results ?? detailed);
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.detail || "Failed to load finance dashboard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const statCardConfig = useMemo(
    () => [
      {
        key: "total_collected",
        label: "Total (All Time)",
        icon: "bi-cash-stack",
        format: currency,
      },
      {
        key: "outstanding_balance",
        label: "Outstanding Balance",
        icon: "bi-exclamation-circle",
        format: currency,
      },
      {
        key: "fully_paid_invoices",
        label: "Fully Paid Invoices",
        icon: "bi-check-circle",
        format: (v) => v,
      },
      {
        key: "partially_paid_invoices",
        label: "Partially Paid Invoices",
        icon: "bi-hourglass-split",
        format: (v) => v,
      },
      {
        key: "unpaid_invoices",
        label: "Unpaid Invoices",
        icon: "bi-x-circle",
        format: (v) => v,
      },
    ],
    []
  );

  if (loading) {
    return (
      <div>
        <Breadcrumb items={[
          { label: "Dashboard", href: "/finance" },
          { label: "Overview", href: "#" },
        ]} />
        <div className="page-header">
          <div>
            <h1 className="page-title">Finance Dashboard</h1>
            <p className="page-subtitle">Loading...</p>
          </div>
        </div>
        <div className="row row-cols-1 row-cols-sm-2 row-cols-lg-5 g-3 mb-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div className="col" key={i}>
              <StatCardSkeleton />
            </div>
          ))}
        </div>
        <div className="chart-card mb-4">
          <div className="chart-card__header">
            <div className="skeleton skeleton-text" style={{ width: "200px", height: "20px" }}></div>
          </div>
          <div className="skeleton skeleton-text" style={{ width: "100%", height: "300px" }}></div>
        </div>
        <div className="row g-3 mb-4">
          <div className="col-lg-5">
            <div className="chart-card">
              <div className="chart-card__header">
                <div className="skeleton skeleton-text" style={{ width: "180px", height: "20px" }}></div>
              </div>
              <div className="skeleton skeleton-text" style={{ width: "100%", height: "250px" }}></div>
            </div>
          </div>
          <div className="col-lg-7">
            <div className="chart-card">
              <div className="chart-card__header">
                <div className="skeleton skeleton-text" style={{ width: "180px", height: "20px" }}></div>
              </div>
              <div className="skeleton skeleton-text" style={{ width: "100%", height: "250px" }}></div>
            </div>
          </div>
        </div>
        <div className="table-wrap">
          <div className="table-wrap__header">
            <div className="skeleton skeleton-text" style={{ width: "150px", height: "20px" }}></div>
          </div>
          <TableSkeleton rows={5} columns={8} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Breadcrumb items={[
          { label: "Dashboard", href: "/finance" },
          { label: "Overview", href: "#" },
        ]} />
        <div className="alert alert-danger">{error}</div>
      </div>
    );
  }

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: "Dashboard", href: "/finance" },
        { label: "Overview", href: "#" },
      ]} />

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Finance Dashboard</h1>
          <p className="page-subtitle">
            Overview of school finances, collections, and payment trends
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn btn-outline-primary btn-sm">
            <i className="bi bi-download me-1"></i>Export
          </button>
          <button className="btn btn-primary btn-sm">
            <i className="bi bi-printer me-1"></i>Print
          </button>
        </div>
      </div>

      {/* 5 Stat Cards */}
      <div className="row row-cols-1 row-cols-sm-2 row-cols-lg-5 g-3 mb-4">
        {statCardConfig.map((cfg) => {
          const value = statCards?.[cfg.key];
          const variant = 
            cfg.key === "outstanding_balance" ? "danger" :
            cfg.key === "fully_paid_invoices" ? "success" :
            cfg.key === "partially_paid_invoices" ? "gold" :
            cfg.key === "unpaid_invoices" ? "danger" : "";
          
          const variantClass = variant ? `stat-card--${variant}` : "";
          
          return (
            <div className="col" key={cfg.key}>
              <div className={`stat-card ${variantClass}`}>
                <i className={`bi ${cfg.icon}`}></i>
                <div>
                  <div className="stat-card__value">{cfg.format(value)}</div>
                  <div className="stat-card__label">{cfg.label}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Multi-year Revenue Trend */}
      <div className="chart-card mb-4">
        <div className="chart-card__header">
          <div>
            <div className="chart-card__title">
              <i className="bi bi-graph-up-arrow me-2" style={{ color: "var(--blue-700)" }}></i>
              Revenue by Month, Across Academic Years
            </div>
            <div className="chart-card__subtitle">Monthly collection trends compared across years</div>
          </div>
        </div>
        {revenueTrend.length === 0 ? (
          <div className="empty-state">
            <i className="bi bi-graph-up"></i>
            <h6>No revenue data</h6>
            <p className="text-muted-soft">No revenue data available for the selected years.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={revenueTrend}>
              <CartesianGrid stroke="var(--ink-100)" vertical={false} />
              <XAxis 
                dataKey="period" 
                tick={{ fontSize: 12, fill: "var(--ink-400)" }}
                axisLine={{ stroke: "var(--border-color)" }}
                tickLine={false}
              />
              <YAxis 
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 12, fill: "var(--ink-400)" }}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <Tooltip 
                content={<CustomTooltip />}
                contentStyle={{ 
                  borderRadius: "var(--radius-md)", 
                  border: "1px solid var(--border-color)",
                  boxShadow: "var(--shadow-sm)"
                }}
              />
              <Legend 
                wrapperStyle={{ fontSize: "var(--fs-xs)" }}
                formatter={(value) => <span style={{ color: "var(--ink-700)" }}>{value}</span>}
              />
              {yearKeys.map((year, idx) => (
                <Line
                  key={year}
                  type="monotone"
                  dataKey={year}
                  name={year}
                  stroke={PALETTE[idx % PALETTE.length]}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="row g-3 mb-4">
        {/* Payment Method Pie Chart */}
        <div className="col-lg-5">
          <div className="chart-card h-100">
            <div className="chart-card__header">
              <div>
                <div className="chart-card__title">
                  <i className="bi bi-pie-chart me-2" style={{ color: "var(--blue-700)" }}></i>
                  Payment Methods
                </div>
                <div className="chart-card__subtitle">Current academic year</div>
              </div>
            </div>
            {paymentMethods.length === 0 ? (
              <div className="empty-state">
                <i className="bi bi-pie-chart"></i>
                <h6>No payment data</h6>
                <p className="text-muted-soft">No payments recorded for this academic year.</p>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={paymentMethods}
                      dataKey="amount"
                      nameKey="method"
                      outerRadius={100}
                      innerRadius={55}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                      paddingAngle={2}
                    >
                      {paymentMethods.map((entry, idx) => (
                        <Cell key={entry.method} fill={PALETTE[idx % PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                    <Legend 
                      iconType="circle"
                      wrapperStyle={{ fontSize: "var(--fs-xs)" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </>
            )}
          </div>
        </div>

        {/* Classroom Payment Bar Chart */}
        <div className="col-lg-7">
          <div className="chart-card h-100">
            <div className="chart-card__header">
              <div>
                <div className="chart-card__title">
                  <i className="bi bi-building me-2" style={{ color: "var(--blue-700)" }}></i>
                  Fees Due vs Paid by Class
                </div>
                <div className="chart-card__subtitle">Current academic year</div>
              </div>
            </div>
            {classroomPayments.length === 0 ? (
              <div className="empty-state">
                <i className="bi bi-bar-chart"></i>
                <h6>No class data</h6>
                <p className="text-muted-soft">No classroom fee data available for this academic year.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={classroomPayments}>
                  <CartesianGrid stroke="var(--ink-100)" vertical={false} />
                  <XAxis 
                    dataKey="classroom" 
                    angle={-30} 
                    textAnchor="end" 
                    interval={0} 
                    height={70}
                    tick={{ fontSize: 11, fill: "var(--ink-400)" }}
                    axisLine={{ stroke: "var(--border-color)" }}
                    tickLine={false}
                  />
                  <YAxis 
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 12, fill: "var(--ink-400)" }}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                  />
                  <Tooltip 
                    formatter={(value) => currency(value)}
                    contentStyle={{ 
                      borderRadius: "var(--radius-md)", 
                      border: "1px solid var(--border-color)",
                      boxShadow: "var(--shadow-sm)"
                    }}
                  />
                  <Legend 
                    wrapperStyle={{ fontSize: "var(--fs-xs)" }}
                    formatter={(value) => <span style={{ color: "var(--ink-700)" }}>{value}</span>}
                  />
                  <Bar dataKey="due" name="Due" fill={PALETTE[0]} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="paid" name="Paid" fill={PALETTE[1]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Latest Invoices Table */}
      <div className="table-wrap">
        <div className="table-wrap__header">
          <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
            <i className="bi bi-receipt me-2" style={{ color: "var(--blue-700)" }}></i>
            Latest Invoices
          </span>
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
            {latestInvoices.length} recent invoice{latestInvoices.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th>Admission No</th>
                <th>Student</th>
                <th>Classroom</th>
                <th>Term</th>
                <th className="text-end">Due</th>
                <th className="text-end">Paid</th>
                <th className="text-end">Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {latestInvoices.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-muted-soft py-3">
                    <i className="bi bi-inbox me-2"></i>
                    No invoices found.
                  </td>
                </tr>
              )}
              {latestInvoices.map((inv) => {
                const badge = STATUS_BADGE[inv.status] || STATUS_BADGE.unpaid;
                return (
                  <tr key={inv.id}>
                    <td>
                      <span style={{ fontWeight: 600, color: "var(--blue-700)", fontSize: "var(--fs-sm)" }}>
                        {inv.admission_no}
                      </span>
                    </td>
                    <td className="cell-name">{inv.student_name}</td>
                    <td>
                      <span className="badge badge-neutral">{inv.classroom}</span>
                    </td>
                    <td>{inv.term}</td>
                    <td className="text-end">{currency(inv.due)}</td>
                    <td className="text-end" style={{ color: "var(--success-600)" }}>
                      {currency(inv.paid)}
                    </td>
                    <td className="text-end">
                      <span className={inv.balance > 0 ? "text-danger fw-semibold" : "cell-muted"}>
                        {currency(inv.balance)}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${badge.className}`}>
                        <i className={`bi ${badge.icon} me-1`}></i>
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}