import { useEffect, useState, useCallback } from "react";
import api, { academicsApi, calendarApi, reportCardsApi, teacherApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";
import Pagination from "../../components/Pagination";
import Modal from "../../components/Modal";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoImage from "../../assets/junda_high_logo.png";

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

// Draws the logo at its NATURAL aspect ratio (never squashed into a square),
// limited by a max height and a max width. Returns the size it was drawn at.
const placeLogo = (doc, logo, x, y, maxH, maxW) => {
  if (!logo) return { w: 0, h: 0 };
  const props = doc.getImageProperties(logo);
  const ratio = props.width / props.height;
  let h = maxH;
  let w = h * ratio;
  if (w > maxW) {
    w = maxW;
    h = w / ratio;
  }
  doc.addImage(logo, "PNG", x, y, w, h);
  return { w, h };
};

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

// ---- Report card wording (matches the school's official report card) ----
const SCHOOL_NAME = "JUNDA HIGH SCHOOL";
const SCHOOL_ADDRESS = "P.O BOX 87073-80100, MOMBASA   |   Email: jundahighschool83@gmail.com";
const SCHOOL_MOTTO = "STRIVE TO EXCELL"; // spelled as on the school's sample report card
const PASS_MARK = 50; // mean score below this = "has not attained a pass mark"

// Per-subject teacher remark, by the subject's average %.
const subjectRemark = (avg) => {
  if (avg === null || avg === undefined) return "Did not sit for this paper.";
  if (avg >= 80) return "Excellent performance. Keep up the good work.";
  if (avg >= 60) return "Good performance. Keep working hard to reach the top grade.";
  if (avg >= 45) return "Fair performance. More consistency and effort required.";
  if (avg >= 30) return "Below average. Needs close attention and extra practice.";
  return "Poor performance. Requires urgent remedial support.";
};

const firstNameOf = (fullName) => {
  const first = String(fullName || "The student").trim().split(/\s+/)[0] || "The student";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
};

const classTeacherRemark = (name, mean) => {
  if (mean === null || mean === undefined) {
    return `No examination marks have been recorded for ${name} this term.`;
  }
  let text;
  if (mean >= 80) text = `${name} has performed excellently this term. Keep up the outstanding work and aim even higher.`;
  else if (mean >= 60) text = `${name} has performed well this term. With continued effort, the top grade is within reach.`;
  else if (mean >= 45) text = `${name} has shown a fair performance this term. With more focus, a higher grade is achievable.`;
  else if (mean >= 30) text = `${name} has performed below average this term and needs to put in significantly more effort.`;
  else text = `${name} has performed poorly this term and requires urgent remedial support and closer supervision.`;
  if (mean < PASS_MARK) text += " The student has not attained a pass mark this term and needs to work much harder.";
  return text;
};

const principalRemark = (name, mean) => {
  if (mean === null || mean === undefined) {
    return `The school administration encourages ${name} to consult subject teachers and sit all papers next term.`;
  }
  if (mean < PASS_MARK) {
    return `The student has not attained a pass mark this term and needs to work much harder. The school administration encourages ${name} to maintain close consultation with subject teachers next term.`;
  }
  return `The student has attained a pass mark this term. The school administration encourages ${name} to keep up the good work and aim even higher next term.`;
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
  // Toggles the View modal between its normal "lg" size and a fullscreen
  // size that fills the whole laptop window / mobile screen. Purely a
  // display preference - resets to normal every time the modal is opened.
  const [modalFullscreen, setModalFullscreen] = useState(false);

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
    setModalFullscreen(false);
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

  const closeViewModal = () => {
    setShowViewModal(false);
    setModalFullscreen(false);
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

      // --- Header: logo (natural width, not squeezed) + school name + report title + generated date ---
      const { w: logoW } = placeLogo(doc, base64Logo, 12, 10, 14, 30);
      const textX = base64Logo ? 12 + logoW + 4 : 12;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.text("Junda High School Shanzu", textX, 16);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(71, 85, 105);
      doc.text(
        viewClassroom.is_promoted ? "Class Student Roster (Historical)" : "Class Student Roster",
        textX,
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
          doc.text("Junda High School Shanzu — Academics Office", 12, pageHeight - 6);
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
  // REPORT CARD PDF - exactly ONE A4 page per student:
  //   TOP     : logo, school name/address/motto, verification QR, title
  //   MIDDLE  : student info, subject table, summary (total/mean/grade/
  //             position), FEE STATEMENT, class teacher + principal remarks
  //   BOTTOM  : [Class Teacher signature] [Official Stamp] [Principal signature]
  //   FOOTER  : note + copyright line pinned to the bottom of the page
  // The subject table's row height is calculated from the space left over,
  // so the bottom block always stays on the same page regardless of how
  // many subjects a student has.
  // ================================================================
  const drawReportCardPage = (
    doc,
    { classroom, termLabel, titleText, resultRow, logoBase64, qrCodeBase64, teacherMap, isFirstPage }
  ) => {
    if (!isFirstPage) doc.addPage();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const M = 12; // page margin
    const cw = pageWidth - M * 2; // content width
    const navy = [31, 56, 100];
    const grey = [242, 242, 242];
    const border = [166, 166, 166];
    const black = [0, 0, 0];

    // ---- Header: logo (left), school details (centre), QR (right) ----
    placeLogo(doc, logoBase64, M, 9, 21, 34);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...navy);
    doc.text(SCHOOL_NAME, pageWidth / 2, 17, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...black);
    doc.text(SCHOOL_ADDRESS, pageWidth / 2, 23, { align: "center" });

    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(110, 110, 110);
    doc.text(SCHOOL_MOTTO, pageWidth / 2, 27.5, { align: "center" });

    if (qrCodeBase64) {
      const qrSize = 20;
      const qrX = pageWidth - M - qrSize;
      doc.addImage(`data:image/png;base64,${qrCodeBase64}`, "PNG", qrX, 9, qrSize, qrSize);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(4.8);
      doc.setTextColor(110, 110, 110);
      doc.text("Scan to verify", qrX + qrSize / 2, 31, { align: "center" });
    }

    doc.setDrawColor(...navy);
    doc.setLineWidth(0.6);
    doc.line(M, 34, pageWidth - M, 34);

    // ---- Report title ----
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...navy);
    doc.text(titleText, pageWidth / 2, 41, { align: "center" });

    // small helper: one bordered cell with (auto-shrinking) text
    const drawCell = (x, y, w, h, text, { bold = false, fill = false, align = "left", size = 8.5 } = {}) => {
      doc.setDrawColor(...border);
      doc.setLineWidth(0.2);
      if (fill) {
        doc.setFillColor(...grey);
        doc.rect(x, y, w, h, "FD");
      } else {
        doc.rect(x, y, w, h, "S");
      }
      const str = String(text ?? "-");
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setTextColor(...black);
      let fs = size;
      doc.setFontSize(fs);
      while (fs > 5.5 && doc.getTextWidth(str) > w - 4) {
        fs -= 0.5;
        doc.setFontSize(fs);
      }
      const tx = align === "center" ? x + w / 2 : x + 2;
      doc.text(str, tx, y + h / 2, { align, baseline: "middle" });
    };

    // ---- Student / term info table ----
    let y = 46;
    const rowH = 7.5;
    const labelW = 36;
    const valW = (cw - labelW * 2) / 2;
    drawCell(M, y, labelW, rowH, "Student Name", { bold: true, fill: true });
    drawCell(M + labelW, y, valW, rowH, resultRow.full_name);
    drawCell(M + labelW + valW, y, labelW, rowH, "Admission No.", { bold: true, fill: true });
    drawCell(M + labelW * 2 + valW, y, valW, rowH, resultRow.admission_no || "-");
    y += rowH;
    drawCell(M, y, labelW, rowH, "Term / Year", { bold: true, fill: true });
    drawCell(M + labelW, y, valW, rowH, termLabel);
    drawCell(M + labelW + valW, y, labelW, rowH, "Class / Form", { bold: true, fill: true });
    drawCell(
      M + labelW * 2 + valW, y, valW, rowH,
      `${classroom.grade_level_name} ${classroom.stream_name}`
    );
    y += rowH + 6;

    // ================================================================
    // PRE-CALCULATE the fixed-size sections so we know exactly how much
    // room is left for the subject table.
    // ================================================================
    const hasMarks = resultRow.has_marks && resultRow.average_marks != null;
    const mean = hasMarks ? resultRow.average_marks : null;
    const name = firstNameOf(resultRow.full_name);

    // -- Bottom block (signatures + stamp) and footer, pinned to the page bottom --
    const footerLineY = pageHeight - 14;          // thin line above the footer text
    const blockH = 26;                            // signatures + stamp row
    const blockTop = footerLineY - 4 - blockH;    // where the bottom block starts

    // -- Fee statement height --
    const balance = resultRow.fee_balance;
    const hasFeeRecords = balance !== null && balance !== undefined;
    const feeH = 8 + (hasFeeRecords && balance < 0 ? 4 : 0);

    // -- Remarks boxes (measure the wrapped text) --
    const measureRemark = (text) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      const lines = doc.splitTextToSize(text, cw - 8);
      return { lines, h: 10 + lines.length * 3.5 + 2.5 };
    };
    const ctRemark = measureRemark(classTeacherRemark(name, mean));
    const prRemark = measureRemark(principalRemark(name, mean));

    // -- Subject table sizing --
    const subjects = resultRow.subjects || [];
    const n = subjects.length;
    const fontSize = n <= 9 ? 8 : n <= 12 ? 7.5 : n <= 16 ? 7 : 6.5;
    const sumH = 7;
    const fixedBelow =
      6 + sumH * 2 + 5 +   // gap + summary (2 rows) + gap
      feeH + 5 +           // fee statement + gap
      ctRemark.h + 4 +     // class teacher remarks + gap
      prRemark.h + 4;      // principal remarks + gap
    const headH = 8;
    const availForRows = blockTop - 3 - y - fixedBelow - headH;
    const lineH = fontSize * 0.3528 * 1.15;
    const perRow = n > 0 ? availForRows / n : 6;
    const pad = Math.min(2.2, Math.max(0.35, (perRow - lineH) / 2));

    const body = subjects.map((s, i) => {
      const teacherNames = teacherMap?.[String(s.subject || "").trim().toLowerCase()];
      return [
        String(i + 1),
        s.subject,
        s.average != null ? String(s.average) : "-",
        s.grade || "-",
        subjectRemark(s.average),
        teacherNames && teacherNames.length ? teacherNames.join(" / ") : "-",
      ];
    });

    const colNo = 8, colSubject = 42, colMarks = 15, colGrade = 12, colTeacher = 34;
    const colRemarks = cw - colNo - colSubject - colMarks - colGrade - colTeacher;

    autoTable(doc, {
      startY: y,
      head: [["No", "Subject", "Marks\n/100", "Grade", "Teacher's Remarks", "Teacher"]],
      body,
      theme: "grid",
      margin: { left: M, right: M },
      styles: {
        font: "helvetica",
        fontSize,
        textColor: black,
        lineColor: [191, 191, 191],
        lineWidth: 0.2,
        cellPadding: { top: pad, bottom: pad, left: 1.6, right: 1.6 },
        valign: "middle",
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: navy,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 7.5,
        halign: "left",
        lineColor: navy,
        cellPadding: { top: 1, bottom: 1, left: 1.6, right: 1.6 },
      },
      alternateRowStyles: { fillColor: grey },
      columnStyles: {
        0: { cellWidth: colNo, halign: "center" },
        1: { cellWidth: colSubject },
        2: { cellWidth: colMarks, halign: "center" },
        3: { cellWidth: colGrade, halign: "center", fontStyle: "bold" },
        4: { cellWidth: colRemarks, fontSize: Math.max(5.8, fontSize - 1) },
        5: { cellWidth: colTeacher, fontSize: Math.max(5.8, fontSize - 0.5) },
      },
      didParseCell: (d) => {
        if (d.section === "head" && [0, 2, 3].includes(d.column.index)) d.cell.styles.halign = "center";
      },
    });

    y = doc.lastAutoTable.finalY + 6;

    // ---- Summary: Total Marks / Mean Score / Mean Grade / Position ----
    const w1 = 28, v1 = 66, w2 = 28, v2 = 22, w3 = 26;
    const v3 = cw - w1 - v1 - w2 - v2 - w3;
    let x = M;
    drawCell(x, y, w1, sumH, "Total Marks", { bold: true, fill: true }); x += w1;
    drawCell(x, y, v1, sumH, hasMarks ? resultRow.total_marks : "-", { align: "center" }); x += v1;
    drawCell(x, y, w2, sumH, "Mean Score", { bold: true, fill: true }); x += w2;
    drawCell(x, y, v2, sumH, hasMarks ? resultRow.average_marks : "-", { align: "center" }); x += v2;
    drawCell(x, y, w3, sumH, "Mean Grade", { bold: true, fill: true }); x += w3;
    drawCell(x, y, v3, sumH, resultRow.overall_grade || "-", { align: "center", bold: true });
    y += sumH;
    drawCell(M, y, w1, sumH, "Position", { bold: true, fill: true });
    drawCell(
      M + w1, y, v1, sumH,
      resultRow.class_position != null
        ? `${resultRow.class_position} out of ${resultRow.class_size ?? "-"}`
        : "-",
      { align: "center" }
    );
    y += sumH + 5;

    // ---- FEE STATEMENT (one compact strip) ----
    const feeLabelW = 30;
    if (hasFeeRecords) {
      const fw = (cw - feeLabelW) / 3;
      const balanceLabel =
        balance > 0 ? "Outstanding Balance" : balance < 0 ? "Credit (Prepaid)" : "Balance";
      const balanceValue = balance === 0 ? "Fully cleared" : KES(Math.abs(balance));
      let fx = M;
      drawCell(fx, y, feeLabelW, 8, "Fee Statement", { bold: true, fill: true }); fx += feeLabelW;
      drawCell(fx, y, fw, 8, `Total Billed: ${KES(resultRow.fee_total_charged)}`, { size: 8 }); fx += fw;
      drawCell(fx, y, fw, 8, `Total Paid: ${KES(resultRow.fee_total_paid)}`, { size: 8 }); fx += fw;
      drawCell(fx, y, fw, 8, `${balanceLabel}: ${balanceValue}`, { bold: true, size: 8 });
      if (balance < 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(5.8);
        doc.setTextColor(110, 110, 110);
        doc.text(
          "This credit carries forward to next term's invoice automatically.",
          M + feeLabelW + 2,
          y + 8 + 3
        );
      }
    } else {
      drawCell(M, y, feeLabelW, 8, "Fee Statement", { bold: true, fill: true });
      drawCell(M + feeLabelW, y, cw - feeLabelW, 8, "No invoices raised for this student yet.", { size: 8 });
    }
    y += feeH + 5;

    // ---- Remarks boxes ----
    const drawRemarkBox = (top, title, remark) => {
      doc.setDrawColor(...border);
      doc.setLineWidth(0.2);
      doc.rect(M, top, cw, remark.h);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...navy);
      doc.text(title, M + 4, top + 5.5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...black);
      doc.text(remark.lines, M + 4, top + 10);
      return top + remark.h;
    };

    y = drawRemarkBox(y, "Class Teacher's Remarks:", ctRemark) + 4;
    y = drawRemarkBox(y, "Principal's Remarks:", prRemark);

    // ================================================================
    // BOTTOM BLOCK (pinned to the bottom of the page):
    //   [Class Teacher signature]   [ Official Stamp ]   [Principal signature]
    // ================================================================
    const stampW = 46;
    const stampX = pageWidth / 2 - stampW / 2;
    const sigGap = 6;
    const leftEnd = stampX - sigGap;
    const rightStart = stampX + stampW + sigGap;

    // Official stamp box (centre)
    doc.setDrawColor(...black);
    doc.setLineWidth(0.25);
    doc.rect(stampX, blockTop, stampW, blockH);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...black);
    doc.text("Official School Stamp", pageWidth / 2, blockTop + 5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(120, 120, 120);
    doc.text("(Stamp here)", pageWidth / 2, blockTop + blockH / 2 + 3, { align: "center" });

    const drawSignature = (x1, x2, label, printedName) => {
      // printed name sits just above the signature line
      if (printedName) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(...black);
        let fs = 8;
        while (fs > 5.5 && doc.getTextWidth(printedName) > x2 - x1) {
          fs -= 0.5;
          doc.setFontSize(fs);
        }
        doc.text(printedName, x1, blockTop + 12);
      }
      doc.setDrawColor(...black);
      doc.setLineWidth(0.25);
      doc.line(x1, blockTop + 15, x2, blockTop + 15);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...black);
      doc.text(label, x1, blockTop + 19.5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.text("Date: ____________________", x1, blockTop + 25);
    };
    drawSignature(M, leftEnd, "Class Teacher's Signature", classroom.class_teacher_name || "");
    drawSignature(rightStart, pageWidth - M, "Principal's Signature");

    // ================================================================
    // FOOTER (very bottom of the page)
    // ================================================================
    doc.setDrawColor(...black);
    doc.setLineWidth(0.15);
    doc.line(M, footerLineY, pageWidth - M, footerLineY);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(...black);
    doc.text("© Junda High School. All rights reserved.", M, footerLineY + 4);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(5.5);
    doc.setTextColor(90, 90, 90);
    doc.text(
      " Powered by Masomo Portal (www.masomoportal.com).",
      pageWidth - M,
      footerLineY + 4,
      { align: "right" }
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.2);
    doc.text(
      "This document is the property of Junda High School. Parents/guardians should keep it safe. Duplication or unauthorized printing is prohibited.",
      M,
      footerLineY + 7.5
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

  // "Term 2, 2026" + "TERM 2, 2026 END OF TERM EXAMINATION REPORT" for the card header.
  const reportCardMeta = () => {
    const term = viewTerms.find((t) => String(t.id) === String(viewResults?.term_id));
    const year = viewClassroom?.academic_year_year;
    const termLabel = term ? `Term ${term.term_number}, ${year}` : String(viewResults?.term || "");
    const exam = viewSelectedExam
      ? viewExams.find((e) => String(e.id) === String(viewSelectedExam))
      : null;
    const examWording = exam ? String(exam.name).toUpperCase() : "END OF TERM";
    return {
      termLabel,
      titleText: `${termLabel.toUpperCase()} ${examWording} EXAMINATION REPORT`,
    };
  };

  // Subject -> teacher name(s) for this classroom, from teacher allocations.
  // Reads EVERY page of results (the endpoint ignores page_size), so no
  // subject is left without its teacher. If the account can't read
  // allocations (or the fields differ), the Teacher column simply shows
  // "-" and the report card still prints.
  const loadSubjectTeachers = async (classroom) => {
    try {
      let list = [];
      let page = 1;
      // safety cap of 50 pages
      while (page <= 50) {
        const { data } = await teacherApi.allAllocations({ classroom: classroom.id, page });
        if (Array.isArray(data)) {
          list = data;
          break;
        }
        list = list.concat(data.results ?? []);
        if (!data.next) break;
        page += 1;
      }

      const map = {};
      list.forEach((a) => {
        const subject = String(a.subject_name || a.subject?.name || "").trim().toLowerCase();
        const teacher = String(
          a.teacher_name ||
            a.teacher_full_name ||
            (a.teacher?.first_name ? `${a.teacher.first_name} ${a.teacher.last_name || ""}` : "")
        ).trim();
        if (!subject || !teacher) return;
        map[subject] = map[subject] || [];
        if (!map[subject].includes(teacher)) map[subject].push(teacher);
      });
      return map;
    } catch (err) {
      console.error("Could not load subject teachers for the report card:", err);
      return {};
    }
  };

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
      const [logoBase64, qrCodeBase64, teacherMap] = await Promise.all([
        getImageBase64(logoImage),
        fetchReportCardQr(resultRow.verification_token),
        loadSubjectTeachers(viewClassroom),
      ]);
      const { termLabel, titleText } = reportCardMeta();

      drawReportCardPage(doc, {
        classroom: viewClassroom,
        termLabel,
        titleText,
        resultRow: { ...resultRow, class_size: currentClassSize() },
        logoBase64,
        qrCodeBase64,
        teacherMap,
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
      const classSize = currentClassSize();
      const { termLabel, titleText } = reportCardMeta();

      // Fetch the logo, the subject teachers and every student's verification
      // QR up front, in parallel, so the page-drawing loop below doesn't
      // block on network per student.
      const qrByEnrollment = {};
      const [logoBase64, teacherMap] = await Promise.all([
        getImageBase64(logoImage),
        loadSubjectTeachers(viewClassroom),
        Promise.all(
          viewResults.results.map(async (row) => {
            qrByEnrollment[row.enrollment_id] = await fetchReportCardQr(row.verification_token);
          })
        ),
      ]);

      viewResults.results.forEach((row, idx) => {
        drawReportCardPage(doc, {
          classroom: viewClassroom,
          termLabel,
          titleText,
          resultRow: { ...row, class_size: classSize },
          logoBase64,
          qrCodeBase64: qrByEnrollment[row.enrollment_id] || null,
          teacherMap,
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
      <Modal
        show={showViewModal}
        onClose={closeViewModal}
        title="Classroom Details"
        size={modalFullscreen ? "fullscreen" : "lg"}
      >
        {viewClassroom && (
          <div>
            {/* Modal header strip with logo + class name + fullscreen toggle */}
            <div
              className="d-flex align-items-center justify-content-between gap-3 mb-3 pb-3"
              style={{ borderBottom: "1px solid var(--border-color)" }}
            >
              <div className="d-flex align-items-center gap-3">
                <img
                  src={logoImage}
                  alt="Junda High School Shanzu"
                  style={{ width: 76, height: 52, objectFit: "contain", flexShrink: 0 }}
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
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary btn-icon"
                title={modalFullscreen ? "Exit fullscreen" : "Expand to fullscreen"}
                onClick={() => setModalFullscreen((prev) => !prev)}
                style={{ flexShrink: 0 }}
              >
                <i className={`bi ${modalFullscreen ? "bi-fullscreen-exit" : "bi-arrows-fullscreen"}`}></i>
              </button>
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