import { useEffect, useMemo, useState } from "react";
import { academicsApi, calendarApi, examsApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";

export default function AdminMarkEntry() {
  const [classrooms, setClassrooms] = useState([]);
  const [year, setYear] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [classroomId, setClassroomId] = useState("");

  const [terms, setTerms] = useState([]);
  const [termId, setTermId] = useState("");

  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState("");
  const [examsLoading, setExamsLoading] = useState(false);

  const [sheet, setSheet] = useState(null);
  const [cells, setCells] = useState({}); // "enrollment:subject:paperKey" -> { marks_obtained, is_absent }
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addingPaper, setAddingPaper] = useState(null); // subject_id currently adding a column for
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");

  useEffect(() => {
    academicsApi.allClassrooms().then(({ data }) => setClassrooms(data));
  }, []);

  const years = useMemo(
    () => [...new Set(classrooms.map((c) => c.academic_year_year))].sort((a, b) => b - a),
    [classrooms]
  );

  const gradesForYear = useMemo(() => {
    const pool = year ? classrooms.filter((c) => String(c.academic_year_year) === String(year)) : classrooms;
    const seen = new Map();
    pool.forEach((c) => seen.set(c.grade_level, c.grade_level_name));
    return [...seen.entries()];
  }, [classrooms, year]);

  const classroomsForGrade = useMemo(() => {
    return classrooms.filter((c) => {
      if (year && String(c.academic_year_year) !== String(year)) return false;
      if (gradeId && String(c.grade_level) !== String(gradeId)) return false;
      return true;
    });
  }, [classrooms, year, gradeId]);

  const selectedClassroom = classrooms.find((c) => String(c.id) === String(classroomId));

  // Load terms once a classroom (-> its academic year) is chosen
  useEffect(() => {
    setTermId("");
    setTerms([]);
    if (!selectedClassroom) return;
    calendarApi.terms({ academic_year: selectedClassroom.academic_year }).then(({ data }) => {
      setTerms(data.results ?? data);
    });
  }, [classroomId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load exams once term + classroom's grade are known
  useEffect(() => {
    setExamId("");
    setExams([]);
    if (!selectedClassroom || !termId) return;
    setExamsLoading(true);
    examsApi.exams({ grade_level: selectedClassroom.grade_level, term: termId })
      .then(({ data }) => setExams(data.results ?? data))
      .finally(() => setExamsLoading(false));
  }, [termId, classroomId]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetSheet = () => {
    setSheet(null);
    setCells({});
    setMessage("");
  };

  const loadSheet = async () => {
    if (!classroomId || !examId) return;
    resetSheet();
    setLoadingSheet(true);
    try {
      const { data } = await academicsApi.examSpreadsheet(classroomId, examId);
      setSheet(data);
      const initial = {};
      data.students.forEach((s) => {
        data.subjects.forEach((subj) => {
          subj.columns.forEach((col) => {
            const key = `${s.enrollment_id}:${subj.subject_id}:${col.paper_id ?? "single"}`;
            const existing = data.marks[key];
            initial[key] = existing || { marks_obtained: "", is_absent: false };
          });
        });
      });
      setCells(initial);
    } catch (err) {
      setMessage(err.response?.data?.detail || "Could not load the spreadsheet.");
      setMessageType("danger");
    } finally {
      setLoadingSheet(false);
    }
  };

  const updateCell = (key, field, value) => {
    setCells((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };

  const addPaperColumn = async (subjectId) => {
    setAddingPaper(subjectId);
    try {
      const subj = sheet.subjects.find((s) => s.subject_id === subjectId);
      const realPapers = subj.columns.filter((c) => c.paper_id !== null);
      const nextNumber = realPapers.length ? Math.max(...realPapers.map((c, i) => i + 2)) : 2;
      const { data: newPaper } = await academicsApi.createSubjectPaper({
        subject: subjectId,
        paper_number: nextNumber,
        name: `Paper ${nextNumber}`,
        max_marks: 100,
      });
      setSheet((prev) => ({
        ...prev,
        subjects: prev.subjects.map((s) =>
          s.subject_id === subjectId
            ? {
                ...s,
                columns: [
                  ...s.columns.filter((c) => c.paper_id !== null || s.columns.length === 0),
                  { paper_id: newPaper.id, label: newPaper.name, max_marks: newPaper.max_marks },
                ].filter((c) => c.paper_id !== null || s.columns.length === 1 && s.columns[0].paper_id === null ? false : true),
              }
            : s
        ),
      }));
      // seed blank cells for the new column across every student
      setCells((prev) => {
        const next = { ...prev };
        sheet.students.forEach((s) => {
          next[`${s.enrollment_id}:${subjectId}:${newPaper.id}`] = { marks_obtained: "", is_absent: false };
        });
        return next;
      });
    } catch (err) {
      setMessage(err.response?.data ? JSON.stringify(err.response.data) : "Could not add paper column.");
      setMessageType("danger");
    } finally {
      setAddingPaper(null);
    }
  };

  const save = async () => {
    if (!sheet) return;
    setSaving(true);
    setMessage("");
    try {
      const entries = [];
      sheet.students.forEach((s) => {
        sheet.subjects.forEach((subj) => {
          subj.columns.forEach((col) => {
            const key = `${s.enrollment_id}:${subj.subject_id}:${col.paper_id ?? "single"}`;
            const cell = cells[key] || {};
            entries.push({
              enrollment_id: s.enrollment_id,
              subject_id: subj.subject_id,
              paper_id: col.paper_id,
              max_marks: col.max_marks,
              marks_obtained: cell.is_absent
                ? null
                : (cell.marks_obtained === "" || cell.marks_obtained == null ? null : Number(cell.marks_obtained)),
              is_absent: !!cell.is_absent,
            });
          });
        });
      });
      const { data } = await academicsApi.saveExamSpreadsheet(classroomId, { exam_id: examId, entries });
      setMessage(`Saved ${data.saved.length} mark(s).${data.errors.length ? ` ${data.errors.length} error(s).` : ""}`);
      setMessageType(data.errors.length ? "warning" : "success");
    } catch (err) {
      setMessage(err.response?.data?.detail || "Could not save marks.");
      setMessageType("danger");
    } finally {
      setSaving(false);
    }
  };

  const totalColumns = sheet ? sheet.subjects.reduce((sum, s) => sum + s.columns.length, 0) : 0;

  return (
    <div>
      <Breadcrumb items={[
        { label: "Dashboard", href: "/admin" },
        { label: "Exams", href: "/admin/exams" },
        { label: "Mark Entry (All Subjects)", href: "#" },
      ]} />

      <div className="page-header">
        <div>
          <h1 className="page-title">Mark Entry — All Subjects</h1>
          <p className="page-subtitle">
            Pick a class and exam, then enter marks for every subject at once — one spreadsheet per class per exam.
          </p>
        </div>
      </div>

      {message && (
        <div className={`alert alert-${messageType} alert-dismissible fade show`} role="alert">
          {message}
          <button type="button" className="btn-close" onClick={() => setMessage("")}></button>
        </div>
      )}

      <div className="card p-4 mb-4">
        <div className="row g-3 align-items-end">
          <div className="col-md-2">
            <label className="form-label">Year</label>
            <select className="form-select" value={year} onChange={(e) => { setYear(e.target.value); setGradeId(""); setClassroomId(""); resetSheet(); }}>
              <option value="">All</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">Grade</label>
            <select className="form-select" value={gradeId} onChange={(e) => { setGradeId(e.target.value); setClassroomId(""); resetSheet(); }}>
              <option value="">Select...</option>
              {gradesForYear.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">Stream / Class</label>
            <select className="form-select" value={classroomId} onChange={(e) => { setClassroomId(e.target.value); resetSheet(); }}>
              <option value="">Select...</option>
              {classroomsForGrade.map((c) => (
                <option key={c.id} value={c.id}>{c.stream_name} — {c.student_count} active</option>
              ))}
            </select>
          </div>
          <div className="col-md-2">
            <label className="form-label">Term</label>
            <select className="form-select" value={termId} onChange={(e) => { setTermId(e.target.value); resetSheet(); }} disabled={!selectedClassroom}>
              <option value="">Select...</option>
              {terms.map((t) => <option key={t.id} value={t.id}>Term {t.term_number}</option>)}
            </select>
          </div>
          <div className="col-md-2">
            <label className="form-label">Exam Type</label>
            <select className="form-select" value={examId} onChange={(e) => { setExamId(e.target.value); resetSheet(); }} disabled={!termId || examsLoading}>
              <option value="">{examsLoading ? "Loading..." : "Select..."}</option>
              {exams.map((ex) => <option key={ex.id} value={ex.id}>{ex.exam_type_name}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-3">
          <button className="btn btn-primary" disabled={!classroomId || !examId || loadingSheet} onClick={loadSheet}>
            {loadingSheet ? "Loading..." : "Load Spreadsheet"}
          </button>
        </div>
      </div>

      {sheet && (
        <div className="table-wrap">
          <div className="table-wrap__header">
            <span style={{ fontWeight: 600 }}>
              <i className="bi bi-grid-3x3 me-2"></i>
              {sheet.classroom} — {sheet.exam}
            </span>
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
              {sheet.students.length} students · {sheet.subjects.length} subjects · {totalColumns} columns
            </span>
          </div>

          <div className="table-responsive" style={{ maxHeight: "70vh" }}>
            <table className="table table-bordered table-sm mb-0" style={{ fontSize: "var(--fs-xs)" }}>
              <thead className="sticky-top bg-white">
                <tr>
                  <th rowSpan={2} style={{ minWidth: 110, position: "sticky", left: 0, background: "#fff", zIndex: 2 }}>Adm No</th>
                  <th rowSpan={2} style={{ minWidth: 160, position: "sticky", left: 110, background: "#fff", zIndex: 2 }}>Student</th>
                  {sheet.subjects.map((subj) => (
                    <th key={subj.subject_id} colSpan={subj.columns.length} className="text-center">
                      {subj.subject_name}{" "}
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary py-0 px-1 ms-1"
                        title={`Add another paper column for ${subj.subject_name}`}
                        disabled={addingPaper === subj.subject_id}
                        onClick={() => addPaperColumn(subj.subject_id)}
                      >
                        {addingPaper === subj.subject_id ? "..." : "+"}
                      </button>
                    </th>
                  ))}
                </tr>
                <tr>
                  {sheet.subjects.map((subj) =>
                    subj.columns.map((col) => (
                      <th key={`${subj.subject_id}-${col.paper_id ?? "single"}`} className="text-center" style={{ minWidth: 90 }}>
                        {col.label}
                        <div style={{ fontWeight: 400, color: "var(--ink-400)" }}>/{col.max_marks}</div>
                      </th>
                    ))
                  )}
                </tr>
              </thead>
              <tbody>
                {sheet.students.map((s) => (
                  <tr key={s.enrollment_id}>
                    <td style={{ position: "sticky", left: 0, background: "#fff", fontWeight: 600, color: "var(--blue-700)" }}>
                      {s.admission_no}
                    </td>
                    <td style={{ position: "sticky", left: 110, background: "#fff" }}>{s.full_name}</td>
                    {sheet.subjects.map((subj) =>
                      subj.columns.map((col) => {
                        const key = `${s.enrollment_id}:${subj.subject_id}:${col.paper_id ?? "single"}`;
                        const cell = cells[key] || { marks_obtained: "", is_absent: false };
                        return (
                          <td key={key} className="p-1">
                            <input
                              type="number"
                              className="form-control form-control-sm text-center"
                              style={{ width: 56, display: "inline-block" }}
                              min="0"
                              max={col.max_marks}
                              disabled={cell.is_absent}
                              value={cell.marks_obtained}
                              onChange={(e) => updateCell(key, "marks_obtained", e.target.value)}
                            />
                            <input
                              type="checkbox"
                              className="ms-1"
                              title="Absent"
                              checked={cell.is_absent}
                              onChange={(e) => updateCell(key, "is_absent", e.target.checked)}
                            />
                          </td>
                        );
                      })
                    )}
                  </tr>
                ))}
                {sheet.students.length === 0 && (
                  <tr>
                    <td colSpan={2 + totalColumns} className="text-center text-muted py-3">
                      No active students in this class.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {sheet.students.length > 0 && (
            <div className="p-3">
              <button className="btn btn-success" disabled={saving} onClick={save}>
                {saving ? "Saving..." : "Save All Marks"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}