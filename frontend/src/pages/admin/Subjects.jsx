import { useEffect, useState, useMemo } from "react";
import { academicsApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";
import Pagination from "../../components/Pagination";

const CURRICULA = ["CBC", "8-4-4"];

const emptySubjectForm = { name: "", code: "", curriculum_type: "CBC", has_papers: false };
const emptyPaperForm = { paper_number: 1, name: "", max_marks: 100 };
const emptyGradeSubjectForm = { grade_level: "", subject: "", is_compulsory: true };
const emptyRuleForm = {
  grade_level: "",
  min_optional_subjects: 0,
  max_optional_subjects: 0,
  min_total_subjects: 7,
  max_total_subjects: 9,
};
const emptyGradingForm = {
  curriculum_type: "CBC",
  subject: "",
  min_percentage: 0,
  max_percentage: 0,
  grade_letter: "",
  points: 0,
  remark: "",
};

export default function AdminSubjects() {
  const [activeTab, setActiveTab] = useState("subjects");

  const [subjects, setSubjects] = useState([]);
  const [gradeLevels, setGradeLevels] = useState([]);
  const [gradeSubjects, setGradeSubjects] = useState([]);
  const [selectionRules, setSelectionRules] = useState([]);
  const [gradingScales, setGradingScales] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");

  // ---- lookups ----
  const gradeLevelsById = useMemo(
    () => Object.fromEntries(gradeLevels.map((g) => [g.id, g])),
    [gradeLevels]
  );
  const subjectsById = useMemo(
    () => Object.fromEntries(subjects.map((s) => [s.id, s])),
    [subjects]
  );
  const gradeLabel = (id) => {
    const g = gradeLevelsById[id];
    return g ? `${g.name} (${g.curriculum_type})` : "—";
  };
  const subjectLabel = (id) => subjectsById[id]?.name || "—";

  // ---- search / filter / pagination state ----
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState({ curriculum: "" });
  const [currentPage, setCurrentPage] = useState(1);

  const [searchQueryLinks, setSearchQueryLinks] = useState("");
  const [filtersLinks, setFiltersLinks] = useState({ grade: "", type: "" });
  const [currentPageLinks, setCurrentPageLinks] = useState(1);

  const [filtersGrading, setFiltersGrading] = useState({ curriculum: "", subject: "" });
  const [currentPageGrading, setCurrentPageGrading] = useState(1);

  const [itemsPerPage, setItemsPerPage] = useState(10);

  // ---- forms ----
  const [subjectForm, setSubjectForm] = useState(emptySubjectForm);
  const [editingSubject, setEditingSubject] = useState(null);
  const [showSubjectModal, setShowSubjectModal] = useState(false);

  const [papersSubject, setPapersSubject] = useState(null);
  const [paperForm, setPaperForm] = useState(emptyPaperForm);
  const [editingPaper, setEditingPaper] = useState(null);
  const [showPapersModal, setShowPapersModal] = useState(false);

  const [gradeSubjectForm, setGradeSubjectForm] = useState(emptyGradeSubjectForm);
  const [editingGradeSubject, setEditingGradeSubject] = useState(null);
  const [showGradeSubjectModal, setShowGradeSubjectModal] = useState(false);

  const [ruleForm, setRuleForm] = useState(emptyRuleForm);
  const [editingRule, setEditingRule] = useState(null);
  const [showRuleModal, setShowRuleModal] = useState(false);

  const [gradingForm, setGradingForm] = useState(emptyGradingForm);
  const [editingGrading, setEditingGrading] = useState(null);
  const [showGradingModal, setShowGradingModal] = useState(false);

  const flash = (text, type = "success") => {
    setMessage(text);
    setMessageType(type);
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [s, g, gs, rules, grading] = await Promise.all([
        academicsApi.subjects(),
        academicsApi.gradeLevels(),
        academicsApi.gradeSubjects(),
        academicsApi.selectionRules(),
        academicsApi.gradingScales(),
      ]);
      setSubjects(s.data.results ?? s.data);
      setGradeLevels(g.data.results ?? g.data);
      setGradeSubjects(gs.data.results ?? gs.data);
      setSelectionRules(rules.data.results ?? rules.data);
      setGradingScales(grading.data.results ?? grading.data);
      return s.data.results ?? s.data;
    } catch (error) {
      console.error("Failed to load data:", error);
      flash("Failed to load subject data.", "danger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  // ===========================================================================
  // SUBJECTS
  // ===========================================================================
  const openAddSubject = () => {
    setEditingSubject(null);
    setSubjectForm(emptySubjectForm);
    setShowSubjectModal(true);
  };
  const openEditSubject = (s) => {
    setEditingSubject(s);
    setSubjectForm({
      name: s.name,
      code: s.code,
      curriculum_type: s.curriculum_type,
      has_papers: s.has_papers,
    });
    setShowSubjectModal(true);
  };
  const saveSubject = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingSubject) {
        await academicsApi.updateSubject(editingSubject.id, subjectForm);
        flash("Subject updated.");
      } else {
        await academicsApi.createSubject(subjectForm);
        flash("Subject created.");
      }
      setShowSubjectModal(false);
      await loadAll();
    } catch (err) {
      flash(err.response?.data ? JSON.stringify(err.response.data) : "Could not save subject.", "danger");
    } finally {
      setSaving(false);
    }
  };
  const deleteSubject = async (s) => {
    if (!window.confirm(`Delete "${s.name}"? This cannot be undone.`)) return;
    try {
      await academicsApi.deleteSubject(s.id);
      flash("Subject deleted.");
      await loadAll();
    } catch (err) {
      flash(err.response?.data?.detail || "Could not delete subject.", "danger");
    }
  };

  // ---- papers (nested inside a subject) ----
  const openPapersModal = (subject) => {
    setPapersSubject(subject);
    setEditingPaper(null);
    setPaperForm({ ...emptyPaperForm, paper_number: (subject.papers?.length || 0) + 1 });
    setShowPapersModal(true);
  };
  const openEditPaper = (paper) => {
    setEditingPaper(paper);
    setPaperForm({ paper_number: paper.paper_number, name: paper.name, max_marks: paper.max_marks });
  };
  const savePaper = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...paperForm, subject: papersSubject.id };
      if (editingPaper) {
        await academicsApi.updateSubjectPaper(editingPaper.id, payload);
        flash("Paper updated.");
      } else {
        await academicsApi.createSubjectPaper(payload);
        flash("Paper added.");
      }
      const refreshed = await loadAll();
      const updatedSubject = (refreshed || []).find((s) => s.id === papersSubject.id);
      setPapersSubject(updatedSubject || papersSubject);
      setEditingPaper(null);
      setPaperForm({ ...emptyPaperForm, paper_number: (updatedSubject?.papers?.length || 0) + 1 });
    } catch (err) {
      flash(err.response?.data ? JSON.stringify(err.response.data) : "Could not save paper.", "danger");
    } finally {
      setSaving(false);
    }
  };
  const deletePaper = async (paper) => {
    if (!window.confirm(`Delete "${paper.name}"?`)) return;
    try {
      await academicsApi.deleteSubjectPaper(paper.id);
      flash("Paper deleted.");
      const refreshed = await loadAll();
      const updatedSubject = (refreshed || []).find((s) => s.id === papersSubject.id);
      setPapersSubject(updatedSubject || papersSubject);
    } catch (err) {
      flash(err.response?.data?.detail || "Could not delete paper.", "danger");
    }
  };

  // ===========================================================================
  // GRADE SUBJECT OFFERINGS
  // ===========================================================================
  const openAddGradeSubject = () => {
    setEditingGradeSubject(null);
    setGradeSubjectForm(emptyGradeSubjectForm);
    setShowGradeSubjectModal(true);
  };
  const openEditGradeSubject = (gs) => {
    setEditingGradeSubject(gs);
    setGradeSubjectForm({
      grade_level: gs.grade_level,
      subject: gs.subject,
      is_compulsory: gs.is_compulsory,
    });
    setShowGradeSubjectModal(true);
  };
  const saveGradeSubject = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingGradeSubject) {
        await academicsApi.updateGradeSubject(editingGradeSubject.id, gradeSubjectForm);
        flash("Offering updated.");
      } else {
        await academicsApi.createGradeSubject(gradeSubjectForm);
        flash("Subject linked to grade.");
      }
      setShowGradeSubjectModal(false);
      await loadAll();
    } catch (err) {
      flash(err.response?.data ? JSON.stringify(err.response.data) : "Could not save.", "danger");
    } finally {
      setSaving(false);
    }
  };
  const deleteGradeSubject = async (gs) => {
    if (!window.confirm("Remove this subject from the grade?")) return;
    try {
      await academicsApi.deleteGradeSubject(gs.id);
      flash("Offering removed.");
      await loadAll();
    } catch (err) {
      flash(err.response?.data?.detail || "Could not remove offering.", "danger");
    }
  };

  // subjects offered as options when linking, filtered to the chosen grade's curriculum
  const subjectOptionsForGrade = (gradeLevelId) => {
    const grade = gradeLevelsById[gradeLevelId];
    if (!grade) return subjects;
    return subjects.filter((s) => s.curriculum_type === grade.curriculum_type);
  };

  // ===========================================================================
  // SELECTION RULES (one per grade level)
  // ===========================================================================
  const openRuleModal = (gradeLevelId) => {
    const existing = selectionRules.find((r) => r.grade_level === gradeLevelId);
    setEditingRule(existing || null);
    setRuleForm(
      existing
        ? { ...existing }
        : { ...emptyRuleForm, grade_level: gradeLevelId }
    );
    setShowRuleModal(true);
  };
  const saveRule = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingRule) {
        await academicsApi.updateSelectionRule(editingRule.id, ruleForm);
        flash("Selection rule updated.");
      } else {
        await academicsApi.createSelectionRule(ruleForm);
        flash("Selection rule saved.");
      }
      setShowRuleModal(false);
      await loadAll();
    } catch (err) {
      flash(err.response?.data ? JSON.stringify(err.response.data) : "Could not save rule.", "danger");
    } finally {
      setSaving(false);
    }
  };
  const deleteRule = async (rule) => {
    if (!window.confirm("Delete this selection rule?")) return;
    try {
      await academicsApi.deleteSelectionRule(rule.id);
      flash("Selection rule deleted.");
      await loadAll();
    } catch (err) {
      flash(err.response?.data?.detail || "Could not delete rule.", "danger");
    }
  };

  // ===========================================================================
  // GRADING SCALES
  // ===========================================================================
  const openAddGrading = () => {
    setEditingGrading(null);
    setGradingForm(emptyGradingForm);
    setShowGradingModal(true);
  };
  const openEditGrading = (g) => {
    setEditingGrading(g);
    setGradingForm({
      curriculum_type: g.curriculum_type,
      subject: g.subject ?? "",
      min_percentage: g.min_percentage,
      max_percentage: g.max_percentage,
      grade_letter: g.grade_letter,
      points: g.points,
      remark: g.remark || "",
    });
    setShowGradingModal(true);
  };
  const saveGrading = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...gradingForm, subject: gradingForm.subject || null };
      if (editingGrading) {
        await academicsApi.updateGradingScale(editingGrading.id, payload);
        flash("Grading scale updated.");
      } else {
        await academicsApi.createGradingScale(payload);
        flash("Grading scale added.");
      }
      setShowGradingModal(false);
      await loadAll();
    } catch (err) {
      flash(err.response?.data ? JSON.stringify(err.response.data) : "Could not save grading scale.", "danger");
    } finally {
      setSaving(false);
    }
  };
  const deleteGrading = async (g) => {
    if (!window.confirm(`Delete grade "${g.grade_letter}"?`)) return;
    try {
      await academicsApi.deleteGradingScale(g.id);
      flash("Grading scale deleted.");
      await loadAll();
    } catch (err) {
      flash(err.response?.data?.detail || "Could not delete grading scale.", "danger");
    }
  };

  // ===========================================================================
  // FILTERING + PAGINATION
  // ===========================================================================
  const filteredSubjects = useMemo(() => {
    let result = subjects;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (s) => s.name?.toLowerCase().includes(q) || s.code?.toLowerCase().includes(q)
      );
    }
    if (filters.curriculum) result = result.filter((s) => s.curriculum_type === filters.curriculum);
    return result;
  }, [subjects, searchQuery, filters]);

  const filteredGradeSubjects = useMemo(() => {
    let result = gradeSubjects;
    if (searchQueryLinks.trim()) {
      const q = searchQueryLinks.toLowerCase().trim();
      result = result.filter(
        (gs) =>
          gradeLabel(gs.grade_level).toLowerCase().includes(q) ||
          (gs.subject_name || "").toLowerCase().includes(q)
      );
    }
    if (filtersLinks.grade) result = result.filter((gs) => gs.grade_level === parseInt(filtersLinks.grade));
    if (filtersLinks.type) {
      const isCompulsory = filtersLinks.type === "compulsory";
      result = result.filter((gs) => gs.is_compulsory === isCompulsory);
    }
    return result;
  }, [gradeSubjects, searchQueryLinks, filtersLinks, gradeLevelsById]);

  const filteredGrading = useMemo(() => {
    let result = gradingScales;
    if (filtersGrading.curriculum) result = result.filter((g) => g.curriculum_type === filtersGrading.curriculum);
    if (filtersGrading.subject) {
      if (filtersGrading.subject === "general") result = result.filter((g) => !g.subject);
      else result = result.filter((g) => g.subject === parseInt(filtersGrading.subject));
    }
    return [...result].sort((a, b) => b.min_percentage - a.min_percentage);
  }, [gradingScales, filtersGrading]);

  const paginate = (list, page) => {
    const totalItems = list.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return { items: list.slice(startIndex, endIndex), totalItems, totalPages, startIndex, endIndex };
  };

  const subjectsPage = paginate(filteredSubjects, currentPage);
  const gradeSubjectsPage = paginate(filteredGradeSubjects, currentPageLinks);
  const gradingPage = paginate(filteredGrading, currentPageGrading);

  useEffect(() => setCurrentPage(1), [searchQuery, filters]);
  useEffect(() => setCurrentPageLinks(1), [searchQueryLinks, filtersLinks]);
  useEffect(() => setCurrentPageGrading(1), [filtersGrading]);

  const clearFilters = () => {
    setSearchQuery("");
    setFilters({ curriculum: "" });
  };
  const clearFiltersLinks = () => {
    setSearchQueryLinks("");
    setFiltersLinks({ grade: "", type: "" });
  };

  const TABS = [
    { key: "subjects", label: "Subjects", icon: "bi-book" },
    { key: "grades", label: "Grade Offerings", icon: "bi-link-45deg" },
    { key: "rules", label: "Selection Rules", icon: "bi-sliders2" },
    { key: "grading", label: "Grading Scales", icon: "bi-mortarboard" },
  ];

  return (
    <div>
      <Breadcrumb
        items={[
          { label: "Dashboard", href: "/admin" },
          { label: "Subjects", href: "/admin/subjects" },
          { label: "All Subjects", href: "#" },
        ]}
      />

      <div className="page-header">
        <div>
          <h1 className="page-title">Subjects</h1>
          <p className="page-subtitle">
            Manage subjects, papers, grade offerings, selection rules, and grading scales
          </p>
        </div>
      </div>

      {message && (
        <div className={`alert alert-${messageType} alert-dismissible fade show`} role="alert">
          {message}
          <button type="button" className="btn-close" onClick={() => setMessage("")}></button>
        </div>
      )}

      {/* ---- Nav tabs ---- */}
      <ul className="nav nav-tabs mb-4">
        {TABS.map((t) => (
          <li className="nav-item" key={t.key}>
            <button
              className={`nav-link ${activeTab === t.key ? "active" : ""}`}
              onClick={() => setActiveTab(t.key)}
              type="button"
            >
              <i className={`bi ${t.icon} me-2`}></i>
              {t.label}
            </button>
          </li>
        ))}
      </ul>

      {loading ? (
        <TableSkeleton rows={5} columns={4} />
      ) : (
        <>
          {/* =========================== SUBJECTS TAB =========================== */}
          {activeTab === "subjects" && (
            <>
              <div className="table-wrap mb-4">
                <div
                  className="table-wrap__header"
                  style={{ flexDirection: "column", alignItems: "stretch", gap: "0.75rem" }}
                >
                  <div className="d-flex flex-wrap gap-2 justify-content-between" style={{ width: "100%" }}>
                    <div className="d-flex flex-wrap gap-2" style={{ flex: 1 }}>
                      <div style={{ flex: 1, minWidth: "200px", position: "relative" }}>
                        <i
                          className="bi bi-search"
                          style={{
                            position: "absolute",
                            left: "0.85rem",
                            top: "50%",
                            transform: "translateY(-50%)",
                            color: "var(--ink-400)",
                          }}
                        ></i>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Search by name or code..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          style={{ paddingLeft: "2.4rem" }}
                        />
                      </div>
                      <select
                        className="form-select"
                        value={filters.curriculum}
                        onChange={(e) => setFilters({ ...filters, curriculum: e.target.value })}
                        style={{ width: "auto", minWidth: "140px" }}
                      >
                        <option value="">All Curriculums</option>
                        {CURRICULA.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      {(searchQuery || filters.curriculum) && (
                        <button className="btn btn-sm btn-light" onClick={clearFilters}>
                          <i className="bi bi-x-lg"></i> Clear
                        </button>
                      )}
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={openAddSubject}>
                      <i className="bi bi-plus-lg me-1"></i> Add Subject
                    </button>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "0.5rem",
                    }}
                  >
                    <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                      <i className="bi bi-book me-2"></i>All Subjects
                    </span>
                    <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
                      {subjectsPage.totalItems} subject{subjectsPage.totalItems !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>

                {subjectsPage.items.length === 0 ? (
                  <div className="empty-state">
                    <i className="bi bi-book"></i>
                    <h6>{searchQuery || filters.curriculum ? "No subjects match your search" : "No subjects created yet"}</h6>
                    <p className="text-muted-soft">
                      {searchQuery || filters.curriculum ? "Try adjusting your search or filters" : 'Click "Add Subject" to get started'}
                    </p>
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-hover mb-0">
                      <thead>
                        <tr>
                          <th>Code</th>
                          <th>Name</th>
                          <th>Curriculum</th>
                          <th>Papers</th>
                          <th style={{ width: "120px" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subjectsPage.items.map((s) => (
                          <tr key={s.id}>
                            <td><span className="badge badge-neutral">{s.code}</span></td>
                            <td><span style={{ fontWeight: 600, color: "var(--ink-900)" }}>{s.name}</span></td>
                            <td>
                              <span className={`badge ${s.curriculum_type === "CBC" ? "badge-blue" : "badge-gold"}`}>
                                {s.curriculum_type}
                              </span>
                            </td>
                            <td>
                              {s.has_papers ? (
                                <span className="badge badge-success">
                                  <i className="bi bi-file-text me-1"></i>
                                  {s.papers?.length ? s.papers.map((p) => p.name).join(", ") : "No papers yet"}
                                </span>
                              ) : (
                                <span className="text-muted-soft">No</span>
                              )}
                            </td>
                            <td>
                              <div className="table-actions">
                                {s.has_papers && (
                                  <button
                                    className="btn btn-sm btn-outline-secondary btn-icon"
                                    title="Manage papers"
                                    onClick={() => openPapersModal(s)}
                                  >
                                    <i className="bi bi-file-earmark-text"></i>
                                  </button>
                                )}
                                <button
                                  className="btn btn-sm btn-outline-primary btn-icon"
                                  title="Edit"
                                  onClick={() => openEditSubject(s)}
                                >
                                  <i className="bi bi-pencil"></i>
                                </button>
                                <button
                                  className="btn btn-sm btn-outline-danger btn-icon"
                                  title="Delete"
                                  onClick={() => deleteSubject(s)}
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
                )}
              </div>

              {subjectsPage.totalItems > 0 && (
                <Pagination
                  currentPage={currentPage}
                  totalPages={subjectsPage.totalPages}
                  onPageChange={(p) => p >= 1 && p <= subjectsPage.totalPages && setCurrentPage(p)}
                  itemsPerPage={itemsPerPage}
                  setItemsPerPage={setItemsPerPage}
                  startIndex={subjectsPage.startIndex}
                  endIndex={subjectsPage.endIndex}
                  totalItems={subjectsPage.totalItems}
                />
              )}
            </>
          )}

          {/* ======================= GRADE OFFERINGS TAB ======================= */}
          {activeTab === "grades" && (
            <>
              <div className="table-wrap mb-4">
                <div
                  className="table-wrap__header"
                  style={{ flexDirection: "column", alignItems: "stretch", gap: "0.75rem" }}
                >
                  <div className="d-flex flex-wrap gap-2 justify-content-between" style={{ width: "100%" }}>
                    <div className="d-flex flex-wrap gap-2" style={{ flex: 1 }}>
                      <div style={{ flex: 1, minWidth: "200px", position: "relative" }}>
                        <i
                          className="bi bi-search"
                          style={{
                            position: "absolute",
                            left: "0.85rem",
                            top: "50%",
                            transform: "translateY(-50%)",
                            color: "var(--ink-400)",
                          }}
                        ></i>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Search by grade or subject..."
                          value={searchQueryLinks}
                          onChange={(e) => setSearchQueryLinks(e.target.value)}
                          style={{ paddingLeft: "2.4rem" }}
                        />
                      </div>
                      <select
                        className="form-select"
                        value={filtersLinks.grade}
                        onChange={(e) => setFiltersLinks({ ...filtersLinks, grade: e.target.value })}
                        style={{ width: "auto", minWidth: "140px" }}
                      >
                        <option value="">All Grades</option>
                        {gradeLevels.map((g) => (
                          <option key={g.id} value={g.id}>{g.name} ({g.curriculum_type})</option>
                        ))}
                      </select>
                      <select
                        className="form-select"
                        value={filtersLinks.type}
                        onChange={(e) => setFiltersLinks({ ...filtersLinks, type: e.target.value })}
                        style={{ width: "auto", minWidth: "130px" }}
                      >
                        <option value="">All Types</option>
                        <option value="compulsory">Compulsory</option>
                        <option value="optional">Optional</option>
                      </select>
                      {(searchQueryLinks || filtersLinks.grade || filtersLinks.type) && (
                        <button className="btn btn-sm btn-light" onClick={clearFiltersLinks}>
                          <i className="bi bi-x-lg"></i> Clear
                        </button>
                      )}
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={openAddGradeSubject}>
                      <i className="bi bi-plus-lg me-1"></i> Offer Subject
                    </button>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "0.5rem",
                    }}
                  >
                    <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                      <i className="bi bi-link-45deg me-2"></i>Grade Subject Offerings
                    </span>
                    <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
                      {gradeSubjectsPage.totalItems} offering{gradeSubjectsPage.totalItems !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>

                {gradeSubjectsPage.items.length === 0 ? (
                  <div className="empty-state">
                    <i className="bi bi-link-45deg"></i>
                    <h6>No grade subject offerings found</h6>
                    <p className="text-muted-soft">Click "Offer Subject" to link a subject to a grade</p>
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-hover mb-0">
                      <thead>
                        <tr>
                          <th>Grade</th>
                          <th>Subject</th>
                          <th>Type</th>
                          <th style={{ width: "100px" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gradeSubjectsPage.items.map((gs) => (
                          <tr key={gs.id}>
                            <td><span className="badge badge-blue">{gradeLabel(gs.grade_level)}</span></td>
                            <td><span style={{ fontWeight: 500, color: "var(--ink-900)" }}>{gs.subject_name}</span></td>
                            <td>
                              {gs.is_compulsory ? (
                                <span className="badge badge-success">
                                  <i className="bi bi-check-circle me-1"></i>Compulsory
                                </span>
                              ) : (
                                <span className="badge badge-neutral">
                                  <i className="bi bi-circle me-1"></i>Optional
                                </span>
                              )}
                            </td>
                            <td>
                              <div className="table-actions">
                                <button
                                  className="btn btn-sm btn-outline-primary btn-icon"
                                  title="Edit"
                                  onClick={() => openEditGradeSubject(gs)}
                                >
                                  <i className="bi bi-pencil"></i>
                                </button>
                                <button
                                  className="btn btn-sm btn-outline-danger btn-icon"
                                  title="Unlink"
                                  onClick={() => deleteGradeSubject(gs)}
                                >
                                  <i className="bi bi-unlink"></i>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {gradeSubjectsPage.totalItems > 0 && (
                <Pagination
                  currentPage={currentPageLinks}
                  totalPages={gradeSubjectsPage.totalPages}
                  onPageChange={(p) => p >= 1 && p <= gradeSubjectsPage.totalPages && setCurrentPageLinks(p)}
                  itemsPerPage={itemsPerPage}
                  setItemsPerPage={setItemsPerPage}
                  startIndex={gradeSubjectsPage.startIndex}
                  endIndex={gradeSubjectsPage.endIndex}
                  totalItems={gradeSubjectsPage.totalItems}
                />
              )}
            </>
          )}

          {/* ========================= SELECTION RULES TAB ========================= */}
          {activeTab === "rules" && (
            <div className="table-wrap">
              <div className="table-wrap__header">
                <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                  <i className="bi bi-sliders2 me-2"></i>Selection Rules by Grade
                </span>
                <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
                  {gradeLevels.length} grade{gradeLevels.length !== 1 ? "s" : ""}
                </span>
              </div>
              {gradeLevels.length === 0 ? (
                <div className="empty-state">
                  <i className="bi bi-sliders2"></i>
                  <h6>No grade levels configured yet</h6>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead>
                      <tr>
                        <th>Grade</th>
                        <th>Min Optional</th>
                        <th>Max Optional</th>
                        <th>Min Total</th>
                        <th>Max Total</th>
                        <th style={{ width: "120px" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gradeLevels.map((g) => {
                        const rule = selectionRules.find((r) => r.grade_level === g.id);
                        return (
                          <tr key={g.id}>
                            <td><span className="badge badge-blue">{g.name} ({g.curriculum_type})</span></td>
                            {rule ? (
                              <>
                                <td>{rule.min_optional_subjects}</td>
                                <td>{rule.max_optional_subjects}</td>
                                <td>{rule.min_total_subjects}</td>
                                <td>{rule.max_total_subjects}</td>
                              </>
                            ) : (
                              <td colSpan={4}><span className="text-muted-soft">Not configured</span></td>
                            )}
                            <td>
                              <div className="table-actions">
                                <button
                                  className="btn btn-sm btn-outline-primary btn-icon"
                                  title={rule ? "Edit rule" : "Set rule"}
                                  onClick={() => openRuleModal(g.id)}
                                >
                                  <i className={`bi ${rule ? "bi-pencil" : "bi-plus-lg"}`}></i>
                                </button>
                                {rule && (
                                  <button
                                    className="btn btn-sm btn-outline-danger btn-icon"
                                    title="Delete rule"
                                    onClick={() => deleteRule(rule)}
                                  >
                                    <i className="bi bi-trash"></i>
                                  </button>
                                )}
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
          )}

          {/* ========================= GRADING SCALES TAB ========================= */}
          {activeTab === "grading" && (
            <>
              <div className="table-wrap mb-4">
                <div
                  className="table-wrap__header"
                  style={{ flexDirection: "column", alignItems: "stretch", gap: "0.75rem" }}
                >
                  <div className="d-flex flex-wrap gap-2 justify-content-between" style={{ width: "100%" }}>
                    <div className="d-flex flex-wrap gap-2" style={{ flex: 1 }}>
                      <select
                        className="form-select"
                        value={filtersGrading.curriculum}
                        onChange={(e) => setFiltersGrading({ ...filtersGrading, curriculum: e.target.value })}
                        style={{ width: "auto", minWidth: "140px" }}
                      >
                        <option value="">All Curriculums</option>
                        {CURRICULA.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <select
                        className="form-select"
                        value={filtersGrading.subject}
                        onChange={(e) => setFiltersGrading({ ...filtersGrading, subject: e.target.value })}
                        style={{ width: "auto", minWidth: "160px" }}
                      >
                        <option value="">All Subjects</option>
                        <option value="general">General (curriculum default)</option>
                        {subjects.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      {(filtersGrading.curriculum || filtersGrading.subject) && (
                        <button
                          className="btn btn-sm btn-light"
                          onClick={() => setFiltersGrading({ curriculum: "", subject: "" })}
                        >
                          <i className="bi bi-x-lg"></i> Clear
                        </button>
                      )}
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={openAddGrading}>
                      <i className="bi bi-plus-lg me-1"></i> Add Grade Band
                    </button>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "0.5rem",
                    }}
                  >
                    <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                      <i className="bi bi-mortarboard me-2"></i>Grading Scales
                    </span>
                    <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
                      {gradingPage.totalItems} band{gradingPage.totalItems !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>

                {gradingPage.items.length === 0 ? (
                  <div className="empty-state">
                    <i className="bi bi-mortarboard"></i>
                    <h6>No grading scale configured yet</h6>
                    <p className="text-muted-soft">
                      Add bands like A (80–100%) for CBC or 8-4-4, per subject or as a curriculum-wide default
                    </p>
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-hover mb-0">
                      <thead>
                        <tr>
                          <th>Curriculum</th>
                          <th>Subject</th>
                          <th>Range</th>
                          <th>Grade</th>
                          <th>Points</th>
                          <th>Remark</th>
                          <th style={{ width: "100px" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gradingPage.items.map((g) => (
                          <tr key={g.id}>
                            <td>
                              <span className={`badge ${g.curriculum_type === "CBC" ? "badge-blue" : "badge-gold"}`}>
                                {g.curriculum_type}
                              </span>
                            </td>
                            <td>
                              {g.subject ? subjectLabel(g.subject) : <span className="badge badge-neutral">General default</span>}
                            </td>
                            <td>{g.min_percentage}% – {g.max_percentage}%</td>
                            <td><span style={{ fontWeight: 700 }}>{g.grade_letter}</span></td>
                            <td>{g.points}</td>
                            <td><span className="text-muted-soft">{g.remark || "—"}</span></td>
                            <td>
                              <div className="table-actions">
                                <button
                                  className="btn btn-sm btn-outline-primary btn-icon"
                                  title="Edit"
                                  onClick={() => openEditGrading(g)}
                                >
                                  <i className="bi bi-pencil"></i>
                                </button>
                                <button
                                  className="btn btn-sm btn-outline-danger btn-icon"
                                  title="Delete"
                                  onClick={() => deleteGrading(g)}
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
                )}
              </div>

              {gradingPage.totalItems > 0 && (
                <Pagination
                  currentPage={currentPageGrading}
                  totalPages={gradingPage.totalPages}
                  onPageChange={(p) => p >= 1 && p <= gradingPage.totalPages && setCurrentPageGrading(p)}
                  itemsPerPage={itemsPerPage}
                  setItemsPerPage={setItemsPerPage}
                  startIndex={gradingPage.startIndex}
                  endIndex={gradingPage.endIndex}
                  totalItems={gradingPage.totalItems}
                />
              )}
            </>
          )}
        </>
      )}

      {/* =============================== MODALS =============================== */}

      {showSubjectModal && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show d-block" tabIndex="-1">
            <div className="modal-dialog">
              <div className="modal-content">
                <form onSubmit={saveSubject}>
                  <div className="modal-header">
                    <h5 className="modal-title">{editingSubject ? "Edit Subject" : "Add Subject"}</h5>
                    <button type="button" className="btn-close" onClick={() => setShowSubjectModal(false)}></button>
                  </div>
                  <div className="modal-body">
                    <label className="form-label small">Name</label>
                    <input
                      className="form-control mb-2"
                      placeholder="e.g. Mathematics"
                      value={subjectForm.name}
                      onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })}
                      required
                    />
                    <label className="form-label small">Code</label>
                    <input
                      className="form-control mb-2"
                      placeholder="e.g. MATH"
                      value={subjectForm.code}
                      onChange={(e) => setSubjectForm({ ...subjectForm, code: e.target.value })}
                      required
                    />
                    <label className="form-label small">Curriculum</label>
                    <select
                      className="form-select mb-2"
                      value={subjectForm.curriculum_type}
                      onChange={(e) => setSubjectForm({ ...subjectForm, curriculum_type: e.target.value })}
                    >
                      {CURRICULA.map((c) => (
                        <option key={c} value={c}>{c === "8-4-4" ? "8-4-4 (Legacy)" : c}</option>
                      ))}
                    </select>
                    <div className="form-check">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        id="hasPapers"
                        checked={subjectForm.has_papers}
                        onChange={(e) => setSubjectForm({ ...subjectForm, has_papers: e.target.checked })}
                      />
                      <label className="form-check-label" htmlFor="hasPapers">
                        Has papers (e.g. PP1/PP2)
                      </label>
                    </div>
                    {editingSubject && subjectForm.has_papers && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary mt-3"
                        onClick={() => {
                          setShowSubjectModal(false);
                          openPapersModal(editingSubject);
                        }}
                      >
                        <i className="bi bi-file-earmark-text me-1"></i>Manage Papers
                      </button>
                    )}
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-light" onClick={() => setShowSubjectModal(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                      {saving ? "Saving..." : "Save Subject"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </>
      )}

      {showPapersModal && papersSubject && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show d-block" tabIndex="-1">
            <div className="modal-dialog modal-lg">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Papers — {papersSubject.name}</h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => {
                      setShowPapersModal(false);
                      setEditingPaper(null);
                    }}
                  ></button>
                </div>
                <div className="modal-body">
                  {papersSubject.papers?.length > 0 ? (
                    <table className="table table-sm mb-3">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Name</th>
                          <th>Max Marks</th>
                          <th style={{ width: "90px" }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {papersSubject.papers
                          .slice()
                          .sort((a, b) => a.paper_number - b.paper_number)
                          .map((p) => (
                            <tr key={p.id}>
                              <td>{p.paper_number}</td>
                              <td>{p.name}</td>
                              <td>{p.max_marks}</td>
                              <td>
                                <div className="table-actions">
                                  <button
                                    className="btn btn-sm btn-outline-primary btn-icon"
                                    title="Edit"
                                    onClick={() => openEditPaper(p)}
                                  >
                                    <i className="bi bi-pencil"></i>
                                  </button>
                                  <button
                                    className="btn btn-sm btn-outline-danger btn-icon"
                                    title="Delete"
                                    onClick={() => deletePaper(p)}
                                  >
                                    <i className="bi bi-trash"></i>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-muted-soft mb-3">No papers added yet.</p>
                  )}

                  <hr />
                  <h6 className="mb-2">{editingPaper ? "Edit Paper" : "Add Paper"}</h6>
                  <form onSubmit={savePaper}>
                    <div className="row g-2">
                      <div className="col-3">
                        <label className="form-label small">Paper #</label>
                        <input
                          type="number"
                          min="1"
                          className="form-control"
                          value={paperForm.paper_number}
                          onChange={(e) => setPaperForm({ ...paperForm, paper_number: Number(e.target.value) })}
                          required
                        />
                      </div>
                      <div className="col-5">
                        <label className="form-label small">Name</label>
                        <input
                          className="form-control"
                          placeholder="e.g. PP1"
                          value={paperForm.name}
                          onChange={(e) => setPaperForm({ ...paperForm, name: e.target.value })}
                          required
                        />
                      </div>
                      <div className="col-4">
                        <label className="form-label small">Max Marks</label>
                        <input
                          type="number"
                          min="1"
                          className="form-control"
                          value={paperForm.max_marks}
                          onChange={(e) => setPaperForm({ ...paperForm, max_marks: Number(e.target.value) })}
                          required
                        />
                      </div>
                    </div>
                    <div className="d-flex gap-2 mt-3">
                      <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                        {saving ? "Saving..." : editingPaper ? "Update Paper" : "Add Paper"}
                      </button>
                      {editingPaper && (
                        <button
                          type="button"
                          className="btn btn-light btn-sm"
                          onClick={() => {
                            setEditingPaper(null);
                            setPaperForm({ ...emptyPaperForm, paper_number: (papersSubject.papers?.length || 0) + 1 });
                          }}
                        >
                          Cancel Edit
                        </button>
                      )}
                    </div>
                  </form>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-light"
                    onClick={() => {
                      setShowPapersModal(false);
                      setEditingPaper(null);
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {showGradeSubjectModal && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show d-block" tabIndex="-1">
            <div className="modal-dialog">
              <div className="modal-content">
                <form onSubmit={saveGradeSubject}>
                  <div className="modal-header">
                    <h5 className="modal-title">
                      {editingGradeSubject ? "Edit Offering" : "Offer Subject at a Grade"}
                    </h5>
                    <button type="button" className="btn-close" onClick={() => setShowGradeSubjectModal(false)}></button>
                  </div>
                  <div className="modal-body">
                    <label className="form-label small">Grade Level</label>
                    <select
                      className="form-select mb-2"
                      required
                      value={gradeSubjectForm.grade_level}
                      onChange={(e) =>
                        setGradeSubjectForm({ ...gradeSubjectForm, grade_level: e.target.value, subject: "" })
                      }
                    >
                      <option value="">Grade level...</option>
                      {gradeLevels.map((g) => (
                        <option key={g.id} value={g.id}>{g.name} ({g.curriculum_type})</option>
                      ))}
                    </select>
                    <label className="form-label small">Subject</label>
                    <select
                      className="form-select mb-2"
                      required
                      value={gradeSubjectForm.subject}
                      onChange={(e) => setGradeSubjectForm({ ...gradeSubjectForm, subject: e.target.value })}
                    >
                      <option value="">Subject...</option>
                      {subjectOptionsForGrade(Number(gradeSubjectForm.grade_level)).map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    {gradeSubjectForm.grade_level && (
                      <p className="text-muted-soft" style={{ fontSize: "var(--fs-xs)" }}>
                        Showing subjects matching this grade's curriculum ({gradeLevelsById[gradeSubjectForm.grade_level]?.curriculum_type}).
                      </p>
                    )}
                    <div className="form-check mb-2">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        id="isCompulsory"
                        checked={gradeSubjectForm.is_compulsory}
                        onChange={(e) => setGradeSubjectForm({ ...gradeSubjectForm, is_compulsory: e.target.checked })}
                      />
                      <label className="form-check-label" htmlFor="isCompulsory">Compulsory</label>
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-light" onClick={() => setShowGradeSubjectModal(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                      {saving ? "Saving..." : "Save"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </>
      )}

      {showRuleModal && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show d-block" tabIndex="-1">
            <div className="modal-dialog">
              <div className="modal-content">
                <form onSubmit={saveRule}>
                  <div className="modal-header">
                    <h5 className="modal-title">
                      Selection Rule — {gradeLabel(ruleForm.grade_level)}
                    </h5>
                    <button type="button" className="btn-close" onClick={() => setShowRuleModal(false)}></button>
                  </div>
                  <div className="modal-body">
                    <div className="row g-2">
                      <div className="col-6">
                        <label className="form-label small">Min optional</label>
                        <input
                          type="number"
                          className="form-control"
                          value={ruleForm.min_optional_subjects}
                          onChange={(e) => setRuleForm({ ...ruleForm, min_optional_subjects: Number(e.target.value) })}
                        />
                      </div>
                      <div className="col-6">
                        <label className="form-label small">Max optional</label>
                        <input
                          type="number"
                          className="form-control"
                          value={ruleForm.max_optional_subjects}
                          onChange={(e) => setRuleForm({ ...ruleForm, max_optional_subjects: Number(e.target.value) })}
                        />
                      </div>
                      <div className="col-6">
                        <label className="form-label small">Min total</label>
                        <input
                          type="number"
                          className="form-control"
                          value={ruleForm.min_total_subjects}
                          onChange={(e) => setRuleForm({ ...ruleForm, min_total_subjects: Number(e.target.value) })}
                        />
                      </div>
                      <div className="col-6">
                        <label className="form-label small">Max total</label>
                        <input
                          type="number"
                          className="form-control"
                          value={ruleForm.max_total_subjects}
                          onChange={(e) => setRuleForm({ ...ruleForm, max_total_subjects: Number(e.target.value) })}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-light" onClick={() => setShowRuleModal(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                      {saving ? "Saving..." : "Save Rule"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </>
      )}

      {showGradingModal && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show d-block" tabIndex="-1">
            <div className="modal-dialog">
              <div className="modal-content">
                <form onSubmit={saveGrading}>
                  <div className="modal-header">
                    <h5 className="modal-title">{editingGrading ? "Edit Grade Band" : "Add Grade Band"}</h5>
                    <button type="button" className="btn-close" onClick={() => setShowGradingModal(false)}></button>
                  </div>
                  <div className="modal-body">
                    <label className="form-label small">Curriculum</label>
                    <select
                      className="form-select mb-2"
                      value={gradingForm.curriculum_type}
                      onChange={(e) => setGradingForm({ ...gradingForm, curriculum_type: e.target.value })}
                    >
                      {CURRICULA.map((c) => (
                        <option key={c} value={c}>{c === "8-4-4" ? "8-4-4 (Legacy)" : c}</option>
                      ))}
                    </select>
                    <label className="form-label small">Subject (optional)</label>
                    <select
                      className="form-select mb-2"
                      value={gradingForm.subject}
                      onChange={(e) => setGradingForm({ ...gradingForm, subject: e.target.value })}
                    >
                      <option value="">General (curriculum-wide default)</option>
                      {subjects
                        .filter((s) => s.curriculum_type === gradingForm.curriculum_type)
                        .map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                    <div className="row g-2">
                      <div className="col-6">
                        <label className="form-label small">Min %</label>
                        <input
                          type="number"
                          step="0.01"
                          className="form-control"
                          value={gradingForm.min_percentage}
                          onChange={(e) => setGradingForm({ ...gradingForm, min_percentage: e.target.value })}
                          required
                        />
                      </div>
                      <div className="col-6">
                        <label className="form-label small">Max %</label>
                        <input
                          type="number"
                          step="0.01"
                          className="form-control"
                          value={gradingForm.max_percentage}
                          onChange={(e) => setGradingForm({ ...gradingForm, max_percentage: e.target.value })}
                          required
                        />
                      </div>
                      <div className="col-4">
                        <label className="form-label small">Grade letter</label>
                        <input
                          className="form-control"
                          placeholder="e.g. A, E.E"
                          value={gradingForm.grade_letter}
                          onChange={(e) => setGradingForm({ ...gradingForm, grade_letter: e.target.value })}
                          required
                        />
                      </div>
                      <div className="col-4">
                        <label className="form-label small">Points</label>
                        <input
                          type="number"
                          step="0.01"
                          className="form-control"
                          value={gradingForm.points}
                          onChange={(e) => setGradingForm({ ...gradingForm, points: e.target.value })}
                        />
                      </div>
                      <div className="col-12">
                        <label className="form-label small">Remark</label>
                        <input
                          className="form-control"
                          placeholder="e.g. Exceeding Expectation"
                          value={gradingForm.remark}
                          onChange={(e) => setGradingForm({ ...gradingForm, remark: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-light" onClick={() => setShowGradingModal(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                      {saving ? "Saving..." : "Save Grade Band"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}