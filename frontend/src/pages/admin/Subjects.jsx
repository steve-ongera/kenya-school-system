import { useEffect, useState, useMemo } from "react";
import api, { academicsApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";
import Pagination from "../../components/Pagination";

export default function AdminSubjects() {
  const [subjects, setSubjects] = useState([]);
  const [gradeLevels, setGradeLevels] = useState([]);
  const [gradeSubjects, setGradeSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchQueryLinks, setSearchQueryLinks] = useState("");
  const [filters, setFilters] = useState({
    curriculum: "",
  });
  const [filtersLinks, setFiltersLinks] = useState({
    grade: "",
    type: "",
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [currentPageLinks, setCurrentPageLinks] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [subjectForm, setSubjectForm] = useState({ 
    name: "", 
    code: "", 
    curriculum_type: "CBC", 
    has_papers: false 
  });
  const [linkForm, setLinkForm] = useState({ 
    grade_level: "", 
    subject: "", 
    is_compulsory: true 
  });
  const [ruleForm, setRuleForm] = useState({ 
    grade_level: "", 
    min_optional_subjects: 0, 
    max_optional_subjects: 0, 
    min_total_subjects: 7, 
    max_total_subjects: 9 
  });

  const loadAll = async () => {
    setLoading(true);
    try {
      const [s, g, gs] = await Promise.all([
        academicsApi.subjects(),
        academicsApi.gradeLevels(),
        academicsApi.gradeSubjects(),
      ]);
      setSubjects(s.data.results ?? s.data);
      setGradeLevels(g.data.results ?? g.data);
      setGradeSubjects(gs.data.results ?? gs.data);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const addSubject = async (e) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);
    try {
      await api.post("/subjects/", subjectForm);
      setSubjectForm({ name: "", code: "", curriculum_type: "CBC", has_papers: false });
      await loadAll();
      setMessage("✅ Subject created successfully.");
      setMessageType("success");
    } catch (err) {
      setMessage(err.response?.data ? JSON.stringify(err.response.data) : "Could not create subject.");
      setMessageType("danger");
    } finally {
      setLoading(false);
    }
  };

  const linkSubjectToGrade = async (e) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);
    try {
      await api.post("/grade-subjects/", linkForm);
      setLinkForm({ grade_level: "", subject: "", is_compulsory: true });
      await loadAll();
      setMessage("✅ Subject linked to grade successfully.");
      setMessageType("success");
    } catch (err) {
      setMessage(err.response?.data ? JSON.stringify(err.response.data) : "Could not link subject.");
      setMessageType("danger");
    } finally {
      setLoading(false);
    }
  };

  const saveSelectionRule = async (e) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);
    try {
      await api.post("/selection-rules/", ruleForm);
      setRuleForm({ grade_level: "", min_optional_subjects: 0, max_optional_subjects: 0, min_total_subjects: 7, max_total_subjects: 9 });
      setMessage("✅ Selection rule saved successfully.");
      setMessageType("success");
    } catch (err) {
      setMessage(err.response?.data ? JSON.stringify(err.response.data) : "Could not save rule.");
      setMessageType("danger");
    } finally {
      setLoading(false);
    }
  };

  // Filter and Search Logic for Subjects
  const filteredSubjects = useMemo(() => {
    let result = subjects;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(s =>
        s.name?.toLowerCase().includes(query) ||
        s.code?.toLowerCase().includes(query)
      );
    }

    if (filters.curriculum) {
      result = result.filter(s => s.curriculum_type === filters.curriculum);
    }

    return result;
  }, [subjects, searchQuery, filters]);

  // Filter and Search Logic for Grade Subjects
  const filteredGradeSubjects = useMemo(() => {
    let result = gradeSubjects;

    if (searchQueryLinks.trim()) {
      const query = searchQueryLinks.toLowerCase().trim();
      result = result.filter(gs =>
        gs.grade_level?.toLowerCase().includes(query) ||
        gs.subject_name?.toLowerCase().includes(query)
      );
    }

    if (filtersLinks.grade) {
      result = result.filter(gs => gs.grade_level_id === parseInt(filtersLinks.grade));
    }

    if (filtersLinks.type) {
      const isCompulsory = filtersLinks.type === "compulsory";
      result = result.filter(gs => gs.is_compulsory === isCompulsory);
    }

    return result;
  }, [gradeSubjects, searchQueryLinks, filtersLinks]);

  const totalItems = filteredSubjects.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentItems = filteredSubjects.slice(startIndex, endIndex);

  const totalItemsLinks = filteredGradeSubjects.length;
  const totalPagesLinks = Math.ceil(totalItemsLinks / itemsPerPage);
  const startIndexLinks = (currentPageLinks - 1) * itemsPerPage;
  const endIndexLinks = startIndexLinks + itemsPerPage;
  const currentItemsLinks = filteredGradeSubjects.slice(startIndexLinks, endIndexLinks);

  useEffect(() => setCurrentPage(1), [searchQuery, filters]);
  useEffect(() => setCurrentPageLinks(1), [searchQueryLinks, filtersLinks]);

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  const handlePageChangeLinks = (page) => {
    if (page < 1 || page > totalPagesLinks) return;
    setCurrentPageLinks(page);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setFilters({ curriculum: "" });
    setCurrentPage(1);
  };

  const clearFiltersLinks = () => {
    setSearchQueryLinks("");
    setFiltersLinks({ grade: "", type: "" });
    setCurrentPageLinks(1);
  };

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: "Dashboard", href: "/admin" },
        { label: "Subjects", href: "/admin/subjects" },
        { label: "All Subjects", href: "#" },
      ]} />

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Subjects</h1>
          <p className="page-subtitle">
            Manage subjects, link them to grades, and configure selection rules
          </p>
        </div>
      </div>

      {/* Message Alerts */}
      {message && (
        <div className={`alert alert-${messageType} alert-dismissible fade show`} role="alert">
          {message}
          <button type="button" className="btn-close" onClick={() => setMessage("")}></button>
        </div>
      )}

      {/* Three Forms in a Row */}
      <div className="row g-3 mb-4">
        {/* Add Subject Form */}
        <div className="col-md-4">
          <div className="card p-3 h-100">
            <h6 className="mb-3" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
              <i className="bi bi-book me-2" style={{ color: "var(--blue-700)" }}></i>
              Add Subject
            </h6>
            <form onSubmit={addSubject}>
              <input 
                className="form-control mb-2" 
                placeholder="Name e.g. Mathematics"
                value={subjectForm.name} 
                onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })} 
                required 
              />
              <input 
                className="form-control mb-2" 
                placeholder="Code e.g. MATH"
                value={subjectForm.code} 
                onChange={(e) => setSubjectForm({ ...subjectForm, code: e.target.value })} 
                required 
              />
              <select 
                className="form-select mb-2" 
                value={subjectForm.curriculum_type}
                onChange={(e) => setSubjectForm({ ...subjectForm, curriculum_type: e.target.value })}
              >
                <option value="CBC">CBC</option>
                <option value="8-4-4">8-4-4 (Legacy)</option>
              </select>
              <div className="form-check mb-2">
                <input type="checkbox" className="form-check-input" id="hasPapers"
                  checked={subjectForm.has_papers}
                  onChange={(e) => setSubjectForm({ ...subjectForm, has_papers: e.target.checked })} />
                <label className="form-check-label" htmlFor="hasPapers">Has papers (PP1/PP2)</label>
              </div>
              <button className="btn btn-primary btn-sm w-100" type="submit" disabled={loading}>
                {loading ? "Saving..." : "Save Subject"}
              </button>
            </form>
          </div>
        </div>

        {/* Link Subject to Grade Form */}
        <div className="col-md-4">
          <div className="card p-3 h-100">
            <h6 className="mb-3" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
              <i className="bi bi-link-45deg me-2" style={{ color: "var(--blue-700)" }}></i>
              Offer Subject at a Grade
            </h6>
            <form onSubmit={linkSubjectToGrade}>
              <select 
                className="form-select mb-2" 
                required 
                value={linkForm.grade_level}
                onChange={(e) => setLinkForm({ ...linkForm, grade_level: e.target.value })}
              >
                <option value="">Grade level...</option>
                {gradeLevels.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <select 
                className="form-select mb-2" 
                required 
                value={linkForm.subject}
                onChange={(e) => setLinkForm({ ...linkForm, subject: e.target.value })}
              >
                <option value="">Subject...</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <div className="form-check mb-2">
                <input type="checkbox" className="form-check-input" id="isCompulsory"
                  checked={linkForm.is_compulsory}
                  onChange={(e) => setLinkForm({ ...linkForm, is_compulsory: e.target.checked })} />
                <label className="form-check-label" htmlFor="isCompulsory">Compulsory</label>
              </div>
              <button className="btn btn-primary btn-sm w-100" type="submit" disabled={loading}>
                {loading ? "Saving..." : "Save"}
              </button>
            </form>
          </div>
        </div>

        {/* Selection Rule Form */}
        <div className="col-md-4">
          <div className="card p-3 h-100">
            <h6 className="mb-3" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
              <i className="bi bi-sliders2 me-2" style={{ color: "var(--blue-700)" }}></i>
              Selection Rule for a Grade
            </h6>
            <form onSubmit={saveSelectionRule}>
              <select 
                className="form-select mb-2" 
                required 
                value={ruleForm.grade_level}
                onChange={(e) => setRuleForm({ ...ruleForm, grade_level: e.target.value })}
              >
                <option value="">Grade level...</option>
                {gradeLevels.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <div className="row g-2">
                <div className="col-6">
                  <label className="form-label small">Min optional</label>
                  <input type="number" className="form-control" value={ruleForm.min_optional_subjects}
                    onChange={(e) => setRuleForm({ ...ruleForm, min_optional_subjects: Number(e.target.value) })} />
                </div>
                <div className="col-6">
                  <label className="form-label small">Max optional</label>
                  <input type="number" className="form-control" value={ruleForm.max_optional_subjects}
                    onChange={(e) => setRuleForm({ ...ruleForm, max_optional_subjects: Number(e.target.value) })} />
                </div>
                <div className="col-6">
                  <label className="form-label small">Min total</label>
                  <input type="number" className="form-control" value={ruleForm.min_total_subjects}
                    onChange={(e) => setRuleForm({ ...ruleForm, min_total_subjects: Number(e.target.value) })} />
                </div>
                <div className="col-6">
                  <label className="form-label small">Max total</label>
                  <input type="number" className="form-control" value={ruleForm.max_total_subjects}
                    onChange={(e) => setRuleForm({ ...ruleForm, max_total_subjects: Number(e.target.value) })} />
                </div>
              </div>
              <button className="btn btn-primary btn-sm w-100 mt-2" type="submit" disabled={loading}>
                {loading ? "Saving..." : "Save Rule"}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Subjects Table */}
      {loading ? (
        <TableSkeleton rows={5} columns={4} />
      ) : currentItems.length === 0 ? (
        <div className="table-wrap mb-4">
          <div className="table-wrap__header" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.75rem" }}>
            <div className="d-flex flex-wrap gap-2" style={{ width: "100%" }}>
              <div style={{ flex: 1, minWidth: "200px", position: "relative" }}>
                <i className="bi bi-search" style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--ink-400)" }}></i>
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
                <option value="CBC">CBC</option>
                <option value="8-4-4">8-4-4</option>
              </select>
              {(searchQuery || filters.curriculum) && (
                <button className="btn btn-sm btn-light" onClick={clearFilters}>
                  <i className="bi bi-x-lg"></i> Clear
                </button>
              )}
            </div>
            {(searchQuery || filters.curriculum) && (
              <div className="d-flex flex-wrap gap-1">
                {searchQuery && (
                  <span className="filter-chip">
                    Search: "{searchQuery}"
                    <button onClick={() => setSearchQuery("")}><i className="bi bi-x"></i></button>
                  </span>
                )}
                {filters.curriculum && (
                  <span className="filter-chip">
                    Curriculum: {filters.curriculum}
                    <button onClick={() => setFilters({ ...filters, curriculum: "" })}><i className="bi bi-x"></i></button>
                  </span>
                )}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
              <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                <i className="bi bi-book me-2"></i>
                All Subjects
              </span>
              <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
                {totalItems} subject{totalItems !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <div className="empty-state">
            <i className="bi bi-book"></i>
            <h6>
              {searchQuery || filters.curriculum 
                ? "No subjects match your search" 
                : "No subjects created yet"}
            </h6>
            <p className="text-muted-soft">
              {searchQuery || filters.curriculum
                ? "Try adjusting your search or filters"
                : "Use the form above to add your first subject"}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="table-wrap mb-4">
            <div className="table-wrap__header" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.75rem" }}>
              <div className="d-flex flex-wrap gap-2" style={{ width: "100%" }}>
                <div style={{ flex: 1, minWidth: "200px", position: "relative" }}>
                  <i className="bi bi-search" style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--ink-400)" }}></i>
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
                  <option value="CBC">CBC</option>
                  <option value="8-4-4">8-4-4</option>
                </select>
                {(searchQuery || filters.curriculum) && (
                  <button className="btn btn-sm btn-light" onClick={clearFilters}>
                    <i className="bi bi-x-lg"></i> Clear
                  </button>
                )}
              </div>
              {(searchQuery || filters.curriculum) && (
                <div className="d-flex flex-wrap gap-1">
                  {searchQuery && (
                    <span className="filter-chip">
                      Search: "{searchQuery}"
                      <button onClick={() => setSearchQuery("")}><i className="bi bi-x"></i></button>
                    </span>
                  )}
                  {filters.curriculum && (
                    <span className="filter-chip">
                      Curriculum: {filters.curriculum}
                      <button onClick={() => setFilters({ ...filters, curriculum: "" })}><i className="bi bi-x"></i></button>
                    </span>
                  )}
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                  <i className="bi bi-book me-2"></i>
                  All Subjects
                </span>
                <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
                  Showing {startIndex + 1}-{Math.min(endIndex, totalItems)} of {totalItems}
                </span>
              </div>
            </div>
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Curriculum</th>
                    <th>Papers</th>
                    <th style={{ width: "80px" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentItems.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <span className="badge badge-neutral">{s.code}</span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>{s.name}</span>
                      </td>
                      <td>
                        <span className={`badge ${s.curriculum_type === "CBC" ? "badge-blue" : "badge-gold"}`}>
                          {s.curriculum_type}
                        </span>
                      </td>
                      <td>
                        {s.has_papers ? (
                          <span className="badge badge-success">
                            <i className="bi bi-file-text me-1"></i>
                            {s.papers?.map((p) => p.name).join(", ") || "Yes"}
                          </span>
                        ) : (
                          <span className="text-muted-soft">No</span>
                        )}
                      </td>
                      <td>
                        <div className="table-actions">
                          <button className="btn btn-sm btn-outline-primary btn-icon" title="Edit">
                            <i className="bi bi-pencil"></i>
                          </button>
                          <button className="btn btn-sm btn-outline-danger btn-icon" title="Delete">
                            <i className="bi bi-trash"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

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
        </>
      )}

      {/* Grade Subjects Table */}
      <h5 className="mt-4 mb-3" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
        <i className="bi bi-link-45deg me-2" style={{ color: "var(--blue-700)" }}></i>
        Grade Subject Offerings
      </h5>

      {loading ? (
        <TableSkeleton rows={5} columns={3} />
      ) : currentItemsLinks.length === 0 ? (
        <div className="table-wrap">
          <div className="table-wrap__header" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.75rem" }}>
            <div className="d-flex flex-wrap gap-2" style={{ width: "100%" }}>
              <div style={{ flex: 1, minWidth: "200px", position: "relative" }}>
                <i className="bi bi-search" style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--ink-400)" }}></i>
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
                  <option key={g.id} value={g.id}>{g.name}</option>
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
            {(searchQueryLinks || filtersLinks.grade || filtersLinks.type) && (
              <div className="d-flex flex-wrap gap-1">
                {searchQueryLinks && (
                  <span className="filter-chip">
                    Search: "{searchQueryLinks}"
                    <button onClick={() => setSearchQueryLinks("")}><i className="bi bi-x"></i></button>
                  </span>
                )}
                {filtersLinks.grade && (
                  <span className="filter-chip">
                    Grade: {gradeLevels.find(g => g.id === parseInt(filtersLinks.grade))?.name}
                    <button onClick={() => setFiltersLinks({ ...filtersLinks, grade: "" })}><i className="bi bi-x"></i></button>
                  </span>
                )}
                {filtersLinks.type && (
                  <span className="filter-chip">
                    Type: {filtersLinks.type}
                    <button onClick={() => setFiltersLinks({ ...filtersLinks, type: "" })}><i className="bi bi-x"></i></button>
                  </span>
                )}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
              <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                <i className="bi bi-link-45deg me-2"></i>
                Grade Subject Offerings
              </span>
              <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
                {totalItemsLinks} offering{totalItemsLinks !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <div className="empty-state">
            <i className="bi bi-link-45deg"></i>
            <h6>No grade subject offerings found</h6>
            <p className="text-muted-soft">Use the form above to link subjects to grades</p>
          </div>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <div className="table-wrap__header" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.75rem" }}>
              <div className="d-flex flex-wrap gap-2" style={{ width: "100%" }}>
                <div style={{ flex: 1, minWidth: "200px", position: "relative" }}>
                  <i className="bi bi-search" style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--ink-400)" }}></i>
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
                    <option key={g.id} value={g.id}>{g.name}</option>
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
              {(searchQueryLinks || filtersLinks.grade || filtersLinks.type) && (
                <div className="d-flex flex-wrap gap-1">
                  {searchQueryLinks && (
                    <span className="filter-chip">
                      Search: "{searchQueryLinks}"
                      <button onClick={() => setSearchQueryLinks("")}><i className="bi bi-x"></i></button>
                    </span>
                  )}
                  {filtersLinks.grade && (
                    <span className="filter-chip">
                      Grade: {gradeLevels.find(g => g.id === parseInt(filtersLinks.grade))?.name}
                      <button onClick={() => setFiltersLinks({ ...filtersLinks, grade: "" })}><i className="bi bi-x"></i></button>
                    </span>
                  )}
                  {filtersLinks.type && (
                    <span className="filter-chip">
                      Type: {filtersLinks.type}
                      <button onClick={() => setFiltersLinks({ ...filtersLinks, type: "" })}><i className="bi bi-x"></i></button>
                    </span>
                  )}
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                  <i className="bi bi-link-45deg me-2"></i>
                  Grade Subject Offerings
                </span>
                <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
                  Showing {startIndexLinks + 1}-{Math.min(endIndexLinks, totalItemsLinks)} of {totalItemsLinks}
                </span>
              </div>
            </div>
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th>Grade</th>
                    <th>Subject</th>
                    <th>Type</th>
                    <th style={{ width: "80px" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentItemsLinks.map((gs) => (
                    <tr key={gs.id}>
                      <td>
                        <span className="badge badge-blue">{gs.grade_level}</span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 500, color: "var(--ink-900)" }}>{gs.subject_name}</span>
                      </td>
                      <td>
                        {gs.is_compulsory ? (
                          <span className="badge badge-success">
                            <i className="bi bi-check-circle me-1"></i>
                            Compulsory
                          </span>
                        ) : (
                          <span className="badge badge-neutral">
                            <i className="bi bi-circle me-1"></i>
                            Optional
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="table-actions">
                          <button className="btn btn-sm btn-outline-danger btn-icon" title="Unlink">
                            <i className="bi bi-unlink"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Pagination
            currentPage={currentPageLinks}
            totalPages={totalPagesLinks}
            onPageChange={handlePageChangeLinks}
            itemsPerPage={itemsPerPage}
            setItemsPerPage={setItemsPerPage}
            startIndex={startIndexLinks}
            endIndex={endIndexLinks}
            totalItems={totalItemsLinks}
          />
        </>
      )}
    </div>
  );
}