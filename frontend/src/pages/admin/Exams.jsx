import { useEffect, useMemo, useState } from "react";
import api, { examsApi, academicsApi, calendarApi } from "../../services/api";

const emptyTypeForm = {
  name: "",
  weight: 1,
  order: 1,
  counts_towards_midterm_rank: false,
  counts_towards_endterm_rank: true,
};

const emptyExamForm = {
  term: "",
  exam_type: "",
  grade_level: "",
  name: "",
  start_date: "",
  end_date: "",
};

const emptyFilters = {
  academic_year: "",
  term: "",
  grade_level: "",
  exam_type: "",
  status: "", // "" | "published" | "draft"
};

function errorText(err, fallback) {
  const data = err?.response?.data;
  if (!data) return fallback;
  if (typeof data === "string") return data;
  if (data.detail) return data.detail;
  try {
    return JSON.stringify(data);
  } catch {
    return fallback;
  }
}

// ===========================================================================
// Small reusable bits
// ===========================================================================
function StatCard({ label, value, variant = "primary" }) {
  return (
    <div className="col-6 col-md-3">
      <div className={`card border-0 shadow-sm h-100`}>
        <div className="card-body py-3">
          <div className="text-muted small text-uppercase" style={{ letterSpacing: 0.4 }}>
            {label}
          </div>
          <div className={`fs-3 fw-semibold text-${variant}`}>{value}</div>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel = "Delete", onConfirm, onCancel }) {
  return (
    <>
      <div className="modal d-block" tabIndex="-1" role="dialog" style={{ zIndex: 1055 }}>
        <div className="modal-dialog modal-dialog-centered" role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">{title}</h5>
              <button type="button" className="btn-close" onClick={onCancel} aria-label="Close" />
            </div>
            <div className="modal-body">
              <p className="mb-0">{message}</p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onCancel}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger btn-sm" onClick={onConfirm}>
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop show" style={{ zIndex: 1050 }} />
    </>
  );
}

function SortHeader({ label, field, sort, setSort }) {
  const active = sort.field === field;
  const arrow = active ? (sort.dir === "asc" ? "↑" : "↓") : "";
  return (
    <th
      role="button"
      onClick={() =>
        setSort((prev) =>
          prev.field === field ? { field, dir: prev.dir === "asc" ? "desc" : "asc" } : { field, dir: "asc" }
        )
      }
      style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
      title={`Sort by ${label}`}
    >
      {label} <span className="text-muted">{arrow}</span>
    </th>
  );
}

