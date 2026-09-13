import { useEffect, useState } from "react";
import { academicsApi, calendarApi, examsApi } from "../../services/api";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoImage from "../../assets/masomo_logo.png";

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
  // Download the ranking as a compact landscape PDF — super tiny data so
  // wide grade-level tables fit on one horizontal page.
  // ---------------------------------------------------------------------
  const handleDownloadRankingPdf = async () => {
    if (!data || !data.results?.length) return;
    try {
      setDownloadingPdf(true);

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      const base64Logo = await getImageBase64(logoImage);

      const generatedOn = new Date().toLocaleDateString("en-KE", {
        year: "numeric", month: "long", day: "numeric",
      });

      // --- Header ---
      if (base64Logo) {
        doc.addImage(base64Logo, "PNG", 8, 7, 10, 10);
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text("Masomo School", base64Logo ? 21 : 8, 12);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text("Student Rankings Report", base64Logo ? 21 : 8, 17);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(`Generated ${generatedOn}`, pageWidth - 8, 10, { align: "right" });

      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.line(8, 20, pageWidth - 8, 20);

      // --- Meta line ---
      const scopeLabel = data.grade_level
        ? `${data.grade_level} — All Streams`
        : data.classroom || "-";
      const examLabel = selectedExamLabel;
      const metaLine = `${scopeLabel}   |   ${data.term || "-"}${data.academic_year ? ` (${data.academic_year})` : ""}   |   ${examLabel}   |   ${data.results.length} student(s)`;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(51, 65, 85);
      doc.text(metaLine, 8, 25);

      // --- Table columns (PDF uses abbreviated subject headers) ---
      const showClassCol = scope === "grade";
      const subjectHeaders = (data.subjects || []).map((s) => abbreviateSubject(s));
      const fixedHeaders = ["#", "Student Name", "Reg No"];
      if (showClassCol) fixedHeaders.push("Class");
      const tableColumn = [...fixedHeaders, ...subjectHeaders, "Avg %"];

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
          return avg === null || avg === undefined ? "N/A" : `${avg}`;
        });
        const avgCell =
          r.average_marks === null || r.average_marks === undefined
            ? "N/A"
            : `${r.average_marks}`;
        return [...base, ...subjectCells, avgCell];
      });

      // --- Column widths — super compact so wide tables fit on one line ---
      const columnStyles = {
        0: { cellWidth: 7,  halign: "center" },                                        // #
        1: { cellWidth: 38, halign: "left", overflow: "ellipsize" },                   // Student Name
        2: { cellWidth: 20, halign: "left", overflow: "ellipsize" },                   // Reg No
      };
      let nextIdx = 3;
      if (showClassCol) {
        columnStyles[nextIdx] = { cellWidth: 20, halign: "left", overflow: "ellipsize" };
        nextIdx += 1;
      }
      const subjectColWidth = 11; // tight per-subject column
      (data.subjects || []).forEach(() => {
        columnStyles[nextIdx] = { cellWidth: subjectColWidth, halign: "center" };
        nextIdx += 1;
      });
      columnStyles[nextIdx] = { cellWidth: 14, halign: "center" }; // Avg %

      autoTable(doc, {
        startY: 28,
        head: [tableColumn],
        body: tableRows,
        theme: "grid",
        styles: {
          fontSize: 6,           // super tiny
          cellPadding: 0.8,      // very tight
          lineColor: [226, 232, 240],
          lineWidth: 0.1,
          textColor: [51, 65, 85],
          overflow: "ellipsize",
          valign: "middle",
        },
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 6,
          cellPadding: 1,
          halign: "center",
        },
        bodyStyles: {
          fontSize: 6,
          textColor: [51, 65, 85],
          cellPadding: 0.8,
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles,
        margin: { left: 8, right: 8 },
        // horizontalPageBreak is still set as a safety net — but with
        // abbreviations + 6pt font + 11mm subject columns, a 13-subject
        // grade-wide ranking fits in one horizontal page.
        horizontalPageBreak: true,
        horizontalPageBreakRepeat: showClassCol ? [0, 1, 2, 3] : [0, 1, 2],
        didParseCell: (dataCell) => {
          if (dataCell.section !== "body") return;
          // Bold the Avg % column (last)
          const lastColIdx = tableColumn.length - 1;
          if (dataCell.column.index === lastColIdx) {
            dataCell.cell.styles.fontStyle = "bold";
            dataCell.cell.styles.textColor = [15, 23, 42];
          }
          // Greyscale italic for N/A cells
          if (String(dataCell.cell.raw).toLowerCase() === "n/a") {
            dataCell.cell.styles.textColor = [148, 163, 184];
            dataCell.cell.styles.fontStyle = "italic";
          }
        },
        didDrawPage: () => {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6);
          doc.setTextColor(148, 163, 184);
          doc.text(
            `Page ${doc.internal.getCurrentPageInfo().pageNumber} of ${doc.internal.getNumberOfPages()}`,
            pageWidth - 8,
            pageHeight - 4,
            { align: "right" }
          );
          doc.text("Masomo School — Academics Office", 8, pageHeight - 4);
        },
      });

      // --- Signature blocks ---
      let finalY = doc.lastAutoTable.finalY + 12;
      if (finalY > pageHeight - 26) {
        doc.addPage();
        finalY = 20;
      }

      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.2);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text("Academic Officer's Signature:", 8, finalY);
      doc.line(8, finalY + 8, 80, finalY + 8);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text("Sign & Official Stamp", 8, finalY + 11.5);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text("Principal's Signature:", pageWidth - 80, finalY);
      doc.line(pageWidth - 80, finalY + 8, pageWidth - 8, finalY + 8);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text("Sign & Official Stamp", pageWidth - 80, finalY + 11.5);

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
            alt="Masomo School"
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
                  {scope === "grade" && <th style={{ minWidth: 110 }}>Class</th>}
                  {data.subjects.map((s) => (
                    <th key={s} className="text-center" style={{ minWidth: 100 }}>{s}</th>
                  ))}
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