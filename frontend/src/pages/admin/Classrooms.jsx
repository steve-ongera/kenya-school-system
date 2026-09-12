import { useEffect, useState, useCallback } from "react";
import api, { academicsApi, calendarApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";
import Pagination from "../../components/Pagination";
import Modal from "../../components/Modal";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoImage from "../../assets/masomo_logo.png";

const emptyFilters = { grade_level: "", stream: "", academic_year: "" };

function downloadCsv(filename, rows) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (val) => {
    const s = val === null || val === undefined ? "" : String(val);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Load an image URL as a base64 data URL (for embedding the logo in PDFs)
const getImageBase64 = (url) =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = url;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(null);
  });

export default function AdminClassrooms() {
  // ---- Classroom list (server-paginated) ----
  const [classrooms, setClassrooms] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState(emptyFilters);

  // ---- Static reference data ----
  const [gradeLevels, setGradeLevels] = useState([]);
  const [streams, setStreams] = useState([]);
  const [years, setYears] = useState([]);
  const [teachers, setTeachers] = useState([]);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");

  // ---- Add Grade Level / Stream / Single Classroom forms ----
  const [gradeForm, setGradeForm] = useState({
    name: "", curriculum_type: "CBC", education_level: "JSS", level_order: "",
  });
  const [streamForm, setStreamForm] = useState({ name: "" });
  const [classForm, setClassForm] = useState({ grade_level: "", stream: "", academic_year: "" });
  const [formSaving, setFormSaving] = useState(false);

  // ---- Bulk create form ----
  const [bulkForm, setBulkForm] = useState({ academic_year: "", grade_level_ids: [], stream_ids: [] });
  const [bulkSaving, setBulkSaving] = useState(false);

  // ---- View modal (now includes student roster) ----
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewClassroom, setViewClassroom] = useState(null);
  const [viewStudents, setViewStudents] = useState([]);
  const [viewStudentsLoading, setViewStudentsLoading] = useState(false);
  const [downloadingRosterPdf, setDownloadingRosterPdf] = useState(false);

  // ---- Assign Teacher modal ----
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignTarget, setAssignTarget] = useState(null);
  const [assignTeacherId, setAssignTeacherId] = useState("");
  const [assignSaving, setAssignSaving] = useState(false);

  // ---- Delete modal ----
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  // Debounce search input.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ---- Load classrooms (server-side page + search + filters) ----
  const loadClassrooms = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: currentPage, page_size: itemsPerPage };
      if (searchQuery) params.search = searchQuery;
      if (filters.grade_level) params.grade_level = filters.grade_level;
      if (filters.stream) params.stream = filters.stream;
      if (filters.academic_year) params.academic_year = filters.academic_year;

      const { data } = await api.get("/classrooms/", { params });
      if (Array.isArray(data)) {
        setClassrooms(data);
        setTotalItems(data.length);
      } else {
        setClassrooms(data.results ?? []);
        setTotalItems(data.count ?? 0);
      }
    } catch (error) {
      console.error("Failed to load classrooms:", error);
      setMessage("Could not load classrooms.");
      setMessageType("danger");
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, searchQuery, filters]);

  useEffect(() => { loadClassrooms(); }, [loadClassrooms]);

  // ---- Load static reference data (grades, streams, years, teachers) ----
  const loadStaticData = async () => {
    try {
      const [g, s, y, t] = await Promise.all([
        academicsApi.gradeLevels(),
        academicsApi.streams(),
        calendarApi.academicYears(),
        api.get("/users/", { params: { role: "TEACHER", page_size: 500 } }),
      ]);
      setGradeLevels(g.data.results ?? g.data);
      setStreams(s.data.results ?? s.data);
      setYears(y.data.results ?? y.data);
      setTeachers(t.data.results ?? t.data);
    } catch (error) {
      console.error("Failed to load reference data:", error);
    }
  };

  useEffect(() => { loadStaticData(); }, []);

  // ---------------- ADD GRADE / STREAM / SINGLE CLASSROOM ----------------
  const addGradeLevel = async (e) => {
    e.preventDefault();
    setMessage("");
    setFormSaving(true);
    try {
      await api.post("/grade-levels/", { ...gradeForm, level_order: Number(gradeForm.level_order) });
      setGradeForm({ name: "", curriculum_type: "CBC", education_level: "JSS", level_order: "" });
      await loadStaticData();
      setMessage("Grade level created successfully.");
      setMessageType("success");
    } catch (err) {
      setMessage(err.response?.data ? JSON.stringify(err.response.data) : "Could not create grade level.");
      setMessageType("danger");
    } finally {
      setFormSaving(false);
    }
  };

  const addStream = async (e) => {
    e.preventDefault();
    setMessage("");
    setFormSaving(true);
    try {
      await api.post("/streams/", streamForm);
      setStreamForm({ name: "" });
      await loadStaticData();
      setMessage("Stream created successfully.");
      setMessageType("success");
    } catch {
      setMessage("Could not create stream.");
      setMessageType("danger");
    } finally {
      setFormSaving(false);
    }
  };

  const addClassroom = async (e) => {
    e.preventDefault();
    setMessage("");
    setFormSaving(true);
    try {
      await api.post("/classrooms/", classForm);
      setClassForm({ grade_level: "", stream: "", academic_year: "" });
      await loadClassrooms();
      setMessage("Classroom created successfully.");
      setMessageType("success");
    } catch (err) {
      setMessage(err.response?.data ? JSON.stringify(err.response.data) : "Could not create classroom.");
      setMessageType("danger");
    } finally {
      setFormSaving(false);
    }
  };

  // ---------------- BULK CREATE ----------------
  const toggleBulkSelection = (field, id) => {
    setBulkForm((prev) => {
      const current = prev[field];
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      return { ...prev, [field]: next };
    });
  };

  const selectAllBulk = (field, allIds) => {
    setBulkForm((prev) => ({ ...prev, [field]: prev[field].length === allIds.length ? [] : allIds }));
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
      setMessage(`Created ${data.created_count} classroom(s). ${data.skipped_count} already existed and were skipped.`);
      setMessageType("success");
      setBulkForm({ academic_year: "", grade_level_ids: [], stream_ids: [] });
      setCurrentPage(1);
      await loadClassrooms();
    } catch (err) {
      setMessage(err.response?.data ? JSON.stringify(err.response.data) : "Could not bulk create classrooms.");
      setMessageType("danger");
    } finally {
      setBulkSaving(false);
    }
  };

  // ---------------- VIEW (+ student roster) ----------------
  const openView = async (classroom) => {
    setViewClassroom(classroom);
    setShowViewModal(true);
    setViewStudents([]);
    setViewStudentsLoading(true);
    try {
      const { data } = await api.get(`/classrooms/${classroom.id}/students/`);
      setViewStudents(data);
    } catch (err) {
      console.error("Failed to load classroom roster:", err);
      setMessage("Could not load student list for this classroom.");
      setMessageType("danger");
    } finally {
      setViewStudentsLoading(false);
    }
  };

  const handleDownloadRoster = () => {
    if (!viewClassroom || !viewStudents.length) return;
    const rows = viewStudents.map((s) => {
      const primaryGuardian = s.guardians?.[0];
      return {
        "Admission No": s.admission_no,
        "Full Name": s.full_name,
        "Gender": s.gender === "M" ? "Male" : "Female",
        "Date of Birth": s.date_of_birth || "",
        "Curriculum": s.curriculum_type,
        "UPI Number": s.upi_number || "",
        "Email": s.email || "",
        "Phone": s.phone_number || "",
        "National ID": s.national_id || "",
        "Status": s.is_active ? "Active" : "Inactive",
        "Date Admitted": s.date_admitted || "",
        "Parent/Guardian Name": primaryGuardian?.name || "",
        "Parent/Guardian Relationship": primaryGuardian?.relationship || "",
        "Parent/Guardian Phone": primaryGuardian?.phone_number || "",
        "Parent/Guardian Email": primaryGuardian?.email || "",
      };
    });
    const filename = `${viewClassroom.grade_level_name}_${viewClassroom.stream_name}_${viewClassroom.academic_year_year}_students.csv`
      .replace(/\s+/g, "_");
    downloadCsv(filename, rows);
  };

  // ---- Download the specific classroom's roster as a landscape PDF ----
  const handleDownloadRosterPdf = async () => {
    if (!viewClassroom || !viewStudents.length) return;
    try {
      setDownloadingRosterPdf(true);

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      const base64Logo = await getImageBase64(logoImage);

      const generatedOn = new Date().toLocaleDateString("en-KE", {
        year: "numeric", month: "long", day: "numeric",
      });

      // --- Header: logo + school name + report title + generated date ---
      if (base64Logo) {
        doc.addImage(base64Logo, "PNG", 12, 10, 12, 12);
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.text("Masomo School", base64Logo ? 28 : 12, 16);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(71, 85, 105);
      doc.text("Class Student Roster", base64Logo ? 28 : 12, 22);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`Generated ${generatedOn}`, pageWidth - 12, 16, { align: "right" });

      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.line(12, 26, pageWidth - 12, 26);

      // --- Class meta line ---
      const metaLine = [
        `Grade: ${viewClassroom.grade_level_name}`,
        `Stream: ${viewClassroom.stream_name}`,
        `Year: ${viewClassroom.academic_year_year}${viewClassroom.academic_year_is_current ? " (current)" : ""}`,
        `Class Teacher: ${viewClassroom.class_teacher_name || "Unassigned"}`,
        `Students: ${viewStudents.length}`,
      ].join("   |   ");

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(51, 65, 85);
      doc.text(metaLine, 12, 32);

      // --- Roster table ---
      const tableColumn = [
        "Adm No", "Full Name", "Gender", "DOB", "Curriculum",
        "Phone", "Parent/Guardian", "Relationship", "Guardian Phone",
      ];

      const tableRows = viewStudents.map((s) => {
        const g = s.guardians?.[0];
        return [
          s.admission_no || "-",
          s.full_name || "-",
          s.gender === "M" ? "Male" : s.gender === "F" ? "Female" : "-",
          s.date_of_birth || "-",
          s.curriculum_type || "-",
          s.phone_number || "-",
          g?.name || "-",
          g?.relationship || "-",
          g?.phone_number || "-",
        ];
      });

      autoTable(doc, {
        startY: 37,
        head: [tableColumn],
        body: tableRows,
        theme: "grid",
        styles: {
          cellWidth: "wrap",
          overflow: "ellipsize",
        },
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 8.5,
          cellPadding: 2,
          halign: "left",
          overflow: "ellipsize",
        },
        bodyStyles: {
          fontSize: 8,
          textColor: [51, 65, 85],
          cellPadding: 1.8,
          valign: "middle",
          lineWidth: 0.1,
          lineColor: [226, 232, 240],
          overflow: "ellipsize",
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 24, halign: "left",   overflow: "ellipsize" }, // Adm No
          1: { cellWidth: 46, halign: "left",   overflow: "ellipsize" }, // Full Name
          2: { cellWidth: 16, halign: "center", overflow: "ellipsize" }, // Gender
          3: { cellWidth: 22, halign: "center", overflow: "ellipsize" }, // DOB
          4: { cellWidth: 26, halign: "center", overflow: "ellipsize" }, // Curriculum
          5: { cellWidth: 28, halign: "left",   overflow: "ellipsize" }, // Phone
          6: { cellWidth: 42, halign: "left",   overflow: "ellipsize" }, // Parent/Guardian
          7: { cellWidth: 24, halign: "left",   overflow: "ellipsize" }, // Relationship
          8: { cellWidth: 28, halign: "left",   overflow: "ellipsize" }, // Guardian Phone
        },
        margin: { left: 12, right: 12 },
        didDrawPage: () => {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor(148, 163, 184);
          doc.text(
            `Page ${doc.internal.getCurrentPageInfo().pageNumber} of ${doc.internal.getNumberOfPages()}`,
            pageWidth - 12,
            pageHeight - 6,
            { align: "right" }
          );
          doc.text("Masomo School — Academics Office", 12, pageHeight - 6);
        },
      });

      // --- Signature / stamp blocks: Class Teacher + Principal ---
      let finalY = doc.lastAutoTable.finalY + 14;
      if (finalY > pageHeight - 28) {
        doc.addPage();
        finalY = 24;
      }

      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.2);

      // Class Teacher (left)
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text("Class Teacher's Signature:", 12, finalY);
      doc.line(12, finalY + 10, 90, finalY + 10);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text("Sign & Official Stamp", 12, finalY + 14);

      // Principal (right)
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text("Principal's Signature:", pageWidth - 90, finalY);
      doc.line(pageWidth - 90, finalY + 10, pageWidth - 12, finalY + 10);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text("Sign & Official Stamp", pageWidth - 90, finalY + 14);

      const filename = `${viewClassroom.grade_level_name}_${viewClassroom.stream_name}_${viewClassroom.academic_year_year}_students.pdf`
        .replace(/\s+/g, "_");
      doc.save(filename);
    } catch (err) {
      console.error("Failed to generate roster PDF:", err);
      setMessage("Could not generate the student roster PDF.");
      setMessageType("danger");
    } finally {
      setDownloadingRosterPdf(false);
    }
  };

  // ---------------- ASSIGN TEACHER ----------------
  const openAssign = (classroom) => {
    setAssignTarget(classroom);
    setAssignTeacherId(classroom.class_teacher || "");
    setShowAssignModal(true);
  };

  const handleAssignTeacher = async (e) => {
    e.preventDefault();
    if (!assignTarget) return;
    setAssignSaving(true);
    try {
      await api.patch(`/classrooms/${assignTarget.id}/`, {
        class_teacher: assignTeacherId || null,
      });
      setMessage("Class teacher updated successfully.");
      setMessageType("success");
      setShowAssignModal(false);
      await loadClassrooms();
    } catch (err) {
      setMessage(err.response?.data?.detail || "Could not update class teacher.");
      setMessageType("danger");
    } finally {
      setAssignSaving(false);
    }
  };

  // ---------------- DELETE ----------------
  const openDelete = (classroom) => {
    setDeleteTarget(classroom);
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteSaving(true);
    try {
      await api.delete(`/classrooms/${deleteTarget.id}/`);
      setMessage(`${deleteTarget.grade_level_name} ${deleteTarget.stream_name} (${deleteTarget.academic_year_year}) was deleted.`);
      setMessageType("success");
      setShowDeleteModal(false);
      setDeleteTarget(null);
      await loadClassrooms();
    } catch (err) {
      setMessage(err.response?.data?.detail || "Could not delete classroom.");
      setMessageType("danger");
      setShowDeleteModal(false);
    } finally {
      setDeleteSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + classrooms.length;
  const hasActiveFilters = !!(searchInput || filters.grade_level || filters.stream || filters.academic_year);
  const bulkComboCount = bulkForm.grade_level_ids.length * bulkForm.stream_ids.length;

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  const updateFilter = (patch) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setSearchInput("");
    setSearchQuery("");
    setFilters(emptyFilters);
    setCurrentPage(1);
  };

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
          <p className="page-subtitle">Manage grade levels, streams, and classroom configurations</p>
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
              <button className="btn btn-primary btn-sm w-100" type="submit" disabled={formSaving}>
                {formSaving ? "Saving..." : "Save Grade Level"}
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
              <button className="btn btn-primary btn-sm w-100" type="submit" disabled={formSaving}>
                {formSaving ? "Saving..." : "Save Stream"}
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
              <button className="btn btn-primary btn-sm w-100" type="submit" disabled={formSaving}>
                {formSaving ? "Saving..." : "Save Classroom"}
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
          grade × stream combination. Existing ones are skipped automatically.
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

      {/* Table with Search & Filters */}
      <div className="table-wrap">
        <div className="table-wrap__header" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.75rem" }}>
          <div className="d-flex flex-wrap gap-2" style={{ width: "100%" }}>
            <div style={{ flex: 1, minWidth: "200px", position: "relative" }}>
              <i className="bi bi-search" style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--ink-400)" }}></i>
              <input
                type="text"
                className="form-control"
                placeholder="Search by grade, stream, or class teacher..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                style={{ paddingLeft: "2.4rem" }}
              />
            </div>
            <select
              className="form-select"
              value={filters.grade_level}
              onChange={(e) => updateFilter({ grade_level: e.target.value })}
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
              onChange={(e) => updateFilter({ stream: e.target.value })}
              style={{ width: "auto", minWidth: "120px" }}
            >
              <option value="">All Streams</option>
              {streams.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select
              className="form-select"
              value={filters.academic_year}
              onChange={(e) => updateFilter({ academic_year: e.target.value })}
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
                  <button onClick={() => setSearchInput("")}><i className="bi bi-x"></i></button>
                </span>
              )}
              {filters.grade_level && (
                <span className="filter-chip">
                  Grade: {gradeLevels.find((g) => String(g.id) === String(filters.grade_level))?.name}
                  <button onClick={() => updateFilter({ grade_level: "" })}><i className="bi bi-x"></i></button>
                </span>
              )}
              {filters.stream && (
                <span className="filter-chip">
                  Stream: {streams.find((s) => String(s.id) === String(filters.stream))?.name}
                  <button onClick={() => updateFilter({ stream: "" })}><i className="bi bi-x"></i></button>
                </span>
              )}
              {filters.academic_year && (
                <span className="filter-chip">
                  Year: {years.find((y) => String(y.id) === String(filters.academic_year))?.year}
                  <button onClick={() => updateFilter({ academic_year: "" })}><i className="bi bi-x"></i></button>
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
              {totalItems} classroom{totalItems !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={Math.min(itemsPerPage, 10)} columns={6} />
        ) : classrooms.length === 0 ? (
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
                  <th style={{ width: "150px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {classrooms.map((c) => (
                  <tr key={c.id}>
                    <td><span className="badge badge-blue">{c.grade_level_name}</span></td>
                    <td><span className="badge badge-neutral">{c.stream_name}</span></td>
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
                        <span className="text-muted-soft">Unassigned</span>
                      )}
                    </td>
                    <td>
                      <div className="table-actions">
                        <button className="btn btn-sm btn-outline-primary btn-icon" title="View" onClick={() => openView(c)}>
                          <i className="bi bi-eye"></i>
                        </button>
                        <button className="btn btn-sm btn-outline-secondary btn-icon" title="Assign Class Teacher" onClick={() => openAssign(c)}>
                          <i className="bi bi-person-check"></i>
                        </button>
                        <button className="btn btn-sm btn-outline-danger btn-icon" title="Delete" onClick={() => openDelete(c)}>
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

      {!loading && classrooms.length > 0 && (
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

      {/* ---------------- VIEW MODAL (details + student roster + CSV/PDF download) ---------------- */}
      <Modal show={showViewModal} onClose={() => setShowViewModal(false)} title="Classroom Details" size="lg">
        {viewClassroom && (
          <div>
            {/* Modal header strip with logo + class name */}
            <div
              className="d-flex align-items-center gap-3 mb-3 pb-3"
              style={{ borderBottom: "1px solid var(--border-color)" }}
            >
              <img
                src={logoImage}
                alt="Masomo School"
                style={{ width: 44, height: 44, objectFit: "contain" }}
              />
              <div>
                <div style={{ fontWeight: 700, fontSize: "var(--fs-md)", color: "var(--ink-900)" }}>
                  {viewClassroom.grade_level_name} {viewClassroom.stream_name}
                </div>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-600)" }}>
                  {viewClassroom.academic_year_year}
                  {viewClassroom.academic_year_is_current ? " · current year" : ""}
                  {" · "}
                  {viewClassroom.student_count || 0} student{(viewClassroom.student_count || 0) !== 1 ? "s" : ""}
                </div>
              </div>
            </div>

            <div className="row g-2 mb-3">
              <div className="col-6"><strong>Grade:</strong> {viewClassroom.grade_level_name}</div>
              <div className="col-6"><strong>Stream:</strong> {viewClassroom.stream_name}</div>
              <div className="col-6"><strong>Academic Year:</strong> {viewClassroom.academic_year_year}</div>
              <div className="col-6"><strong>Status:</strong> {viewClassroom.academic_year_is_current ? "Current year" : "Past/Future year"}</div>
              <div className="col-6"><strong>Student Count:</strong> {viewClassroom.student_count || 0}</div>
              <div className="col-6"><strong>Class Teacher:</strong> {viewClassroom.class_teacher_name || "Unassigned"}</div>
            </div>

            <hr />

            <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
              <h6 className="mb-0" style={{ fontWeight: 700 }}>
                <i className="bi bi-people me-2"></i>
                Students in this Class
              </h6>
              <div className="d-flex gap-2">
                <button
                  className="btn btn-sm btn-outline-success"
                  onClick={handleDownloadRoster}
                  disabled={viewStudentsLoading || viewStudents.length === 0}
                >
                  <i className="bi bi-download me-1"></i>
                  Download CSV
                </button>
                <button
                  className="btn btn-sm btn-outline-primary"
                  onClick={handleDownloadRosterPdf}
                  disabled={viewStudentsLoading || viewStudents.length === 0 || downloadingRosterPdf}
                >
                  {downloadingRosterPdf ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                      Preparing...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-file-earmark-pdf me-1"></i>
                      Download PDF
                    </>
                  )}
                </button>
              </div>
            </div>

            {viewStudentsLoading ? (
              <div className="text-center py-4">
                <span className="spinner-border spinner-border-sm me-2"></span>
                Loading students...
              </div>
            ) : viewStudents.length === 0 ? (
              <p className="text-muted-soft">No active students in this classroom yet.</p>
            ) : (
              <div className="table-responsive" style={{ maxHeight: "400px", overflowY: "auto" }}>
                <table className="table table-sm table-hover mb-0">
                  <thead>
                    <tr>
                      <th>Admission No</th>
                      <th>Name</th>
                      <th>Gender</th>
                      <th>DOB</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>National ID</th>
                      <th>Parent/Guardian</th>
                      <th>Parent Phone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewStudents.map((s) => {
                      const primaryGuardian = s.guardians?.[0];
                      return (
                        <tr key={s.id}>
                          <td style={{ fontWeight: 600 }}>{s.admission_no}</td>
                          <td>{s.full_name}</td>
                          <td>{s.gender === "M" ? "Male" : "Female"}</td>
                          <td>{s.date_of_birth || "-"}</td>
                          <td>{s.email || "-"}</td>
                          <td>{s.phone_number || "-"}</td>
                          <td>{s.national_id || "-"}</td>
                          <td>
                            {primaryGuardian
                              ? `${primaryGuardian.name} (${primaryGuardian.relationship})`
                              : "-"}
                          </td>
                          <td>{primaryGuardian?.phone_number || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ---------------- ASSIGN TEACHER MODAL ---------------- */}
      <Modal show={showAssignModal} onClose={() => setShowAssignModal(false)} title="Assign Class Teacher">
        {assignTarget && (
          <form onSubmit={handleAssignTeacher}>
            <p>
              Classroom: <strong>{assignTarget.grade_level_name} {assignTarget.stream_name} ({assignTarget.academic_year_year})</strong>
            </p>
            <label className="form-label">Class Teacher</label>
            <select
              className="form-select"
              value={assignTeacherId}
              onChange={(e) => setAssignTeacherId(e.target.value)}
            >
              <option value="">Unassigned</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.first_name} {t.last_name}
                </option>
              ))}
            </select>
            <div className="mt-3 d-flex gap-2 justify-content-end">
              <button type="button" className="btn btn-secondary" onClick={() => setShowAssignModal(false)}>Cancel</button>
              <button className="btn btn-success" type="submit" disabled={assignSaving}>
                {assignSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ---------------- DELETE MODAL ---------------- */}
      <Modal show={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Delete Classroom">
        {deleteTarget && (
          <>
            <p>
              This permanently deletes <strong>{deleteTarget.grade_level_name} {deleteTarget.stream_name} ({deleteTarget.academic_year_year})</strong>.
              This cannot be undone.
            </p>
            {deleteTarget.student_count > 0 && (
              <div className="alert alert-warning">
                This classroom has {deleteTarget.student_count} active student(s). Deletion will be blocked until they are moved or promoted.
              </div>
            )}
            <div className="d-flex gap-2 justify-content-end">
              <button className="btn btn-secondary" onClick={() => setShowDeleteModal(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={deleteSaving}>
                {deleteSaving ? "Deleting..." : "Delete Classroom"}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}