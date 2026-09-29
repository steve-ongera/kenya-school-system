import { useEffect, useState } from "react";
import { academicsApi, calendarApi, examsApi } from "../../services/api";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoImage from "../../assets/junda_high_logo.png";

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

// ---------------------------------------------------------------------------
// Compact subject abbreviations for PDF headers.
// Falls back to the first 3 letters (uppercased) for anything not listed.
// ---------------------------------------------------------------------------
const SUBJECT_ABBREVIATIONS = {
  "english": "Eng",
  "kiswahili": "Kis",
  "mathematics": "Maths",
  "maths": "Maths",
  "math": "Maths",
  "biology": "Bio",
  "chemistry": "Chem",
  "physics": "Phy",
  "geography": "Geo",
  "history": "Hist",
  "history and government": "Hist",
  "history & government": "Hist",
  "cre": "CRE",
  "christian religious education": "CRE",
  "ire": "IRE",
  "islamic religious education": "IRE",
  "hre": "HRE",
  "hindu religious education": "HRE",
  "business studies": "Bus",
  "business": "Bus",
  "agriculture": "Agri",
  "computer studies": "Comp",
  "computer science": "Comp",
  "home science": "Home",
  "social studies": "S.St",
  "science": "Sci",
  "science and technology": "Sci",
  "physical education": "PE",
  "music": "Mus",
  "art": "Art",
  "art and design": "Art",
  "design and technology": "D&T",
  "integrated science": "Int.Sci",
  "pre-technical studies": "PTS",
  "pre technical studies": "PTS",
  "agriculture and nutrition": "Agri",
  "religious education": "RE",
};

// ---- PDF theme (same as the finance report / payment receipt) ----
const SCHOOL_NAME = "JUNDA HIGH SCHOOL SHANZU";
const ADDRESS_LINE_1 = "P.O BOX 87073-80100, MOMBASA";
const ADDRESS_LINE_2 = "Email: jundahighschool83@gmail.com";
const MOTTO = "STRIVE TO EXCELL";
const NAVY = [31, 56, 100];
const GREY = [242, 242, 242];
const BORDER = [166, 166, 166];
const BLACK = [0, 0, 0];

// Receipt-style letterhead, drawn on every page.
const drawLetterhead = (doc, base64Logo, title, filterLine) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 10;

  if (base64Logo) {
    const props = doc.getImageProperties(base64Logo);
    const ratio = props.width / props.height || 1;
    const maxH = 16;
    const maxW = 30;
    let drawW = maxH * ratio;
    let drawH = maxH;
    if (drawW > maxW) {
      drawW = maxW;
      drawH = drawW / ratio;
    }
    doc.addImage(base64Logo, "PNG", marginX, 6 + (maxH - drawH) / 2, drawW, drawH);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...NAVY);
  doc.text(SCHOOL_NAME, pageWidth / 2, 12, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...BLACK);
  doc.text(ADDRESS_LINE_1, pageWidth / 2, 17, { align: "center" });
  doc.text(ADDRESS_LINE_2, pageWidth / 2, 20.5, { align: "center" });

  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor(110, 110, 110);
  doc.text(MOTTO, pageWidth / 2, 24, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.text(
    `Generated ${new Date().toLocaleDateString("en-KE", { year: "numeric", month: "long", day: "numeric" })}`,
    pageWidth - marginX,
    8.5,
    { align: "right" }
  );

  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.6);
  doc.line(marginX, 27, pageWidth - marginX, 27);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...NAVY);
  doc.text(title, pageWidth / 2, 33, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...BLACK);
  doc.text(filterLine, pageWidth / 2, 38, { align: "center", maxWidth: pageWidth - marginX * 2 });
};

// Footer with copyright + Masomo Portal credit + page numbers, on every page.
const drawFooters = (doc) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 10;
  const year = new Date().getFullYear();
  const total = doc.internal.getNumberOfPages();
  const lineY = pageHeight - 14;

  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BLACK);
    doc.setLineWidth(0.15);
    doc.line(marginX, lineY, pageWidth - marginX, lineY);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...BLACK);
    doc.text(`© ${year} Junda High School Shanzu. All rights reserved.`, marginX, lineY + 4);

    doc.setFont("helvetica", "normal");
    doc.text(`Page ${i} of ${total}`, pageWidth / 2, lineY + 4, { align: "center" });

    doc.setFont("helvetica", "italic");
    doc.setFontSize(6);
    doc.setTextColor(90, 90, 90);
    doc.text("Powered by Masomo Portal (www.masomoportal.com)", pageWidth - marginX, lineY + 4, {
      align: "right",
    });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.text(
      "This is an official rankings report. Duplication is prohibited.",
      marginX,
      lineY + 7.5
    );
  }
};

