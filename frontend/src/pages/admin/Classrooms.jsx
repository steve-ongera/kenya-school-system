import { useEffect, useState, useCallback } from "react";
import api, { academicsApi, calendarApi, reportCardsApi } from "../../services/api";
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

// ---- Money helpers (fee balance on the ranking table + report cards) ----
const KES = (amount) =>
  `KES ${Number(amount || 0).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// balance > 0 -> still owes, balance < 0 -> prepaid/credit, 0 -> cleared,
// null/undefined -> no invoice has ever been raised for this student.
const feeLabel = (balance) => {
  if (balance === null || balance === undefined) return "No fee records";
  if (balance > 0) return `${KES(balance)} outstanding`;
  if (balance < 0) return `${KES(Math.abs(balance))} in credit (prepaid)`;
  return "Fully cleared";
};

const feeBadgeClass = (balance) => {
  if (balance === null || balance === undefined) return "badge-neutral";
  if (balance > 0) return "badge-danger";
  return "badge-success";
};

// Fallback remark ladder for report cards - only used if an older cached
// response doesn't carry a `remark` field from the backend. The backend
// (ClassRoomViewSet.results) now computes and returns this per student,
// including "No marks recorded" for students with nothing entered yet.
const overallRemark = (avg) => {
  if (avg === null || avg === undefined) return "No marks recorded";
  if (avg >= 80) return "Excellent";
  if (avg >= 65) return "Good";
  if (avg >= 50) return "Average";
  if (avg >= 30) return "Below Average";
  return "Needs Improvement";
};

// Tabs shown on this page - "classrooms" is the landing tab.
const TABS = [
  { key: "classrooms", label: "All Classrooms", icon: "bi-building" },
  { key: "setup", label: "Add Grade / Stream / Class", icon: "bi-plus-circle" },
  { key: "bulk", label: "Bulk Create", icon: "bi-grid-3x3-gap" },
];

export default function AdminClassrooms() {
  // ---- Active tab ----
  const [activeTab, setActiveTab] = useState("classrooms");

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

  // ---- View modal (student roster) ----
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewClassroom, setViewClassroom] = useState(null);
  const [viewStudents, setViewStudents] = useState([]);
  const [viewStudentsLoading, setViewStudentsLoading] = useState(false);
  const [downloadingRosterPdf, setDownloadingRosterPdf] = useState(false);

  // ---- View modal: term/exam selectors + ranking/results + report cards ----
  const [viewTerms, setViewTerms] = useState([]);
  const [viewSelectedTerm, setViewSelectedTerm] = useState("");
  const [viewExams, setViewExams] = useState([]); // exams available for the selected term/grade
  const [viewSelectedExam, setViewSelectedExam] = useState(""); // "" = combined (all exams this term)
  const [viewResults, setViewResults] = useState(null); // { term, subjects: [...], results: [...], available_exams: [...] }
  const [viewResultsLoading, setViewResultsLoading] = useState(false);
  const [printingReportCard, setPrintingReportCard] = useState(null); // enrollment_id or "ALL"

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

  // ---------------- VIEW (+ student roster + ranking/results) ----------------
  const loadViewResults = async (classroomId, termId, examId = "") => {
    if (!classroomId || !termId) return;
    setViewResultsLoading(true);
    try {
      const params = { term: termId };
      if (examId) params.exam = examId;
      const { data } = await api.get(`/classrooms/${classroomId}/results/`, { params });
      setViewResults(data);
      setViewExams(data.available_exams || []);
    } catch (err) {
      console.error("Failed to load classroom results:", err);
      setViewResults(null);
      setViewExams([]);
    } finally {
      setViewResultsLoading(false);
    }
  };

  const handleViewTermChange = async (termId) => {
    setViewSelectedTerm(termId);
    setViewSelectedExam("");
    if (viewClassroom && termId) await loadViewResults(viewClassroom.id, termId, "");
  };

  const handleViewExamChange = async (examId) => {
    setViewSelectedExam(examId);
    if (viewClassroom && viewSelectedTerm) await loadViewResults(viewClassroom.id, viewSelectedTerm, examId);
  };

  const openView = async (classroom) => {
    setViewClassroom(classroom);
    setShowViewModal(true);
    setViewStudents([]);
    setViewStudentsLoading(true);
    setViewResults(null);
    setViewTerms([]);
    setViewSelectedTerm("");
    setViewSelectedExam("");
    setViewExams([]);
    try {
      const [studentsRes, termsRes] = await Promise.all([
        api.get(`/classrooms/${classroom.id}/students/`),
        calendarApi.terms({ academic_year: classroom.academic_year }),
      ]);
      setViewStudents(studentsRes.data);

      const termList = termsRes.data.results ?? termsRes.data;
      setViewTerms(termList);
      const defaultTerm = termList.find((t) => t.is_current) || termList[0];
      if (defaultTerm) {
        setViewSelectedTerm(defaultTerm.id);
        await loadViewResults(classroom.id, defaultTerm.id, "");
      }
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
        "Status": s.enrollment_status_display || "",
        "Gender": s.gender === "M" ? "Male" : "Female",
        "Date of Birth": s.date_of_birth || "",
        "Curriculum": s.curriculum_type,
        "UPI Number": s.upi_number || "",
        "Email": s.email || "",
        "Phone": s.phone_number || "",
        "National ID": s.national_id || "",
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
      doc.text(
        viewClassroom.is_promoted ? "Class Student Roster (Historical)" : "Class Student Roster",
        base64Logo ? 28 : 12,
        22
      );

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`Generated ${generatedOn}`, pageWidth - 12, 16, { align: "right" });

      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.line(12, 26, pageWidth - 12, 26);

      // --- Class meta line ---
      const metaParts = [
        `Grade: ${viewClassroom.grade_level_name}`,
        `Stream: ${viewClassroom.stream_name}`,
        `Year: ${viewClassroom.academic_year_year}${viewClassroom.academic_year_is_current ? " (current)" : ""}`,
        `Class Teacher: ${viewClassroom.class_teacher_name || "Unassigned"}`,
        `Students: ${viewStudents.length}`,
      ];
      if (viewClassroom.is_promoted) {
        metaParts.push(
          `Promoted${viewClassroom.promoted_to_label ? ` to ${viewClassroom.promoted_to_label}` : ""}`
        );
      }
      const metaLine = metaParts.join("   |   ");

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(51, 65, 85);
      doc.text(metaLine, 12, 32);

      // --- Roster table ---
      const tableColumn = [
        "Adm No", "Full Name", "Status", "Gender", "DOB", "Curriculum",
        "Phone", "Parent/Guardian", "Relationship", "Guardian Phone",
      ];

      const tableRows = viewStudents.map((s) => {
        const g = s.guardians?.[0];
        return [
          s.admission_no || "-",
          s.full_name || "-",
          s.enrollment_status_display || "-",
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
          1: { cellWidth: 42, halign: "left",   overflow: "ellipsize" }, // Full Name
          2: { cellWidth: 22, halign: "center", overflow: "ellipsize" }, // Status
          3: { cellWidth: 16, halign: "center", overflow: "ellipsize" }, // Gender
          4: { cellWidth: 22, halign: "center", overflow: "ellipsize" }, // DOB
          5: { cellWidth: 26, halign: "center", overflow: "ellipsize" }, // Curriculum
          6: { cellWidth: 28, halign: "left",   overflow: "ellipsize" }, // Phone
          7: { cellWidth: 38, halign: "left",   overflow: "ellipsize" }, // Parent/Guardian
          8: { cellWidth: 24, halign: "left",   overflow: "ellipsize" }, // Relationship
          9: { cellWidth: 28, halign: "left",   overflow: "ellipsize" }, // Guardian Phone
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

  // ================================================================
  // REPORT CARD PDF
  // Monochrome, compact rows, one page per student, with:
  //   - a LARGE QR code near the bottom (above signatures) linking to
  //     the public verification page
  //   - per-subject grade + points (backend falls back to a default
  //     high-school scale when no GradingScale is configured)
  //   - a summary strip: total marks / average % / overall grade / points
  //   - a stamp box for the official school stamp
  //   - class teacher & principal signature lines at the very bottom
  //   - a copyright / anti-duplication footer for Junda High School
  // ================================================================
  const drawReportCardPage = (
    doc,
    { classroom, term, examLabel, resultRow, logoBase64, qrCodeBase64, isFirstPage }
  ) => {
    if (!isFirstPage) doc.addPage();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const black = [0, 0, 0];

    // ---- Header ----
    if (logoBase64) {
      doc.addImage(logoBase64, "PNG", 14, 9, 11, 11);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...black);
    doc.text("Masomo School", logoBase64 ? 28 : 14, 15);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text("Official Student Report Card", logoBase64 ? 28 : 14, 20);

    // Date only in the top-right (QR moved to the bottom)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(
      new Date().toLocaleDateString("en-KE", { year: "numeric", month: "long", day: "numeric" }),
      pageWidth - 14,
      14,
      { align: "right" }
    );

    doc.setDrawColor(...black);
    doc.setLineWidth(0.25);
    doc.line(14, 26, pageWidth - 14, 26);

    // ---- Student + class meta, two columns ----
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...black);
    doc.text(`Name: ${resultRow.full_name}`, 14, 31.5);
    doc.text(`Admission No: ${resultRow.admission_no}`, 14, 36);
    doc.text(`Status this year: ${resultRow.enrollment_status_display || "Active"}`, 14, 40.5);

    doc.text(
      `Class: ${classroom.grade_level_name} ${classroom.stream_name} (${classroom.academic_year_year})`,
      pageWidth - 14, 31.5, { align: "right" }
    );
    doc.text(`Term: ${term}`, pageWidth - 14, 36, { align: "right" });
    doc.text(`Exam: ${examLabel}`, pageWidth - 14, 40.5, { align: "right" });

    // ---- Subject marks table: compact row height, grade + points ----
    const tableRows = resultRow.subjects.map((s) => [
      s.subject,
      s.average != null ? `${s.average}%` : "-",
      s.grade || "-",
      s.points != null ? s.points : "-",
    ]);

    autoTable(doc, {
      startY: 45,
      head: [["Subject", "Average %", "Grade", "Points"]],
      body: tableRows,
      theme: "grid",
      styles: {
        lineColor: black,
        lineWidth: 0.15,
        textColor: black,
        cellPadding: { top: 0.7, bottom: 0.7, left: 1.5, right: 1.5 },
      },
      headStyles: {
        fillColor: false,
        textColor: black,
        fontStyle: "bold",
        fontSize: 7.5,
        halign: "left",
        cellPadding: { top: 1, bottom: 1, left: 1.5, right: 1.5 },
      },
      bodyStyles: {
        fontSize: 7,
        valign: "middle",
        minCellHeight: 0, // shrink rows to content — this is what keeps everything on one page
      },
      columnStyles: {
        0: { cellWidth: "auto", halign: "left" },
        1: { cellWidth: 26, halign: "center" },
        2: { cellWidth: 20, halign: "center" },
        3: { cellWidth: 20, halign: "center" },
      },
      margin: { left: 14, right: 14 },
    });

    let y = doc.lastAutoTable.finalY + 5;

    // ---- Summary strip: total marks / average % / overall grade / avg points ----
    const stripHeight = 14;
    doc.setDrawColor(...black);
    doc.setLineWidth(0.25);
    doc.rect(14, y, pageWidth - 28, stripHeight);

    const summaryCols = [
      ["Total Marks", resultRow.total_marks ?? "-"],
      ["Average %", resultRow.average_marks != null ? `${resultRow.average_marks}%` : "-"],
      ["Overall Grade", resultRow.overall_grade || "-"],
      ["Points (Avg)", resultRow.average_points ?? "-"],
      ["Total Points", resultRow.total_points ?? "-"],
    ];
    const colWidth = (pageWidth - 28) / summaryCols.length;
    summaryCols.forEach(([label, value], i) => {
      const x = 14 + i * colWidth;
      if (i > 0) doc.line(x, y, x, y + stripHeight);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.text(label, x + colWidth / 2, y + 5, { align: "center" });
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.text(String(value), x + colWidth / 2, y + 11, { align: "center" });
    });

    y += stripHeight + 5;

    // ---- Position + remark ----
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...black);
    doc.text(
      `Class Position: ${resultRow.class_position ?? "-"} of ${resultRow.class_size ?? "-"}`,
      14, y
    );
    doc.text(
      `Remark: ${resultRow.remark || overallRemark(resultRow.average_marks)}`,
      pageWidth - 14, y, { align: "right" }
    );

    // ---- Fee statement box (monochrome) ----
    y += 5;
    const balance = resultRow.fee_balance;
    const hasFeeRecords = balance !== null && balance !== undefined;
    const feeBoxHeight = hasFeeRecords ? (balance < 0 ? 20 : 16) : 11;

    doc.setDrawColor(...black);
    doc.setLineWidth(0.2);
    doc.rect(14, y, pageWidth - 28, feeBoxHeight);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text("Fee Statement", 17, y + 4.5);

    if (hasFeeRecords) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.8);
      doc.text(`Total Billed: ${KES(resultRow.fee_total_charged)}`, 17, y + 9.5);
      doc.text(`Total Paid: ${KES(resultRow.fee_total_paid)}`, 17, y + 14);

      const feeLabelText = balance > 0 ? "Outstanding Balance:" : balance < 0 ? "Credit (Prepaid):" : "Balance:";
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.8);
      doc.text(feeLabelText, pageWidth - 17, y + 9.5, { align: "right" });
      doc.setFontSize(9);
      doc.text(
        balance === 0 ? "Fully cleared" : KES(Math.abs(balance)),
        pageWidth - 17, y + 14.5, { align: "right" }
      );
      if (balance < 0) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(5.5);
        doc.text("This credit carries forward to next term's invoice automatically.", 17, y + 18);
      }
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.8);
      doc.text("No invoices raised for this student yet.", pageWidth - 17, y + 4.5, { align: "right" });
    }

    // ================================================================
    // BOTTOM SECTION (restructured):
    //   Large QR code (left) + Official stamp box (right) on one row,
    //   then Class Teacher & Principal signature lines below them,
    //   then the copyright / anti-duplication footer at the very bottom.
    // ================================================================

    // Total bottom block height = QR row + signature row + footer clearance
    const qrSize = 26;                       // larger QR (was 16)
    const qrRowHeight = qrSize + 6;          // QR + caption
    const sigRowHeight = 12;                 // signature line + label
    const footerReserve = 14;                // space for the copyright footer
    const bottomBlockHeight = qrRowHeight + sigRowHeight + footerReserve + 8;

    // Where the bottom block starts (anchored to page bottom)
    let bottomTop = pageHeight - bottomBlockHeight - 6;

    // Never let the bottom block overlap the fee box
    const feeBottom = y + feeBoxHeight;
    if (bottomTop < feeBottom + 4) bottomTop = feeBottom + 4;

    // ---- Row 1: Large QR (left) + Official Stamp box (right) ----
    const qrX = 14;
    const qrY = bottomTop;

    if (qrCodeBase64) {
      doc.addImage(
        `data:image/png;base64,${qrCodeBase64}`,
        "PNG",
        qrX, qrY, qrSize, qrSize
      );
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.8);
      doc.setTextColor(...black);
      doc.text(
        "Scan to verify authenticity",
        qrX + qrSize / 2,
        qrY + qrSize + 3.5,
        { align: "center" }
      );
    } else {
      // Placeholder box when the QR can't be generated
      doc.setDrawColor(...black);
      doc.setLineWidth(0.2);
      doc.rect(qrX, qrY, qrSize, qrSize);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.text("Verification QR", qrX + qrSize / 2, qrY + qrSize / 2 - 1, { align: "center" });
      doc.text("unavailable", qrX + qrSize / 2, qrY + qrSize / 2 + 3, { align: "center" });
    }

    // Official stamp box on the same row, to the right of the QR
    const stampGap = 6;
    const stampX = qrX + qrSize + stampGap;
    const stampY = qrY;
    const stampWidth = pageWidth - stampX - 14;
    const stampHeight = qrSize;

    doc.setDrawColor(...black);
    doc.setLineWidth(0.2);
    doc.rect(stampX, stampY, stampWidth, stampHeight);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...black);
    doc.text(
      "Official School Stamp",
      stampX + stampWidth / 2,
      stampY + 5,
      { align: "center" }
    );
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.text(
      "(Stamp here)",
      stampX + stampWidth / 2,
      stampY + stampHeight / 2 + 2,
      { align: "center" }
    );

    // ---- Row 2: Signature lines (Class Teacher | Principal) ----
    const sigY = qrY + qrRowHeight + 2;

    doc.setDrawColor(...black);
    doc.setLineWidth(0.2);

    // Class Teacher (left)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...black);
    doc.text("Class Teacher's Signature:", 14, sigY);
    doc.line(14, sigY + 7, pageWidth / 2 - 6, sigY + 7);

    // Principal (right)
    doc.text("Principal's Signature:", pageWidth / 2 + 6, sigY);
    doc.line(pageWidth / 2 + 6, sigY + 7, pageWidth - 14, sigY + 7);

    // ---- Row 3: Copyright / anti-duplication footer ----
    const footerLineY = pageHeight - 10;
    const footerTextY = pageHeight - 6.5;

    doc.setDrawColor(...black);
    doc.setLineWidth(0.15);
    doc.line(14, footerLineY - 2.5, pageWidth - 14, footerLineY - 2.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.5);
    doc.setTextColor(...black);
    doc.text(
      "© Junda High School. All rights reserved.",
      14,
      footerTextY
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(4.8);
    doc.text(
      "This document is the property of Junda High School. Parents/guardians should keep it safe. Duplication or unauthorized printing is prohibited.",
      14,
      footerTextY + 3
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.text(
      `Page ${doc.internal.getCurrentPageInfo().pageNumber} of ${doc.internal.getNumberOfPages()}`,
      pageWidth - 14,
      footerTextY,
      { align: "right" }
    );
  };

  // Human-readable label for whichever exam scope is currently selected,
  // reused by both the on-screen caption and the report card PDFs.
  const currentExamLabel = () => {
    if (!viewSelectedExam) return "All Exams (Combined)";
    const ex = viewExams.find((e) => String(e.id) === String(viewSelectedExam));
    return ex ? `${ex.name} (${ex.exam_type_name})` : "Selected Exam";
  };

  // Ranked cohort size - backend now sends class_size; fall back to counting
  // the rows that actually carry a position (students who left mid-year are
  // returned unranked with class_position = null).
  const currentClassSize = () =>
    viewResults?.class_size ??
    (viewResults?.results?.filter((r) => r.class_position != null).length || 0);

  // Fetches the QR image for one report card's verification token. Only
  // called at print time (not on every ranking-table load), since the
  // backend renders the actual QR image on demand.
  const fetchReportCardQr = async (token) => {
    if (!token) return null;
    try {
      const { data } = await reportCardsApi.qrCode(token);
      return data.qr_code_base64 || null;
    } catch (err) {
      console.error("Could not fetch report card verification QR:", err);
      return null;
    }
  };

  const handlePrintReportCard = async (resultRow) => {
    if (!viewClassroom || !viewResults) return;
    setPrintingReportCard(resultRow.enrollment_id);
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const logoBase64 = await getImageBase64(logoImage);
      const qrCodeBase64 = await fetchReportCardQr(resultRow.verification_token);

      drawReportCardPage(doc, {
        classroom: viewClassroom,
        term: viewResults.term,
        examLabel: currentExamLabel(),
        resultRow: { ...resultRow, class_size: currentClassSize() },
        logoBase64,
        qrCodeBase64,
        isFirstPage: true,
      });
      doc.save(`${resultRow.admission_no}_report_card.pdf`.replace(/\s+/g, "_"));
    } catch (err) {
      console.error("Failed to generate report card:", err);
      setMessage("Could not generate the report card.");
      setMessageType("danger");
    } finally {
      setPrintingReportCard(null);
    }
  };

  const handleBulkPrintReportCards = async () => {
    if (!viewClassroom || !viewResults || !viewResults.results?.length) return;
    setPrintingReportCard("ALL");
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const logoBase64 = await getImageBase64(logoImage);
      const examLabel = currentExamLabel();
      const classSize = currentClassSize();

      // Fetch every student's verification QR up front, in parallel, so
      // the page-drawing loop below doesn't block on network per student.
      const qrByEnrollment = {};
      await Promise.all(
        viewResults.results.map(async (row) => {
          qrByEnrollment[row.enrollment_id] = await fetchReportCardQr(row.verification_token);
        })
      );

      viewResults.results.forEach((row, idx) => {
        drawReportCardPage(doc, {
          classroom: viewClassroom,
          term: viewResults.term,
          examLabel,
          resultRow: { ...row, class_size: classSize },
          logoBase64,
          qrCodeBase64: qrByEnrollment[row.enrollment_id] || null,
          isFirstPage: idx === 0,
        });
      });
      const filename = `${viewClassroom.grade_level_name}_${viewClassroom.stream_name}_${viewClassroom.academic_year_year}_report_cards.pdf`
        .replace(/\s+/g, "_");
      doc.save(filename);
    } catch (err) {
      console.error("Failed to generate bulk report cards:", err);
      setMessage("Could not generate the bulk report cards.");
      setMessageType("danger");
    } finally {
      setPrintingReportCard(null);
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

      {/* ---------------- TAB NAVIGATION ---------------- */}
      <ul className="nav nav-tabs mb-4" role="tablist">
        {TABS.map((tab) => (
          <li className="nav-item" role="presentation" key={tab.key}>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              className={`nav-link${activeTab === tab.key ? " active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <i className={`bi ${tab.icon} me-2`}></i>
              {tab.label}
              {tab.key === "classrooms" && (
                <span className="badge badge-neutral ms-2">{totalItems}</span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {/* ---------------- TAB: ALL CLASSROOMS ---------------- */}
      {activeTab === "classrooms" && (
        <div role="tabpanel">
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
                    : "Use the \"Add Grade / Stream / Class\" or \"Bulk Create\" tabs above to get started"}
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
                          {c.is_promoted && (
                            <span
                              className="badge badge-neutral ms-1"
                              style={{ fontSize: "10px" }}
                              title={c.promoted_to_label ? `Promoted to ${c.promoted_to_label}` : "Promoted"}
                            >
                              <i className="bi bi-arrow-up-right me-1"></i>
                              {c.promoted_to_label === "Graduated" ? "Graduated" : "Promoted"}
                            </span>
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
        </div>
      )}

      {/* ---------------- TAB: ADD GRADE / STREAM / CLASSROOM ---------------- */}
      {activeTab === "setup" && (
        <div role="tabpanel" className="row g-3">
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
      )}

      {/* ---------------- TAB: BULK CREATE ---------------- */}
      {activeTab === "bulk" && (
        <div role="tabpanel" className="card p-3">
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
      )}

      {/* ---------------- VIEW MODAL (details + roster + ranking/results + report cards) ---------------- */}
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
                  {viewClassroom.is_promoted && (
                    <span
                      className="badge badge-neutral ms-2"
                      style={{ fontSize: "10px", verticalAlign: "middle" }}
                      title={viewClassroom.promoted_to_label ? `Promoted to ${viewClassroom.promoted_to_label}` : "Promoted"}
                    >
                      <i className="bi bi-arrow-up-right me-1"></i>
                      {viewClassroom.promoted_to_label === "Graduated" ? "Graduated" : "Promoted"}
                    </span>
                  )}
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
              {viewClassroom.is_promoted && (
                <div className="col-12">
                  <strong>Promotion:</strong>{" "}
                  {viewClassroom.promoted_to_label
                    ? `Promoted to ${viewClassroom.promoted_to_label}`
                    : "Promoted"}
                </div>
              )}
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

            {viewClassroom.is_promoted && (
              <div className="alert alert-info py-2 px-3 mb-3" style={{ fontSize: "var(--fs-xs)" }}>
                <i className="bi bi-info-circle me-1"></i>
                This class has been promoted
                {viewClassroom.promoted_to_label ? ` to ${viewClassroom.promoted_to_label}` : ""}.
                The list below is the <strong>historical roster</strong> — who was in this
                class in {viewClassroom.academic_year_year} — not who's currently active here.
                Their {viewClassroom.academic_year_year} marks, ranking and report cards are
                still available below.
              </div>
            )}

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
                      <th>Status</th>
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
                          <td>
                            {s.enrollment_status_display ? (
                              <span className={`badge ${s.enrollment_status === "ACTIVE" ? "badge-success" : "badge-neutral"}`}>
                                {s.enrollment_status_display}
                              </span>
                            ) : "-"}
                          </td>
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

            <hr />

            {/* ---------------- RANKING / RESULTS + REPORT CARDS ---------------- */}
            <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
              <h6 className="mb-0" style={{ fontWeight: 700 }}>
                <i className="bi bi-bar-chart-line me-2"></i>
                Class Ranking & Report Cards
              </h6>
              <div className="d-flex gap-2 align-items-center flex-wrap">
                <select
                  className="form-select form-select-sm"
                  style={{ width: "auto" }}
                  value={viewSelectedTerm}
                  onChange={(e) => handleViewTermChange(e.target.value)}
                >
                  <option value="">Select term...</option>
                  {viewTerms.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.get_term_number_display || `Term ${t.term_number}`}
                      {t.is_current ? " (current)" : ""}
                    </option>
                  ))}
                </select>
                <select
                  className="form-select form-select-sm"
                  style={{ width: "auto" }}
                  value={viewSelectedExam}
                  onChange={(e) => handleViewExamChange(e.target.value)}
                  disabled={!viewSelectedTerm || viewResultsLoading}
                  title="Filter ranking to a single exam, or combine every exam this term"
                >
                  <option value="">All Exams (combined)</option>
                  {viewExams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name} ({ex.exam_type_name}){!ex.is_published ? " — unpublished" : ""}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-sm btn-outline-primary"
                  onClick={handleBulkPrintReportCards}
                  disabled={!viewResults || !viewResults.results?.length || printingReportCard === "ALL"}
                >
                  {printingReportCard === "ALL" ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-1"></span>
                      Preparing...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-printer me-1"></i>
                      Print All Report Cards
                    </>
                  )}
                </button>
              </div>
            </div>

            {viewSelectedTerm && !viewResultsLoading && (
              <p className="text-muted-soft mb-2" style={{ fontSize: "var(--fs-xs)" }}>
                Ranking based on: <strong>{currentExamLabel()}</strong>
                {viewExams.length === 0 && " — no exams configured yet for this grade/term."}
                {viewClassroom.is_promoted && viewExams.length > 0 &&
                  ` — showing the ${viewClassroom.academic_year_year} cohort, including students since promoted.`}
              </p>
            )}

            {viewResultsLoading ? (
              <div className="text-center py-4">
                <span className="spinner-border spinner-border-sm me-2"></span>
                Loading results...
              </div>
            ) : !viewSelectedTerm ? (
              <p className="text-muted-soft">Select a term to view class ranking and results.</p>
            ) : !viewResults || !viewResults.results?.length ? (
              <p className="text-muted-soft">No students found for this classroom/term.</p>
            ) : (
              <div className="table-responsive" style={{ maxHeight: "400px", overflowY: "auto" }}>
                <table className="table table-sm table-hover mb-0">
                  <thead>
                    <tr>
                      <th style={{ width: "60px" }}>Pos</th>
                      <th>Admission No</th>
                      <th>Name</th>
                      <th>Status</th>
                      <th>Average %</th>
                      <th>Total Marks</th>
                      <th>Grade</th>
                      <th>Points</th>
                      <th>Remark</th>
                      <th>Fee Balance</th>
                      <th style={{ width: "90px" }}>Report</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewResults.results.map((r) => (
                      <tr key={r.enrollment_id}>
                        <td style={{ fontWeight: 700 }}>{r.class_position ?? "-"}</td>
                        <td>{r.admission_no}</td>
                        <td>{r.full_name}</td>
                        <td>
                          {r.enrollment_status_display ? (
                            <span className={`badge ${r.enrollment_status === "ACTIVE" ? "badge-success" : "badge-neutral"}`}>
                              {r.enrollment_status_display}
                            </span>
                          ) : "-"}
                        </td>
                        <td>{r.average_marks != null ? `${r.average_marks}%` : "-"}</td>
                        <td>{r.total_marks != null ? r.total_marks : "-"}</td>
                        <td>{r.overall_grade || "-"}</td>
                        <td>{r.average_points ?? "-"}</td>
                        <td>
                          {r.has_marks ? (
                            <span className="badge badge-neutral">{r.remark}</span>
                          ) : (
                            <span className="text-muted-soft">{r.remark}</span>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${feeBadgeClass(r.fee_balance)}`} title={feeLabel(r.fee_balance)}>
                            {feeLabel(r.fee_balance)}
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn btn-sm btn-outline-secondary btn-icon"
                            title="Print report card"
                            onClick={() => handlePrintReportCard(r)}
                            disabled={printingReportCard === r.enrollment_id || printingReportCard === "ALL"}
                          >
                            {printingReportCard === r.enrollment_id ? (
                              <span className="spinner-border spinner-border-sm"></span>
                            ) : (
                              <i className="bi bi-file-earmark-pdf"></i>
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
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