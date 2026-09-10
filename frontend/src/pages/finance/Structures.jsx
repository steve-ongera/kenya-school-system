import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import { financeApi, calendarApi, academicsApi, schoolApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";

const currency = (value) => Number(value || 0).toLocaleString();

const emptyItem = () => ({ name: "", amount: "" });

export default function FinanceStructures() {
  const [structures, setStructures] = useState([]);
  const [gradeLevels, setGradeLevels] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [terms, setTerms] = useState([]);
  const [school, setSchool] = useState(null);

  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // ---- create form state ----
  const [form, setForm] = useState({ academic_year: "", grade_level: "", term: "" });
  const [items, setItems] = useState([emptyItem()]);

  // ---- list filters ----
  const [filters, setFilters] = useState({ term__academic_year: "", grade_level: "" });

  const loadStructures = async (params = {}) => {
    setLoading(true);
    try {
      const { data } = await financeApi.feeStructures(params);
      setStructures(data.results ?? data);
    } catch (error) {
      console.error("Failed to load structures:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    academicsApi.gradeLevels().then(({ data }) => setGradeLevels(data.results ?? data));
    calendarApi.academicYears().then(({ data }) => setAcademicYears(data.results ?? data));
    calendarApi.terms().then(({ data }) => setTerms(data.results ?? data));
    schoolApi.list().then(({ data }) => setSchool((data.results ?? data)[0] || null));
    loadStructures();
  }, []);

  useEffect(() => {
    const params = {};
    if (filters.term__academic_year) params.term__academic_year = filters.term__academic_year;
    if (filters.grade_level) params.grade_level = filters.grade_level;
    loadStructures(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const formTerms = useMemo(
    () => terms.filter((t) => !form.academic_year || String(t.academic_year) === String(form.academic_year)),
    [terms, form.academic_year]
  );

  const existingCombos = useMemo(
    () => new Set(structures.map((s) => `${s.grade_level}-${s.term}`)),
    [structures]
  );
  const isDuplicate = form.grade_level && form.term && existingCombos.has(`${form.grade_level}-${form.term}`);

  const total = items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

  const updateItem = (idx, field, value) => {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  };
  const addItem = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const resetForm = () => {
    setForm({ academic_year: "", grade_level: "", term: "" });
    setItems([emptyItem()]);
  };

  const submit = async (e) => {
    e.preventDefault();
    setMessage(null);

    const cleanItems = items
      .filter((i) => i.name.trim() && i.amount !== "")
      .map((i) => ({ name: i.name.trim(), amount: Number(i.amount) }));

    if (!form.grade_level || !form.term) {
      setMessage({ type: "danger", text: "Select a grade and term." });
      return;
    }
    if (cleanItems.length === 0) {
      setMessage({ type: "danger", text: "Add at least one fee item." });
      return;
    }
    if (isDuplicate) {
      setMessage({ type: "danger", text: "A fee structure already exists for this grade and term." });
      return;
    }

    setSaving(true);
    try {
      await financeApi.createFeeStructure({
        grade_level: form.grade_level,
        term: form.term,
        total_amount: total,
        items: cleanItems,
      });
      setMessage({ type: "success", text: " Fee structure created successfully." });
      resetForm();
      loadStructures({
        ...(filters.term__academic_year ? { term__academic_year: filters.term__academic_year } : {}),
        ...(filters.grade_level ? { grade_level: filters.grade_level } : {}),
      });
    } catch (err) {
      const data = err.response?.data;
      const text =
        data?.non_field_errors?.[0] ||
        (typeof data === "object" ? JSON.stringify(data) : null) ||
        "Could not create fee structure — it may already exist for this grade and term.";
      setMessage({ type: "danger", text });
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = (structure) => {
    const doc = new jsPDF();
    let y = 20;

    doc.setFontSize(16);
    doc.text(school?.name || "Fee Structure", 14, y);
    y += 8;

    doc.setFontSize(11);
    doc.text(`Grade: ${structure.grade_level_name}`, 14, y);
    y += 6;
    doc.text(`Term: ${structure.term_label}`, 14, y);
    y += 10;

    doc.setFontSize(12);
    doc.text("Item", 14, y);
    doc.text("Amount (KES)", 150, y, { align: "right" });
    y += 2;
    doc.line(14, y, 196, y);
    y += 6;

    doc.setFontSize(11);
    (structure.items || []).forEach((item) => {
      doc.text(item.name, 14, y);
      doc.text(currency(item.amount), 150, y, { align: "right" });
      y += 7;
    });

    y += 2;
    doc.line(14, y, 196, y);
    y += 8;
    doc.setFontSize(12);
    doc.text("Total Due", 14, y);
    doc.text(`KES ${currency(structure.total_amount)}`, 150, y, { align: "right" });

    doc.save(`FeeStructure_${structure.grade_level_name}_${structure.term_label}.pdf`.replace(/\s+/g, "_"));
  };

  const clearFilters = () => {
    setFilters({ term__academic_year: "", grade_level: "" });
  };

  const hasActiveFilters = filters.term__academic_year || filters.grade_level;

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: "Dashboard", href: "/finance" },
        { label: "Fee Structures", href: "/finance/structures" },
        { label: "All Structures", href: "#" },
      ]} />

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Fee Structures</h1>
          <p className="page-subtitle">
            Create a fee structure once per grade and term. Each is downloadable as a PDF to hand out to students.
          </p>
        </div>
        <span className="badge badge-neutral" style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem" }}>
          <i className="bi bi-cash-stack me-1"></i>
          {structures.length} structure{structures.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Messages */}
      {message && (
        <div className={`alert alert-${message.type} alert-dismissible fade show`} role="alert">
          {message.text}
          <button type="button" className="btn-close" onClick={() => setMessage(null)}></button>
        </div>
      )}

      {/* Create Form */}
      <div className="card p-4 mb-4">
        <h6 className="mb-3" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
          <i className="bi bi-plus-circle me-2" style={{ color: "var(--blue-700)" }}></i>
          New Fee Structure
        </h6>
        <form onSubmit={submit}>
          <div className="row g-3 mb-3">
            <div className="col-md-4">
              <label className="form-label">
                <i className="bi bi-calendar3 me-1" style={{ color: "var(--blue-700)" }}></i>
                Academic Year
              </label>
              <select
                className="form-select"
                value={form.academic_year}
                onChange={(e) => setForm({ ...form, academic_year: e.target.value, term: "" })}
              >
                <option value="">Select...</option>
                {academicYears.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.year}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label">
                <i className="bi bi-book me-1" style={{ color: "var(--blue-700)" }}></i>
                Grade
              </label>
              <select
                className="form-select"
                required
                value={form.grade_level}
                onChange={(e) => setForm({ ...form, grade_level: e.target.value })}
              >
                <option value="">Select...</option>
                {gradeLevels.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label">
                <i className="bi bi-clock me-1" style={{ color: "var(--blue-700)" }}></i>
                Term
              </label>
              <select
                className="form-select"
                required
                value={form.term}
                onChange={(e) => setForm({ ...form, term: e.target.value })}
                disabled={!form.academic_year}
              >
                <option value="">{form.academic_year ? "Select..." : "Choose academic year first"}</option>
                {formTerms.map((t) => (
                  <option key={t.id} value={t.id}>
                    Term {t.term_number}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {isDuplicate && (
            <div className="alert alert-warning py-2 mb-3">
              <i className="bi bi-exclamation-triangle me-2"></i>
              A fee structure already exists for this grade and term. Edit or delete the existing one instead of
              creating a duplicate.
            </div>
          )}

          <label className="form-label" style={{ fontWeight: 600 }}>
            <i className="bi bi-list-ul me-1" style={{ color: "var(--blue-700)" }}></i>
            Fee Items
          </label>
          {items.map((item, idx) => (
            <div className="row g-2 mb-2" key={idx}>
              <div className="col-md-6">
                <input
                  className="form-control"
                  placeholder="e.g. Tuition, Boarding, Activity fee"
                  value={item.name}
                  onChange={(e) => updateItem(idx, "name", e.target.value)}
                />
              </div>
              <div className="col-md-4">
                <input
                  type="number"
                  className="form-control"
                  placeholder="Amount (KES)"
                  value={item.amount}
                  onChange={(e) => updateItem(idx, "amount", e.target.value)}
                />
              </div>
              <div className="col-md-2">
                <button
                  type="button"
                  className="btn btn-outline-danger w-100"
                  onClick={() => removeItem(idx)}
                  disabled={items.length === 1}
                >
                  <i className="bi bi-trash"></i>
                </button>
              </div>
            </div>
          ))}
          <button type="button" className="btn btn-outline-secondary btn-sm mb-3" onClick={addItem}>
            <i className="bi bi-plus-lg me-1"></i> Add Item
          </button>

          <div className="d-flex justify-content-between align-items-center border-top pt-3">
            <div>
              <span className="text-muted">Total: </span>
              <span className="fw-bold fs-5" style={{ color: "var(--blue-700)" }}>
                KES {currency(total)}
              </span>
            </div>
            <button className="btn btn-primary" disabled={saving || isDuplicate}>
              {saving ? "Saving..." : "Create Fee Structure"}
            </button>
          </div>
        </form>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-4">
        <h6 className="mb-3" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
          <i className="bi bi-funnel me-2" style={{ color: "var(--blue-700)" }}></i>
          Filter Fee Structures
        </h6>
        <div className="row g-3 align-items-end">
          <div className="col-md-4">
            <label className="form-label">Academic Year</label>
            <select
              className="form-select"
              value={filters.term__academic_year}
              onChange={(e) => setFilters({ ...filters, term__academic_year: e.target.value })}
            >
              <option value="">All</option>
              {academicYears.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.year}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">Grade</label>
            <select
              className="form-select"
              value={filters.grade_level}
              onChange={(e) => setFilters({ ...filters, grade_level: e.target.value })}
            >
              <option value="">All</option>
              {gradeLevels.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-4">
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
            {filters.term__academic_year && (
              <span className="filter-chip">
                Year: {academicYears.find(y => String(y.id) === String(filters.term__academic_year))?.year}
                <button onClick={() => setFilters({ ...filters, term__academic_year: "" })}><i className="bi bi-x"></i></button>
              </span>
            )}
            {filters.grade_level && (
              <span className="filter-chip">
                Grade: {gradeLevels.find(g => String(g.id) === String(filters.grade_level))?.name}
                <button onClick={() => setFilters({ ...filters, grade_level: "" })}><i className="bi bi-x"></i></button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Fee Structures Cards Grid */}
      {loading ? (
        <div className="row g-4">
          {[1, 2, 3].map((i) => (
            <div className="col-12 col-md-6 col-lg-4" key={i}>
              <div className="card">
                <div className="card-body">
                  <div className="skeleton skeleton-text" style={{ width: "60%", height: "24px", marginBottom: "0.5rem" }}></div>
                  <div className="skeleton skeleton-text" style={{ width: "40%", height: "16px", marginBottom: "1rem" }}></div>
                  <div className="skeleton skeleton-text" style={{ width: "100%", height: "60px", marginBottom: "0.5rem" }}></div>
                  <div className="skeleton skeleton-text" style={{ width: "50%", height: "20px" }}></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : structures.length === 0 ? (
        <div className="empty-state">
          <i className="bi bi-cash-stack"></i>
          <h6>No fee structures found</h6>
          <p className="text-muted-soft">
            {hasActiveFilters 
              ? "No fee structures match your filters. Try adjusting your search criteria." 
              : "Create your first fee structure using the form above."}
          </p>
        </div>
      ) : (
        <div className="row g-4">
          {structures.map((f) => (
            <div className="col-12 col-md-6 col-lg-4" key={f.id}>
              <div className="card h-100">
                <div className="card-body">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                    <h6 style={{ fontWeight: 700, color: "var(--ink-900)", margin: 0 }}>
                      {f.grade_level_name}
                    </h6>
                    <span className="badge badge-blue">
                      <i className="bi bi-clock me-1"></i>
                      {f.term_label}
                    </span>
                  </div>
                  
                  <div style={{ marginBottom: "1rem" }}>
                    <span className="badge badge-neutral">
                      <i className="bi bi-calendar3 me-1"></i>
                      {f.academic_year_label || "Academic Year"}
                    </span>
                  </div>

                  {/* Fee Items */}
                  <div style={{ 
                    background: "var(--bg-app)", 
                    borderRadius: "var(--radius-md)", 
                    padding: "0.75rem",
                    marginBottom: "1rem"
                  }}>
                    <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)", marginBottom: "0.3rem" }}>
                      <i className="bi bi-list-ul me-1"></i> Breakdown
                    </div>
                    {(f.items || []).length > 0 ? (
                      (f.items || []).map((item, idx) => (
                        <div key={idx} style={{ 
                          display: "flex", 
                          justifyContent: "space-between", 
                          fontSize: "var(--fs-sm)",
                          padding: "0.2rem 0",
                          borderBottom: idx < (f.items || []).length - 1 ? "1px dashed var(--border-color)" : "none"
                        }}>
                          <span style={{ color: "var(--ink-700)" }}>{item.name}</span>
                          <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                            KES {currency(item.amount)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <span className="text-muted-soft" style={{ fontSize: "var(--fs-sm)" }}>No items</span>
                    )}
                  </div>

                  {/* Total */}
                  <div style={{ 
                    display: "flex", 
                    justifyContent: "space-between", 
                    alignItems: "center",
                    paddingTop: "0.75rem",
                    borderTop: "2px solid var(--border-color)"
                  }}>
                    <span style={{ fontWeight: 600, color: "var(--ink-700)" }}>Total Due</span>
                    <span style={{ 
                      fontWeight: 700, 
                      fontSize: "1.1rem",
                      color: "var(--blue-700)"
                    }}>
                      KES {currency(f.total_amount)}
                    </span>
                  </div>
                </div>
                <div className="card-footer" style={{ 
                  background: "transparent",
                  borderTop: "1px solid var(--border-color)",
                  padding: "0.75rem 1.25rem",
                  display: "flex",
                  gap: "0.5rem"
                }}>
                  <button className="btn btn-sm btn-primary w-100" onClick={() => downloadPdf(f)}>
                    <i className="bi bi-download me-1"></i> PDF
                  </button>
                  <button className="btn btn-sm btn-outline-secondary">
                    <i className="bi bi-eye me-1"></i> View
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}