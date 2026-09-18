import { useEffect, useState, useMemo } from "react";
import { financeApi, academicsApi, calendarApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";
import Pagination from "../../components/Pagination";

export default function AdminFees() {
  const [structures, setStructures] = useState([]);
  const [gradeLevels, setGradeLevels] = useState([]);
  const [terms, setTerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState({
    grade: "",
    term: "",
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [form, setForm] = useState({ grade_level: "", term: "", total_amount: "" });
  const [items, setItems] = useState([{ name: "Tuition", amount: "" }]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [f, g, t] = await Promise.all([
        financeApi.feeStructures(),
        academicsApi.gradeLevels(),
        calendarApi.terms(),
      ]);
      setStructures(f.data.results ?? f.data);
      setGradeLevels(g.data.results ?? g.data);
      setTerms(t.data.results ?? t.data);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const updateItem = (idx, field, value) => {
    const next = [...items];
    next[idx][field] = value;
    setItems(next);
  };

  const addItemRow = () => setItems([...items, { name: "", amount: "" }]);

  const removeItemRow = (idx) => {
    if (items.length <= 1) return;
    const next = items.filter((_, i) => i !== idx);
    setItems(next);
  };

  const submit = async (e) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);
    const cleanItems = items.filter((i) => i.name && i.amount).map((i) => ({ name: i.name, amount: i.amount }));
    const total = form.total_amount || cleanItems.reduce((sum, i) => sum + Number(i.amount || 0), 0);
    try {
      await financeApi.createFeeStructure({ ...form, total_amount: total, items: cleanItems });
      setForm({ grade_level: "", term: "", total_amount: "" });
      setItems([{ name: "Tuition", amount: "" }]);
      await loadAll();
      setMessage(" Fee structure saved successfully.");
      setMessageType("success");
    } catch (err) {
      setMessage(err.response?.data ? JSON.stringify(err.response.data) : "Could not save fee structure.");
      setMessageType("danger");
    } finally {
      setLoading(false);
    }
  };

  // Filter and Search Logic
  // NOTE: the API sends grade_level_id / term_id — we compare them as
  // strings so filter values ("3") match regardless of whether the
  // backend serializes ids as numbers or strings.
  const filteredStructures = useMemo(() => {
    let result = structures;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter((f) =>
        (f.grade_level_name || "").toLowerCase().includes(query) ||
        (f.term_label || "").toLowerCase().includes(query)
      );
    }

    if (filters.grade) {
      result = result.filter(
        (f) => String(f.grade_level_id) === String(filters.grade)
      );
    }

    if (filters.term) {
      result = result.filter(
        (f) => String(f.term_id) === String(filters.term)
      );
    }

    return result;
  }, [structures, searchQuery, filters]);

  const totalItems = filteredStructures.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentItems = filteredStructures.slice(startIndex, endIndex);

  // Reset to page 1 whenever the filter inputs change, and clamp the page
  // if the current page falls out of range after filtering.
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filters.grade, filters.term]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setFilters({ grade: "", term: "" });
    setCurrentPage(1);
  };

  const calculateTotal = () => {
    return items.reduce((sum, i) => sum + Number(i.amount || 0), 0);
  };

  const hasActiveFilters = !!(searchQuery || filters.grade || filters.term);

  return (
    <div>
      <Breadcrumb items={[
        { label: "Dashboard", href: "/admin" },
        { label: "Finance", href: "/admin/fees" },
        { label: "Fee Structures", href: "#" },
      ]} />

      <div className="page-header">
        <div>
          <h1 className="page-title">Fee Structures</h1>
          <p className="page-subtitle">
            Fee structures differ by grade and by term — set one per grade/term combination.
          </p>
        </div>
      </div>

      {message && (
        <div className={`alert alert-${messageType} alert-dismissible fade show`} role="alert">
          {message}
          <button type="button" className="btn-close" onClick={() => setMessage("")}></button>
        </div>
      )}

      {/* Create Fee Structure Form */}
      <form className="card p-4 mb-4" onSubmit={submit}>
        <h5 className="mb-3" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
          <i className="bi bi-cash-stack me-2" style={{ color: "var(--blue-700)" }}></i>
          Create Fee Structure
        </h5>
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label">Grade Level</label>
            <select className="form-select" required value={form.grade_level}
              onChange={(e) => setForm({ ...form, grade_level: e.target.value })}>
              <option value="">Select...</option>
              {gradeLevels.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label">Term</label>
            <select className="form-select" required value={form.term}
              onChange={(e) => setForm({ ...form, term: e.target.value })}>
              <option value="">Select...</option>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>Term {t.term_number} - {t.academic_year_label}</option>
              ))}
            </select>
          </div>
        </div>

        <label className="form-label mt-3" style={{ fontWeight: 600 }}>
          <i className="bi bi-list-ul me-1"></i>
          Fee Breakdown (optional line items)
        </label>
        {items.map((item, idx) => (
          <div className="row g-2 mb-2" key={idx}>
            <div className="col-5">
              <input className="form-control" placeholder="e.g. Tuition, Boarding, Activity"
                value={item.name} onChange={(e) => updateItem(idx, "name", e.target.value)} />
            </div>
            <div className="col-5">
              <input type="number" className="form-control" placeholder="Amount (KES)"
                value={item.amount} onChange={(e) => updateItem(idx, "amount", e.target.value)} />
            </div>
            <div className="col-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-danger w-100"
                onClick={() => removeItemRow(idx)}
                disabled={items.length <= 1}
              >
                <i className="bi bi-trash"></i>
              </button>
            </div>
          </div>
        ))}
        <div className="d-flex gap-2 mb-3">
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={addItemRow}>
            <i className="bi bi-plus-lg me-1"></i>Add line item
          </button>
          {items.length > 0 && items.some(i => i.amount) && (
            <span className="badge badge-success d-flex align-items-center" style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem" }}>
              <i className="bi bi-calculator me-1"></i>
              Total: KES {calculateTotal().toLocaleString()}
            </span>
          )}
        </div>

        <div className="col-md-4">
          <label className="form-label">Total Amount (KES) — auto-sums items if left blank</label>
          <input type="number" className="form-control" value={form.total_amount}
            onChange={(e) => setForm({ ...form, total_amount: e.target.value })}
            placeholder="Leave blank to auto-calculate" />
        </div>

        <div className="mt-3 d-flex gap-2">
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Saving..." : "Save Fee Structure"}
          </button>
        </div>
      </form>

      {/* Table with Search & Filters */}
      {loading ? (
        <TableSkeleton rows={5} columns={4} />
      ) : (
        <div className="table-wrap">
          <div className="table-wrap__header" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.75rem" }}>
            <div className="d-flex flex-wrap gap-2" style={{ width: "100%" }}>
              <div style={{ flex: 1, minWidth: "200px", position: "relative" }}>
                <i className="bi bi-search" style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--ink-400)" }}></i>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search by grade or term..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ paddingLeft: "2.4rem" }}
                />
              </div>
              <select
                className="form-select"
                value={filters.grade}
                onChange={(e) => setFilters({ ...filters, grade: e.target.value })}
                style={{ width: "auto", minWidth: "140px" }}
              >
                <option value="">All Grades</option>
                {gradeLevels.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <select
                className="form-select"
                value={filters.term}
                onChange={(e) => setFilters({ ...filters, term: e.target.value })}
                style={{ width: "auto", minWidth: "140px" }}
              >
                <option value="">All Terms</option>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>Term {t.term_number}</option>
                ))}
              </select>
              {hasActiveFilters && (
                <button type="button" className="btn btn-sm btn-light" onClick={clearFilters}>
                  <i className="bi bi-x-lg"></i> Clear
                </button>
              )}
            </div>

            {hasActiveFilters && (
              <div className="d-flex flex-wrap gap-1">
                {searchQuery && (
                  <span className="filter-chip">
                    Search: "{searchQuery}"
                    <button onClick={() => setSearchQuery("")}><i className="bi bi-x"></i></button>
                  </span>
                )}
                {filters.grade && (
                  <span className="filter-chip">
                    Grade: {gradeLevels.find(g => String(g.id) === String(filters.grade))?.name}
                    <button onClick={() => setFilters({ ...filters, grade: "" })}><i className="bi bi-x"></i></button>
                  </span>
                )}
                {filters.term && (
                  <span className="filter-chip">
                    Term: {terms.find(t => String(t.id) === String(filters.term))?.term_number}
                    <button onClick={() => setFilters({ ...filters, term: "" })}><i className="bi bi-x"></i></button>
                  </span>
                )}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
              <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                <i className="bi bi-cash-stack me-2"></i>
                All Fee Structures
              </span>
              <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
                {totalItems === 0
                  ? "0 structures"
                  : `Showing ${startIndex + 1}-${Math.min(endIndex, totalItems)} of ${totalItems}`}
              </span>
            </div>
          </div>

          {currentItems.length === 0 ? (
            <div className="empty-state">
              <i className="bi bi-cash-stack"></i>
              <h6>
                {hasActiveFilters
                  ? "No fee structures match your search"
                  : "No fee structures created yet"}
              </h6>
              <p className="text-muted-soft">
                {hasActiveFilters
                  ? "Try adjusting your search or filters"
                  : "Use the form above to create your first fee structure"}
              </p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th>Grade</th>
                    <th>Term</th>
                    <th>Total (KES)</th>
                    <th>Breakdown</th>
                  </tr>
                </thead>
                <tbody>
                  {currentItems.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <span className="badge badge-blue">{f.grade_level_name}</span>
                      </td>
                      <td>
                        <span className="badge badge-neutral">{f.term_label}</span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: "var(--blue-700)", fontSize: "var(--fs-md)" }}>
                          KES {Number(f.total_amount).toLocaleString()}
                        </span>
                      </td>
                      <td>
                        {(f.items || []).length > 0 ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                            {(f.items || []).map((i, idx) => (
                              <span key={idx} className="badge badge-neutral" style={{ background: "var(--bg-app)" }}>
                                {i.name}: <strong>KES {Number(i.amount).toLocaleString()}</strong>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-soft">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {!loading && currentItems.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          itemsPerPage={itemsPerPage}
          setItemsPerPage={setItemsPerPage}
          startIndex={startIndex}
          endIndex={endIndex}
          totalItems={totalItems}
        />
      )}
    </div>
  );
}