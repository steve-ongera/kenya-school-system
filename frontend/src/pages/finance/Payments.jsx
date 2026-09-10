import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { financeApi, calendarApi, academicsApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";
import Pagination from "../../components/Pagination";

const currency = (value) => Number(value || 0).toLocaleString();

const METHOD_LABEL = {
  MPESA: "M-Pesa",
  BANK: "Bank",
  CASH: "Cash",
  CHEQUE: "Cheque",
};

const METHOD_BADGE = {
  MPESA: "badge-success",
  BANK: "badge-blue",
  CASH: "badge-gold",
  CHEQUE: "badge-neutral",
};

const METHOD_ICON = {
  MPESA: "bi-phone",
  BANK: "bi-building",
  CASH: "bi-cash",
  CHEQUE: "bi-file-text",
};

export default function FinancePayments() {
  // ---- record-payment form ----
  const [invoices, setInvoices] = useState([]);
  const [form, setForm] = useState({ invoice: "", amount: "", method: "MPESA", reference: "" });
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");

  const loadInvoices = async () => {
    const { data } = await financeApi.invoices();
    setInvoices((data.results ?? data).filter((i) => i.balance > 0));
  };

  useEffect(() => {
    loadInvoices();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setMessage("");
    setMessageType("info");
    try {
      await financeApi.recordPayment(form);
      setForm({ invoice: "", amount: "", method: "MPESA", reference: "" });
      loadInvoices();
      loadPayments(1);
      setMessage(" Payment recorded successfully.");
      setMessageType("success");
    } catch (err) {
      setMessage(err.response?.data ? JSON.stringify(err.response.data) : "Could not record payment.");
      setMessageType("danger");
    }
  };

  // ---- filter dropdown options ----
  const [academicYears, setAcademicYears] = useState([]);
  const [gradeLevels, setGradeLevels] = useState([]);
  const [streams, setStreams] = useState([]);
  const [terms, setTerms] = useState([]);

  useEffect(() => {
    calendarApi.academicYears().then(({ data }) => setAcademicYears(data.results ?? data));
    academicsApi.gradeLevels().then(({ data }) => setGradeLevels(data.results ?? data));
    academicsApi.streams().then(({ data }) => setStreams(data.results ?? data));
    calendarApi.terms().then(({ data }) => setTerms(data.results ?? data));
  }, []);

  // ---- payments list: filters, search, pagination ----
  const [filters, setFilters] = useState({
    invoice__enrollment__academic_year: "",
    invoice__enrollment__classroom__grade_level: "",
    invoice__enrollment__classroom__stream: "",
    invoice__fee_structure__term: "",
    method: "",
  });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [payments, setPayments] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [listLoading, setListLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // debounce the search box
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const activeParams = useMemo(() => {
    const params = { page_size: pageSize };
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params[key] = value;
    });
    if (debouncedSearch) params.search = debouncedSearch;
    return params;
  }, [filters, debouncedSearch]);

  const loadPayments = async (targetPage = page) => {
    setListLoading(true);
    try {
      const { data } = await financeApi.payments({ ...activeParams, page: targetPage });
      setPayments(data.results ?? data);
      setCount(data.count ?? (data.results ?? data).length);
      setPage(targetPage);
    } catch (error) {
      console.error("Failed to load payments:", error);
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    loadPayments(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeParams]);

  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  const updateFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

  const clearFilters = () => {
    setFilters({
      invoice__enrollment__academic_year: "",
      invoice__enrollment__classroom__grade_level: "",
      invoice__enrollment__classroom__stream: "",
      invoice__fee_structure__term: "",
      method: "",
    });
    setSearch("");
    setDebouncedSearch("");
  };

  // Check if any filters are active
  const hasActiveFilters = 
    filters.invoice__enrollment__academic_year ||
    filters.invoice__enrollment__classroom__grade_level ||
    filters.invoice__enrollment__classroom__stream ||
    filters.invoice__fee_structure__term ||
    filters.method ||
    search;

  // ---- Excel export ----
  const downloadExcel = async () => {
    setExporting(true);
    try {
      const { data } = await financeApi.payments({ ...activeParams, page_size: 5000, page: 1 });
      const rows = data.results ?? data;

      const sheetData = rows.map((p) => ({
        "Date Paid": p.paid_at ? new Date(p.paid_at).toLocaleString() : "",
        "Admission No": p.admission_no,
        "Student Name": p.student_name,
        "Student Phone": p.student_phone,
        "Guardian Name": p.guardian_name || "",
        "Guardian Phone": p.guardian_phone || "",
        "Classroom": p.classroom,
        "Academic Year": p.academic_year,
        "Term": p.term,
        "Amount (KES)": Number(p.amount),
        "Method": METHOD_LABEL[p.method] || p.method,
        "Reference": p.reference || "",
        "Receipt No": p.receipt_no || "",
        "Recorded By": p.recorded_by_name,
      }));

      const worksheet = XLSX.utils.json_to_sheet(sheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Payments");

      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `payments_${stamp}.xlsx`);
    } catch (error) {
      console.error("Failed to export:", error);
    } finally {
      setExporting(false);
    }
  };

  // Get selected invoice details for display
  const selectedInvoice = invoices.find(inv => String(inv.id) === String(form.invoice));

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: "Dashboard", href: "/finance" },
        { label: "Payments", href: "/finance/payments" },
        { label: "All Payments", href: "#" },
      ]} />

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="page-subtitle">
            Record and manage all fee payments made by students
          </p>
        </div>
        <span className="badge badge-neutral" style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem" }}>
          <i className="bi bi-cash-stack me-1"></i>
          {count} payments
        </span>
      </div>

      {/* Messages */}
      {message && (
        <div className={`alert alert-${messageType} alert-dismissible fade show`} role="alert">
          {message}
          <button type="button" className="btn-close" onClick={() => setMessage("")}></button>
        </div>
      )}

      {/* Record Payment Form */}
      <div className="card p-4 mb-4">
        <h6 className="mb-3" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
          <i className="bi bi-plus-circle me-2" style={{ color: "var(--blue-700)" }}></i>
          Record Payment
        </h6>
        <form onSubmit={submit}>
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label">
                <i className="bi bi-receipt me-1" style={{ color: "var(--blue-700)" }}></i>
                Invoice (outstanding balance)
              </label>
              <select
                className="form-select"
                required
                value={form.invoice}
                onChange={(e) => setForm({ ...form, invoice: e.target.value })}
              >
                <option value="">Select...</option>
                {invoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.admission_no} - {inv.student_name} (Bal: KES {currency(inv.balance)})
                  </option>
                ))}
              </select>
              {invoices.length === 0 && (
                <div className="form-text-hint">
                  <i className="bi bi-info-circle me-1"></i>
                  No outstanding invoices available.
                </div>
              )}
            </div>
            <div className="col-md-2">
              <label className="form-label">
                <i className="bi bi-currency-dollar me-1" style={{ color: "var(--blue-700)" }}></i>
                Amount (KES)
              </label>
              <input
                type="number"
                className="form-control"
                required
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0.00"
                min="1"
                step="1"
              />
              {selectedInvoice && (
                <div className="form-text-hint">
                  Max: KES {currency(selectedInvoice.balance)}
                </div>
              )}
            </div>
            <div className="col-md-2">
              <label className="form-label">
                <i className="bi bi-credit-card me-1" style={{ color: "var(--blue-700)" }}></i>
                Method
              </label>
              <select
                className="form-select"
                value={form.method}
                onChange={(e) => setForm({ ...form, method: e.target.value })}
              >
                <option value="MPESA">M-Pesa</option>
                <option value="BANK">Bank</option>
                <option value="CASH">Cash</option>
                <option value="CHEQUE">Cheque</option>
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">
                <i className="bi bi-hash me-1" style={{ color: "var(--blue-700)" }}></i>
                Reference
              </label>
              <input
                className="form-control"
                placeholder="M-Pesa code / receipt no."
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
              />
            </div>
            <div className="col-md-1 d-flex align-items-end">
              <button className="btn btn-primary w-100" type="submit" style={{ height: "38px" }}>
                <i className="bi bi-save me-1"></i>Save
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Filters + Search + Export */}
      <div className="card p-4 mb-4">
        <h6 className="mb-3" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
          <i className="bi bi-funnel me-2" style={{ color: "var(--blue-700)" }}></i>
          Filter Payments
        </h6>
        <div className="row g-3">
          <div className="col-md-2">
            <label className="form-label">Academic Year</label>
            <select
              className="form-select"
              value={filters.invoice__enrollment__academic_year}
              onChange={(e) => updateFilter("invoice__enrollment__academic_year", e.target.value)}
            >
              <option value="">All</option>
              {academicYears.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.year}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-2">
            <label className="form-label">Grade</label>
            <select
              className="form-select"
              value={filters.invoice__enrollment__classroom__grade_level}
              onChange={(e) => updateFilter("invoice__enrollment__classroom__grade_level", e.target.value)}
            >
              <option value="">All</option>
              {gradeLevels.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-2">
            <label className="form-label">Stream</label>
            <select
              className="form-select"
              value={filters.invoice__enrollment__classroom__stream}
              onChange={(e) => updateFilter("invoice__enrollment__classroom__stream", e.target.value)}
            >
              <option value="">All</option>
              {streams.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-2">
            <label className="form-label">Term</label>
            <select
              className="form-select"
              value={filters.invoice__fee_structure__term}
              onChange={(e) => updateFilter("invoice__fee_structure__term", e.target.value)}
            >
              <option value="">All</option>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.term_number ? `Term ${t.term_number}` : `Term #${t.id}`}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-2">
            <label className="form-label">Method</label>
            <select
              className="form-select"
              value={filters.method}
              onChange={(e) => updateFilter("method", e.target.value)}
            >
              <option value="">All</option>
              <option value="MPESA">M-Pesa</option>
              <option value="BANK">Bank</option>
              <option value="CASH">Cash</option>
              <option value="CHEQUE">Cheque</option>
            </select>
          </div>
          <div className="col-md-2 d-flex align-items-end">
            <button className="btn btn-outline-secondary w-100" onClick={clearFilters} type="button">
              <i className="bi bi-arrow-counterclockwise me-1"></i>
              Clear Filters
            </button>
          </div>

          <div className="col-md-8">
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
          <div className="col-md-4 d-flex align-items-end">
            <button
              className="btn btn-success w-100"
              onClick={downloadExcel}
              disabled={exporting}
              type="button"
            >
              {exporting ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  Preparing...
                </>
              ) : (
                <>
                  <i className="bi bi-file-earmark-excel me-2"></i>
                  Download Excel
                </>
              )}
            </button>
          </div>
        </div>

        {/* Active filter chips */}
        {hasActiveFilters && (
          <div className="d-flex flex-wrap gap-1 mt-3">
            {filters.invoice__enrollment__academic_year && (
              <span className="filter-chip">
                Year: {academicYears.find(y => String(y.id) === String(filters.invoice__enrollment__academic_year))?.year}
                <button onClick={() => updateFilter("invoice__enrollment__academic_year", "")}><i className="bi bi-x"></i></button>
              </span>
            )}
            {filters.invoice__enrollment__classroom__grade_level && (
              <span className="filter-chip">
                Grade: {gradeLevels.find(g => String(g.id) === String(filters.invoice__enrollment__classroom__grade_level))?.name}
                <button onClick={() => updateFilter("invoice__enrollment__classroom__grade_level", "")}><i className="bi bi-x"></i></button>
              </span>
            )}
            {filters.invoice__enrollment__classroom__stream && (
              <span className="filter-chip">
                Stream: {streams.find(s => String(s.id) === String(filters.invoice__enrollment__classroom__stream))?.name}
                <button onClick={() => updateFilter("invoice__enrollment__classroom__stream", "")}><i className="bi bi-x"></i></button>
              </span>
            )}
            {filters.invoice__fee_structure__term && (
              <span className="filter-chip">
                Term: {terms.find(t => String(t.id) === String(filters.invoice__fee_structure__term))?.term_number}
                <button onClick={() => updateFilter("invoice__fee_structure__term", "")}><i className="bi bi-x"></i></button>
              </span>
            )}
            {filters.method && (
              <span className="filter-chip">
                Method: {METHOD_LABEL[filters.method] || filters.method}
                <button onClick={() => updateFilter("method", "")}><i className="bi bi-x"></i></button>
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

      {/* Payments Table */}
      <div className="table-wrap">
        <div className="table-wrap__header">
          <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
            <i className="bi bi-list-ul me-2" style={{ color: "var(--blue-700)" }}></i>
            Payment History
          </span>
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
            {count} payment{count !== 1 ? "s" : ""} found
          </span>
        </div>

        {listLoading ? (
          <TableSkeleton rows={5} columns={12} />
        ) : payments.length === 0 ? (
          <div className="empty-state">
            <i className="bi bi-cash-stack"></i>
            <h6>No payments found</h6>
            <p className="text-muted-soft">
              {hasActiveFilters 
                ? "No payments match your filters. Try adjusting your search criteria." 
                : "No payments have been recorded yet."}
            </p>
          </div>
        ) : (
          <>
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Admission No</th>
                    <th>Student</th>
                    <th>Phone</th>
                    <th>Guardian</th>
                    <th>Guardian Phone</th>
                    <th>Class</th>
                    <th>Term</th>
                    <th className="text-end">Amount</th>
                    <th>Method</th>
                    <th>Reference</th>
                    <th>Recorded By</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontSize: "var(--fs-sm)", color: "var(--ink-600)" }}>
                        {p.paid_at ? new Date(p.paid_at).toLocaleDateString('en-KE') : "-"}
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: "var(--blue-700)", fontSize: "var(--fs-sm)" }}>
                          {p.admission_no}
                        </span>
                      </td>
                      <td className="cell-name">{p.student_name}</td>
                      <td>{p.student_phone || <span className="text-muted-soft">-</span>}</td>
                      <td>{p.guardian_name || <span className="text-muted-soft">-</span>}</td>
                      <td>{p.guardian_phone || <span className="text-muted-soft">-</span>}</td>
                      <td>
                        <span className="badge badge-neutral">{p.classroom}</span>
                      </td>
                      <td>{p.term}</td>
                      <td className="text-end fw-bold" style={{ color: "var(--success-600)" }}>
                        KES {currency(p.amount)}
                      </td>
                      <td>
                        <span className={`badge ${METHOD_BADGE[p.method] || "badge-neutral"}`}>
                          <i className={`bi ${METHOD_ICON[p.method] || "bi-credit-card"} me-1`}></i>
                          {METHOD_LABEL[p.method] || p.method}
                        </span>
                      </td>
                      <td>
                        {p.reference ? (
                          <span style={{ fontSize: "var(--fs-sm)", color: "var(--ink-600)" }}>{p.reference}</span>
                        ) : (
                          <span className="text-muted-soft">-</span>
                        )}
                      </td>
                      <td style={{ fontSize: "var(--fs-sm)", color: "var(--ink-600)" }}>{p.recorded_by_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={(newPage) => loadPayments(newPage)}
              itemsPerPage={pageSize}
              setItemsPerPage={() => {}} // Fixed page size
              startIndex={(page - 1) * pageSize}
              endIndex={Math.min(page * pageSize, count)}
              totalItems={count}
            />
          </>
        )}
      </div>
    </div>
  );
}