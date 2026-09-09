import { useEffect, useState, useCallback, useMemo } from "react";
import { studentsApi, academicsApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";
import Pagination from "../../components/Pagination";
import Modal from "../../components/Modal";

const emptyAddForm = {
  first_name: "", last_name: "", email: "", phone_number: "", national_id: "",
  gender: "M", curriculum_type: "CBC", classroom_id: "", date_of_birth: "", upi_number: "",
  parent_name: "", parent_phone: "", parent_relationship: "GUARDIAN",
};

const emptyEditForm = {
  first_name: "", last_name: "", email: "", phone_number: "", national_id: "",
  gender: "M", date_of_birth: "", curriculum_type: "CBC", upi_number: "", is_active: true,
};

const emptyFilters = {
  gender: "", curriculum_type: "", status: "",
  academic_year: "", grade_level: "", classroom_id: "",
};

export default function AdminStudents() {
  const [students, setStudents] = useState([]);
  const [totalItems, setTotalItems] = useState(0);

  // Full, unfiltered classroom list — used to build the Academic Year /
  // Grade / Classroom filter dropdowns (needs to see every year, not just
  // the current one).
  const [allClassrooms, setAllClassrooms] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState(emptyFilters);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");

  // ---- Add modal ----
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState(emptyAddForm);
  const [addSaving, setAddSaving] = useState(false);

  // ---- View modal ----
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewStudent, setViewStudent] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);

  // ---- Edit modal ----
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // { id, admission_no, username }
  const [editForm, setEditForm] = useState(emptyEditForm);
  const [editSaving, setEditSaving] = useState(false);

  // ---- Delete modal ----
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  // ---- Reset password modal ----
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetSaving, setResetSaving] = useState(false);
  const [resetResult, setResetResult] = useState(null);

  // Debounce the search box so we're not firing a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: currentPage, page_size: itemsPerPage };
      if (searchQuery) params.search = searchQuery;
      if (filters.gender) params.gender = filters.gender;
      if (filters.curriculum_type) params.curriculum_type = filters.curriculum_type;
      if (filters.status) params.is_active = filters.status === "active";
      // These three filter on the student's CURRENT enrollment/classroom.
      // Requires the backend StudentViewSet to support filtering by the
      // related classroom's academic year, grade level, and id.
      if (filters.academic_year) params.current_enrollment__classroom__academic_year__year = filters.academic_year;
      if (filters.grade_level) params.current_enrollment__classroom__grade_level = filters.grade_level;
      if (filters.classroom_id) params.current_enrollment__classroom = filters.classroom_id;

      const { data } = await studentsApi.list(params);
      if (Array.isArray(data)) {
        // Pagination disabled server-side — fall back gracefully.
        setStudents(data);
        setTotalItems(data.length);
      } else {
        setStudents(data.results ?? []);
        setTotalItems(data.count ?? 0);
      }
    } catch (error) {
      console.error("Failed to load students:", error);
      setMessage("Could not load students.");
      setMessageType("danger");
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, searchQuery, filters]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  useEffect(() => {
    academicsApi.classrooms().then(({ data }) => setAllClassrooms(data.results ?? data));
  }, []);

  // Classrooms allowed in the Admit / Edit forms — current academic year
  // only, so new admissions can never land in a stale/past year again.
  const admitClassrooms = useMemo(
    () => allClassrooms.filter((c) => c.academic_year_is_current),
    [allClassrooms]
  );

  // Distinct academic years, newest first, for the filter dropdown.
  const academicYearOptions = useMemo(() => {
    const years = [...new Set(allClassrooms.map((c) => c.academic_year))];
    return years.sort((a, b) => b - a);
  }, [allClassrooms]);

  // Distinct grade levels for the filter dropdown, scoped to the selected
  // academic year (if any) so the list doesn't show grades that don't
  // exist in that year.
  const gradeLevelOptions = useMemo(() => {
    const pool = filters.academic_year
      ? allClassrooms.filter((c) => String(c.academic_year) === String(filters.academic_year))
      : allClassrooms;
    const seen = new Map();
    pool.forEach((c) => seen.set(c.grade_level, c.grade_level_name));
    return [...seen.entries()]; // [ [id, name], ... ]
  }, [allClassrooms, filters.academic_year]);

  // Classrooms for the filter dropdown, scoped to selected year + grade.
  const classroomOptions = useMemo(() => {
    return allClassrooms.filter((c) => {
      if (filters.academic_year && String(c.academic_year) !== String(filters.academic_year)) return false;
      if (filters.grade_level && String(c.grade_level) !== String(filters.grade_level)) return false;
      return true;
    });
  }, [allClassrooms, filters.academic_year, filters.grade_level]);

  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + students.length;
  const hasActiveFilters = !!(
    searchInput || filters.gender || filters.curriculum_type || filters.status ||
    filters.academic_year || filters.grade_level || filters.classroom_id
  );

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  const clearFilters = () => {
    setSearchInput("");
    setSearchQuery("");
    setFilters(emptyFilters);
    setCurrentPage(1);
  };

  const updateFilter = (patch) => {
    // Changing academic_year or grade_level invalidates a more specific
    // downstream selection (grade/classroom), so clear those to avoid an
    // impossible combination silently returning zero results.
    setFilters((prev) => {
      const next = { ...prev, ...patch };
      if ("academic_year" in patch) {
        next.grade_level = "";
        next.classroom_id = "";
      } else if ("grade_level" in patch) {
        next.classroom_id = "";
      }
      return next;
    });
    setCurrentPage(1);
  };

  // ---------------- ADD ----------------
  const handleAdmit = async (e) => {
    e.preventDefault();
    setAddSaving(true);
    try {
      const payload = {
        ...addForm,
        date_of_birth: addForm.date_of_birth || null,
      };
      const { data } = await studentsApi.admit(payload);
      setMessage(
        `Admitted successfully. Admission No / login username: ${data.admission_no}` +
        (data.current_classroom ? ` — enrolled in ${data.current_classroom}` : "") +
        (data.guardian ? ` — guardian ${data.guardian.name} linked` : "")
      );
      setMessageType("success");
      setShowAddModal(false);
      setAddForm(emptyAddForm);
      setCurrentPage(1);
      await loadStudents();
    } catch (err) {
      setMessage(err.response?.data?.detail || err.response?.data?.classroom_id?.[0] || "Could not admit student.");
      setMessageType("danger");
    } finally {
      setAddSaving(false);
    }
  };

  // ---------------- VIEW ----------------
  const openView = async (student) => {
    setShowViewModal(true);
    setViewLoading(true);
    setViewStudent(null);
    try {
      const { data } = await studentsApi.detail(student.id);
      setViewStudent(data);
    } catch (err) {
      setMessage("Could not load student details.");
      setMessageType("danger");
      setShowViewModal(false);
    } finally {
      setViewLoading(false);
    }
  };

  // ---------------- EDIT ----------------
  const openEdit = async (student) => {
    setShowEditModal(true);
    setEditTarget(null);
    try {
      const { data } = await studentsApi.detail(student.id);
      setEditTarget({ id: data.id, admission_no: data.admission_no, username: data.user.username });
      setEditForm({
        first_name: data.user.first_name || "",
        last_name: data.user.last_name || "",
        email: data.user.email || "",
        phone_number: data.user.phone_number || "",
        national_id: data.user.national_id || "",
        gender: data.gender,
        date_of_birth: data.date_of_birth || "",
        curriculum_type: data.curriculum_type,
        upi_number: data.upi_number || "",
        is_active: data.is_active,
      });
    } catch (err) {
      setMessage("Could not load student for editing.");
      setMessageType("danger");
      setShowEditModal(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editTarget) return;
    setEditSaving(true);
    try {
      await studentsApi.update(editTarget.id, {
        user: {
          first_name: editForm.first_name,
          last_name: editForm.last_name,
          email: editForm.email,
          phone_number: editForm.phone_number,
          national_id: editForm.national_id,
        },
        gender: editForm.gender,
        date_of_birth: editForm.date_of_birth || null,
        curriculum_type: editForm.curriculum_type,
        upi_number: editForm.upi_number,
        is_active: editForm.is_active,
      });
      setMessage("Student updated successfully.");
      setMessageType("success");
      setShowEditModal(false);
      await loadStudents();
    } catch (err) {
      setMessage(err.response?.data?.detail || "Could not update student.");
      setMessageType("danger");
    } finally {
      setEditSaving(false);
    }
  };

  // ---------------- DELETE ----------------
  const openDelete = (student) => {
    setDeleteTarget(student);
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteSaving(true);
    try {
      await studentsApi.remove(deleteTarget.id);
      setMessage(`${deleteTarget.full_name} was removed.`);
      setMessageType("success");
      setShowDeleteModal(false);
      setDeleteTarget(null);
      await loadStudents();
    } catch (err) {
      setMessage(err.response?.data?.detail || "Could not delete student.");
      setMessageType("danger");
    } finally {
      setDeleteSaving(false);
    }
  };

  // ---------------- RESET PASSWORD ----------------
  const openReset = (student) => {
    setResetTarget(student);
    setResetPasswordValue("");
    setResetResult(null);
    setShowResetModal(true);
  };

  const handleReset = async (e) => {
    e.preventDefault();
    if (!resetTarget) return;
    setResetSaving(true);
    try {
      const { data } = await studentsApi.resetPassword(resetTarget.id, {
        new_password: resetPasswordValue || undefined,
      });
      setResetResult(data.new_password);
    } catch (err) {
      setMessage(err.response?.data?.detail || "Could not reset password.");
      setMessageType("danger");
      setShowResetModal(false);
    } finally {
      setResetSaving(false);
    }
  };

  return (
    <div>
      <Breadcrumb items={[
        { label: "Dashboard", href: "/admin" },
        { label: "Students", href: "/admin/students" },
        { label: "All Students", href: "#" },
      ]} />

      <div className="page-header">
        <div>
          <h1 className="page-title">Students</h1>
          <p className="page-subtitle">Manage all students across the school</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          <i className="bi bi-plus-lg me-1"></i>
          Admit Student
        </button>
      </div>

      {message && (
        <div className={`alert alert-${messageType} alert-dismissible fade show`} role="alert">
          {message}
          <button type="button" className="btn-close" onClick={() => setMessage("")}></button>
        </div>
      )}

      <div className="table-wrap">
        <div className="table-wrap__header" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.75rem" }}>
          <div className="d-flex flex-wrap gap-2" style={{ width: "100%" }}>
            <div style={{ flex: 1, minWidth: "200px", position: "relative" }}>
              <i className="bi bi-search" style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--ink-400)" }}></i>
              <input
                type="text"
                className="form-control"
                placeholder="Search by name or admission no..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                style={{ paddingLeft: "2.4rem" }}
              />
            </div>
            <select
              className="form-select"
              value={filters.gender}
              onChange={(e) => updateFilter({ gender: e.target.value })}
              style={{ width: "auto", minWidth: "130px" }}
            >
              <option value="">All Genders</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>
            <select
              className="form-select"
              value={filters.curriculum_type}
              onChange={(e) => updateFilter({ curriculum_type: e.target.value })}
              style={{ width: "auto", minWidth: "140px" }}
            >
              <option value="">All Curriculums</option>
              <option value="CBC">CBC</option>
              <option value="8-4-4">8-4-4</option>
            </select>
            <select
              className="form-select"
              value={filters.status}
              onChange={(e) => updateFilter({ status: e.target.value })}
              style={{ width: "auto", minWidth: "120px" }}
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            {hasActiveFilters && (
              <button className="btn btn-sm btn-light" onClick={clearFilters}>
                <i className="bi bi-x-lg"></i> Clear
              </button>
            )}
          </div>

          <div className="d-flex flex-wrap gap-2" style={{ width: "100%" }}>
            <select
              className="form-select"
              value={filters.academic_year}
              onChange={(e) => updateFilter({ academic_year: e.target.value })}
              style={{ width: "auto", minWidth: "150px" }}
            >
              <option value="">All Academic Years</option>
              {academicYearOptions.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            <select
              className="form-select"
              value={filters.grade_level}
              onChange={(e) => updateFilter({ grade_level: e.target.value })}
              style={{ width: "auto", minWidth: "160px" }}
            >
              <option value="">All Grades / Forms</option>
              {gradeLevelOptions.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
            <select
              className="form-select"
              value={filters.classroom_id}
              onChange={(e) => updateFilter({ classroom_id: e.target.value })}
              style={{ width: "auto", minWidth: "180px" }}
            >
              <option value="">All Classes</option>
              {classroomOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.grade_level_name} {c.stream_name} ({c.academic_year})
                </option>
              ))}
            </select>
          </div>

          {hasActiveFilters && (
            <div className="d-flex flex-wrap gap-1">
              {searchQuery && (
                <span className="filter-chip">
                  Search: "{searchQuery}"
                  <button onClick={() => setSearchInput("")}><i className="bi bi-x"></i></button>
                </span>
              )}
              {filters.gender && (
                <span className="filter-chip">
                  Gender: {filters.gender === "M" ? "Male" : "Female"}
                  <button onClick={() => updateFilter({ gender: "" })}><i className="bi bi-x"></i></button>
                </span>
              )}
              {filters.curriculum_type && (
                <span className="filter-chip">
                  Curriculum: {filters.curriculum_type}
                  <button onClick={() => updateFilter({ curriculum_type: "" })}><i className="bi bi-x"></i></button>
                </span>
              )}
              {filters.status && (
                <span className="filter-chip">
                  Status: {filters.status}
                  <button onClick={() => updateFilter({ status: "" })}><i className="bi bi-x"></i></button>
                </span>
              )}
              {filters.academic_year && (
                <span className="filter-chip">
                  Year: {filters.academic_year}
                  <button onClick={() => updateFilter({ academic_year: "" })}><i className="bi bi-x"></i></button>
                </span>
              )}
              {filters.grade_level && (
                <span className="filter-chip">
                  Grade: {gradeLevelOptions.find(([id]) => String(id) === String(filters.grade_level))?.[1]}
                  <button onClick={() => updateFilter({ grade_level: "" })}><i className="bi bi-x"></i></button>
                </span>
              )}
              {filters.classroom_id && (
                <span className="filter-chip">
                  Class: {classroomOptions.find((c) => String(c.id) === String(filters.classroom_id))?.stream_name}
                  <button onClick={() => updateFilter({ classroom_id: "" })}><i className="bi bi-x"></i></button>
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

        {loading ? (
          <TableSkeleton rows={Math.min(itemsPerPage, 10)} columns={7} />
        ) : students.length === 0 ? (
          <div className="empty-state">
            <i className="bi bi-people"></i>
            <h6>{hasActiveFilters ? "No students match your search" : "No students admitted yet"}</h6>
            <p className="text-muted-soft">
              {hasActiveFilters ? "Try adjusting your search or filters" : "Click 'Admit Student' to add your first student"}
            </p>
          </div>
        ) : (
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
                  <th style={{ width: "150px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span style={{ fontWeight: 600, color: "var(--blue-700)", fontSize: "var(--fs-sm)" }}>
                        {s.admission_no}
                      </span>
                    </td>
                    <td>
                      <div className="table-avatar-cell">
                        <div className="avatar-sm">
                          {(s.full_name || "").split(" ").filter(Boolean).slice(0, 2).map((n) => n[0]).join("")}
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
                        <button className="btn btn-sm btn-outline-primary btn-icon" title="View" onClick={() => openView(s)}>
                          <i className="bi bi-eye"></i>
                        </button>
                        <button className="btn btn-sm btn-outline-secondary btn-icon" title="Edit" onClick={() => openEdit(s)}>
                          <i className="bi bi-pencil"></i>
                        </button>
                        <button className="btn btn-sm btn-outline-warning btn-icon" title="Reset Password" onClick={() => openReset(s)}>
                          <i className="bi bi-key"></i>
                        </button>
                        <button className="btn btn-sm btn-outline-danger btn-icon" title="Delete" onClick={() => openDelete(s)}>
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

      {!loading && students.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          itemsPerPage={itemsPerPage}
          setItemsPerPage={(n) => { setItemsPerPage(n); setCurrentPage(1); }}
          startIndex={startIndex}
          endIndex={endIndex}
          totalItems={totalItems}
        />
      )}

      {/* ---------------- ADD MODAL ---------------- */}
      <Modal show={showAddModal} onClose={() => setShowAddModal(false)} title="Admit New Student" size="lg">
        <form onSubmit={handleAdmit}>
          <h6 style={{ fontWeight: 700 }}>Student Details</h6>
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">First Name</label>
              <input className="form-control" required
                value={addForm.first_name}
                onChange={(e) => setAddForm({ ...addForm, first_name: e.target.value })} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Last Name</label>
              <input className="form-control" required
                value={addForm.last_name}
                onChange={(e) => setAddForm({ ...addForm, last_name: e.target.value })} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Email (optional)</label>
              <input type="email" className="form-control"
                value={addForm.email}
                onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Phone Number (optional)</label>
              <input className="form-control"
                value={addForm.phone_number}
                onChange={(e) => setAddForm({ ...addForm, phone_number: e.target.value })} />
            </div>
            <div className="col-md-6">
              <label className="form-label">National ID (optional)</label>
              <input className="form-control"
                value={addForm.national_id}
                onChange={(e) => setAddForm({ ...addForm, national_id: e.target.value })} />
            </div>
            <div className="col-md-6">
              <label className="form-label">UPI / NEMIS No (optional)</label>
              <input className="form-control" value={addForm.upi_number}
                onChange={(e) => setAddForm({ ...addForm, upi_number: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Gender</label>
              <select className="form-select" value={addForm.gender}
                onChange={(e) => setAddForm({ ...addForm, gender: e.target.value })}>
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label">Date of Birth</label>
              <input type="date" className="form-control" value={addForm.date_of_birth}
                onChange={(e) => setAddForm({ ...addForm, date_of_birth: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Curriculum</label>
              <select className="form-select" value={addForm.curriculum_type}
                onChange={(e) => setAddForm({ ...addForm, curriculum_type: e.target.value })}>
                <option value="CBC">CBC</option>
                <option value="8-4-4">8-4-4 (Legacy)</option>
              </select>
            </div>
            <div className="col-md-12">
              <label className="form-label">Classroom</label>
              <select className="form-select" required value={addForm.classroom_id}
                onChange={(e) => setAddForm({ ...addForm, classroom_id: e.target.value })}>
                <option value="">Select...</option>
                {admitClassrooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.grade_level_name} {c.stream_name} - {c.academic_year}
                  </option>
                ))}
              </select>
              <div className="form-text" style={{ fontSize: "var(--fs-xs)" }}>
                Only classrooms in the current academic year are shown.
              </div>
            </div>
          </div>

          <h6 className="mt-4" style={{ fontWeight: 700 }}>Parent / Guardian</h6>
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Parent/Guardian Name</label>
              <input className="form-control"
                placeholder="e.g. Jane Wanjiku"
                value={addForm.parent_name}
                onChange={(e) => setAddForm({ ...addForm, parent_name: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Parent/Guardian Phone</label>
              <input className="form-control"
                placeholder="07XXXXXXXX"
                value={addForm.parent_phone}
                onChange={(e) => setAddForm({ ...addForm, parent_phone: e.target.value })} />
            </div>
            <div className="col-md-2">
              <label className="form-label">Relationship</label>
              <select className="form-select" value={addForm.parent_relationship}
                onChange={(e) => setAddForm({ ...addForm, parent_relationship: e.target.value })}>
                <option value="MOTHER">Mother</option>
                <option value="FATHER">Father</option>
                <option value="GUARDIAN">Guardian</option>
              </select>
            </div>
            <div className="col-12">
              <div className="form-text" style={{ fontSize: "var(--fs-xs)" }}>
                If this phone number already belongs to a registered parent (e.g. an older sibling),
                the student is linked to that existing parent account instead of creating a duplicate.
              </div>
            </div>
          </div>

          <p className="text-muted-soft mt-3" style={{ fontSize: "var(--fs-xs)" }}>
            The admission number is generated automatically and used as the student's login username.
            The initial password for every new student is always <strong>password123</strong>.
          </p>
          <div className="mt-3 d-flex gap-2 justify-content-end">
            <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
            <button className="btn btn-success" type="submit" disabled={addSaving}>
              {addSaving ? "Saving..." : "Save Student"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ---------------- VIEW MODAL ---------------- */}
      <Modal show={showViewModal} onClose={() => setShowViewModal(false)} title="Student Details">
        {viewLoading || !viewStudent ? (
          <div className="text-center py-4"><span className="spinner-border spinner-border-sm me-2"></span>Loading...</div>
        ) : (
          <div>
            <h6 className="mb-3" style={{ fontWeight: 700 }}>{viewStudent.full_name}</h6>
            <div className="row g-2">
              <div className="col-6"><strong>Admission No:</strong> {viewStudent.admission_no}</div>
              <div className="col-6"><strong>Username:</strong> {viewStudent.user.username}</div>
              <div className="col-6"><strong>Email:</strong> {viewStudent.user.email || "-"}</div>
              <div className="col-6"><strong>Phone:</strong> {viewStudent.user.phone_number || "-"}</div>
              <div className="col-6"><strong>National ID:</strong> {viewStudent.user.national_id || "-"}</div>
              <div className="col-6"><strong>Gender:</strong> {viewStudent.gender === "M" ? "Male" : "Female"}</div>
              <div className="col-6"><strong>Date of Birth:</strong> {viewStudent.date_of_birth || "-"}</div>
              <div className="col-6"><strong>Curriculum:</strong> {viewStudent.curriculum_type}</div>
              <div className="col-6"><strong>UPI Number:</strong> {viewStudent.upi_number || "-"}</div>
              <div className="col-6"><strong>Current Class:</strong> {viewStudent.current_classroom || "-"}</div>
              <div className="col-6"><strong>Date Admitted:</strong> {viewStudent.date_admitted}</div>
              <div className="col-6"><strong>Status:</strong> {viewStudent.is_active ? "Active" : "Inactive"}</div>
            </div>
          </div>
        )}
      </Modal>

      {/* ---------------- EDIT MODAL ---------------- */}
      <Modal show={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Student & Account" size="lg">
        {!editTarget ? (
          <div className="text-center py-4"><span className="spinner-border spinner-border-sm me-2"></span>Loading...</div>
        ) : (
          <form onSubmit={handleEditSubmit}>
            <div className="d-flex gap-3 mb-2" style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
              <span><strong>Admission No:</strong> {editTarget.admission_no}</span>
              <span><strong>Username:</strong> {editTarget.username}</span>
            </div>

            <h6 className="mt-2" style={{ fontWeight: 700 }}>Account</h6>
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label">First Name</label>
                <input className="form-control" required value={editForm.first_name}
                  onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })} />
              </div>
              <div className="col-md-6">
                <label className="form-label">Last Name</label>
                <input className="form-control" required value={editForm.last_name}
                  onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })} />
              </div>
              <div className="col-md-6">
                <label className="form-label">Email</label>
                <input type="email" className="form-control" value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
              </div>
              <div className="col-md-6">
                <label className="form-label">Phone Number</label>
                <input className="form-control" value={editForm.phone_number}
                  onChange={(e) => setEditForm({ ...editForm, phone_number: e.target.value })} />
              </div>
              <div className="col-md-6">
                <label className="form-label">National ID</label>
                <input className="form-control" value={editForm.national_id}
                  onChange={(e) => setEditForm({ ...editForm, national_id: e.target.value })} />
              </div>
            </div>

            <h6 className="mt-4" style={{ fontWeight: 700 }}>Student Profile</h6>
            <div className="row g-3">
              <div className="col-md-4">
                <label className="form-label">Gender</label>
                <select className="form-select" value={editForm.gender}
                  onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </div>
              <div className="col-md-4">
                <label className="form-label">Date of Birth</label>
                <input type="date" className="form-control" value={editForm.date_of_birth || ""}
                  onChange={(e) => setEditForm({ ...editForm, date_of_birth: e.target.value })} />
              </div>
              <div className="col-md-4">
                <label className="form-label">Curriculum</label>
                <select className="form-select" value={editForm.curriculum_type}
                  onChange={(e) => setEditForm({ ...editForm, curriculum_type: e.target.value })}>
                  <option value="CBC">CBC</option>
                  <option value="8-4-4">8-4-4 (Legacy)</option>
                </select>
              </div>
              <div className="col-md-4">
                <label className="form-label">UPI / NEMIS No</label>
                <input className="form-control" value={editForm.upi_number}
                  onChange={(e) => setEditForm({ ...editForm, upi_number: e.target.value })} />
              </div>
              <div className="col-md-4 d-flex align-items-end">
                <div className="form-check">
                  <input className="form-check-input" type="checkbox" id="editIsActive"
                    checked={editForm.is_active}
                    onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })} />
                  <label className="form-check-label" htmlFor="editIsActive">Active</label>
                </div>
              </div>
            </div>

            <div className="mt-4 d-flex gap-2 justify-content-end">
              <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
              <button className="btn btn-success" type="submit" disabled={editSaving}>
                {editSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ---------------- DELETE MODAL ---------------- */}
      <Modal show={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Delete Student">
        {deleteTarget && (
          <>
            <p>
              This permanently deletes <strong>{deleteTarget.full_name}</strong> ({deleteTarget.admission_no})
              and their login account, and cannot be undone. Historical records (results, invoices) are kept
              on file but this profile's access is removed.
            </p>
            <div className="d-flex gap-2 justify-content-end">
              <button className="btn btn-secondary" onClick={() => setShowDeleteModal(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={deleteSaving}>
                {deleteSaving ? "Deleting..." : "Delete Student"}
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* ---------------- RESET PASSWORD MODAL ---------------- */}
      <Modal show={showResetModal} onClose={() => setShowResetModal(false)} title="Reset Password">
        {resetTarget && (
          resetResult ? (
            <div>
              <div className="alert alert-success">
                Password reset for <strong>{resetTarget.full_name}</strong>.
              </div>
              <p>New password: <code>{resetResult}</code></p>
              <p className="text-muted-soft" style={{ fontSize: "var(--fs-xs)" }}>
                Share this with the student securely — it won't be shown again.
              </p>
              <div className="d-flex justify-content-end">
                <button className="btn btn-secondary" onClick={() => setShowResetModal(false)}>Close</button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleReset}>
              <p>Resetting password for <strong>{resetTarget.full_name}</strong> ({resetTarget.admission_no}).</p>
              <label className="form-label">New Password (optional)</label>
              <input
                className="form-control"
                placeholder="Leave blank to reset to password123"
                value={resetPasswordValue}
                onChange={(e) => setResetPasswordValue(e.target.value)}
              />
              <div className="mt-3 d-flex gap-2 justify-content-end">
                <button type="button" className="btn btn-secondary" onClick={() => setShowResetModal(false)}>Cancel</button>
                <button className="btn btn-warning" type="submit" disabled={resetSaving}>
                  {resetSaving ? "Resetting..." : "Reset Password"}
                </button>
              </div>
            </form>
          )
        )}
      </Modal>
    </div>
  );
}