import { useEffect, useState, useMemo } from "react";
import { studentsApi, academicsApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";
import Pagination from "../../components/Pagination";

export default function AdminStudents() {
  const [students, setStudents] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    first_name: "", last_name: "", gender: "M", curriculum_type: "CBC", classroom_id: "",
  });
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState({
    gender: "",
    curriculum_type: "",
    status: "",
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const loadStudents = async () => {
    setLoading(true);
    try {
      const { data } = await studentsApi.list();
      setStudents(data.results ?? data);
    } catch (error) {
      console.error("Failed to load students:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudents();
    academicsApi.classrooms().then(({ data }) => setClassrooms(data.results ?? data));
  }, []);

  const handleAdmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);
    try {
      const { data } = await studentsApi.admit(form);
      setMessage(` Admitted successfully. Admission No: ${data.admission_no}`);
      setMessageType("success");
      setShowForm(false);
      setForm({ first_name: "", last_name: "", gender: "M", curriculum_type: "CBC", classroom_id: "" });
      await loadStudents();
    } catch (err) {
      setMessage(err.response?.data?.detail || "Could not admit student.");
      setMessageType("danger");
    } finally {
      setLoading(false);
    }
  };

  const filteredStudents = useMemo(() => {
    let result = students;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(s => 
        s.full_name?.toLowerCase().includes(query) ||
        s.admission_no?.toLowerCase().includes(query)
      );
    }

    if (filters.gender) result = result.filter(s => s.gender === filters.gender);
    if (filters.curriculum_type) result = result.filter(s => s.curriculum_type === filters.curriculum_type);
    if (filters.status) {
      const isActive = filters.status === "active";
      result = result.filter(s => s.is_active === isActive);
    }

    return result;
  }, [students, searchQuery, filters]);

  const totalItems = filteredStudents.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentItems = filteredStudents.slice(startIndex, endIndex);

  useEffect(() => setCurrentPage(1), [searchQuery, filters]);

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setFilters({ gender: "", curriculum_type: "", status: "" });
    setCurrentPage(1);
  };

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: "Dashboard", href: "/admin" },
        { label: "Students", href: "/admin/students" },
        { label: "All Students", href: "#" },
      ]} />

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Students</h1>
          <p className="page-subtitle">Manage all students across the school</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
          <i className="bi bi-plus-lg me-1"></i>
          {showForm ? "Cancel" : "Admit Student"}
        </button>
      </div>

      {/* Message Alerts */}
      {message && (
        <div className={`alert alert-${messageType} alert-dismissible fade show`} role="alert">
          {message}
          <button type="button" className="btn-close" onClick={() => setMessage("")}></button>
        </div>
      )}

      {/* Admit Student Form */}
      {showForm && (
        <form className="card p-4 mb-4" onSubmit={handleAdmit}>
          <h5 className="mb-3" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
            <i className="bi bi-person-plus me-2" style={{ color: "var(--blue-700)" }}></i>
            Admit New Student
          </h5>
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">First Name</label>
              <input className="form-control" required
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Last Name</label>
              <input className="form-control" required
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Gender</label>
              <select className="form-select" value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label">Curriculum</label>
              <select className="form-select" value={form.curriculum_type}
                onChange={(e) => setForm({ ...form, curriculum_type: e.target.value })}>
                <option value="CBC">CBC</option>
                <option value="8-4-4">8-4-4 (Legacy)</option>
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label">Classroom</label>
              <select className="form-select" required value={form.classroom_id}
                onChange={(e) => setForm({ ...form, classroom_id: e.target.value })}>
                <option value="">Select...</option>
                {classrooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.grade_level_name} {c.stream_name} - {c.academic_year}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3 d-flex gap-2">
            <button className="btn btn-success" type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Student"}
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Table with Search & Filters inside */}
      {loading ? (
        <TableSkeleton rows={5} columns={7} />
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
                  placeholder="Search by name or admission no..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ paddingLeft: "2.4rem" }}
                />
              </div>
              <select 
                className="form-select" 
                value={filters.gender} 
                onChange={(e) => setFilters({ ...filters, gender: e.target.value })}
                style={{ width: "auto", minWidth: "130px" }}
              >
                <option value="">All Genders</option>
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
              <select 
                className="form-select" 
                value={filters.curriculum_type} 
                onChange={(e) => setFilters({ ...filters, curriculum_type: e.target.value })}
                style={{ width: "auto", minWidth: "140px" }}
              >
                <option value="">All Curriculums</option>
                <option value="CBC">CBC</option>
                <option value="8-4-4">8-4-4</option>
              </select>
              <select 
                className="form-select" 
                value={filters.status} 
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                style={{ width: "auto", minWidth: "120px" }}
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              {(searchQuery || filters.gender || filters.curriculum_type || filters.status) && (
                <button className="btn btn-sm btn-light" onClick={clearFilters}>
                  <i className="bi bi-x-lg"></i> Clear
                </button>
              )}
            </div>
            {/* Active Filters Display */}
            {(searchQuery || filters.gender || filters.curriculum_type || filters.status) && (
              <div className="d-flex flex-wrap gap-1">
                {searchQuery && (
                  <span className="filter-chip">
                    Search: "{searchQuery}"
                    <button onClick={() => setSearchQuery("")}><i className="bi bi-x"></i></button>
                  </span>
                )}
                {filters.gender && (
                  <span className="filter-chip">
                    Gender: {filters.gender === "M" ? "Male" : "Female"}
                    <button onClick={() => setFilters({ ...filters, gender: "" })}><i className="bi bi-x"></i></button>
                  </span>
                )}
                {filters.curriculum_type && (
                  <span className="filter-chip">
                    Curriculum: {filters.curriculum_type}
                    <button onClick={() => setFilters({ ...filters, curriculum_type: "" })}><i className="bi bi-x"></i></button>
                  </span>
                )}
                {filters.status && (
                  <span className="filter-chip">
                    Status: {filters.status}
                    <button onClick={() => setFilters({ ...filters, status: "" })}><i className="bi bi-x"></i></button>
                  </span>
                )}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
              <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                <i className="bi bi-person-lines-fill me-2"></i>
                Student List
              </span>
              <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
                {totalItems} student{totalItems !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <div className="empty-state">
            <i className="bi bi-people"></i>
            <h6>
              {searchQuery || filters.gender || filters.curriculum_type || filters.status 
                ? "No students match your search" 
                : "No students admitted yet"}
            </h6>
            <p className="text-muted-soft">
              {searchQuery || filters.gender || filters.curriculum_type || filters.status
                ? "Try adjusting your search or filters"
                : "Click 'Admit Student' to add your first student"}
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
                    placeholder="Search by name or admission no..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ paddingLeft: "2.4rem" }}
                  />
                </div>
                <select 
                  className="form-select" 
                  value={filters.gender} 
                  onChange={(e) => setFilters({ ...filters, gender: e.target.value })}
                  style={{ width: "auto", minWidth: "130px" }}
                >
                  <option value="">All Genders</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
                <select 
                  className="form-select" 
                  value={filters.curriculum_type} 
                  onChange={(e) => setFilters({ ...filters, curriculum_type: e.target.value })}
                  style={{ width: "auto", minWidth: "140px" }}
                >
                  <option value="">All Curriculums</option>
                  <option value="CBC">CBC</option>
                  <option value="8-4-4">8-4-4</option>
                </select>
                <select 
                  className="form-select" 
                  value={filters.status} 
                  onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                  style={{ width: "auto", minWidth: "120px" }}
                >
                  <option value="">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                {(searchQuery || filters.gender || filters.curriculum_type || filters.status) && (
                  <button className="btn btn-sm btn-light" onClick={clearFilters}>
                    <i className="bi bi-x-lg"></i> Clear
                  </button>
                )}
              </div>
              {/* Active Filters Display */}
              {(searchQuery || filters.gender || filters.curriculum_type || filters.status) && (
                <div className="d-flex flex-wrap gap-1">
                  {searchQuery && (
                    <span className="filter-chip">
                      Search: "{searchQuery}"
                      <button onClick={() => setSearchQuery("")}><i className="bi bi-x"></i></button>
                    </span>
                  )}
                  {filters.gender && (
                    <span className="filter-chip">
                      Gender: {filters.gender === "M" ? "Male" : "Female"}
                      <button onClick={() => setFilters({ ...filters, gender: "" })}><i className="bi bi-x"></i></button>
                    </span>
                  )}
                  {filters.curriculum_type && (
                    <span className="filter-chip">
                      Curriculum: {filters.curriculum_type}
                      <button onClick={() => setFilters({ ...filters, curriculum_type: "" })}><i className="bi bi-x"></i></button>
                    </span>
                  )}
                  {filters.status && (
                    <span className="filter-chip">
                      Status: {filters.status}
                      <button onClick={() => setFilters({ ...filters, status: "" })}><i className="bi bi-x"></i></button>
                    </span>
                  )}
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                  <i className="bi bi-person-lines-fill me-2"></i>
                  Student List
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
                    <th>Admission No</th>
                    <th>Name</th>
                    <th>Gender</th>
                    <th>Curriculum</th>
                    <th>Current Class</th>
                    <th>Status</th>
                    <th style={{ width: "80px" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentItems.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <span style={{ fontWeight: 600, color: "var(--blue-700)", fontSize: "var(--fs-sm)" }}>
                          {s.admission_no}
                        </span>
                      </td>
                      <td>
                        <div className="table-avatar-cell">
                          <div className="avatar-sm">
                            {s.first_name?.[0]}{s.last_name?.[0]}
                          </div>
                          <span className="cell-name">{s.full_name}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${s.gender === "M" ? "badge-blue" : "badge-gold"}`}>
                          {s.gender === "M" ? "Male" : "Female"}
                        </span>
                      </td>
                      <td>
                        <span className="badge badge-neutral">{s.curriculum_type}</span>
                      </td>
                      <td>{s.current_classroom || "-"}</td>
                      <td>
                        <span className={`badge ${s.is_active ? "badge-success" : "badge-danger"}`}>
                          <span className={`status-dot ${s.is_active ? "status-dot--online" : "status-dot--offline"}`}></span>
                          {s.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>
                        <div className="table-actions">
                          <button className="btn btn-sm btn-outline-primary btn-icon" title="View">
                            <i className="bi bi-eye"></i>
                          </button>
                          <button className="btn btn-sm btn-outline-secondary btn-icon" title="Edit">
                            <i className="bi bi-pencil"></i>
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