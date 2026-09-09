// pages/finance/DetailedReport.jsx
import { useEffect, useRef, useState } from "react";
import { financeReportsApi, calendarApi, academicsApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";
import Pagination from "../../components/Pagination";

const formatKES = (n) =>
  `KES ${Number(n || 0).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;

const STATUS_BADGE = {
  paid: { className: "badge-success", label: "Fully paid", icon: "bi-check-circle" },
  partial: { className: "badge-warning", label: "Partial", icon: "bi-hourglass-split" },
  unpaid: { className: "badge-danger", label: "Unpaid", icon: "bi-x-circle" },
};

/**
 * Finance - Page 3 of the finance reports suite: the drill-down. A
 * filterable, paginated invoice table (academic year tabs + term /
 * classroom / status / search filters), alongside a per-term summary
 * and a top-10 debtors list so finance can go from "who owes what"
 * straight to a specific invoice.
 */
export default function FinanceDetailedReport() {
  const [academicYears, setAcademicYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState(null);

  const [terms, setTerms] = useState([]);
  const [classrooms, setClassrooms] = useState([]);

  const [termFilter, setTermFilter] = useState("");
  const [classroomFilter, setClassroomFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const initialLoad = useRef(true);
  const searchDebounce = useRef(null);

  // Debounce the search box - wait 400ms after typing stops before it
  // becomes the value that actually drives a fetch.
  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(searchDebounce.current);
  }, [searchInput]);

  // Initial load: no academic_year param, backend picks the current one.
  useEffect(() => {
    setLoading(true);
    financeReportsApi
      .detailed()
      .then(({ data: res }) => {
        setResult(res);
        setAcademicYears(res.academic_years);
        setSelectedYear(res.selected_academic_year);
      })
      .catch(() => setError("Could not load the detailed report."))
      .finally(() => {
        setLoading(false);
        initialLoad.current = false;
      });
  }, []);

  // Term/classroom dropdown options depend on the selected academic year.
  useEffect(() => {
    if (!selectedYear) return;
    calendarApi.terms({ academic_year: selectedYear }).then(({ data }) => setTerms(data.results || data));
    academicsApi
      .classrooms({ academic_year: selectedYear, page_size: 200 })
      .then(({ data }) => setClassrooms(data.results || data));
  }, [selectedYear]);

  // Re-fetch whenever any filter (or page) changes, skipping the very
  // first render since that fetch already happened above.
  useEffect(() => {
    if (initialLoad.current) return;
    setLoading(true);
    setError(null);
    financeReportsApi
      .detailed({
        academic_year: selectedYear || undefined,
        term: termFilter || undefined,
        classroom: classroomFilter || undefined,
        status: statusFilter || undefined,
        search: search || undefined,
        page,
        page_size: itemsPerPage,
      })
      .then(({ data: res }) => setResult(res))
      .catch(() => setError("Could not load the detailed report."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, termFilter, classroomFilter, statusFilter, search, page, itemsPerPage]);

  const handleTabClick = (yearId) => {
    if (yearId === selectedYear) return;
    setSelectedYear(yearId);
    setTermFilter("");
    setClassroomFilter("");
    setPage(1);
  };

  const rows = result?.results || [];
  const count = result?.count ?? 0;
  const pageSize = itemsPerPage;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    setPage(newPage);
  };

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setTermFilter("");
    setClassroomFilter("");
    setStatusFilter("");
    setPage(1);
  };

  // Check if any filters are active
  const hasActiveFilters = searchInput || termFilter || classroomFilter || statusFilter;

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: "Dashboard", href: "/finance" },
        { label: "Reports", href: "/finance/reports" },
        { label: "Detailed Report", href: "#" },
      ]} />

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Detailed Report</h1>
          <p className="page-subtitle">
            Every invoice, filterable by term, class, and payment status.
          </p>
        </div>
        {academicYears.length > 0 && (
          <ul className="nav nav-pills" style={{ marginBottom: 0 }}>
            {academicYears.map((ay) => (
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

      {error && (
        <div className="alert alert-danger alert-dismissible fade show" role="alert">
          <i className="bi bi-exclamation-circle me-2"></i>
          {error}
          <button type="button" className="btn-close" onClick={() => setError(null)}></button>
        </div>
      )}

      {/* Term Summary + Top Debtors */}
      <div className="row g-4 mb-4">
        <div className="col-12 col-lg-6">
          <div className="table-wrap h-100">
            <div className="table-wrap__header">
              <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                <i className="bi bi-calendar3 me-2" style={{ color: "var(--blue-700)" }}></i>
                Term Summary
              </span>
              {result?.term_summary?.length > 0 && (
                <span className="badge badge-neutral">{result.term_summary.length} terms</span>
              )}
            </div>
            {!result?.term_summary?.length ? (
              <div className="empty-state">
                <i className="bi bi-calendar3"></i>
                <h6>No term data</h6>
                <p className="text-muted-soft">No term data for this academic year yet.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead>
                    <tr>
                      <th>Term</th>
                      <th className="text-end">Due</th>
                      <th className="text-end">Paid</th>
                      <th className="text-end">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.term_summary.map((t) => (
                      <tr key={t.term}>
                        <td data-label="Term" className="cell-name">{t.term}</td>
                        <td data-label="Due" className="text-end">{formatKES(t.due)}</td>
                        <td data-label="Paid" className="text-end" style={{ color: "var(--success-600)" }}>
                          {formatKES(t.paid)}
                        </td>
                        <td data-label="Outstanding" className="text-end">
                          <span className={t.outstanding > 0 ? "text-danger fw-semibold" : "cell-muted"}>
                            {formatKES(t.outstanding)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="col-12 col-lg-6">
          <div className="table-wrap h-100">
            <div className="table-wrap__header">
              <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                <i className="bi bi-trophy me-2" style={{ color: "var(--gold-500)" }}></i>
                Top 10 Debtors
              </span>
              {result?.top_debtors?.length > 0 && (
                <span className="badge badge-danger">{result.top_debtors.length} owing</span>
              )}
            </div>
            {!result?.top_debtors?.length ? (
              <div className="empty-state">
                <i className="bi bi-emoji-smile" style={{ color: "var(--success-600)" }}></i>
                <h6>All paid up!</h6>
                <p className="text-muted-soft">No outstanding balances - everyone's paid up.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Class</th>
                      <th className="text-end">Owing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.top_debtors.map((d) => (
                      <tr key={d.admission_no}>
                        <td data-label="Student">
                          <div className="cell-name">{d.name}</div>
                          <div className="cell-muted" style={{ fontSize: "var(--fs-xs)" }}>
                            <i className="bi bi-hash me-1"></i>
                            {d.admission_no}
                          </div>
                        </td>
                        <td data-label="Class">
                          <span className="badge badge-neutral">{d.classroom}</span>
                        </td>
                        <td data-label="Owing" className="text-end">
                          <span className="text-danger fw-semibold">{formatKES(d.outstanding)}</span>
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

      {/* Filterable, paginated invoice table */}
      <div className="table-wrap">
        <div className="table-wrap__header" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.75rem" }}>
          {/* Filters */}
          <div className="d-flex flex-wrap gap-2" style={{ width: "100%" }}>
            <div style={{ flex: 1, minWidth: "200px", position: "relative" }}>
              <i className="bi bi-search" style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--ink-400)" }}></i>
              <input
                type="text"
                className="form-control"
                placeholder="Search name or admission no…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                style={{ paddingLeft: "2.4rem" }}
              />
            </div>

            <select
              className="form-select"
              value={termFilter}
              onChange={(e) => {
                setTermFilter(e.target.value);
                setPage(1);
              }}
              style={{ width: "auto", minWidth: "130px" }}
            >
              <option value="">All terms</option>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.term_number ? `Term ${t.term_number}` : `Term ${t.id}`}
                </option>
              ))}
            </select>

            <select
              className="form-select"
              value={classroomFilter}
              onChange={(e) => {
                setClassroomFilter(e.target.value);
                setPage(1);
              }}
              style={{ width: "auto", minWidth: "140px" }}
            >
              <option value="">All classes</option>
              {classrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.grade_level_name} {c.stream_name}
                </option>
              ))}
            </select>

            <select
              className="form-select"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              style={{ width: "auto", minWidth: "130px" }}
            >
              <option value="">All statuses</option>
              <option value="paid">Fully paid</option>
              <option value="partial">Partial</option>
              <option value="unpaid">Unpaid</option>
            </select>

            {hasActiveFilters && (
              <button className="btn btn-sm btn-light" onClick={clearFilters}>
                <i className="bi bi-x-lg"></i> Clear
              </button>
            )}

            <div className="toolbar__spacer" />

            {result?.summary && !loading && (
              <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)", whiteSpace: "nowrap" }}>
                <span style={{ fontWeight: 600, color: "var(--ink-700)" }}>
                  {count}
                </span> invoice{count === 1 ? "" : "s"} · 
                <span style={{ color: "var(--danger-600)", fontWeight: 600 }}>
                  {formatKES(result.summary.total_outstanding)}
                </span> outstanding
              </div>
            )}
          </div>

          {/* Active filter chips */}
          {hasActiveFilters && (
            <div className="d-flex flex-wrap gap-1">
              {searchInput && (
                <span className="filter-chip">
                  Search: "{searchInput}"
                  <button onClick={() => setSearchInput("")}><i className="bi bi-x"></i></button>
                </span>
              )}
              {termFilter && (
                <span className="filter-chip">
                  Term: {terms.find(t => String(t.id) === String(termFilter))?.term_number || termFilter}
                  <button onClick={() => setTermFilter("")}><i className="bi bi-x"></i></button>
                </span>
              )}
              {classroomFilter && (
                <span className="filter-chip">
                  Class: {classrooms.find(c => String(c.id) === String(classroomFilter))?.grade_level_name || classroomFilter}
                  <button onClick={() => setClassroomFilter("")}><i className="bi bi-x"></i></button>
                </span>
              )}
              {statusFilter && (
                <span className="filter-chip">
                  Status: {statusFilter === "paid" ? "Fully paid" : statusFilter === "partial" ? "Partial" : "Unpaid"}
                  <button onClick={() => setStatusFilter("")}><i className="bi bi-x"></i></button>
                </span>
              )}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
            <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
              <i className="bi bi-receipt me-2"></i>
              Invoices
            </span>
            {!loading && rows.length > 0 && (
              <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
                Showing {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, count)} of {count}
              </span>
            )}
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={5} columns={8} />
        ) : rows.length === 0 ? (
          <div className="empty-state">
            <i className="bi bi-inbox"></i>
            <h6>No invoices found</h6>
            <p className="text-muted-soft">No invoices match these filters. Try adjusting your search criteria.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Admission No</th>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Term</th>
                  <th className="text-end">Due</th>
                  <th className="text-end">Paid</th>
                  <th className="text-end">Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((inv) => {
                  const badge = STATUS_BADGE[inv.status] || STATUS_BADGE.unpaid;
                  return (
                    <tr key={inv.id}>
                      <td data-label="Admission No">
                        <span style={{ fontWeight: 600, color: "var(--blue-700)", fontSize: "var(--fs-sm)" }}>
                          {inv.admission_no}
                        </span>
                      </td>
                      <td data-label="Student" className="cell-name">{inv.student_name}</td>
                      <td data-label="Class">
                        <span className="badge badge-neutral">{inv.classroom}</span>
                      </td>
                      <td data-label="Term">{inv.term}</td>
                      <td data-label="Due" className="text-end">{formatKES(inv.due)}</td>
                      <td data-label="Paid" className="text-end" style={{ color: "var(--success-600)" }}>
                        {formatKES(inv.paid)}
                      </td>
                      <td data-label="Balance" className="text-end">
                        <span className={inv.balance > 0 ? "text-danger fw-semibold" : "cell-muted"}>
                          {formatKES(inv.balance)}
                        </span>
                      </td>
                      <td data-label="Status">
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
        )}

        {!loading && rows.length > 0 && (
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            itemsPerPage={itemsPerPage}
            setItemsPerPage={setItemsPerPage}
            startIndex={(page - 1) * pageSize}
            endIndex={Math.min(page * pageSize, count)}
            totalItems={count}
          />
        )}
      </div>
    </div>
  );
}