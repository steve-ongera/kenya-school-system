import { useEffect, useMemo, useState } from "react";
import { financeApi, calendarApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";
import Pagination from "../../components/Pagination";

const currency = (value) => Number(value || 0).toLocaleString();

const STATUS_CONFIG = {
  paid: { label: "Fully Paid", className: "badge-success", icon: "bi-check-circle" },
  partial: { label: "Partial", className: "badge-warning", icon: "bi-hourglass-split" },
  unpaid: { label: "Unpaid", className: "badge-danger", icon: "bi-x-circle" },
};

function getStatus(inv) {
  const due = Number(inv.amount_due);
  const paid = Number(inv.amount_paid);
  if (paid >= due) return STATUS_CONFIG.paid;
  if (paid > 0) return STATUS_CONFIG.partial;
  return STATUS_CONFIG.unpaid;
}

export default function FinanceInvoices() {
  const [academicYears, setAcademicYears] = useState([]);
  const [academicYear, setAcademicYear] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [invoices, setInvoices] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    calendarApi.academicYears().then(({ data }) => {
      const years = data.results ?? data;
      setAcademicYears(years);
      const current = years.find((y) => y.is_current);
      if (current) setAcademicYear(String(current.id));
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const params = useMemo(() => {
    const p = { page_size: itemsPerPage };
    if (academicYear) p.enrollment__academic_year = academicYear;
    if (debouncedSearch) p.search = debouncedSearch;
    return p;
  }, [academicYear, debouncedSearch, itemsPerPage]);

  const loadInvoices = async (targetPage = 1) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await financeApi.invoices({ ...params, page: targetPage });
      setInvoices(data.results ?? data);
      setCount(data.count ?? (data.results ?? data).length);
      setPage(targetPage);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not load invoices.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const totalPages = Math.max(1, Math.ceil(count / itemsPerPage));

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    loadInvoices(newPage);
  };

  const clearFilters = () => {
    setAcademicYear("");
    setSearch("");
    setDebouncedSearch("");
    setPage(1);
  };

  // Check if any filters are active
  const hasActiveFilters = academicYear || search;

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: "Dashboard", href: "/finance" },
        { label: "Invoices", href: "/finance/invoices" },
        { label: "All Invoices", href: "#" },
      ]} />

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="page-subtitle">
            Invoices are generated automatically by the billing engine each term. This view is for browsing and
            searching what's already in the system.
          </p>
        </div>
        <span className="badge badge-neutral" style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem" }}>
          <i className="bi bi-receipt me-1"></i>
          {count} invoice{count !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Error Message */}
      {error && (
        <div className="alert alert-danger alert-dismissible fade show" role="alert">
          <i className="bi bi-exclamation-circle me-2"></i>
          {error}
          <button type="button" className="btn-close" onClick={() => setError(null)}></button>
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 mb-4">
        <h6 className="mb-3" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
          <i className="bi bi-funnel me-2" style={{ color: "var(--blue-700)" }}></i>
          Filter Invoices
        </h6>
        <div className="row g-3 align-items-end">
          <div className="col-md-3">
            <label className="form-label">
              <i className="bi bi-calendar3 me-1" style={{ color: "var(--blue-700)" }}></i>
              Academic Year
            </label>
            <select 
              className="form-select" 
              value={academicYear} 
              onChange={(e) => setAcademicYear(e.target.value)}
            >
              <option value="">All</option>
              {academicYears.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.year}
                  {y.is_current ? " (current)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label">
              <i className="bi bi-search me-1" style={{ color: "var(--blue-700)" }}></i>
              Search Student
            </label>
            <input
              className="form-control"
              placeholder="Admission no. or student name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="col-md-3">
            <button
              className="btn btn-outline-secondary w-100"
              type="button"
              onClick={clearFilters}
            >
              <i className="bi bi-arrow-counterclockwise me-1"></i>
              Clear Filters
            </button>
          </div>
        </div>

        {/* Active filter chips */}
        {hasActiveFilters && (
          <div className="d-flex flex-wrap gap-1 mt-3">
            {academicYear && (
              <span className="filter-chip">
                Year: {academicYears.find(y => String(y.id) === String(academicYear))?.year}
                <button onClick={() => setAcademicYear("")}><i className="bi bi-x"></i></button>
              </span>
            )}
            {search && (
              <span className="filter-chip">
                Search: "{search}"
                <button onClick={() => setSearch("")}><i className="bi bi-x"></i></button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Invoices Table */}
      <div className="table-wrap">
        <div className="table-wrap__header">
          <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
            <i className="bi bi-list-ul me-2" style={{ color: "var(--blue-700)" }}></i>
            All Invoices
          </span>
          {!loading && invoices.length > 0 && (
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
              Showing {(page - 1) * itemsPerPage + 1} - {Math.min(page * itemsPerPage, count)} of {count}
            </span>
          )}
        </div>

        {loading ? (
          <TableSkeleton rows={5} columns={8} />
        ) : invoices.length === 0 ? (
          <div className="empty-state">
            <i className="bi bi-receipt"></i>
            <h6>No invoices found</h6>
            <p className="text-muted-soft">
              {hasActiveFilters 
                ? "No invoices match your filters. Try adjusting your search criteria." 
                : "No invoices have been generated yet."}
            </p>
          </div>
        ) : (
          <>
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th>Admission No</th>
                    <th>Student</th>
                    <th>Grade</th>
                    <th>Term</th>
                    <th className="text-end">Due (KES)</th>
                    <th className="text-end">Paid (KES)</th>
                    <th className="text-end">Balance (KES)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const status = getStatus(inv);
                    return (
                      <tr key={inv.id}>
                        <td>
                          <span style={{ fontWeight: 600, color: "var(--blue-700)", fontSize: "var(--fs-sm)" }}>
                            {inv.admission_no}
                          </span>
                        </td>
                        <td className="cell-name">{inv.student_name}</td>
                        <td>
                          <span className="badge badge-blue">{inv.grade_level_name}</span>
                        </td>
                        <td>
                          <span className="badge badge-neutral">{inv.term_label}</span>
                        </td>
                        <td className="text-end">{currency(inv.amount_due)}</td>
                        <td className="text-end" style={{ color: "var(--success-600)" }}>
                          {currency(inv.amount_paid)}
                        </td>
                        <td className={`text-end fw-bold ${inv.balance > 0 ? "text-danger" : "text-success"}`}>
                          {currency(inv.balance)}
                        </td>
                        <td>
                          <span className={`badge ${status.className}`}>
                            <i className={`bi ${status.icon} me-1`}></i>
                            {status.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={handlePageChange}
              itemsPerPage={itemsPerPage}
              setItemsPerPage={setItemsPerPage}
              startIndex={(page - 1) * itemsPerPage}
              endIndex={Math.min(page * itemsPerPage, count)}
              totalItems={count}
            />
          </>
        )}
      </div>
    </div>
  );
}