export default function AdminExams() {
  const [activeTab, setActiveTab] = useState("all"); // "all" | "types" | "schedule"

  const [exams, setExams] = useState([]);
  const [examTypes, setExamTypes] = useState([]);
  const [gradeLevels, setGradeLevels] = useState([]);
  const [terms, setTerms] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [loading, setLoading] = useState(true);

  const [message, setMessage] = useState(null); // { type, text }

  const flash = (type, text) => {
    setMessage({ type, text });
    window.setTimeout(() => setMessage(null), 4500);
  };

  // ---- confirm dialog (replaces window.confirm) -------------------------
  const [confirmDialog, setConfirmDialog] = useState(null); // { title, message, onConfirm }
  const askConfirm = (title, message, onConfirm) => setConfirmDialog({ title, message, onConfirm });
  const closeConfirm = () => setConfirmDialog(null);

  const loadAll = async () => {
    const [e, et, g, t, ay] = await Promise.all([
      examsApi.exams(),
      examsApi.examTypes(),
      academicsApi.gradeLevels(),
      calendarApi.terms(),
      calendarApi.academicYears(),
    ]);
    setExams(e.data.results ?? e.data);
    setExamTypes(et.data.results ?? et.data);
    setGradeLevels(g.data.results ?? g.data);
    setTerms(t.data.results ?? t.data);
    setAcademicYears(ay.data.results ?? ay.data);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await loadAll();
      } catch {
        flash("danger", "Could not load exam data. Please refresh the page.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ---- top-of-page summary ------------------------------------------------
  const stats = useMemo(
    () => ({
      total: exams.length,
      published: exams.filter((e) => e.is_published).length,
      draft: exams.filter((e) => !e.is_published).length,
      types: examTypes.length,
    }),
    [exams, examTypes]
  );

  // ---------------------------------------------------------------------
  // Exam Type CRUD
  // ---------------------------------------------------------------------
  const [typeForm, setTypeForm] = useState(emptyTypeForm);
  const [editingTypeId, setEditingTypeId] = useState(null);
  const [editTypeForm, setEditTypeForm] = useState(emptyTypeForm);
  const [savingType, setSavingType] = useState(false);

  const addExamType = async (e) => {
    e.preventDefault();
    setSavingType(true);
    try {
      await api.post("/exam-types/", typeForm);
      setTypeForm(emptyTypeForm);
      await loadAll();
      flash("success", "Exam type created.");
    } catch (err) {
      flash("danger", errorText(err, "Could not create exam type."));
    } finally {
      setSavingType(false);
    }
  };

  const startEditType = (type) => {
    setEditingTypeId(type.id);
    setEditTypeForm({
      name: type.name,
      weight: type.weight,
      order: type.order,
      counts_towards_midterm_rank: type.counts_towards_midterm_rank,
      counts_towards_endterm_rank: type.counts_towards_endterm_rank,
    });
  };

  const cancelEditType = () => {
    setEditingTypeId(null);
    setEditTypeForm(emptyTypeForm);
  };

  const saveEditType = async (id) => {
    setSavingType(true);
    try {
      await api.patch(`/exam-types/${id}/`, editTypeForm);
      cancelEditType();
      await loadAll();
      flash("success", "Exam type updated.");
    } catch (err) {
      flash("danger", errorText(err, "Could not update exam type."));
    } finally {
      setSavingType(false);
    }
  };

  const deleteExamType = (type) => {
    askConfirm(
      "Delete exam type?",
      `Delete "${type.name}"? This cannot be undone, and may fail if exams already use it.`,
      async () => {
        closeConfirm();
        try {
          await api.delete(`/exam-types/${type.id}/`);
          await loadAll();
          flash("success", "Exam type deleted.");
        } catch (err) {
          flash(
            "danger",
            errorText(err, "Could not delete this exam type. It may already be used by scheduled exams.")
          );
        }
      }
    );
  };

  // ---------------------------------------------------------------------
  // Exam (schedule) CRUD
  // ---------------------------------------------------------------------
  const [examForm, setExamForm] = useState(emptyExamForm);
  const [editingExamId, setEditingExamId] = useState(null);
  const [editExamForm, setEditExamForm] = useState(emptyExamForm);
  const [savingExam, setSavingExam] = useState(false);

  const addExam = async (e) => {
    e.preventDefault();
    setSavingExam(true);
    try {
      await api.post("/exams/", examForm);
      setExamForm(emptyExamForm);
      await loadAll();
      flash("success", "Exam scheduled.");
    } catch (err) {
      flash("danger", errorText(err, "Could not schedule exam."));
    } finally {
      setSavingExam(false);
    }
  };

  const startEditExam = (exam) => {
    setEditingExamId(exam.id);
    setEditExamForm({
      term: exam.term,
      exam_type: exam.exam_type,
      grade_level: exam.grade_level,
      name: exam.name,
      start_date: exam.start_date,
      end_date: exam.end_date,
    });
  };

  const cancelEditExam = () => {
    setEditingExamId(null);
    setEditExamForm(emptyExamForm);
  };

  const saveEditExam = async (id) => {
    setSavingExam(true);
    try {
      await api.patch(`/exams/${id}/`, editExamForm);
      cancelEditExam();
      await loadAll();
      flash("success", "Exam schedule updated.");
    } catch (err) {
      flash("danger", errorText(err, "Could not update this exam."));
    } finally {
      setSavingExam(false);
    }
  };

  const deleteExam = (exam) => {
    askConfirm("Delete exam?", `Delete "${exam.name}"? This cannot be undone.`, async () => {
      closeConfirm();
      try {
        await api.delete(`/exams/${exam.id}/`);
        await loadAll();
        flash("success", "Exam deleted.");
      } catch (err) {
        flash("danger", errorText(err, "Could not delete this exam."));
      }
    });
  };

  const togglePublish = async (exam) => {
    try {
      await api.patch(`/exams/${exam.id}/`, { is_published: !exam.is_published });
      await loadAll();
    } catch (err) {
      flash("danger", errorText(err, "Could not change publish status."));
    }
  };

  // ---------------------------------------------------------------------
  // Filters (All Exams tab)
  // ---------------------------------------------------------------------
  const [filters, setFilters] = useState(emptyFilters);
  const [sort, setSort] = useState({ field: "", dir: "asc" });

  const termsForYear = (academicYearId) =>
    academicYearId ? terms.filter((t) => String(t.academic_year) === String(academicYearId)) : terms;

  const filteredTermOptions = useMemo(
    () => termsForYear(filters.academic_year),
    [terms, filters.academic_year]
  );

  const setFilter = (field, value) => {
    setFilters((prev) => {
      const next = { ...prev, [field]: value };
      // changing the academic year invalidates a previously chosen term
      // that doesn't belong to it
      if (field === "academic_year") next.term = "";
      return next;
    });
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const filteredExams = useMemo(() => {
    let rows = exams.filter((ex) => {
      if (filters.term && String(ex.term) !== String(filters.term)) return false;
      if (!filters.term && filters.academic_year) {
        const term = terms.find((t) => t.id === ex.term);
        if (!term || String(term.academic_year) !== String(filters.academic_year)) return false;
      }
      if (filters.grade_level && String(ex.grade_level) !== String(filters.grade_level)) return false;
      if (filters.exam_type && String(ex.exam_type) !== String(filters.exam_type)) return false;
      if (filters.status === "published" && !ex.is_published) return false;
      if (filters.status === "draft" && ex.is_published) return false;
      return true;
    });

    if (sort.field) {
      const dir = sort.dir === "asc" ? 1 : -1;
      rows = [...rows].sort((a, b) => {
        const av = (a[sort.field] ?? "").toString().toLowerCase();
        const bv = (b[sort.field] ?? "").toString().toLowerCase();
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      });
    }
    return rows;
  }, [exams, terms, filters, sort]);

  return (
    <div>
      <div className="d-flex justify-content-between align-items-end mb-3 flex-wrap gap-2">
        <h2 className="page-title mb-0">Exams</h2>
      </div>

      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      {/* ---- Summary cards ------------------------------------------------ */}
      <div className="row g-2 mb-3">
        <StatCard label="Total Exams" value={stats.total} variant="dark" />
        <StatCard label="Published" value={stats.published} variant="success" />
        <StatCard label="Draft" value={stats.draft} variant="secondary" />
        <StatCard label="Exam Types" value={stats.types} variant="info" />
      </div>

      <ul className="nav nav-tabs mb-3">
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link ${activeTab === "all" ? "active" : ""}`}
            onClick={() => setActiveTab("all")}
          >
            All Exams <span className="badge bg-secondary ms-1">{exams.length}</span>
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link ${activeTab === "types" ? "active" : ""}`}
            onClick={() => setActiveTab("types")}
          >
            Exam Types <span className="badge bg-secondary ms-1">{examTypes.length}</span>
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link ${activeTab === "schedule" ? "active" : ""}`}
            onClick={() => setActiveTab("schedule")}
          >
            Schedule Exams
          </button>
        </li>
      </ul>

      {loading ? (
        <div className="text-muted">Loading…</div>
      ) : (
        <>
          {activeTab === "all" && (
            <AllExamsTab
              exams={filteredExams}
              totalCount={exams.length}
              academicYears={academicYears}
              terms={filteredTermOptions}
              gradeLevels={gradeLevels}
              examTypes={examTypes}
              filters={filters}
              setFilter={setFilter}
              resetFilters={() => setFilters(emptyFilters)}
              activeFilterCount={activeFilterCount}
              togglePublish={togglePublish}
              sort={sort}
              setSort={setSort}
            />
          )}

          {activeTab === "types" && (
            <ExamTypesTab
              examTypes={examTypes}
              typeForm={typeForm}
              setTypeForm={setTypeForm}
              addExamType={addExamType}
              savingType={savingType}
              editingTypeId={editingTypeId}
              editTypeForm={editTypeForm}
              setEditTypeForm={setEditTypeForm}
              startEditType={startEditType}
              cancelEditType={cancelEditType}
              saveEditType={saveEditType}
              deleteExamType={deleteExamType}
            />
          )}

          {activeTab === "schedule" && (
            <ScheduleExamsTab
              exams={exams}
              examTypes={examTypes}
              gradeLevels={gradeLevels}
              terms={terms}
              examForm={examForm}
              setExamForm={setExamForm}
              addExam={addExam}
              savingExam={savingExam}
              editingExamId={editingExamId}
              editExamForm={editExamForm}
              setEditExamForm={setEditExamForm}
              startEditExam={startEditExam}
              cancelEditExam={cancelEditExam}
              saveEditExam={saveEditExam}
              deleteExam={deleteExam}
              togglePublish={togglePublish}
            />
          )}
        </>
      )}

      {confirmDialog && (
        <ConfirmModal
          title={confirmDialog.title}
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={closeConfirm}
        />
      )}
    </div>
  );
}

// ===========================================================================
// TAB 1 — All Exams (filterable overview, read + publish toggle only)
// ===========================================================================
function AllExamsTab({
  exams,
  totalCount,
  academicYears,
  terms,
  gradeLevels,
  examTypes,
  filters,
  setFilter,
  resetFilters,
  activeFilterCount,
  togglePublish,
  sort,
  setSort,
}) {
  return (
    <div>
      <div className="card p-3 mb-3">
        <div className="row g-2 align-items-end">
          <div className="col-md-2">
            <label className="form-label small">Academic Year</label>
            <select
              className="form-select"
              value={filters.academic_year}
              onChange={(e) => setFilter("academic_year", e.target.value)}
            >
              <option value="">All years</option>
              {academicYears.map((ay) => (
                <option key={ay.id} value={ay.id}>
                  {ay.year}
                  {ay.is_current ? " (current)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-2">
            <label className="form-label small">Term</label>
            <select className="form-select" value={filters.term} onChange={(e) => setFilter("term", e.target.value)}>
              <option value="">All terms</option>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  Term {t.term_number} - {t.academic_year_label}
                  {t.is_current ? " (current)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-2">
            <label className="form-label small">Grade Level</label>
            <select
              className="form-select"
              value={filters.grade_level}
              onChange={(e) => setFilter("grade_level", e.target.value)}
            >
              <option value="">All grades</option>
              {gradeLevels.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-2">
            <label className="form-label small">Exam Type</label>
            <select
              className="form-select"
              value={filters.exam_type}
              onChange={(e) => setFilter("exam_type", e.target.value)}
            >
              <option value="">All types</option>
              {examTypes.map((et) => (
                <option key={et.id} value={et.id}>
                  {et.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-2">
            <label className="form-label small">Status</label>
            <select
              className="form-select"
              value={filters.status}
              onChange={(e) => setFilter("status", e.target.value)}
            >
              <option value="">All</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
          </div>
          <div className="col-md-2">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm w-100"
              onClick={resetFilters}
              disabled={!activeFilterCount}
            >
              Clear filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
            </button>
          </div>
        </div>
      </div>

      <div className="d-flex justify-content-between align-items-center mb-2">
        <small className="text-muted">
          Showing {exams.length} of {totalCount} exams
        </small>
      </div>

      <div className="table-responsive card">
        <table className="table table-hover mb-0">
          <thead>
            <tr>
              <SortHeader label="Name" field="name" sort={sort} setSort={setSort} />
              <th>Type</th>
              <th>Grade</th>
              <th>Term</th>
              <SortHeader label="Dates" field="start_date" sort={sort} setSort={setSort} />
              <th>Published</th>
            </tr>
          </thead>
          <tbody>
            {exams.map((ex) => (
              <tr key={ex.id}>
                <td>{ex.name}</td>
                <td>{ex.exam_type_name}</td>
                <td>{ex.grade_level_name || ex.grade_level}</td>
                <td>{ex.term_label}</td>
                <td>
                  {ex.start_date} → {ex.end_date}
                </td>
                <td>
                  <button
                    type="button"
                    className={`btn btn-sm ${ex.is_published ? "btn-success" : "btn-outline-secondary"}`}
                    onClick={() => togglePublish(ex)}
                  >
                    {ex.is_published ? "✓ Published" : "Draft"}
                  </button>
                </td>
              </tr>
            ))}
            {exams.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-muted py-4">
                  {totalCount === 0
                    ? "No exams scheduled yet. Add one under the Schedule Exams tab."
                    : "No exams match the current filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===========================================================================
// TAB 2 — Exam Types (add / list / edit / delete)
// ===========================================================================
function ExamTypesTab({
  examTypes,
  typeForm,
  setTypeForm,
  addExamType,
  savingType,
  editingTypeId,
  editTypeForm,
  setEditTypeForm,
  startEditType,
  cancelEditType,
  saveEditType,
  deleteExamType,
}) {
  const [search, setSearch] = useState("");

  const visibleTypes = useMemo(() => {
    if (!search.trim()) return examTypes;
    const q = search.trim().toLowerCase();
    return examTypes.filter((et) => et.name.toLowerCase().includes(q));
  }, [examTypes, search]);

  return (
    <div className="row g-3">
      <div className="col-md-4">
        <form className="card p-3" onSubmit={addExamType}>
          <h6>Add Exam Type</h6>
          <input
            className="form-control mb-2"
            placeholder="e.g. Midterm Exam"
            value={typeForm.name}
            onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
            required
          />
          <div className="row g-2 mb-2">
            <div className="col-6">
              <label className="form-label small">Weight</label>
              <input
                type="number"
                step="0.1"
                className="form-control"
                value={typeForm.weight}
                onChange={(e) => setTypeForm({ ...typeForm, weight: e.target.value })}
              />
            </div>
            <div className="col-6">
              <label className="form-label small">Order in term</label>
              <input
                type="number"
                className="form-control"
                value={typeForm.order}
                onChange={(e) => setTypeForm({ ...typeForm, order: e.target.value })}
              />
            </div>
          </div>
          <div className="form-check">
            <input
              type="checkbox"
              className="form-check-input"
              id="midtermFlag"
              checked={typeForm.counts_towards_midterm_rank}
              onChange={(e) => setTypeForm({ ...typeForm, counts_towards_midterm_rank: e.target.checked })}
            />
            <label className="form-check-label" htmlFor="midtermFlag">
              Counts toward midterm ranking
            </label>
          </div>
          <div className="form-check mb-2">
            <input
              type="checkbox"
              className="form-check-input"
              id="endtermFlag"
              checked={typeForm.counts_towards_endterm_rank}
              onChange={(e) => setTypeForm({ ...typeForm, counts_towards_endterm_rank: e.target.checked })}
            />
            <label className="form-check-label" htmlFor="endtermFlag">
              Counts toward end-of-term ranking
            </label>
          </div>
          <button className="btn btn-primary btn-sm" disabled={savingType}>
            {savingType ? "Saving…" : "Save Exam Type"}
          </button>
        </form>
      </div>

      <div className="col-md-8">
        <div className="d-flex justify-content-between align-items-center mb-2 gap-2">
          <input
            type="search"
            className="form-control form-control-sm"
            style={{ maxWidth: 260 }}
            placeholder="Search exam types…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <small className="text-muted text-nowrap">
            {visibleTypes.length} of {examTypes.length}
          </small>
        </div>

        <div className="table-responsive card">
          <table className="table table-hover mb-0 align-middle">
            <thead>
              <tr>
                <th>Name</th>
                <th style={{ width: 90 }}>Weight</th>
                <th style={{ width: 90 }}>Order</th>
                <th>Midterm</th>
                <th>End-term</th>
                <th style={{ width: 160 }}></th>
              </tr>
            </thead>
            <tbody>
              {visibleTypes.map((et) =>
                editingTypeId === et.id ? (
                  <tr key={et.id}>
                    <td>
                      <input
                        className="form-control form-control-sm"
                        value={editTypeForm.name}
                        onChange={(e) => setEditTypeForm({ ...editTypeForm, name: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.1"
                        className="form-control form-control-sm"
                        value={editTypeForm.weight}
                        onChange={(e) => setEditTypeForm({ ...editTypeForm, weight: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        value={editTypeForm.order}
                        onChange={(e) => setEditTypeForm({ ...editTypeForm, order: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={editTypeForm.counts_towards_midterm_rank}
                        onChange={(e) =>
                          setEditTypeForm({ ...editTypeForm, counts_towards_midterm_rank: e.target.checked })
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={editTypeForm.counts_towards_endterm_rank}
                        onChange={(e) =>
                          setEditTypeForm({ ...editTypeForm, counts_towards_endterm_rank: e.target.checked })
                        }
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-success btn-sm me-1"
                        onClick={() => saveEditType(et.id)}
                      >
                        Save
                      </button>
                      <button type="button" className="btn btn-outline-secondary btn-sm" onClick={cancelEditType}>
                        Cancel
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={et.id}>
                    <td>{et.name}</td>
                    <td>{et.weight}</td>
                    <td>{et.order}</td>
                    <td>
                      {et.counts_towards_midterm_rank ? (
                        <span className="badge bg-success-subtle text-success">Yes</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {et.counts_towards_endterm_rank ? (
                        <span className="badge bg-success-subtle text-success">Yes</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-outline-primary btn-sm me-1"
                        onClick={() => startEditType(et)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-danger btn-sm"
                        onClick={() => deleteExamType(et)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              )}
              {visibleTypes.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-4">
                    {examTypes.length === 0
                      ? "No exam types yet. Add one on the left."
                      : "No exam types match your search."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// TAB 3 — Schedule Exams (add / list / edit / delete exam schedules)
// ===========================================================================
function ScheduleExamsTab({
  exams,
  examTypes,
  gradeLevels,
  terms,
  examForm,
  setExamForm,
  addExam,
  savingExam,
  editingExamId,
  editExamForm,
  setEditExamForm,
  startEditExam,
  cancelEditExam,
  saveEditExam,
  deleteExam,
  togglePublish,
}) {
  const [search, setSearch] = useState("");

  const visibleExams = useMemo(() => {
    if (!search.trim()) return exams;
    const q = search.trim().toLowerCase();
    return exams.filter(
      (ex) =>
        ex.name.toLowerCase().includes(q) ||
        (ex.grade_level_name || "").toLowerCase().includes(q) ||
        (ex.term_label || "").toLowerCase().includes(q)
    );
  }, [exams, search]);

  return (
    <div>
      <form className="card p-3 mb-3" onSubmit={addExam}>
        <h6>Schedule an Exam</h6>
        <div className="row g-2">
          <div className="col-md-3">
            <select
              className="form-select"
              required
              value={examForm.term}
              onChange={(e) => setExamForm({ ...examForm, term: e.target.value })}
            >
              <option value="">Term...</option>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  Term {t.term_number} - {t.academic_year_label}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-3">
            <select
              className="form-select"
              required
              value={examForm.exam_type}
              onChange={(e) => setExamForm({ ...examForm, exam_type: e.target.value })}
            >
              <option value="">Exam type...</option>
              {examTypes.map((et) => (
                <option key={et.id} value={et.id}>
                  {et.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-3">
            <select
              className="form-select"
              required
              value={examForm.grade_level}
              onChange={(e) => setExamForm({ ...examForm, grade_level: e.target.value })}
            >
              <option value="">Grade level...</option>
              {gradeLevels.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-3">
            <input
              className="form-control"
              placeholder="Exam name"
              value={examForm.name}
              onChange={(e) => setExamForm({ ...examForm, name: e.target.value })}
              required
            />
          </div>
          <div className="col-md-3">
            <label className="form-label small">Start date</label>
            <input
              type="date"
              className="form-control"
              value={examForm.start_date}
              onChange={(e) => setExamForm({ ...examForm, start_date: e.target.value })}
              required
            />
          </div>
          <div className="col-md-3">
            <label className="form-label small">End date</label>
            <input
              type="date"
              className="form-control"
              value={examForm.end_date}
              onChange={(e) => setExamForm({ ...examForm, end_date: e.target.value })}
              required
            />
          </div>
        </div>
        <button className="btn btn-primary btn-sm mt-2 align-self-start" disabled={savingExam}>
          {savingExam ? "Saving…" : "Save Exam"}
        </button>
      </form>

      <div className="d-flex justify-content-between align-items-center mb-2 gap-2">
        <input
          type="search"
          className="form-control form-control-sm"
          style={{ maxWidth: 280 }}
          placeholder="Search by name, grade, or term…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <small className="text-muted text-nowrap">
          {visibleExams.length} of {exams.length}
        </small>
      </div>

      <div className="table-responsive card">
        <table className="table table-hover mb-0 align-middle">
          <thead>
            <tr>
              <th>Name</th>
              <th>Term</th>
              <th>Type</th>
              <th>Grade</th>
              <th>Start</th>
              <th>End</th>
              <th>Published</th>
              <th style={{ width: 160 }}></th>
            </tr>
          </thead>
          <tbody>
            {visibleExams.map((ex) =>
              editingExamId === ex.id ? (
                <tr key={ex.id}>
                  <td>
                    <input
                      className="form-control form-control-sm"
                      value={editExamForm.name}
                      onChange={(e) => setEditExamForm({ ...editExamForm, name: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      className="form-select form-select-sm"
                      value={editExamForm.term}
                      onChange={(e) => setEditExamForm({ ...editExamForm, term: e.target.value })}
                    >
                      {terms.map((t) => (
                        <option key={t.id} value={t.id}>
                          Term {t.term_number} - {t.academic_year_label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className="form-select form-select-sm"
                      value={editExamForm.exam_type}
                      onChange={(e) => setEditExamForm({ ...editExamForm, exam_type: e.target.value })}
                    >
                      {examTypes.map((et) => (
                        <option key={et.id} value={et.id}>
                          {et.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className="form-select form-select-sm"
                      value={editExamForm.grade_level}
                      onChange={(e) => setEditExamForm({ ...editExamForm, grade_level: e.target.value })}
                    >
                      {gradeLevels.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="date"
                      className="form-control form-control-sm"
                      value={editExamForm.start_date}
                      onChange={(e) => setEditExamForm({ ...editExamForm, start_date: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      className="form-control form-control-sm"
                      value={editExamForm.end_date}
                      onChange={(e) => setEditExamForm({ ...editExamForm, end_date: e.target.value })}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`btn btn-sm ${ex.is_published ? "btn-success" : "btn-outline-secondary"}`}
                      onClick={() => togglePublish(ex)}
                    >
                      {ex.is_published ? "Published" : "Draft"}
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-success btn-sm me-1"
                      onClick={() => saveEditExam(ex.id)}
                    >
                      Save
                    </button>
                    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={cancelEditExam}>
                      Cancel
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={ex.id}>
                  <td>{ex.name}</td>
                  <td>{ex.term_label}</td>
                  <td>{ex.exam_type_name}</td>
                  <td>{ex.grade_level_name || ex.grade_level}</td>
                  <td>{ex.start_date}</td>
                  <td>{ex.end_date}</td>
                  <td>
                    <button
                      type="button"
                      className={`btn btn-sm ${ex.is_published ? "btn-success" : "btn-outline-secondary"}`}
                      onClick={() => togglePublish(ex)}
                    >
                      {ex.is_published ? "Published" : "Draft"}
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-outline-primary btn-sm me-1"
                      onClick={() => startEditExam(ex)}
                    >
                      Edit
                    </button>
                    <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => deleteExam(ex)}>
                      Delete
                    </button>
                  </td>
                </tr>
              )
            )}
            {visibleExams.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-muted py-4">
                  {exams.length === 0 ? "No exams scheduled yet. Add one above." : "No exams match your search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}