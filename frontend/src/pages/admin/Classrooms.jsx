import { useEffect, useState } from "react";
import api, { academicsApi, calendarApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";
import Pagination from "../../components/Pagination";

export default function AdminClassrooms() {
  const [classrooms, setClassrooms] = useState([]);
  const [gradeLevels, setGradeLevels] = useState([]);
  const [streams, setStreams] = useState([]);
  const [years, setYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState({
    grade_level: "",
    stream: "",
    year: "",
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [gradeForm, setGradeForm] = useState({
    name: "",
    curriculum_type: "CBC",
    education_level: "JSS",
    level_order: "",
  });
  const [streamForm, setStreamForm] = useState({ name: "" });
  const [classForm, setClassForm] = useState({
    grade_level: "",
    stream: "",
    academic_year: "",
  });

  // ---- Bulk create form ----
  const [bulkForm, setBulkForm] = useState({ academic_year: "", grade_level_ids: [], stream_ids: [] });
  const [bulkSaving, setBulkSaving] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [c, g, s, y] = await Promise.all([
        academicsApi.classrooms(),
        academicsApi.gradeLevels(),
        academicsApi.streams(),
        calendarApi.academicYears(),
      ]);
      setClassrooms(c.data.results ?? c.data);
      setGradeLevels(g.data.results ?? g.data);
      setStreams(s.data.results ?? s.data);
      setYears(y.data.results ?? y.data);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const addGradeLevel = async (e) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);
    try {
      await api.post("/grade-levels/", { ...gradeForm, level_order: Number(gradeForm.level_order) });
      setGradeForm({ name: "", curriculum_type: "CBC", education_level: "JSS", level_order: "" });
      await loadAll();
      setMessage("Grade level created successfully.");
      setMessageType("success");
    } catch (err) {
      setMessage(err.response?.data ? JSON.stringify(err.response.data) : "Could not create grade level.");
      setMessageType("danger");
    } finally {
      setLoading(false);
    }
  };

  const addStream = async (e) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);
    try {
      await api.post("/streams/", streamForm);
      setStreamForm({ name: "" });
      await loadAll();
      setMessage("Stream created successfully.");
      setMessageType("success");
    } catch {
      setMessage("Could not create stream.");
      setMessageType("danger");
    } finally {
      setLoading(false);
    }
  };

  const addClassroom = async (e) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);
    try {
      await api.post("/classrooms/", classForm);
      setClassForm({ grade_level: "", stream: "", academic_year: "" });
      await loadAll();
      setMessage("Classroom created successfully.");
      setMessageType("success");
    } catch (err) {
      setMessage(err.response?.data ? JSON.stringify(err.response.data) : "Could not create classroom.");
      setMessageType("danger");
    } finally {
      setLoading(false);
    }
  };

  // ---- Bulk create handlers ----
  const toggleBulkSelection = (field, id) => {
    setBulkForm((prev) => {
      const current = prev[field];
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      return { ...prev, [field]: next };
    });
  };

  const selectAllBulk = (field, allIds) => {
    setBulkForm((prev) => ({
      ...prev,
      [field]: prev[field].length === allIds.length ? [] : allIds,
    }));
  };

  const handleBulkCreate = async (e) => {
    e.preventDefault();
    setMessage("");
    setBulkSaving(true);
    try {
      const { data } = await api.post("/classrooms/bulk_create/", {
        academic_year: bulkForm.academic_year,
        grade_level_ids: bulkForm.grade_level_ids,
        stream_ids: bulkForm.stream_ids,
      });
      setMessage(
        `Created ${data.created_count} classroom(s). ${data.skipped_count} already existed and were skipped.`
      );
      setMessageType("success");
      setBulkForm({ academic_year: "", grade_level_ids: [], stream_ids: [] });
      await loadAll();
    } catch (err) {
      setMessage(err.response?.data ? JSON.stringify(err.response.data) : "Could not bulk create classrooms.");
      setMessageType("danger");
    } finally {
      setBulkSaving(false);
    }
  };

  // Filter and Search Logic
  const filteredClassrooms = classrooms.filter((c) => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      const matchGrade = c.grade_level_name?.toLowerCase().includes(query);
      const matchStream = c.stream_name?.toLowerCase().includes(query);
      const matchYear = String(c.academic_year_year ?? "").toLowerCase().includes(query);
      const matchTeacher = c.class_teacher_name?.toLowerCase().includes(query);
      if (!matchGrade && !matchStream && !matchYear && !matchTeacher) return false;
    }

    if (filters.grade_level && String(c.grade_level) !== String(filters.grade_level)) return false;
    if (filters.stream && String(c.stream) !== String(filters.stream)) return false;
    if (filters.year && String(c.academic_year) !== String(filters.year)) return false;

    return true;
  });

  const totalItems = filteredClassrooms.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentItems = filteredClassrooms.slice(startIndex, endIndex);

  useEffect(() => setCurrentPage(1), [searchQuery, filters]);

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setFilters({ grade_level: "", stream: "", year: "" });
    setCurrentPage(1);
  };

  const hasActiveFilters = !!(searchQuery || filters.grade_level || filters.stream || filters.year);
  const bulkComboCount = bulkForm.grade_level_ids.length * bulkForm.stream_ids.length;

  return (
    <div>
      <Breadcrumb items={[
        { label: "Dashboard", href: "/admin" },
        { label: "Classes & Streams", href: "/admin/classrooms" },
        { label: "All Classes", href: "#" },
      ]} />

      <div className="page-header">
        <div>
          <h1 className="page-title">Classes & Streams</h1>
          <p className="page-subtitle">
            Manage grade levels, streams, and classroom configurations
          </p>
        </div>
      </div>

      {message && (
        <div className={`alert alert-${messageType} alert-dismissible fade show`} role="alert">
          {message}
          <button type="button" className="btn-close" onClick={() => setMessage("")}></button>
        </div>
      )}

      {/* Three Forms in a Row */}
      <div className="row g-3 mb-4">
        <div className="col-md-4">
          <div className="card p-3 h-100">
            <h6 className="mb-3" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
              <i className="bi bi-book me-2" style={{ color: "var(--blue-700)" }}></i>
              Add Grade Level
            </h6>
            <form onSubmit={addGradeLevel}>
              <input
                className="form-control mb-2"
                placeholder="Name e.g. Grade 9"
                value={gradeForm.name}
                onChange={(e) => setGradeForm({ ...gradeForm, name: e.target.value })}
                required
              />
              <select
                className="form-select mb-2"
                value={gradeForm.curriculum_type}
                onChange={(e) => setGradeForm({ ...gradeForm, curriculum_type: e.target.value })}
              >
                <option value="CBC">CBC</option>
                <option value="8-4-4">8-4-4 (Legacy)</option>
              </select>
              <select
                className="form-select mb-2"
                value={gradeForm.education_level}
                onChange={(e) => setGradeForm({ ...gradeForm, education_level: e.target.value })}
              >
                <option value="JSS">Junior Secondary</option>
                <option value="SSS">Senior Secondary</option>
                <option value="LEGACY">Secondary (8-4-4)</option>
              </select>
              <input
                type="number"
                className="form-control mb-2"
                placeholder="Level order e.g. 9"
                value={gradeForm.level_order}
                onChange={(e) => setGradeForm({ ...gradeForm, level_order: e.target.value })}
                required
              />
              <button className="btn btn-primary btn-sm w-100" type="submit" disabled={loading}>
                {loading ? "Saving..." : "Save Grade Level"}
              </button>
            </form>
          </div>
        </div>

        <div className="col-md-4">
          <div className="card p-3 h-100">
            <h6 className="mb-3" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
              <i className="bi bi-layers me-2" style={{ color: "var(--blue-700)" }}></i>
              Add Stream
            </h6>
            <form onSubmit={addStream}>
              <input
                className="form-control mb-2"
                placeholder="e.g. Red"
                value={streamForm.name}
                onChange={(e) => setStreamForm({ name: e.target.value })}
                required
              />
              <button className="btn btn-primary btn-sm w-100" type="submit" disabled={loading}>
                {loading ? "Saving..." : "Save Stream"}
              </button>
            </form>
          </div>
        </div>

        <div className="col-md-4">
          <div className="card p-3 h-100">
            <h6 className="mb-3" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
              <i className="bi bi-building me-2" style={{ color: "var(--blue-700)" }}></i>
              Create Single Classroom
            </h6>
            <form onSubmit={addClassroom}>
              <select
                className="form-select mb-2"
                required
                value={classForm.grade_level}
                onChange={(e) => setClassForm({ ...classForm, grade_level: e.target.value })}
              >
                <option value="">Grade level...</option>
                {gradeLevels.map((g) => (
                  <option key={g.id} value={g.id}>{g.name} ({g.curriculum_type})</option>
                ))}
              </select>
              <select
                className="form-select mb-2"
                required
                value={classForm.stream}
                onChange={(e) => setClassForm({ ...classForm, stream: e.target.value })}
              >
                <option value="">Stream...</option>
                {streams.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <select
                className="form-select mb-2"
                required
                value={classForm.academic_year}
                onChange={(e) => setClassForm({ ...classForm, academic_year: e.target.value })}
              >
                <option value="">Academic year...</option>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>{y.year}{y.is_current ? " (current)" : ""}</option>
                ))}
              </select>
              <button className="btn btn-primary btn-sm w-100" type="submit" disabled={loading}>
                {loading ? "Saving..." : "Save Classroom"}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Bulk Create Classrooms Panel */}
      <div className="card p-3 mb-4">
        <h6 className="mb-2" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
          <i className="bi bi-grid-3x3-gap me-2" style={{ color: "var(--blue-700)" }}></i>
          Bulk Create Classrooms for a Year
        </h6>
        <p className="text-muted-soft mb-3" style={{ fontSize: "var(--fs-xs)" }}>
          Pick a year, the grades, and the streams — a classroom is created for every
          grade × stream combination. Existing ones are skipped automatically, so it's
          safe to re-run this after adding a new grade or stream later.
        </p>
        <form onSubmit={handleBulkCreate}>
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label">Academic Year</label>
              <select
                className="form-select"
                required
                value={bulkForm.academic_year}
                onChange={(e) => setBulkForm({ ...bulkForm, academic_year: e.target.value })}
              >
                <option value="">Select year...</option>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>{y.year}{y.is_current ? " (current)" : ""}</option>
                ))}
              </select>
            </div>

            <div className="col-md-4">
              <div className="d-flex justify-content-between align-items-center">
                <label className="form-label mb-0">Grade Levels</label>
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0"
                  style={{ fontSize: "var(--fs-xs)" }}
                  onClick={() => selectAllBulk("grade_level_ids", gradeLevels.map((g) => g.id))}
                >
                  {bulkForm.grade_level_ids.length === gradeLevels.length ? "Clear all" : "Select all"}
                </button>
              </div>
              <div className="border rounded p-2 mt-1" style={{ maxHeight: "160px", overflowY: "auto" }}>
                {gradeLevels.length === 0 && (
                  <span className="text-muted-soft" style={{ fontSize: "var(--fs-xs)" }}>No grade levels yet.</span>
                )}
                {gradeLevels.map((g) => (
                  <div className="form-check" key={g.id}>
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id={`bulk-grade-${g.id}`}
                      checked={bulkForm.grade_level_ids.includes(g.id)}
                      onChange={() => toggleBulkSelection("grade_level_ids", g.id)}
                    />
                    <label className="form-check-label" htmlFor={`bulk-grade-${g.id}`}>
                      {g.name} ({g.curriculum_type})
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="col-md-4">
              <div className="d-flex justify-content-between align-items-center">
                <label className="form-label mb-0">Streams</label>
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0"
                  style={{ fontSize: "var(--fs-xs)" }}
                  onClick={() => selectAllBulk("stream_ids", streams.map((s) => s.id))}
                >
                  {bulkForm.stream_ids.length === streams.length ? "Clear all" : "Select all"}
                </button>
              </div>
              <div className="border rounded p-2 mt-1" style={{ maxHeight: "160px", overflowY: "auto" }}>
                {streams.length === 0 && (
                  <span className="text-muted-soft" style={{ fontSize: "var(--fs-xs)" }}>No streams yet.</span>
                )}
                {streams.map((s) => (
                  <div className="form-check" key={s.id}>
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id={`bulk-stream-${s.id}`}
                      checked={bulkForm.stream_ids.includes(s.id)}
                      onChange={() => toggleBulkSelection("stream_ids", s.id)}
                    />
                    <label className="form-check-label" htmlFor={`bulk-stream-${s.id}`}>
                      {s.name}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button
            className="btn btn-primary btn-sm mt-3"
            type="submit"
            disabled={bulkSaving || !bulkForm.academic_year || bulkComboCount === 0}
          >
            {bulkSaving ? "Creating..." : `Create ${bulkComboCount || 0} Classroom(s)`}
          </button>
        </form>
      </div>

      {/* Table with Search & Filters inside */}
      {loading ? (
        <TableSkeleton rows={5} columns={5} />
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
                    placeholder="Search by grade, stream, year, or teacher..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ paddingLeft: "2.4rem" }}
                  />
                </div>
                <select
                  className="form-select"
                  value={filters.grade_level}
                  onChange={(e) => setFilters({ ...filters, grade_level: e.target.value })}
                  style={{ width: "auto", minWidth: "140px" }}
                >
                  <option value="">All Grades</option>
                  {gradeLevels.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                <select
                  className="form-select"
                  value={filters.stream}
                  onChange={(e) => setFilters({ ...filters, stream: e.target.value })}
                  style={{ width: "auto", minWidth: "120px" }}
                >
                  <option value="">All Streams</option>
                  {streams.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <select
                  className="form-select"
                  value={filters.year}
                  onChange={(e) => setFilters({ ...filters, year: e.target.value })}
                  style={{ width: "auto", minWidth: "140px" }}
                >
                  <option value="">All Years</option>
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>{y.year}</option>
                  ))}
                </select>
                {hasActiveFilters && (
                  <button className="btn btn-sm btn-light" onClick={clearFilters}>
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
                  {filters.grade_level && (
                    <span className="filter-chip">
                      Grade: {gradeLevels.find((g) => String(g.id) === String(filters.grade_level))?.name}
                      <button onClick={() => setFilters({ ...filters, grade_level: "" })}><i className="bi bi-x"></i></button>
                    </span>
                  )}
                  {filters.stream && (
                    <span className="filter-chip">
                      Stream: {streams.find((s) => String(s.id) === String(filters.stream))?.name}
                      <button onClick={() => setFilters({ ...filters, stream: "" })}><i className="bi bi-x"></i></button>
                    </span>
                  )}
                  {filters.year && (
                    <span className="filter-chip">
                      Year: {years.find((y) => String(y.id) === String(filters.year))?.year}
                      <button onClick={() => setFilters({ ...filters, year: "" })}><i className="bi bi-x"></i></button>
                    </span>
                  )}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                  <i className="bi bi-building me-2"></i>
                  All Classrooms
                </span>
                <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
                  {totalItems === 0 ? "0 classrooms" : `Showing ${startIndex + 1}-${Math.min(endIndex, totalItems)} of ${totalItems}`}
                </span>
              </div>
            </div>

            {currentItems.length === 0 ? (
              <div className="empty-state">
                <i className="bi bi-building"></i>
                <h6>{hasActiveFilters ? "No classrooms match your search" : "No classrooms created yet"}</h6>
                <p className="text-muted-soft">
                  {hasActiveFilters
                    ? "Try adjusting your search or filters"
                    : "Use the forms above to create grade levels, streams, and classrooms"}
                </p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead>
                    <tr>
                      <th>Grade</th>
                      <th>Stream</th>
                      <th>Year</th>
                      <th>Students</th>
                      <th>Class Teacher</th>
                      <th style={{ width: "80px" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentItems.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <span className="badge badge-blue">{c.grade_level_name}</span>
                        </td>
                        <td>
                          <span className="badge badge-neutral">{c.stream_name}</span>
                        </td>
                        <td>
                          {c.academic_year_year}
                          {c.academic_year_is_current && (
                            <span className="badge badge-success ms-1" style={{ fontSize: "10px" }}>current</span>
                          )}
                        </td>
                        <td>
                          <span className="badge badge-success">
                            <i className="bi bi-people me-1"></i>
                            {c.student_count || 0}
                          </span>
                        </td>
                        <td>
                          {c.class_teacher_name ? (
                            <div className="table-avatar-cell">
                              <div className="avatar-sm">
                                {c.class_teacher_name?.split(" ").map((n) => n[0]).join("") || "T"}
                              </div>
                              <span className="cell-name">{c.class_teacher_name}</span>
                            </div>
                          ) : (
                            <span className="text-muted-soft">-</span>
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
            )}
          </div>

          {currentItems.length > 0 && (
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
        </>
      )}
    </div>
  );
}