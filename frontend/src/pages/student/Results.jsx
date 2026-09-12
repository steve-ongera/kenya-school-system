import { useEffect, useMemo, useState } from "react";
import { studentsApi, examsApi, calendarApi, academicsApi, profileApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoImage from "../../assets/masomo_logo.png";

// ---------------------------------------------------------------------------
// Fallback grading bands, used ONLY when /grading-scales/ isn't reachable or
// doesn't have a row that covers a given percentage.
// ---------------------------------------------------------------------------
const FALLBACK_844 = [
  { min: 80, max: 100, letter: "A", points: 12 },
  { min: 75, max: 79.99, letter: "A-", points: 11 },
  { min: 70, max: 74.99, letter: "B+", points: 10 },
  { min: 65, max: 69.99, letter: "B", points: 9 },
  { min: 60, max: 64.99, letter: "B-", points: 8 },
  { min: 55, max: 59.99, letter: "C+", points: 7 },
  { min: 50, max: 54.99, letter: "C", points: 6 },
  { min: 45, max: 49.99, letter: "C-", points: 5 },
  { min: 40, max: 44.99, letter: "D+", points: 4 },
  { min: 35, max: 39.99, letter: "D", points: 3 },
  { min: 30, max: 34.99, letter: "D-", points: 2 },
  { min: 0, max: 29.99, letter: "E", points: 1 },
];

const FALLBACK_CBC = [
  { min: 75, max: 100, letter: "EE", points: null, remark: "Exceeding Expectation" },
  { min: 50, max: 74.99, letter: "ME", points: null, remark: "Meeting Expectation" },
  { min: 30, max: 49.99, letter: "AE", points: null, remark: "Approaching Expectation" },
  { min: 0, max: 29.99, letter: "BE", points: null, remark: "Below Expectation" },
];

function fallbackGrade(curriculumType, percentage) {
  const table = curriculumType === "CBC" ? FALLBACK_CBC : FALLBACK_844;
  return table.find((b) => percentage >= b.min && percentage <= b.max) || null;
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

export default function StudentResults() {
  // ---- identity / curriculum ----
  const [profile, setProfile] = useState(null);

  // ---- full academic history ----
  const [enrollmentHistory, setEnrollmentHistory] = useState([]);
  const [classroomsById, setClassroomsById] = useState({});
  const [academicYears, setAcademicYears] = useState([]);
  const [gradingScales, setGradingScales] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // ---- drilldown selection: year -> term -> exam ----
  const [selectedYear, setSelectedYear] = useState("");
  const [terms, setTerms] = useState([]);
  const [termsLoading, setTermsLoading] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState("");
  const [exams, setExams] = useState([]);
  const [examsLoading, setExamsLoading] = useState(false);
  const [selectedExam, setSelectedExam] = useState("");

  // ---- results for the chosen exam ----
  const [results, setResults] = useState([]);
  const [resultsLoading, setResultsLoading] = useState(false);

  // ---- ranking ----
  const [ranking, setRanking] = useState(null);
  const [rankingCheckpoint, setRankingCheckpoint] = useState(null);
  const [rankingLoading, setRankingLoading] = useState(false);

  // ---- PDF download state ----
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // ---------------------------------------------------------------------
  // Initial load
  // ---------------------------------------------------------------------
  useEffect(() => {
    (async () => {
      setHistoryLoading(true);
      try {
        const [profileRes, enrollRes, classroomsRes, yearsRes] = await Promise.all([
          profileApi.me(),
          studentsApi.enrollments({ page_size: 200 }),
          academicsApi.classrooms({ page_size: 500 }),
          calendarApi.academicYears(),
        ]);

        setProfile(profileRes.data);

        const history = (enrollRes.data.results ?? enrollRes.data)
          .slice()
          .sort((a, b) => a.academic_year - b.academic_year);
        setEnrollmentHistory(history);

        const cMap = {};
        (classroomsRes.data.results ?? classroomsRes.data).forEach((c) => { cMap[c.id] = c; });
        setClassroomsById(cMap);

        const yearsList = yearsRes.data.results ?? yearsRes.data;
        setAcademicYears(yearsList);

        try {
          if (academicsApi.gradingScales) {
            const { data } = await academicsApi.gradingScales();
            setGradingScales(data.results ?? data);
          }
        } catch {
          setGradingScales([]);
        }

        if (history.length > 0) {
          const currentYearObj = yearsList.find((y) => y.is_current);
          const hasCurrent = currentYearObj && history.some((e) => e.academic_year === currentYearObj.id);
          const defaultYear = hasCurrent
            ? currentYearObj.id
            : history[history.length - 1].academic_year;
          setSelectedYear(defaultYear);
        }
      } catch (error) {
        console.error("Failed to load student history:", error);
      } finally {
        setHistoryLoading(false);
      }
    })();
  }, []);

  const yearLabel = (yearId) => academicYears.find((y) => y.id === yearId)?.year ?? yearId;

  const currentEnrollment = useMemo(
    () => enrollmentHistory.find((e) => String(e.academic_year) === String(selectedYear)),
    [enrollmentHistory, selectedYear]
  );
  const currentClassroom = currentEnrollment ? classroomsById[currentEnrollment.classroom] : null;

  // ---------------------------------------------------------------------
  // Terms
  // ---------------------------------------------------------------------
  useEffect(() => {
    setSelectedTerm("");
    setTerms([]);
    if (!selectedYear) return;
    setTermsLoading(true);
    calendarApi.terms({ academic_year: selectedYear })
      .then(({ data }) => {
        const list = (data.results ?? data).slice().sort((a, b) => a.term_number - b.term_number);
        setTerms(list);
        const current = list.find((t) => t.is_current);
        setSelectedTerm(current ? current.id : (list[list.length - 1]?.id ?? ""));
      })
      .catch((err) => { console.error("Failed to load terms:", err); setTerms([]); })
      .finally(() => setTermsLoading(false));
  }, [selectedYear]);

  // ---------------------------------------------------------------------
  // Exams
  // ---------------------------------------------------------------------
  useEffect(() => {
    setSelectedExam("");
    setExams([]);
    if (!selectedTerm || !currentClassroom) return;
    setExamsLoading(true);
    examsApi.exams({ term: selectedTerm, grade_level: currentClassroom.grade_level })
      .then(({ data }) => {
        const list = (data.results ?? data)
          .filter((ex) => ex.is_published)
          .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
        setExams(list);
        setSelectedExam(list.length ? list[list.length - 1].id : "");
      })
      .catch((err) => { console.error("Failed to load exams:", err); setExams([]); })
      .finally(() => setExamsLoading(false));
  }, [selectedTerm, currentClassroom]);

  // ---------------------------------------------------------------------
  // Results
  // ---------------------------------------------------------------------
  useEffect(() => {
    setResults([]);
    if (!currentEnrollment || !selectedExam) return;
    setResultsLoading(true);
    examsApi.results({ enrollment: currentEnrollment.id, exam: selectedExam, page_size: 500 })
      .then(({ data }) => setResults(data.results ?? data))
      .catch((err) => console.error("Failed to load results:", err))
      .finally(() => setResultsLoading(false));
  }, [currentEnrollment, selectedExam]);

  // ---------------------------------------------------------------------
  // Ranking
  // ---------------------------------------------------------------------
  useEffect(() => {
    setRanking(null);
    setRankingCheckpoint(null);
    if (!currentEnrollment || !selectedTerm) return;

    let cancelled = false;
    const fetchCheckpoint = (checkpoint) =>
      examsApi
        .rankings({ enrollment: currentEnrollment.id, term: selectedTerm, checkpoint })
        .then(({ data }) => (data.results ?? data)[0] || null);

    setRankingLoading(true);
    fetchCheckpoint("ENDTERM")
      .then((endterm) => {
        if (cancelled) return;
        if (endterm) {
          setRanking(endterm);
          setRankingCheckpoint("ENDTERM");
          return;
        }
        return fetchCheckpoint("MIDTERM").then((midterm) => {
          if (cancelled) return;
          if (midterm) {
            setRanking(midterm);
            setRankingCheckpoint("MIDTERM");
          }
        });
      })
      .catch((err) => console.error("Failed to load ranking:", err))
      .finally(() => { if (!cancelled) setRankingLoading(false); });

    return () => { cancelled = true; };
  }, [currentEnrollment, selectedTerm]);

  // ---------------------------------------------------------------------
  // Group papers into one row per subject + attach grade
  // ---------------------------------------------------------------------
  const curriculumType = profile?.student_profile?.curriculum_type;

  const gradeFor = (subjectId, percentage) => {
    if (percentage === null || percentage === undefined) return null;
    const scaleRows = gradingScales.filter(
      (s) => s.curriculum_type === curriculumType && percentage >= Number(s.min_percentage) && percentage <= Number(s.max_percentage)
    );
    const specific = scaleRows.find((s) => s.subject === subjectId);
    const generic = scaleRows.find((s) => s.subject === null);
    const match = specific || generic;
    if (match) {
      return { letter: match.grade_letter, points: match.points !== undefined ? Number(match.points) : null, remark: match.remark };
    }
    return fallbackGrade(curriculumType, percentage);
  };

  const subjectRows = useMemo(() => {
    const map = {};
    results.forEach((r) => {
      const key = r.subject;
      if (!map[key]) {
        map[key] = { subject_id: r.subject, subject_name: r.subject_name, papers: [], marksTotal: 0, maxTotal: 0, hasMarks: false, anyAbsent: false };
      }
      map[key].papers.push(r);
      if (r.is_absent) {
        map[key].anyAbsent = true;
      } else if (r.marks_obtained !== null && r.marks_obtained !== undefined) {
        map[key].marksTotal += Number(r.marks_obtained);
        map[key].maxTotal += Number(r.max_marks);
        map[key].hasMarks = true;
      }
    });
    return Object.values(map).map((row) => {
      const percentage = row.hasMarks && row.maxTotal > 0 ? (row.marksTotal / row.maxTotal) * 100 : null;
      const grade = percentage !== null ? gradeFor(row.subject_id, percentage) : null;
      return { ...row, percentage, grade };
    });
  }, [results, gradingScales, curriculumType]);

  // ---------------------------------------------------------------------
  // Overall stats
  // ---------------------------------------------------------------------
  const stats = useMemo(() => {
    const scored = subjectRows.filter((r) => r.percentage !== null);
    if (scored.length === 0) return null;
    const totalMarks = scored.reduce((s, r) => s + r.marksTotal, 0);
    const totalMax = scored.reduce((s, r) => s + r.maxTotal, 0);
    const average = totalMax > 0 ? (totalMarks / totalMax) * 100 : 0;
    const allHavePoints = scored.every((r) => r.grade && r.grade.points !== null && r.grade.points !== undefined);
    const totalPoints = allHavePoints ? scored.reduce((s, r) => s + r.grade.points, 0) : null;
    return { subjectCount: scored.length, totalMarks, totalMax, average, totalPoints };
  }, [subjectRows]);

  const perfBadgeClass = (percentage) => {
    if (percentage === null || percentage === undefined) return "badge-neutral";
    if (percentage >= 80) return "badge-success";
    if (percentage >= 60) return "badge-gold";
    if (percentage >= 40) return "badge-blue";
    return "badge-danger";
  };

  const selectedExamObj = exams.find((e) => String(e.id) === String(selectedExam));
  const selectedTermObj = terms.find((t) => String(t.id) === String(selectedTerm));

  // ---------------------------------------------------------------------
  // Download report card PDF — only Percentage, Grade, Points/Remark
  // ---------------------------------------------------------------------
  const handleDownloadReportPdf = async () => {
    if (!subjectRows.length) return;
    try {
      setDownloadingPdf(true);

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      const base64Logo = await getImageBase64(logoImage);

      const generatedOn = new Date().toLocaleDateString("en-KE", {
        year: "numeric", month: "long", day: "numeric",
      });

      // --- Header ---
      if (base64Logo) {
        doc.addImage(base64Logo, "PNG", 12, 10, 14, 14);
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.setTextColor(15, 23, 42);
      doc.text("Masomo School", base64Logo ? 30 : 12, 17);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(71, 85, 105);
      doc.text("Student Report Card", base64Logo ? 30 : 12, 23);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`Generated ${generatedOn}`, pageWidth - 12, 16, { align: "right" });

      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.line(12, 28, pageWidth - 12, 28);

      // --- Student meta block ---
      const studentName = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || "-";
      const admissionNo = profile?.student_profile?.admission_no || "-";
      const className = currentClassroom
        ? `${currentClassroom.grade_level_name} ${currentClassroom.stream_name || ""}`.trim()
        : "-";
      const termName = selectedTermObj ? `Term ${selectedTermObj.term_number}` : "-";
      const yearName = yearLabel(selectedYear);

      autoTable(doc, {
        startY: 32,
        theme: "grid",
        body: [
          ["Student", studentName, "Admission No", admissionNo],
          ["Class", className, "Curriculum", curriculumType === "CBC" ? "CBC" : "8-4-4"],
          ["Academic Year", String(yearName), "Term", termName],
          ["Exam", selectedExamObj?.name || "-", "Exam Type", selectedExamObj?.exam_type_name || "-"],
        ],
        styles: {
          fontSize: 9,
          cellPadding: 2.5,
          lineColor: [226, 232, 240],
          lineWidth: 0.1,
          textColor: [51, 65, 85],
        },
        columnStyles: {
          0: { cellWidth: 32, fontStyle: "bold", fillColor: [241, 245, 249], textColor: [71, 85, 105] },
          1: { cellWidth: 58 },
          2: { cellWidth: 32, fontStyle: "bold", fillColor: [241, 245, 249], textColor: [71, 85, 105] },
          3: { cellWidth: "auto" },
        },
        margin: { left: 12, right: 12 },
      });

      let cursorY = doc.lastAutoTable.finalY + 6;

      // --- Summary strip ---
      const summaryLeft = ranking
        ? [
            `Class Position: #${ranking.class_position}${ranking.grade_position ? ` (Grade-wide #${ranking.grade_position})` : ""}`,
            `Term Average (${rankingCheckpoint === "MIDTERM" ? "Midterm" : "End of Term"}): ${ranking.average_marks}%`,
          ]
        : [`Exam Average: ${stats ? stats.average.toFixed(1) : "0.0"}%`];

      if (stats && ranking) {
        summaryLeft.push(`This Exam Average: ${stats.average.toFixed(1)}%`);
      }

      autoTable(doc, {
        startY: cursorY,
        theme: "plain",
        body: summaryLeft.map((line) => [line]),
        styles: {
          fontSize: 9,
          cellPadding: 1.8,
          textColor: [15, 23, 42],
        },
        margin: { left: 12, right: 12 },
      });

      cursorY = doc.lastAutoTable.finalY + 6;

      // --- Subjects table ---
      const tableColumn =
        curriculumType === "CBC"
          ? ["Subject", "Percentage", "Grade", "Remark"]
          : ["Subject", "Percentage", "Grade", "Points"];

      const tableRows = subjectRows.map((row) => {
        const pct = row.percentage !== null ? `${row.percentage.toFixed(1)}%` : "-";
        const grade = row.grade?.letter || "-";
        if (curriculumType === "CBC") {
          const remark = row.grade?.remark || "-";
          return [row.subject_name, pct, grade, remark];
        }
        const pts = row.grade?.points !== null && row.grade?.points !== undefined ? String(row.grade.points) : "-";
        return [row.subject_name, pct, grade, pts];
      });

      autoTable(doc, {
        startY: cursorY,
        head: [tableColumn],
        body: tableRows,
        theme: "grid",
        styles: {
          fontSize: 9,
          cellPadding: 2.5,
          lineColor: [226, 232, 240],
          lineWidth: 0.1,
          textColor: [51, 65, 85],
          overflow: "ellipsize",
        },
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 9,
          cellPadding: 2.5,
          halign: "left",
        },
        bodyStyles: {
          fontSize: 9,
          textColor: [51, 65, 85],
          cellPadding: 2.5,
          valign: "middle",
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles:
          curriculumType === "CBC"
            ? {
                0: { cellWidth: "auto", halign: "left" },
                1: { cellWidth: 32, halign: "right" },
                2: { cellWidth: 24, halign: "center" },
                3: { cellWidth: 60, halign: "left" },
              }
            : {
                0: { cellWidth: "auto", halign: "left" },
                1: { cellWidth: 36, halign: "right" },
                2: { cellWidth: 28, halign: "center" },
                3: { cellWidth: 28, halign: "center" },
              },
        margin: { left: 12, right: 12 },
        didParseCell: (data) => {
          if (data.section === "body") {
            const row = subjectRows[data.row.index];
            if (!row) return;
            const pct = row.percentage;
            if (pct === null || pct === undefined) return;
            const gradeCol = 2;
            const pctCol = 1;
            if (data.column.index === gradeCol) {
              if (pct >= 80) data.cell.styles.textColor = [22, 163, 74];
              else if (pct >= 60) data.cell.styles.textColor = [217, 140, 31];
              else if (pct >= 40) data.cell.styles.textColor = [37, 99, 201];
              else data.cell.styles.textColor = [220, 38, 38];
              data.cell.styles.fontStyle = "bold";
            }
            if (data.column.index === pctCol) {
              data.cell.styles.fontStyle = "bold";
              data.cell.styles.textColor = [15, 23, 42];
            }
          }
        },
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

      // --- Signature blocks: Class Teacher + Principal ---
      let finalY = doc.lastAutoTable.finalY + 16;
      if (finalY > pageHeight - 30) {
        doc.addPage();
        finalY = 24;
      }

      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.2);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text("Class Teacher's Signature:", 12, finalY);
      doc.line(12, finalY + 10, 90, finalY + 10);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text("Sign & Official Stamp", 12, finalY + 14);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text("Principal's Signature:", pageWidth - 90, finalY);
      doc.line(pageWidth - 90, finalY + 10, pageWidth - 12, finalY + 10);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text("Sign & Official Stamp", pageWidth - 90, finalY + 14);

      const safeName = (studentName || "student").replace(/\s+/g, "_");
      const safeExam = (selectedExamObj?.name || "exam").replace(/\s+/g, "_");
      doc.save(`Report_Card_${safeName}_${safeExam}.pdf`);
    } catch (err) {
      console.error("Failed to generate report card PDF:", err);
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable-report, #printable-report * { visibility: visible; }
          #printable-report { position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="no-print">
        <Breadcrumb items={[
          { label: "Dashboard", href: "/student" },
          { label: "Results", href: "/student/results" },
          { label: "My Results", href: "#" },
        ]} />

        <div className="page-header">
          <div>
            <h1 className="page-title">My Results</h1>
            <p className="page-subtitle">
              Browse your results by academic year, term and exam - or print a report card.
            </p>
          </div>
          <div className="d-flex gap-2 align-items-center flex-wrap">
            {curriculumType && (
              <span className="badge badge-blue" style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem" }}>
                <i className="bi bi-mortarboard me-1"></i>
                {curriculumType === "CBC" ? "CBC" : "8-4-4"}
              </span>
            )}
            {currentClassroom && (
              <span className="badge badge-neutral" style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem" }}>
                <i className="bi bi-door-open me-1"></i>
                {currentClassroom.grade_level_name} {currentClassroom.stream_name}
              </span>
            )}
          </div>
        </div>

        {/* ---- Academic history timeline ---- */}
        {!historyLoading && enrollmentHistory.length > 0 && (
          <div className="card p-3 mb-4">
            <h6 className="mb-3" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
              <i className="bi bi-clock-history me-2" style={{ color: "var(--blue-700)" }}></i>
              Academic History
            </h6>
            <div className="d-flex flex-wrap gap-2">
              {enrollmentHistory.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className={`btn btn-sm ${String(e.academic_year) === String(selectedYear) ? "btn-primary" : "btn-outline-secondary"}`}
                  onClick={() => setSelectedYear(e.academic_year)}
                  title={e.classroom_label}
                >
                  {yearLabel(e.academic_year)} — {e.classroom_label}
                  {e.status !== "ACTIVE" && (
                    <span className="ms-1" style={{ fontSize: "0.7rem", opacity: 0.8 }}>({e.status})</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {historyLoading && <TableSkeleton rows={2} columns={4} />}

        {!historyLoading && enrollmentHistory.length === 0 && (
          <div className="table-wrap">
            <div className="empty-state">
              <i className="bi bi-journal-x"></i>
              <h6>No Enrollment Records</h6>
              <p className="text-muted-soft">We couldn't find any enrollment history for your account.</p>
            </div>
          </div>
        )}

        {/* ---- Year / Term / Exam selectors ---- */}
        {enrollmentHistory.length > 0 && (
          <div className="card p-4 mb-4">
            <h6 className="mb-3" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
              <i className="bi bi-funnel me-2" style={{ color: "var(--blue-700)" }}></i>
              Choose Year, Term & Exam
            </h6>
            <div className="row g-3">
              <div className="col-md-4">
                <label className="form-label">Academic Year</label>
                <select className="form-select" value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)}>
                  {enrollmentHistory
                    .slice()
                    .sort((a, b) => b.academic_year - a.academic_year)
                    .map((e) => (
                      <option key={e.academic_year} value={e.academic_year}>
                        {yearLabel(e.academic_year)} ({e.classroom_label})
                      </option>
                    ))}
                </select>
              </div>
              <div className="col-md-4">
                <label className="form-label">Term</label>
                <select
                  className="form-select"
                  value={selectedTerm}
                  onChange={(e) => setSelectedTerm(e.target.value)}
                  disabled={termsLoading || terms.length === 0}
                >
                  {terms.length === 0 && <option value="">{termsLoading ? "Loading..." : "No terms"}</option>}
                  {terms.map((t) => (
                    <option key={t.id} value={t.id}>Term {t.term_number}</option>
                  ))}
                </select>
              </div>
              <div className="col-md-4">
                <label className="form-label">Exam</label>
                <select
                  className="form-select"
                  value={selectedExam}
                  onChange={(e) => setSelectedExam(e.target.value)}
                  disabled={examsLoading || exams.length === 0}
                >
                  {exams.length === 0 && (
                    <option value="">{examsLoading ? "Loading..." : "No published exams"}</option>
                  )}
                  {exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>{ex.name} ({ex.exam_type_name})</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ================= PRINTABLE REPORT AREA ================= */}
      {selectedExam && (
        <div id="printable-report">
          {/* print-only header */}
          <div className="d-none d-print-block mb-3">
            <h4 className="mb-0">Report Card</h4>
            <div style={{ fontSize: "0.9rem" }}>
              {profile?.first_name} {profile?.last_name} ({profile?.student_profile?.admission_no}) —{" "}
              {currentClassroom ? `${currentClassroom.grade_level_name} ${currentClassroom.stream_name}` : ""} —{" "}
              {selectedTermObj ? `Term ${selectedTermObj.term_number}, ${yearLabel(selectedYear)}` : ""} —{" "}
              {selectedExamObj?.name}
            </div>
            <hr />
          </div>

          {/* ---- Ranking summary ---- */}
          {rankingLoading && (
            <div className="alert alert-light no-print" style={{ padding: "0.75rem 1.25rem" }}>
              <span className="text-muted-soft">
                <i className="bi bi-hourglass-split me-2"></i>
                Loading class position...
              </span>
            </div>
          )}

          {!rankingLoading && ranking && (
            <div className="alert alert-success" style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexWrap: "wrap", gap: "0.5rem", padding: "1rem 1.25rem",
            }}>
              <div>
                <i className="bi bi-trophy me-2" style={{ color: "var(--gold-500)" }}></i>
                <strong>Class Position:</strong>
                <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--ink-900)", marginLeft: "0.5rem" }}>
                  #{ranking.class_position}
                </span>
                {ranking.grade_position && (
                  <span style={{ color: "var(--ink-600)", marginLeft: "0.5rem" }}>
                    (Grade-wide #{ranking.grade_position})
                  </span>
                )}
              </div>
              <div>
                <strong>Term Average ({rankingCheckpoint === "MIDTERM" ? "Midterm" : "End of Term"}):</strong>
                <span style={{
                  fontSize: "1.1rem", fontWeight: 700,
                  color: Number(ranking.average_marks) >= 60 ? "var(--success-600)" : "var(--danger-600)",
                  marginLeft: "0.5rem",
                }}>
                  {ranking.average_marks}%
                </span>
              </div>
            </div>
          )}

          {/* ---- Stats ---- */}
          {stats && !resultsLoading && (
            <div className="row g-3 mb-3">
              <div className="col-6 col-md-3">
                <div className="stat-card" style={{ padding: "0.75rem 1rem" }}>
                  <div>
                    <div className="stat-card__value" style={{ fontSize: "1.2rem" }}>{stats.subjectCount}</div>
                    <div className="stat-card__label">Subjects</div>
                  </div>
                </div>
              </div>
              <div className="col-6 col-md-3">
                <div className="stat-card stat-card--success" style={{ padding: "0.75rem 1rem" }}>
                  <div>
                    <div className="stat-card__value" style={{ fontSize: "1.2rem" }}>
                      {stats.totalMarks} / {stats.totalMax}
                    </div>
                    <div className="stat-card__label">Total Marks (this exam)</div>
                  </div>
                </div>
              </div>
              <div className="col-6 col-md-3">
                <div className="stat-card stat-card--gold" style={{ padding: "0.75rem 1rem" }}>
                  <div>
                    <div className="stat-card__value" style={{ fontSize: "1.2rem" }}>{stats.average.toFixed(1)}%</div>
                    <div className="stat-card__label">Exam Average</div>
                  </div>
                </div>
              </div>
              <div className="col-6 col-md-3">
                <div className="stat-card stat-card--blue" style={{ padding: "0.75rem 1rem" }}>
                  <div>
                    <div className="stat-card__value" style={{ fontSize: "1.2rem" }}>
                      {curriculumType === "CBC"
                        ? (fallbackGrade("CBC", stats.average)?.remark || "-")
                        : (stats.totalPoints !== null ? stats.totalPoints : "-")}
                    </div>
                    <div className="stat-card__label">
                      {curriculumType === "CBC" ? "Overall Level" : "Total Points"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ---- Per-subject table (clean: no Marks / Out of) ---- */}
          {resultsLoading ? (
            <TableSkeleton rows={5} columns={4} />
          ) : subjectRows.length === 0 ? (
            <div className="table-wrap">
              <div className="empty-state">
                <i className="bi bi-journal-text"></i>
                <h6>No Results Found</h6>
                <p className="text-muted-soft">
                  No marks have been entered for this exam yet, or it hasn't been published.
                </p>
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <div className="table-wrap__header">
                <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                  <i className="bi bi-journal-text me-2"></i>
                  {selectedExamObj?.name}
                  <span className="badge badge-neutral ms-2">{subjectRows.length}</span>
                </span>
                <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
                  <i className="bi bi-calendar3 me-1"></i>
                  Term {selectedTermObj?.term_number}, {yearLabel(selectedYear)}
                </span>
              </div>
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th style={{ width: "120px" }} className="text-end">Percentage</th>
                      <th style={{ width: "100px" }} className="text-center">Grade</th>
                      {curriculumType === "CBC" ? (
                        <th style={{ width: "200px" }}>Remark</th>
                      ) : (
                        <th style={{ width: "100px" }} className="text-center">Points</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {subjectRows.map((row) => (
                      <tr key={row.subject_id}>
                        <td>
                          <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>{row.subject_name}</span>
                        </td>
                        <td className="text-end">
                          {row.percentage !== null ? (
                            <span className={`badge ${perfBadgeClass(row.percentage)}`}>
                              {row.percentage.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-muted-soft">-</span>
                          )}
                        </td>
                        <td className="text-center">
                          {row.grade ? (
                            <span className={`badge ${perfBadgeClass(row.percentage)}`} style={{ fontWeight: 700 }}>
                              {row.grade.letter}
                            </span>
                          ) : (
                            <span className="text-muted-soft">-</span>
                          )}
                        </td>
                        {curriculumType === "CBC" ? (
                          <td style={{ color: "var(--ink-600)" }}>
                            {row.grade?.remark || <span className="text-muted-soft">-</span>}
                          </td>
                        ) : (
                          <td className="text-center" style={{ color: "var(--ink-600)" }}>
                            {row.grade?.points !== null && row.grade?.points !== undefined
                              ? row.grade.points
                              : <span className="text-muted-soft">-</span>}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-wrap__footer no-print">
                <span className="table-wrap__footer-info">
                  Showing <strong>{subjectRows.length}</strong> subject{subjectRows.length !== 1 ? "s" : ""}
                </span>
                <div className="d-flex gap-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    onClick={handleDownloadReportPdf}
                    disabled={downloadingPdf || subjectRows.length === 0}
                  >
                    {downloadingPdf ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                        Preparing...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-file-earmark-pdf me-1"></i>
                        Download Report Card (PDF)
                      </>
                    )}
                  </button>
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => window.print()}>
                    <i className="bi bi-printer me-1"></i>
                    Print Report Card
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}