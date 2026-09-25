import { useEffect, useState } from "react";
import { teacherApi, academicsApi, calendarApi } from "../../services/api";
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

// Edit these to match the real school's details - shown centered under the
// school name in the PDF header.
const SCHOOL_CONTACT = {
  poBox: "P.O. Box 1234-00100, Nairobi, Kenya",
  phone: "+254 712 345 678",
  email: "info@masomoschool.ac.ke",
};

function abbreviateSubject(name) {
  if (!name) return "-";
  const key = String(name).trim().toLowerCase();
  if (SUBJECT_ABBREVIATIONS[key]) return SUBJECT_ABBREVIATIONS[key];
  // Fallback: first 3 letters, capitalized
  const trimmed = String(name).trim();
  return trimmed.length <= 3 ? trimmed : trimmed.slice(0, 3);
}

export default function TeacherRankings() {
  const [initializing, setInitializing] = useState(true);
  const [noClassTeacherRole, setNoClassTeacherRole] = useState(false);
  const [classrooms, setClassrooms] = useState([]);
  const [terms, setTerms] = useState([]);
  const [exams, setExams] = useState([]);

  const [form, setForm] = useState({ classroom_id: "", term_id: "", exam_id: "" });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [data, setData] = useState(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // ---- step 1: which classrooms is this teacher the class teacher of ----
  useEffect(() => {
    teacherApi.myClassTeacherClassrooms().then(({ data: res }) => {
      const rows = res.results ?? res;
      setClassrooms(rows);
      setNoClassTeacherRole(rows.length === 0);
      if (rows.length > 0) {
        setForm((f) => ({ ...f, classroom_id: String(rows[0].id) }));
      }
      setInitializing(false);
    });
  }, []);

  const selectedClassroom = classrooms.find((c) => String(c.id) === String(form.classroom_id));

  // ---- step 2: terms for that classroom's academic year ----
  useEffect(() => {
    if (!selectedClassroom) return;
    calendarApi.terms({ academic_year: selectedClassroom.academic_year }).then(({ data: res }) => {
      const rows = res.results ?? res;
      const current = rows.find((t) => t.is_current) || rows[0];
      setTerms(rows);
      setForm((f) => ({ ...f, term_id: current ? String(current.id) : "", exam_id: "" }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.classroom_id]);

  // ---- step 3: exams for that term + grade level ----
  useEffect(() => {
    if (!form.term_id || !selectedClassroom) {
      setExams([]);
      return;
    }
    academicsApi
      .classroomResults(form.classroom_id, { term: form.term_id }) // cheap way to warm the picker isn't ideal; use dedicated exams call below instead
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!form.term_id || !selectedClassroom) {
      setExams([]);
      return;
    }
    import("../../services/api").then(({ examsApi }) => {
      examsApi
        .exams({ term: form.term_id, grade_level: selectedClassroom.grade_level_id ?? selectedClassroom.grade_level })
        .then(({ data: res }) => setExams(res.results ?? res));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.term_id, form.classroom_id]);

  const runRanking = async (e) => {
    e.preventDefault();
    setMessage("");
    setData(null);

    if (!form.classroom_id || !form.term_id) {
      setMessage("Select a classroom and term first.");
      return;
    }

    const params = { term: form.term_id };
    if (form.exam_id) params.exam = form.exam_id;

    setLoading(true);
    try {
      const { data: res } = await academicsApi.classroomResults(form.classroom_id, params);
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
  // Download the ranking as a compact landscape PDF - same layout as the
  // admin Rankings page.
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
      doc.text("Junda High School Shanzu", base64Logo ? 21 : 8, 12);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text("Class Rankings Report", base64Logo ? 21 : 8, 17);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(`Generated ${generatedOn}`, pageWidth - 8, 10, { align: "right" });

      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.line(8, 20, pageWidth - 8, 20);

      // --- Meta line ---
      const scopeLabel = data.classroom || "-";
      const examLabel = selectedExamLabel;
      const metaLine = `${scopeLabel}   |   ${data.term || "-"}${data.academic_year ? ` (${data.academic_year})` : ""}   |   ${examLabel}   |   ${data.results.length} student(s)`;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(51, 65, 85);
      doc.text(metaLine, 8, 25);

      // --- Table columns (PDF uses abbreviated subject headers) ---
      const subjectHeaders = (data.subjects || []).map((s) => abbreviateSubject(s));
      const fixedHeaders = ["#", "Name", "Reg No"];
      const tableColumn = [...fixedHeaders, ...subjectHeaders, "Tot", "Pts", "Grd", "Avg%"];

      const tableRows = data.results.map((r) => {
        const base = [r.class_position, r.full_name, r.admission_no];
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

      // --- Column widths - tight, so everything fits on one horizontal page ---
      const columnStyles = {
        0: { cellWidth: 6, halign: "center" },                                     // #
        1: { cellWidth: 34, halign: "left", overflow: "ellipsize" },               // Name
        2: { cellWidth: 18, halign: "left", overflow: "ellipsize" },               // Reg No
      };
      let nextIdx = 3;
      const subjectColWidth = 10;
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
        startY: 28,
        head: [tableColumn],
        body: tableRows,
        theme: "grid",
        styles: {
          fontSize: 6,
          cellPadding: 0.8,
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
        margin: { left: 6, right: 6 },
        horizontalPageBreak: true,
        horizontalPageBreakRepeat: [0, 1, 2],
        didParseCell: (dataCell) => {
          if (dataCell.section !== "body") return;
          const lastColIdx = tableColumn.length - 1;
          if (dataCell.column.index === lastColIdx) {
            dataCell.cell.styles.fontStyle = "bold";
            dataCell.cell.styles.textColor = [15, 23, 42];
          }
          if (dataCell.column.index === lastColIdx - 1) {
            dataCell.cell.styles.fontStyle = "bold";
          }
          if (String(dataCell.cell.raw).trim() === "-") {
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
          doc.text("Junda High School Shanzu — Academics Office", 8, pageHeight - 4);
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
      doc.text("Class Teacher's Signature:", 8, finalY);
      doc.line(8, finalY + 8, 80, finalY + 8);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text("Sign & Date", 8, finalY + 11.5);

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
      const scopeSlug = (data.classroom || "ranking").replace(/\s+/g, "_");
      const termSlug = (data.term || "term").replace(/\s+/g, "_");
      doc.save(`Class_Rankings_${scopeSlug}_${termSlug}.pdf`);
    } catch (err) {
      console.error("Failed to generate rankings PDF:", err);
      setMessage("Could not generate the rankings PDF.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (initializing) {
    return (
      <div>
        <div className="page-header">
          <div className="d-flex align-items-center gap-3">
            <img src={logoImage} alt="Junda High School Shanzu" style={{ width: 48, height: 48, objectFit: "contain" }} />
            <h2 className="page-title mb-0">Class Rankings</h2>
          </div>
        </div>
        <p className="text-muted">Loading...</p>
      </div>
    );
  }

  if (noClassTeacherRole) {
    return (
      <div>
        <div className="page-header">
          <div className="d-flex align-items-center gap-3">
            <img src={logoImage} alt="Junda High School Shanzu" style={{ width: 48, height: 48, objectFit: "contain" }} />
            <div>
              <h2 className="page-title mb-0">Class Rankings</h2>
              <p className="text-muted mb-0" style={{ fontSize: "var(--fs-sm)" }}>
                Ranked results for the class(es) you're assigned to as class teacher.
              </p>
            </div>
          </div>
        </div>
        <div className="card p-4 text-center text-muted">
          You don't have a class teacher role assigned for this or previous
          academic years, so there's no class ranking to show. Ask an
          administrator to assign you as a class teacher first.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div className="d-flex align-items-center gap-3">
          <img src={logoImage} alt="Junda High School Shanzu" style={{ width: 48, height: 48, objectFit: "contain" }} />
          <div>
            <h2 className="page-title mb-0">Class Rankings</h2>
            <p className="text-muted mb-0" style={{ fontSize: "var(--fs-sm)" }}>
              Ranks every active student in your class by average percentage.
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
          <div className="col-md-4">
            <label className="form-label">Classroom</label>
            <select
              className="form-select"
              required
              value={form.classroom_id}
              onChange={(e) => setForm({ ...form, classroom_id: e.target.value })}
            >
              {classrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.grade_level_name} {c.stream_name} ({c.academic_year_year})
                  {c.is_promoted ? " - Promoted" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="col-md-4">
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

          <div className="col-md-4">
            <label className="form-label">Exam</label>
            <select
              className="form-select"
              value={form.exam_id}
              onChange={(e) => setForm({ ...form, exam_id: e.target.value })}
              disabled={!form.term_id}
            >
              <option value="">All Exams (Combined)</option>
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name} — {ex.exam_type_name}
                </option>
              ))}
            </select>
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
              {data.classroom}
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