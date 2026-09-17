import { useEffect, useState, useCallback, useMemo } from "react";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";
import Pagination from "../../components/Pagination";
import Modal from "../../components/Modal";
import { expensesApi, calendarApi } from "../../services/api";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const KES = (n) =>
  `KES ${Number(n || 0).toLocaleString("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "BANK", label: "Bank" },
  { value: "MPESA", label: "M-Pesa" },
  { value: "CHEQUE", label: "Cheque" },
];

const METHOD_LABEL = {
  CASH: "Cash",
  BANK: "Bank",
  MPESA: "M-Pesa",
  CHEQUE: "Cheque",
};

const METHOD_BADGE = {
  CASH: "badge-success",
  BANK: "badge-blue",
  MPESA: "badge-gold",
  CHEQUE: "badge-neutral",
};

const METHOD_ICON = {
  CASH: "bi-cash",
  BANK: "bi-building",
  MPESA: "bi-phone",
  CHEQUE: "bi-file-text",
};

const emptyForm = {
  id: null,
  category: "",
  item_name: "",
  description: "",
  quantity: "1",
  unit_cost: "",
  vendor: "",
  payment_method: "CASH",
  reference: "",
  expense_date: new Date().toISOString().slice(0, 10),
  academic_year: "",
  term: "",
};

const formatDateLabel = (isoDate) => {
  if (!isoDate) return "";
  const d = new Date(`${isoDate}T00:00:00`);
  return d.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
};

// ---------------------------------------------------------------------------
// small building blocks
// ---------------------------------------------------------------------------
function StatCard({ icon, label, value, hint, tone = "neutral" }) {
  const tones = {
    neutral: { bg: "var(--surface-100, #f1f5f9)", color: "var(--ink-700, #334155)" },
    success: { bg: "rgba(25, 135, 84, 0.1)", color: "var(--success-600, #198754)" },
    blue: { bg: "rgba(13, 110, 253, 0.1)", color: "var(--blue-700, #0d6efd)" },
    gold: { bg: "rgba(255, 193, 7, 0.15)", color: "#b45309" },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <div className="card p-3 h-100">
      <div className="d-flex align-items-start gap-3">
        <div
          className="d-flex align-items-center justify-content-center rounded-2"
          style={{ width: 38, height: 38, background: t.bg, color: t.color, flexShrink: 0 }}
        >
          <i className={`bi ${icon}`} style={{ fontSize: "1.05rem" }}></i>
        </div>
        <div className="min-w-0 flex-grow-1">
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-500, #64748b)" }}>{label}</div>
          <div
            className="fw-bold"
            style={{ fontSize: "var(--fs-lg, 1.1rem)", color: "var(--ink-900, #0f172a)" }}
          >
            {value}
          </div>
          {hint && (
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400, #94a3b8)" }}>
              {hint}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryBars({ data }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  if (!data.length) {
    return (
      <p className="text-muted-soft mb-0" style={{ fontSize: "var(--fs-sm)" }}>
        No expenses recorded yet.
      </p>
    );
  }
  return (
    <div className="d-flex flex-column gap-3">
      {data.slice(0, 6).map((row) => (
        <div key={row.category} className="d-flex align-items-center gap-3">
          <span
            className="text-truncate"
            style={{ width: 120, flexShrink: 0, fontSize: "var(--fs-sm)", color: "var(--ink-600, #475569)" }}
            title={row.category || "Uncategorized"}
          >
            {row.category || "Uncategorized"}
          </span>
          <div
            className="flex-grow-1"
            style={{ height: 8, borderRadius: 999, background: "var(--surface-100, #f1f5f9)", overflow: "hidden" }}
          >
            <div
              style={{
                height: "100%",
                borderRadius: 999,
                background: "var(--ink-900, #0f172a)",
                width: `${Math.max(4, (row.total / max) * 100)}%`,
              }}
            />
          </div>
          <span
            className="text-end fw-semibold"
            style={{ width: 100, flexShrink: 0, fontSize: "var(--fs-sm)", color: "var(--ink-700, #334155)" }}
          >
            {KES(row.total)}
          </span>
        </div>
      ))}
    </div>
  );
}

function MethodBadge({ method }) {
  const badge = METHOD_BADGE[method] || "badge-neutral";
  const icon = METHOD_ICON[method] || "bi-credit-card";
  const label = METHOD_LABEL[method] || method;
  return (
    <span className={`badge ${badge}`}>
      <i className={`bi ${icon} me-1`}></i>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// create / edit modal
// ---------------------------------------------------------------------------
function ExpenseForm({ open, onClose, onSaved, categories, terms, initial }) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (open) {
      setForm(initial || emptyForm);
      setErrors({});
    }
  }, [open, initial]);

  const total = (Number(form.quantity) || 0) * (Number(form.unit_cost) || 0);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    const payload = {
      category: form.category || null,
      item_name: form.item_name.trim(),
      description: form.description.trim(),
      quantity: form.quantity,
      unit_cost: form.unit_cost,
      vendor: form.vendor.trim(),
      payment_method: form.payment_method,
      reference: form.reference.trim(),
      expense_date: form.expense_date,
      academic_year: form.academic_year || null,
      term: form.term || null,
    };
    try {
      if (form.id) {
        await expensesApi.update(form.id, payload);
      } else {
        await expensesApi.create(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      const data = err?.response?.data;
      if (data && typeof data === "object") setErrors(data);
      else setErrors({ detail: "Something went wrong. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      show={open}
      onClose={onClose}
      title={form.id ? "Edit Expense" : "Record an Expense"}
      size="lg"
    >
      <form onSubmit={handleSubmit}>
        {errors.detail && (
          <div className="alert alert-danger py-2" style={{ fontSize: "var(--fs-sm)" }}>
            {errors.detail}
          </div>
        )}

        <div className="row g-3">
          <div className="col-md-8">
            <label className="form-label">Item</label>
            <input
              required
              value={form.item_name}
              onChange={set("item_name")}
              placeholder="e.g. A4 photocopy paper"
              className="form-control"
            />
            {errors.item_name && (
              <div className="text-danger mt-1" style={{ fontSize: "var(--fs-xs)" }}>
                {errors.item_name[0]}
              </div>
            )}
          </div>

          <div className="col-md-4">
            <label className="form-label">Category</label>
            <select
              required
              value={form.category}
              onChange={set("category")}
              className="form-select"
            >
              <option value="">Select a category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {errors.category && (
              <div className="text-danger mt-1" style={{ fontSize: "var(--fs-xs)" }}>
                {errors.category[0]}
              </div>
            )}
          </div>

          <div className="col-md-3">
            <label className="form-label">Quantity</label>
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={form.quantity}
              onChange={set("quantity")}
              className="form-control"
            />
            {errors.quantity && (
              <div className="text-danger mt-1" style={{ fontSize: "var(--fs-xs)" }}>
                {errors.quantity[0]}
              </div>
            )}
          </div>

          <div className="col-md-3">
            <label className="form-label">Unit Cost (KES)</label>
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={form.unit_cost}
              onChange={set("unit_cost")}
              className="form-control"
            />
            {errors.unit_cost && (
              <div className="text-danger mt-1" style={{ fontSize: "var(--fs-xs)" }}>
                {errors.unit_cost[0]}
              </div>
            )}
          </div>

          <div className="col-md-6 d-flex align-items-end">
            <div
              className="d-flex justify-content-between align-items-center w-100 rounded-2 px-3 py-2"
              style={{ background: "var(--surface-100, #f8f9fa)" }}
            >
              <span className="text-muted-soft" style={{ fontSize: "var(--fs-sm)" }}>Total</span>
              <span className="fw-bold" style={{ color: "var(--ink-900)" }}>{KES(total)}</span>
            </div>
          </div>

          <div className="col-12">
            <label className="form-label">Notes (optional)</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={set("description")}
              className="form-control"
            />
          </div>

          <div className="col-md-6">
            <label className="form-label">Vendor / Payee</label>
            <input
              value={form.vendor}
              onChange={set("vendor")}
              placeholder="Optional"
              className="form-control"
            />
          </div>

          <div className="col-md-6">
            <label className="form-label">Date</label>
            <input
              required
              type="date"
              value={form.expense_date}
              onChange={set("expense_date")}
              className="form-control"
            />
          </div>

          <div className="col-md-6">
            <label className="form-label">Payment Method</label>
            <select
              value={form.payment_method}
              onChange={set("payment_method")}
              className="form-select"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div className="col-md-6">
            <label className="form-label">Reference</label>
            <input
              value={form.reference}
              onChange={set("reference")}
              placeholder="Receipt / M-Pesa code"
              className="form-control"
            />
          </div>

          <div className="col-12">
            <label className="form-label">Term (optional)</label>
            <select
              value={form.term}
              onChange={set("term")}
              className="form-select"
            >
              <option value="">Not tied to a term</option>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.academic_year_label} - {t.get_term_number_display || `Term ${t.term_number}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="d-flex justify-content-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-outline-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary"
          >
            {saving ? (
              <>
                <span className="spinner-border spinner-border-sm me-2"></span>
                Saving...
              </>
            ) : (
              <>
                <i className="bi bi-check2-circle me-1"></i>
                {form.id ? "Save Changes" : "Record Expense"}
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// main page
// ---------------------------------------------------------------------------
export default function Expenses() {
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [categories, setCategories] = useState([]);
  const [terms, setTerms] = useState([]);
  const [summary, setSummary] = useState({
    total_expenses: 0,
    by_category: [],
    monthly_trend: [],
  });

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [dateFilter, setDateFilter] = useState(""); // NEW - specific calendar day

  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");

  const loadStatic = useCallback(async () => {
    const [catRes, termRes] = await Promise.all([
      expensesApi.categories({ is_active: true }),
      calendarApi.terms(),
    ]);
    setCategories(catRes.data.results || catRes.data);
    setTerms(termRes.data.results || termRes.data);
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, page_size: pageSize };
      if (search) params.search = search;
      if (categoryFilter) params.category = categoryFilter;
      if (methodFilter) params.payment_method = methodFilter;
      if (dateFilter) params.expense_date = dateFilter; // NEW - filters to one calendar day
      const summaryParams = {};
      if (categoryFilter) summaryParams.category = categoryFilter;
      if (dateFilter) summaryParams.expense_date = dateFilter;
      const [listRes, summaryRes] = await Promise.all([
        expensesApi.list(params),
        expensesApi.summary(summaryParams),
      ]);
      setRows(listRes.data.results || listRes.data);
      setCount(
        listRes.data.count ?? (listRes.data.results || listRes.data).length
      );
      setSummary(summaryRes.data);
    } finally {
      setLoading(false);
    }
  }, [page, search, categoryFilter, methodFilter, dateFilter]);

  useEffect(() => { loadStatic(); }, [loadStatic]);
  useEffect(() => { loadRows(); }, [loadRows]);

  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const thisMonthTotal = useMemo(() => {
    const key = new Date().toISOString().slice(0, 7);
    const row = summary.monthly_trend.find((m) => m.month === key);
    return row ? row.total : 0;
  }, [summary]);
  const topCategory = summary.by_category[0];

  const hasActiveFilters = !!(search || categoryFilter || methodFilter || dateFilter);

  const openCreate = () => { setEditing(null); setFormOpen(true); };

  const openEdit = (row) => {
    setEditing({
      id: row.id,
      category: row.category ?? "",
      item_name: row.item_name,
      description: row.description || "",
      quantity: String(row.quantity),
      unit_cost: String(row.unit_cost),
      vendor: row.vendor || "",
      payment_method: row.payment_method,
      reference: row.reference || "",
      expense_date: row.expense_date,
      academic_year: row.academic_year ?? "",
      term: row.term ?? "",
    });
    setFormOpen(true);
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete "${row.item_name}"? This can't be undone.`)) return;
    try {
      await expensesApi.delete(row.id);
      setMessage(`"${row.item_name}" was deleted.`);
      setMessageType("success");
      loadRows();
    } catch (err) {
      setMessage(
        err.response?.data?.detail || "Could not delete this expense."
      );
      setMessageType("danger");
    }
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    setAddingCategory(true);
    try {
      await expensesApi.createCategory({
        name: newCategoryName.trim(),
        code: newCategoryName
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, "_")
          .slice(0, 20),
      });
      setNewCategoryName("");
      await loadStatic();
      setMessage("Category added successfully.");
      setMessageType("success");
    } catch (err) {
      setMessage(
        err.response?.data?.detail || "Could not add this category."
      );
      setMessageType("danger");
    } finally {
      setAddingCategory(false);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setCategoryFilter("");
    setMethodFilter("");
    setDateFilter("");
    setPage(1);
  };

  return (
    <div>
      <Breadcrumb
        items={[
          { label: "Dashboard", href: "/finance" },
          { label: "Expenses", href: "/finance/expenses" },
          { label: "All Expenses", href: "#" },
        ]}
      />

      <div className="page-header">
        <div>
          <h1 className="page-title">Expenses</h1>
          <p className="page-subtitle">
            Track what the school spends to keep running.
          </p>
        </div>
        <div className="d-flex gap-2">
          <button
            type="button"
            onClick={() => setCategoryModalOpen(true)}
            className="btn btn-outline-secondary"
          >
            <i className="bi bi-tags me-1"></i>
            Manage Categories
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="btn btn-primary"
          >
            <i className="bi bi-plus-lg me-1"></i>
            Record Expense
          </button>
        </div>
      </div>

      {message && (
        <div className={`alert alert-${messageType} alert-dismissible fade show`} role="alert">
          {message}
          <button
            type="button"
            className="btn-close"
            onClick={() => setMessage("")}
          ></button>
        </div>
      )}

      {/* stat cards */}
      <div className="row g-3 mb-4">
        <div className="col-md-4">
          <StatCard
            icon="bi-wallet2"
            label={dateFilter ? `Total on ${formatDateLabel(dateFilter)}` : "Total Recorded"}
            value={KES(summary.total_expenses)}
          />
        </div>
        <div className="col-md-4">
          <StatCard
            icon="bi-graph-up-arrow"
            label="This Month"
            value={KES(thisMonthTotal)}
            tone="success"
          />
        </div>
        <div className="col-md-4">
          <StatCard
            icon="bi-receipt"
            label="Top Category"
            value={topCategory ? topCategory.category : "—"}
            hint={topCategory ? KES(topCategory.total) : undefined}
            tone="gold"
          />
        </div>
      </div>

      {/* category breakdown */}
      <div className="card p-4 mb-4">
        <h6 className="mb-3" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
          <i className="bi bi-bar-chart-line me-2" style={{ color: "var(--blue-700)" }}></i>
          Spend by Category
        </h6>
        <CategoryBars data={summary.by_category} />
      </div>

      {/* table, with filters built into its header */}
      <div className="table-wrap">
        <div className="table-wrap__header">
          <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
            <i className="bi bi-list-ul me-2" style={{ color: "var(--blue-700)" }}></i>
            Expense Records
          </span>
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
            {count} expense{count !== 1 ? "s" : ""} found
          </span>
        </div>

        <div className="px-4 pt-3 pb-1 border-bottom">
          <div className="row g-3 align-items-end">
            <div className="col-md-4">
              <label className="form-label">
                <i className="bi bi-search me-1" style={{ color: "var(--blue-700)" }}></i>
                Search
              </label>
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search item, vendor, reference..."
                className="form-control"
              />
            </div>
            <div className="col-md-3">
              <label className="form-label">Category</label>
              <select
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setPage(1);
                }}
                className="form-select"
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label">Payment Method</label>
              <select
                value={methodFilter}
                onChange={(e) => {
                  setMethodFilter(e.target.value);
                  setPage(1);
                }}
                className="form-select"
              >
                <option value="">All methods</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label">
                <i className="bi bi-calendar-event me-1" style={{ color: "var(--blue-700)" }}></i>
                Day
              </label>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value);
                  setPage(1);
                }}
                className="form-control"
              />
            </div>
            <div className="col-md-1 d-flex">
              {hasActiveFilters && (
                <button
                  type="button"
                  className="btn btn-sm btn-light w-100"
                  onClick={clearFilters}
                  title="Clear all filters"
                >
                  <i className="bi bi-x-lg"></i>
                </button>
              )}
            </div>
          </div>

          {hasActiveFilters && (
            <div className="d-flex flex-wrap gap-1 mt-3 pb-3">
              {search && (
                <span className="filter-chip">
                  Search: "{search}"
                  <button onClick={() => setSearch("")}>
                    <i className="bi bi-x"></i>
                  </button>
                </span>
              )}
              {categoryFilter && (
                <span className="filter-chip">
                  Category: {categories.find((c) => String(c.id) === String(categoryFilter))?.name}
                  <button onClick={() => setCategoryFilter("")}>
                    <i className="bi bi-x"></i>
                  </button>
                </span>
              )}
              {methodFilter && (
                <span className="filter-chip">
                  Method: {METHOD_LABEL[methodFilter] || methodFilter}
                  <button onClick={() => setMethodFilter("")}>
                    <i className="bi bi-x"></i>
                  </button>
                </span>
              )}
              {dateFilter && (
                <span className="filter-chip">
                  Day: {formatDateLabel(dateFilter)}
                  <button onClick={() => setDateFilter("")}>
                    <i className="bi bi-x"></i>
                  </button>
                </span>
              )}
            </div>
          )}
        </div>

        {loading ? (
          <TableSkeleton rows={8} columns={8} />
        ) : rows.length === 0 ? (
          <div className="empty-state">
            <i className="bi bi-receipt-cutoff"></i>
            <h6>No expenses found</h6>
            <p className="text-muted-soft">
              {hasActiveFilters
                ? "No expenses match your filters. Try adjusting your search criteria."
                : "No expenses have been recorded yet. Click “Record Expense” to get started."}
            </p>
          </div>
        ) : (
          <>
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Item</th>
                    <th>Category</th>
                    <th>Qty × Cost</th>
                    <th className="text-end">Total</th>
                    <th>Method</th>
                    <th>Recorded By</th>
                    <th style={{ width: "100px" }} className="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td style={{ fontSize: "var(--fs-sm)", color: "var(--ink-600)" }}>
                        {row.expense_date}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                          {row.item_name}
                        </div>
                        {row.vendor && (
                          <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
                            {row.vendor}
                          </div>
                        )}
                      </td>
                      <td>
                        {row.category_name ? (
                          <span className="badge badge-neutral">{row.category_name}</span>
                        ) : (
                          <span className="text-muted-soft">—</span>
                        )}
                      </td>
                      <td style={{ fontSize: "var(--fs-sm)", color: "var(--ink-600)" }}>
                        {row.quantity} × {KES(row.unit_cost)}
                      </td>
                      <td className="text-end fw-bold" style={{ color: "var(--ink-900)" }}>
                        {KES(row.total_amount)}
                      </td>
                      <td><MethodBadge method={row.payment_method} /></td>
                      <td style={{ fontSize: "var(--fs-sm)", color: "var(--ink-500)" }}>
                        {row.recorded_by_name || "—"}
                      </td>
                      <td>
                        <div className="table-actions justify-content-end">
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            className="btn btn-sm btn-outline-secondary btn-icon"
                            title="Edit"
                          >
                            <i className="bi bi-pencil"></i>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(row)}
                            className="btn btn-sm btn-outline-danger btn-icon"
                            title="Delete"
                          >
                            <i className="bi bi-trash"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={(p) => setPage(p)}
              itemsPerPage={pageSize}
              setItemsPerPage={() => {}}
              startIndex={(page - 1) * pageSize}
              endIndex={Math.min(page * pageSize, count)}
              totalItems={count}
            />
          </>
        )}
      </div>

      <ExpenseForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={loadRows}
        categories={categories}
        terms={terms}
        initial={editing}
      />

      {/* quick add / manage categories modal */}
      <Modal
        show={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        title="Manage Categories"
      >
        <ul className="list-unstyled mb-3" style={{ maxHeight: 220, overflowY: "auto" }}>
          {categories.map((c) => (
            <li
              key={c.id}
              className="rounded-2 px-3 py-2 mb-1"
              style={{ background: "var(--surface-100, #f8f9fa)", fontSize: "var(--fs-sm)", color: "var(--ink-700)" }}
            >
              <i className="bi bi-tag me-2" style={{ color: "var(--blue-700)" }}></i>
              {c.name}
            </li>
          ))}
          {categories.length === 0 && (
            <li className="text-muted-soft" style={{ fontSize: "var(--fs-sm)" }}>
              No categories yet.
            </li>
          )}
        </ul>

        <form onSubmit={handleAddCategory} className="d-flex gap-2">
          <input
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="New category, e.g. Electricity"
            className="form-control"
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={addingCategory || !newCategoryName.trim()}
          >
            {addingCategory ? (
              <span className="spinner-border spinner-border-sm"></span>
            ) : (
              <>
                <i className="bi bi-plus-lg me-1"></i>
                Add
              </>
            )}
          </button>
        </form>
      </Modal>
    </div>
  );
}