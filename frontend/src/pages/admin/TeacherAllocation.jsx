import { useEffect, useState } from "react";
import api, { academicsApi, calendarApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";
import Pagination from "../../components/Pagination";

export default function AdminTeacherAllocation() {
  const [allocations, setAllocations] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [years, setYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [form, setForm] = useState({ 
    teacher: "", 
    subject: "", 
    classroom: "", 
    academic_year: "" 
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState({
    teacher: "",
    subject: "",
    classroom: "",
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [a, u, s, c, y] = await Promise.all([
        api.get("/teacher-allocations/"),
        api.get("/users/", { params: { role: "TEACHER" } }),
        academicsApi.subjects(),
        academicsApi.classrooms(),
        calendarApi.academicYears(),
      ]);
      setAllocations(a.data.results ?? a.data);
      setTeachers(u.data.results ?? u.data);
      setSubjects(s.data.results ?? s.data);
      setClassrooms(c.data.results ?? c.data);
      setYears(y.data.results ?? y.data);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const addAllocation = async (e) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);
    try {
      await api.post("/teacher-allocations/", form);
      setForm({ teacher: "", subject: "", classroom: "", academic_year: "" });
      await loadAll();
      setMessage("✅ Allocation saved. This teacher can now enter marks for this subject/classroom.");
      setMessageType("success");
    } catch (err) {
      setMessage(err.response?.data ? JSON.stringify(err.response.data) : "Could not save allocation.");
      setMessageType("danger");
    } finally {
      setLoading(false);
    }
  };

  // Filter and Search Logic
  const filteredAllocations = allocations.filter(a => {
    // Search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      const matchTeacher = a.teacher_name?.toLowerCase().includes(query);
      const matchSubject = a.subject_name?.toLowerCase().includes(query);
      const matchClassroom = a.classroom_label?.toLowerCase().includes(query);
      if (!matchTeacher && !matchSubject && !matchClassroom) return false;
    }

    // Filters
    if (filters.teacher && a.teacher_id !== parseInt(filters.teacher)) return false;
    if (filters.subject && a.subject_id !== parseInt(filters.subject)) return false;
    if (filters.classroom && a.classroom_id !== parseInt(filters.classroom)) return false;

    return true;
  });

  const totalItems = filteredAllocations.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentItems = filteredAllocations.slice(startIndex, endIndex);

  useEffect(() => setCurrentPage(1), [searchQuery, filters]);

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setFilters({ teacher: "", subject: "", classroom: "" });
    setCurrentPage(1);
  };

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: "Dashboard", href: "/admin" },
        { label: "Teacher Allocation", href: "/admin/teacher-allocations" },
        { label: "All Allocations", href: "#" },
      ]} />

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Teacher Allocation</h1>
          <p className="page-subtitle">
            A teacher can be allocated the same subject in multiple classrooms — e.g. Grade 9 Red
            English and Grade 9 Green English are two separate allocations below.
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

      {/* Add Allocation Form */}
      <form className="card p-4 mb-4" onSubmit={addAllocation}>
        <h5 className="mb-3" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
          <i className="bi bi-person-plus me-2" style={{ color: "var(--blue-700)" }}></i>
          Add New Allocation
        </h5>
        <div className="row g-3">
          <div className="col-md-3">
            <label className="form-label">Teacher</label>
            <select className="form-select" required value={form.teacher}
              onChange={(e) => setForm({ ...form, teacher: e.target.value })}>
              <option value="">Select...</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>
              ))}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">Subject</label>
            <select className="form-select" required value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}>
              <option value="">Select...</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">Classroom</label>
            <select className="form-select" required value={form.classroom}
              onChange={(e) => setForm({ ...form, classroom: e.target.value })}>
              <option value="">Select...</option>
              {classrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.grade_level_name} {c.stream_name} ({c.academic_year})
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">Academic Year</label>
            <select className="form-select" required value={form.academic_year}
              onChange={(e) => setForm({ ...form, academic_year: e.target.value })}>
              <option value="">Select...</option>
              {years.map((y) => (
                <option key={y.id} value={y.id}>{y.year}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 d-flex gap-2">
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Saving..." : "Save Allocation"}
          </button>
        </div>
      </form>

      {/* Table with Search & Filters inside */}
      {loading ? (
        <TableSkeleton rows={5} columns={3} />
      ) : currentItems.length === 0 ? (
        <div className="table-wrap">
          <div className="table-wrap__header" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.75rem" }}>
            {/* Search & Filters inside table header */}
            <div className="d-flex flex-wrap gap-2" style={{ width: "100%" }}>
              <div style={{ flex: 1, minWidth: "200px", position: "relative" }}>
                <i className="bi bi-search" style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--ink-400)" }}></i>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="Search by teacher, subject, or classroom..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ paddingLeft: "2.4rem" }}
                />
              </div>
              <select 
                className="form-select" 
                value={filters.teacher} 
                onChange={(e) => setFilters({ ...filters, teacher: e.target.value })}
                style={{ width: "auto", minWidth: "150px" }}
              >
                <option value="">All Teachers</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>
                ))}
              </select>
              <select 
                className="form-select" 
                value={filters.subject} 
                onChange={(e) => setFilters({ ...filters, subject: e.target.value })}
                style={{ width: "auto", minWidth: "140px" }}
              >
                <option value="">All Subjects</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <select 
                className="form-select" 
                value={filters.classroom} 
                onChange={(e) => setFilters({ ...filters, classroom: e.target.value })}
                style={{ width: "auto", minWidth: "150px" }}
              >
                <option value="">All Classrooms</option>
                {classrooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.grade_level_name} {c.stream_name}
                  </option>
                ))}
              </select>
              {(searchQuery || filters.teacher || filters.subject || filters.classroom) && (
                <button className="btn btn-sm btn-light" onClick={clearFilters}>
                  <i className="bi bi-x-lg"></i> Clear
                </button>
              )}
            </div>
            {/* Active Filters Display */}
            {(searchQuery || filters.teacher || filters.subject || filters.classroom) && (
              <div className="d-flex flex-wrap gap-1">
                {searchQuery && (
                  <span className="filter-chip">
                    Search: "{searchQuery}"
                    <button onClick={() => setSearchQuery("")}><i className="bi bi-x"></i></button>
                  </span>
                )}
                {filters.teacher && (
                  <span className="filter-chip">
                    Teacher: {teachers.find(t => t.id === parseInt(filters.teacher))?.first_name} {teachers.find(t => t.id === parseInt(filters.teacher))?.last_name}
                    <button onClick={() => setFilters({ ...filters, teacher: "" })}><i className="bi bi-x"></i></button>
                  </span>
                )}
                {filters.subject && (
                  <span className="filter-chip">
                    Subject: {subjects.find(s => s.id === parseInt(filters.subject))?.name}
                    <button onClick={() => setFilters({ ...filters, subject: "" })}><i className="bi bi-x"></i></button>
                  </span>
                )}
                {filters.classroom && (
                  <span className="filter-chip">
                    Classroom: {classrooms.find(c => c.id === parseInt(filters.classroom))?.grade_level_name} {classrooms.find(c => c.id === parseInt(filters.classroom))?.stream_name}
                    <button onClick={() => setFilters({ ...filters, classroom: "" })}><i className="bi bi-x"></i></button>
                  </span>
                )}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
              <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                <i className="bi bi-person-lines-fill me-2"></i>
                All Allocations
              </span>
              <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
                {totalItems} allocation{totalItems !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <div className="empty-state">
            <i className="bi bi-person-x"></i>
            <h6>
              {searchQuery || filters.teacher || filters.subject || filters.classroom 
                ? "No allocations match your search" 
                : "No allocations created yet"}
            </h6>
            <p className="text-muted-soft">
              {searchQuery || filters.teacher || filters.subject || filters.classroom
                ? "Try adjusting your search or filters"
                : "Use the form above to create your first teacher allocation"}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <div className="table-wrap__header" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.75rem" }}>
              {/* Search & Filters inside table header */}
              <div className="d-flex flex-wrap gap-2" style={{ width: "100%" }}>
                <div style={{ flex: 1, minWidth: "200px", position: "relative" }}>
                  <i className="bi bi-search" style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--ink-400)" }}></i>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="Search by teacher, subject, or classroom..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ paddingLeft: "2.4rem" }}
                  />
                </div>
                <select 
                  className="form-select" 
                  value={filters.teacher} 
                  onChange={(e) => setFilters({ ...filters, teacher: e.target.value })}
                  style={{ width: "auto", minWidth: "150px" }}
                >
                  <option value="">All Teachers</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>
                  ))}
                </select>
                <select 
                  className="form-select" 
                  value={filters.subject} 
                  onChange={(e) => setFilters({ ...filters, subject: e.target.value })}
                  style={{ width: "auto", minWidth: "140px" }}
                >
                  <option value="">All Subjects</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <select 
                  className="form-select" 
                  value={filters.classroom} 
                  onChange={(e) => setFilters({ ...filters, classroom: e.target.value })}
                  style={{ width: "auto", minWidth: "150px" }}
                >
                  <option value="">All Classrooms</option>
                  {classrooms.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.grade_level_name} {c.stream_name}
                    </option>
                  ))}
                </select>
                {(searchQuery || filters.teacher || filters.subject || filters.classroom) && (
                  <button className="btn btn-sm btn-light" onClick={clearFilters}>
                    <i className="bi bi-x-lg"></i> Clear
                  </button>
                )}
              </div>
              {/* Active Filters Display */}
              {(searchQuery || filters.teacher || filters.subject || filters.classroom) && (
                <div className="d-flex flex-wrap gap-1">
                  {searchQuery && (
                    <span className="filter-chip">
                      Search: "{searchQuery}"
                      <button onClick={() => setSearchQuery("")}><i className="bi bi-x"></i></button>
                    </span>
                  )}
                  {filters.teacher && (
                    <span className="filter-chip">
                      Teacher: {teachers.find(t => t.id === parseInt(filters.teacher))?.first_name} {teachers.find(t => t.id === parseInt(filters.teacher))?.last_name}
                      <button onClick={() => setFilters({ ...filters, teacher: "" })}><i className="bi bi-x"></i></button>
                    </span>
                  )}
                  {filters.subject && (
                    <span className="filter-chip">
                      Subject: {subjects.find(s => s.id === parseInt(filters.subject))?.name}
                      <button onClick={() => setFilters({ ...filters, subject: "" })}><i className="bi bi-x"></i></button>
                    </span>
                  )}
                  {filters.classroom && (
                    <span className="filter-chip">
                      Classroom: {classrooms.find(c => c.id === parseInt(filters.classroom))?.grade_level_name} {classrooms.find(c => c.id === parseInt(filters.classroom))?.stream_name}
                      <button onClick={() => setFilters({ ...filters, classroom: "" })}><i className="bi bi-x"></i></button>
                    </span>
                  )}
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                  <i className="bi bi-person-lines-fill me-2"></i>
                  All Allocations
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
                    <th>Teacher</th>
                    <th>Subject</th>
                    <th>Classroom</th>
                    <th style={{ width: "80px" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentItems.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <div className="table-avatar-cell">
                          <div className="avatar-sm">
                            {a.teacher_name?.split(' ').map(n => n[0]).join('') || 'T'}
                          </div>
                          <span className="cell-name">{a.teacher_name}</span>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-blue">{a.subject_name}</span>
                      </td>
                      <td>
                        <span className="badge badge-neutral">{a.classroom_label}</span>
                      </td>
                      <td>
                        <div className="table-actions">
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

          {/* Pagination */}
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
    </div>
  );
}