function abbreviateSubject(name) {
  if (!name) return "-";
  const key = String(name).trim().toLowerCase();
  if (SUBJECT_ABBREVIATIONS[key]) return SUBJECT_ABBREVIATIONS[key];
  // Fallback: first 3 letters, capitalized
  const trimmed = String(name).trim();
  return trimmed.length <= 3 ? trimmed : trimmed.slice(0, 3);
}

export default function AdminRankings() {
  const [academicYears, setAcademicYears] = useState([]);
  const [terms, setTerms] = useState([]);
  const [gradeLevels, setGradeLevels] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [exams, setExams] = useState([]);

  const [scope, setScope] = useState("grade"); // grade | classroom
  const [form, setForm] = useState({
    academic_year_id: "",
    term_id: "",
    grade_level_id: "",
    classroom_id: "",
    exam_id: "",
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [data, setData] = useState(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Load academic years + grade levels once.
  useEffect(() => {
    (async () => {
      const [ay, g] = await Promise.all([
        calendarApi.academicYears(),
        academicsApi.gradeLevels(),
      ]);
      const years = ay.data.results ?? ay.data;
      setAcademicYears(years);
      setGradeLevels(g.data.results ?? g.data);

      const current = years.find((y) => y.is_current) || years[0];
      if (current) setForm((f) => ({ ...f, academic_year_id: String(current.id) }));
    })();
  }, []);

  // Reload terms + classrooms whenever the academic year changes.
  useEffect(() => {
    if (!form.academic_year_id) return;
    (async () => {
      const [t, c] = await Promise.all([
        calendarApi.terms({ academic_year: form.academic_year_id }),
        academicsApi.classrooms({ academic_year: form.academic_year_id }),
      ]);
      const termList = t.data.results ?? t.data;
      const currentTerm = termList.find((tm) => tm.is_current) || termList[0];
      setTerms(termList);
      setClassrooms(c.data.results ?? c.data);
      setForm((f) => ({
        ...f,
        term_id: currentTerm ? String(currentTerm.id) : "",
        classroom_id: "",
        exam_id: "",
      }));
    })();
  }, [form.academic_year_id]);

  // Which grade level is currently in play, depending on scope.
  const effectiveGradeLevelId =
    scope === "grade"
      ? form.grade_level_id
      : classrooms.find((c) => String(c.id) === String(form.classroom_id))?.grade_level;

  // Reload the exam list whenever term or effective grade level changes.
  useEffect(() => {
    if (!form.term_id || !effectiveGradeLevelId) {
      setExams([]);
      return;
    }
    (async () => {
      const res = await examsApi.exams({ term: form.term_id, grade_level: effectiveGradeLevelId });
      setExams(res.data.results ?? res.data);
      setForm((f) => ({ ...f, exam_id: "" }));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.term_id, effectiveGradeLevelId]);

  const runRanking = async (e) => {
    e.preventDefault();
    setMessage("");
    setData(null);

    if (!form.academic_year_id || !form.term_id) {
      setMessage("Select an academic year and term first.");
      return;
    }
    if (scope === "grade" && !form.grade_level_id) {
      setMessage("Select a grade/form level.");
      return;
    }
    if (scope === "classroom" && !form.classroom_id) {
      setMessage("Select a classroom.");
      return;
    }

    const params = { academic_year: form.academic_year_id, term: form.term_id };
    if (form.exam_id) params.exam = form.exam_id;

    setLoading(true);
    try {
      const { data: res } =
        scope === "grade"
          ? await academicsApi.gradeLevelResults(form.grade_level_id, params)
          : await academicsApi.classroomResults(form.classroom_id, params);
      setData(res);
      if (!res.results?.length) setMessage("No active students found for this selection.");
    } catch (err) {
      setMessage(err.response?.data?.detail || "Could not compute ranking.");
    } finally {
      setLoading(false);
    }
  };

  const selectedExamLabel = form.exam_id
    ? exams.find((ex) => String(ex.id) === String(form.exam_id))?.name
    : "All Exams (Combined)";

  // ---------------------------------------------------------------------
  // Download the ranking as a compact landscape PDF - super tiny data so
  // wide grade-level tables (now including Total/Pts/Grade columns) fit
  // on one horizontal page/row. Letterhead + footer match the finance report.
  // ---------------------------------------------------------------------
  const handleDownloadRankingPdf = async () => {
    if (!data || !data.results?.length) return;
    try {
      setDownloadingPdf(true);

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 10;

      const base64Logo = await getImageBase64(logoImage);

      // --- Title + meta line (drawn by the letterhead on every page) ---
      const scopeLabel = data.grade_level
        ? `${data.grade_level} — All Streams`
        : data.classroom || "-";
      const examLabel = selectedExamLabel;
      const reportTitle = "STUDENT RANKINGS REPORT";
      const metaLine = `${scopeLabel}  |  ${data.term || "-"}${data.academic_year ? ` (${data.academic_year})` : ""}  |  ${examLabel}  |  ${data.results.length} student(s)`;

      // --- Table columns (PDF uses abbreviated subject headers) ---
      const showClassCol = scope === "grade";
      const subjectHeaders = (data.subjects || []).map((s) => abbreviateSubject(s));
      const fixedHeaders = ["#", "Name", "Reg No"];
      if (showClassCol) fixedHeaders.push("Class");
      // Total = sum of subject %, Pts = total points, Grd = overall grade
      const tableColumn = [...fixedHeaders, ...subjectHeaders, "Tot", "Pts", "Grd", "Avg%"];

      const tableRows = data.results.map((r) => {
        const base = [
          r.class_position,
          r.full_name,
          r.admission_no,
        ];
        if (showClassCol) base.push(r.classroom_label || "-");
        const subjectCells = (data.subjects || []).map((s) => {
          const entry = r.subjects.find((sub) => sub.subject === s);
          const avg = entry?.average;
          return avg === null || avg === undefined ? "-" : `${avg}`;
        });
        const totalCell =
          r.total_marks === null || r.total_marks === undefined ? "-" : `${r.total_marks}`;
        const pointsCell =
          r.total_points === null || r.total_points === undefined ? "-" : `${r.total_points}`;
        const gradeCell = r.overall_grade || "-";
        const avgCell =
          r.average_marks === null || r.average_marks === undefined
            ? "-"
            : `${r.average_marks}`;
        return [...base, ...subjectCells, totalCell, pointsCell, gradeCell, avgCell];
      });

      // --- Column widths - as tight as possible so everything fits on
      // one horizontal page even with the extra Total/Pts/Grade columns ---
      const columnStyles = {
        0: { cellWidth: 6,  halign: "center" },                                        // #
        1: { cellWidth: 30, halign: "left", overflow: "ellipsize" },                   // Name
        2: { cellWidth: 16, halign: "left", overflow: "ellipsize" },                   // Reg No
      };
      let nextIdx = 3;
      if (showClassCol) {
        columnStyles[nextIdx] = { cellWidth: 22, halign: "left", overflow: "ellipsize" };
        nextIdx += 1;
      }
      const subjectColWidth = 9;
      (data.subjects || []).forEach(() => {
        columnStyles[nextIdx] = { cellWidth: subjectColWidth, halign: "center" };
        nextIdx += 1;
      });
      columnStyles[nextIdx] = { cellWidth: 11, halign: "center" }; // Tot
      nextIdx += 1;
      columnStyles[nextIdx] = { cellWidth: 9, halign: "center" };  // Pts
      nextIdx += 1;
      columnStyles[nextIdx] = { cellWidth: 9, halign: "center" };  // Grd
      nextIdx += 1;
      columnStyles[nextIdx] = { cellWidth: 12, halign: "center" }; // Avg%

      autoTable(doc, {
        startY: 42,
        head: [tableColumn],
        body: tableRows,
        theme: "grid",
        margin: { top: 42, left: marginX, right: marginX, bottom: 20 },
        styles: {
          font: "helvetica",
          fontSize: 5.5,
          cellPadding: 0.6,
          lineColor: BORDER,
          lineWidth: 0.15,
          textColor: BLACK,
          overflow: "ellipsize",
          valign: "middle",
        },
        headStyles: {
          fillColor: NAVY,
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 5.5,
          cellPadding: 0.8,
          halign: "center",
          lineColor: NAVY,
        },
        bodyStyles: {
          fontSize: 5.5,
          textColor: BLACK,
          cellPadding: 0.6,
        },
        alternateRowStyles: { fillColor: GREY },
        columnStyles,
        horizontalPageBreak: true,
        horizontalPageBreakRepeat: showClassCol ? [0, 1, 2, 3] : [0, 1, 2],
        didParseCell: (dataCell) => {
          if (dataCell.section !== "body") return;
          // Bold the Avg% column (last)
          const lastColIdx = tableColumn.length - 1;
          if (dataCell.column.index === lastColIdx) {
            dataCell.cell.styles.fontStyle = "bold";
            dataCell.cell.styles.textColor = NAVY;
          }
          // Bold the Grade column too (second to last)
          if (dataCell.column.index === lastColIdx - 1) {
            dataCell.cell.styles.fontStyle = "bold";
          }
          // Greyscale italic for "-" (no data) cells
          if (String(dataCell.cell.raw).trim() === "-") {
            dataCell.cell.styles.textColor = [148, 163, 184];
            dataCell.cell.styles.fontStyle = "italic";
          }
        },
        didDrawPage: () => {
          drawLetterhead(doc, base64Logo, reportTitle, metaLine);
        },
      });

      // --- Signature blocks (moves to a new page if there is no room) ---
      let finalY = doc.lastAutoTable.finalY + 12;
      if (finalY > pageHeight - 38) {
        doc.addPage();
        drawLetterhead(doc, base64Logo, reportTitle, metaLine);
        finalY = 50;
      }

      doc.setDrawColor(...BLACK);
      doc.setLineWidth(0.25);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...BLACK);
      doc.text("Academic Officer's Signature:", marginX, finalY);
      doc.line(marginX, finalY + 8, 82, finalY + 8);
      doc.text("Principal's Signature:", pageWidth - 82, finalY);
      doc.line(pageWidth - 82, finalY + 8, pageWidth - marginX, finalY + 8);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(100, 100, 100);
      doc.text("Sign & Official Stamp", marginX, finalY + 12);
      doc.text("Sign & Official Stamp", pageWidth - 82, finalY + 12);

      // --- Footer on every page ---
      drawFooters(doc);

      // --- Filename ---
      const scopeSlug = (data.grade_level || data.classroom || "ranking")
        .replace(/\s+/g, "_");
      const termSlug = (data.term || "term").replace(/\s+/g, "_");
      doc.save(`Rankings_${scopeSlug}_${termSlug}.pdf`);
    } catch (err) {
      console.error("Failed to generate rankings PDF:", err);
      setMessage("Could not generate the rankings PDF.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div>
      {/* Page header with logo */}
      <div className="page-header">
        <div className="d-flex align-items-center gap-3">
          <img
            src={logoImage}
            alt="Junda High School Shanzu"
            style={{ width: 48, height: 48, objectFit: "contain" }}
          />
          <div>
            <h2 className="page-title mb-0">Rankings</h2>
            <p className="text-muted mb-0" style={{ fontSize: "var(--fs-sm)" }}>
              Ranks every active student in the chosen scope by average percentage.
              Pick a single exam (e.g. Midterm) to rank on that exam alone, or leave
              "All Exams" for a combined end-of-term ranking. Ties share a position
              and are broken by admission number.
            </p>
          </div>
        </div>
      </div>

      {message && <div className="alert alert-info">{message}</div>}

      <form className="card p-3 mb-4" onSubmit={runRanking}>
        <div className="row g-3 align-items-end">
          <div className="col-md-3">
            <label className="form-label">Academic Year</label>
            <select
              className="form-select"
              required
              value={form.academic_year_id}
              onChange={(e) => setForm({ ...form, academic_year_id: e.target.value })}
            >
              <option value="">Select...</option>
              {academicYears.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.year}{y.is_current ? " (Current)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="col-md-3">
            <label className="form-label">Term</label>
            <select
              className="form-select"
              required
              value={form.term_id}
              onChange={(e) => setForm({ ...form, term_id: e.target.value })}
            >
              <option value="">Select...</option>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  Term {t.term_number}{t.is_current ? " (Current)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="col-md-3">
            <label className="form-label">Scope</label>
            <select
              className="form-select"
              value={scope}
              onChange={(e) => {
                setScope(e.target.value);
                setForm({ ...form, classroom_id: "", grade_level_id: "", exam_id: "" });
              }}
            >
              <option value="grade">Whole Grade / Form (all streams)</option>
              <option value="classroom">Single Classroom</option>
            </select>
          </div>

          <div className="col-md-3">
            {scope === "grade" ? (
              <>
                <label className="form-label">Grade / Form</label>
                <select
                  className="form-select"
                  required
                  value={form.grade_level_id}
                  onChange={(e) => setForm({ ...form, grade_level_id: e.target.value })}
                >
                  <option value="">Select...</option>
                  {gradeLevels.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.curriculum_type})
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <label className="form-label">Classroom</label>
                <select
                  className="form-select"
                  required
                  value={form.classroom_id}
                  onChange={(e) => setForm({ ...form, classroom_id: e.target.value })}
                >
                  <option value="">Select...</option>
                  {classrooms.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.grade_level_name} {c.stream_name}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>

        <div className="row g-3 mt-1">
          <div className="col-md-4">
            <label className="form-label">Exam</label>
            <select
              className="form-select"
              value={form.exam_id}
              onChange={(e) => setForm({ ...form, exam_id: e.target.value })}
              disabled={!effectiveGradeLevelId || !form.term_id}
            >
              <option value="">All Exams (Combined)</option>
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name} — {ex.exam_type_name}
                </option>
              ))}
            </select>
            <div className="form-text">
              "All Exams" combines every exam in the term (e.g. a full End of Term
              ranking). Pick one exam to rank on it alone.
            </div>
          </div>
        </div>

        <button className="btn btn-primary mt-3" style={{ width: "fit-content" }} disabled={loading}>
          <i className="bi bi-bar-chart-line me-1"></i>
          {loading ? "Computing..." : "Compute Ranking"}
        </button>
      </form>

      {data && data.results?.length > 0 && (
        <div className="card">
          <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
            <strong>
              {data.grade_level ? `${data.grade_level} — All Streams` : data.classroom}
              {" · "}{data.term} {data.academic_year ? `(${data.academic_year})` : ""}
              {" · "}{selectedExamLabel}
            </strong>
            <div className="d-flex align-items-center gap-3">
              <span className="text-muted small">{data.results.length} student(s)</span>
              <button
                type="button"
                className="btn btn-sm btn-outline-success"
                onClick={handleDownloadRankingPdf}
                disabled={downloadingPdf}
                title="Download this ranking as a landscape PDF"
              >
                {downloadingPdf ? (
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

          <div className="table-responsive" style={{ maxHeight: "70vh", overflow: "auto" }}>
            <table className="table table-hover table-bordered mb-0">
              <thead style={{ position: "sticky", top: 0, zIndex: 2, background: "#fff" }}>
                <tr>
                  <th style={{ position: "sticky", left: 0, zIndex: 3, background: "#fff", minWidth: 55 }}>#</th>
                  <th style={{ position: "sticky", left: 55, zIndex: 3, background: "#fff", minWidth: 180 }}>
                    Student Name
                  </th>
                  <th style={{ position: "sticky", left: 235, zIndex: 3, background: "#fff", minWidth: 130 }}>
                    Reg No
                  </th>
                  {scope === "grade" && <th style={{ minWidth: 150 }}>Class</th>}
                  {data.subjects.map((s) => (
                    <th key={s} className="text-center" style={{ minWidth: 100 }}>{s}</th>
                  ))}
                  <th className="text-center" style={{ minWidth: 90 }}>Total Marks</th>
                  <th className="text-center" style={{ minWidth: 80 }}>Total Pts</th>
                  <th className="text-center" style={{ minWidth: 70 }}>Grade</th>
                  <th className="text-center" style={{ minWidth: 110, background: "#f4f6f8" }}>
                    Average %
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((r) => (
                  <tr key={r.enrollment_id}>
                    <td style={{ position: "sticky", left: 0, background: "#fff", fontWeight: 600 }}>
                      {r.class_position}
                    </td>
                    <td style={{ position: "sticky", left: 55, background: "#fff" }}>{r.full_name}</td>
                    <td style={{ position: "sticky", left: 235, background: "#fff" }}>{r.admission_no}</td>
                    {scope === "grade" && <td>{r.classroom_label}</td>}
                    {data.subjects.map((s) => {
                      const entry = r.subjects.find((sub) => sub.subject === s);
                      const avg = entry?.average;
                      return (
                        <td key={s} className="text-center">
                          {avg === null || avg === undefined ? <span className="text-muted">N/A</span> : `${avg}%`}
                        </td>
                      );
                    })}
                    <td className="text-center">
                      {r.total_marks === null || r.total_marks === undefined
                        ? <span className="text-muted">N/A</span>
                        : r.total_marks}
                    </td>
                    <td className="text-center">
                      {r.total_points === null || r.total_points === undefined
                        ? <span className="text-muted">N/A</span>
                        : r.total_points}
                    </td>
                    <td className="text-center fw-semibold">
                      {r.overall_grade || <span className="text-muted">N/A</span>}
                    </td>
                    <td className="text-center fw-bold" style={{ background: "#f4f6f8" }}>
                      {r.average_marks === null || r.average_marks === undefined
                        ? <span className="text-muted">N/A</span>
                        : `${r.average_marks}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}