import { useEffect, useRef, useState } from "react";
import { teacherApi, examsApi, studentsApi, calendarApi, academicsApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";

export default function TeacherMarkEntry() {
  const [allocations, setAllocations] = useState([]);
  const [classroomsById, setClassroomsById] = useState({});
  const [subjectsById, setSubjectsById] = useState({});
  const [exams, setExams] = useState([]);
  const [examsLoading, setExamsLoading] = useState(false);
  const [selectedAllocation, setSelectedAllocation] = useState("");
  const [selectedExam, setSelectedExam] = useState("");
  const [maxMarks, setMaxMarks] = useState(100);
  const [enrollments, setEnrollments] = useState([]);
  // marks[enrollment_id][columnKey] = { marks_obtained, is_absent }
  // columnKey is "single" when the subject has no configured papers,
  // or the SubjectPaper id (as a string) when it does.
  const [marks, setMarks] = useState({});
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [saving, setSaving] = useState(false);
  const [addingPaper, setAddingPaper] = useState(false);
  const [loading, setLoading] = useState(false);
  const [marksLoading, setMarksLoading] = useState(false);

  // Keeps a live copy of subjectsById for effects that shouldn't
  // re-run (and wipe entered marks) every time subjectsById changes.
  const subjectsByIdRef = useRef({});
  useEffect(() => { subjectsByIdRef.current = subjectsById; }, [subjectsById]);

  // ---- initial load: allocations + classrooms (for grade_level lookup)
  // + subjects (for paper configuration) ----
  useEffect(() => {
    const loadStatic = async () => {
      setLoading(true);
      try {
        const [allocRes, classroomsRes, subjectsRes] = await Promise.all([
          teacherApi.myAllocations(),
          academicsApi.classrooms({ page_size: 200 }),
          academicsApi.subjects(),
        ]);
        setAllocations(allocRes.data.results ?? allocRes.data);

        const cMap = {};
        (classroomsRes.data.results ?? classroomsRes.data).forEach((c) => { cMap[c.id] = c; });
        setClassroomsById(cMap);

        const sMap = {};
        (subjectsRes.data.results ?? subjectsRes.data).forEach((s) => { sMap[s.id] = s; });
        setSubjectsById(sMap);
      } catch (error) {
        console.error("Failed to load data:", error);
      } finally {
        setLoading(false);
      }
    };
    loadStatic();
  }, []);

  const allocation = allocations.find((a) => String(a.id) === String(selectedAllocation));

  // ---- auto-load exams for this allocation's grade level + active
  // academic year, published or not, as soon as a class/subject is picked ----
  useEffect(() => {
    setSelectedExam("");
    if (!allocation) { setExams([]); return; }

    const classroom = classroomsById[allocation.classroom];
    if (!classroom) { setExams([]); return; }

    const load = async () => {
      setExamsLoading(true);
      try {
        const [termsRes, examsRes] = await Promise.all([
          calendarApi.terms({ academic_year: allocation.academic_year }),
          examsApi.exams({ grade_level: classroom.grade_level }),
        ]);
        const termIds = new Set((termsRes.data.results ?? termsRes.data).map((t) => t.id));
        const allExams = examsRes.data.results ?? examsRes.data;
        // grade_level already narrows it down; this pins it further to
        // the specific academic year the allocation belongs to.
        setExams(allExams.filter((ex) => termIds.has(ex.term)));
      } catch (error) {
        console.error("Failed to load exams:", error);
        setExams([]);
      } finally {
        setExamsLoading(false);
      }
    };
    load();
  }, [selectedAllocation, allocation, classroomsById]);

  // ---- columns to render: one per configured SubjectPaper, or a
  // single unlabeled box when the subject has none ----
  const subject = allocation ? subjectsById[allocation.subject] : null;
  const configuredPapers = (subject?.papers ?? [])
    .slice()
    .sort((a, b) => a.paper_number - b.paper_number);
  const paperColumns = configuredPapers.length > 0
    ? configuredPapers.map((p) => ({
        key: String(p.id),
        id: p.id,
        label: p.name || `Paper ${p.paper_number}`,
        max_marks: p.max_marks,
      }))
    : [{ key: "single", id: null, label: "Marks", max_marks: Number(maxMarks) || 100 }];

  // ---- load the roster + seed blank marks whenever the allocation changes ----
  useEffect(() => {
    if (!allocation) { setEnrollments([]); setMarks({}); return; }
    setLoading(true);
    studentsApi.enrollments({ classroom: allocation.classroom, status: "ACTIVE" }).then(({ data }) => {
      const list = data.results ?? data;
      setEnrollments(list);

      const subj = subjectsByIdRef.current[allocation.subject];
      const configured = (subj?.papers ?? []).slice().sort((a, b) => a.paper_number - b.paper_number);
      const cols = configured.length > 0
        ? configured.map((p) => String(p.id))
        : ["single"];

      const initial = {};
      list.forEach((e) => {
        initial[e.id] = {};
        cols.forEach((key) => { initial[e.id][key] = { marks_obtained: "", is_absent: false }; });
      });
      setMarks(initial);
      setLoading(false);
    }).catch(() => setLoading(false));
    // subjectsById is read via ref on purpose, so adding a paper later
    // doesn't re-trigger this and wipe marks already entered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAllocation]);

  // ---- once class+exam are both chosen and the roster is loaded, pull
  // back any marks already saved for this exam/subject/classroom and
  // overlay them onto the blank grid seeded above. This is what makes
  // "come back later and see what you already entered" work - previously
  // the grid was always reset to blank and existing ExamResult rows were
  // never fetched. ----
  useEffect(() => {
    if (!allocation || !selectedExam || enrollments.length === 0) return;

    const subj = subjectsByIdRef.current[allocation.subject];
    const configured = (subj?.papers ?? []).slice().sort((a, b) => a.paper_number - b.paper_number);
    const cols = configured.length > 0 ? configured.map((p) => String(p.id)) : ["single"];

    let cancelled = false;
    setMarksLoading(true);
    examsApi.results({
      exam: selectedExam,
      subject: allocation.subject,
      enrollment__classroom: allocation.classroom,
      page_size: 1000, // large enough to cover any single class roster
    }).then(({ data }) => {
      if (cancelled) return;
      const list = data.results ?? data;

      setMarks((prev) => {
        const next = { ...prev };
        // make sure every student/column pair exists first, in case this
        // runs before (or without) the roster-seed effect above
        enrollments.forEach((en) => {
          next[en.id] = { ...next[en.id] };
          cols.forEach((key) => {
            next[en.id][key] = next[en.id][key] || { marks_obtained: "", is_absent: false };
          });
        });
        // overlay whatever was already saved for this exam
        list.forEach((r) => {
          const key = r.paper ? String(r.paper) : "single";
          if (!next[r.enrollment]) return;
          next[r.enrollment] = {
            ...next[r.enrollment],
            [key]: {
              marks_obtained: r.is_absent ? "" : (r.marks_obtained ?? ""),
              is_absent: r.is_absent,
            },
          };
        });
        return next;
      });
    }).catch((err) => {
      console.error("Failed to load existing marks:", err);
    }).finally(() => {
      if (!cancelled) setMarksLoading(false);
    });

    return () => { cancelled = true; };
    // enrollments is included so this re-runs once the roster for a newly
    // selected allocation has actually finished loading
  }, [selectedExam, selectedAllocation, enrollments, allocation]);

  const updateMark = (enrollmentId, columnKey, field, value) => {
    setMarks((prev) => ({
      ...prev,
      [enrollmentId]: {
        ...prev[enrollmentId],
        [columnKey]: { ...prev[enrollmentId]?.[columnKey], [field]: value },
      },
    }));
  };

  // ---- "she can add a box" — creates a real SubjectPaper via the API so
  // it's a genuine extra paper for this subject from now on, not just a
  // one-off visual column. Requires SubjectPaperViewSet to allow teacher
  // writes (see note below the component). ----
  const addPaperColumn = async () => {
    if (!subject) return;
    setAddingPaper(true);
    setMessage("");
    try {
      const nextNumber = configuredPapers.length
        ? configuredPapers[configuredPapers.length - 1].paper_number + 1
        : 2; // subject had one implicit "Paper 1" box before this
      const { data: newPaper } = await academicsApi.addSubjectPaper({
        subject: subject.id,
        paper_number: nextNumber,
        name: `Paper ${nextNumber}`,
        max_marks: 100,
      });

      setSubjectsById((prev) => ({
        ...prev,
        [subject.id]: {
          ...prev[subject.id],
          has_papers: true,
          papers: [...(prev[subject.id].papers || []), newPaper],
        },
      }));

      // seed the new column for every student already on screen, without
      // touching what's already been typed into the existing columns
      setMarks((prev) => {
        const next = { ...prev };
        enrollments.forEach((en) => {
          next[en.id] = {
            ...next[en.id],
            [String(newPaper.id)]: { marks_obtained: "", is_absent: false },
          };
        });
        return next;
      });
    } catch (err) {
      setMessage(err.response?.data ? JSON.stringify(err.response.data) : "Could not add paper.");
      setMessageType("danger");
    } finally {
      setAddingPaper(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setMessage("");
    if (!allocation || !selectedExam) return;
    setSaving(true);
    try {
      let totalSaved = 0;
      let totalErrors = 0;
      // one bulk_entry call per paper column — the backend stores one
      // ExamResult row per (exam, enrollment, subject, paper)
      for (const col of paperColumns) {
        const rows = enrollments.map((en) => {
          const cell = marks[en.id]?.[col.key] || {};
          return {
            enrollment_id: en.id,
            marks_obtained: cell.is_absent
              ? null
              : (cell.marks_obtained === "" || cell.marks_obtained == null ? null : Number(cell.marks_obtained)),
            is_absent: !!cell.is_absent,
          };
        });
        const { data } = await examsApi.bulkEntry({
          exam_id: Number(selectedExam),
          subject_id: allocation.subject,
          paper_id: col.id,
          max_marks: Number(col.max_marks),
          rows,
        });
        totalSaved += data.saved.length;
        totalErrors += data.errors.length;
      }
      setMessage(` Saved ${totalSaved} mark(s).${totalErrors ? ` ${totalErrors} error(s).` : ""}`);
      setMessageType(totalErrors ? "warning" : "success");
    } catch (err) {
      setMessage(err.response?.data?.detail || "Could not save marks.");
      setMessageType("danger");
    } finally {
      setSaving(false);
    }
  };

  const getMarksCount = () => {
    let count = 0;
    enrollments.forEach((en) => {
      paperColumns.forEach((col) => {
        const cell = marks[en.id]?.[col.key];
        if (cell && (cell.is_absent || (cell.marks_obtained !== "" && cell.marks_obtained != null))) count++;
      });
    });
    return count;
  };

  const totalStudents = enrollments.length;
  const totalCells = totalStudents * paperColumns.length;

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: "Dashboard", href: "/teacher" },
        { label: "Marks", href: "/teacher/marks" },
        { label: "Enter Marks", href: "#" },
      ]} />

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Enter Marks</h1>
          <p className="page-subtitle">
            Pick one of your allocated classes, then choose from the exams already set up for that
            grade this academic year — key in the whole class at once.
          </p>
        </div>
      </div>

      {/* Messages */}
      {message && (
        <div className={`alert alert-${messageType} alert-dismissible fade show`} role="alert">
          {message}
          <button type="button" className="btn-close" onClick={() => setMessage("")}></button>
        </div>
      )}

      {/* Selection Form */}
      <div className="card p-4 mb-4">
        <h6 className="mb-3" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
          <i className="bi bi-pencil-square me-2" style={{ color: "var(--blue-700)" }}></i>
          Select Class & Exam
        </h6>
        <div className="row g-3">
          <div className="col-md-5">
            <label className="form-label">
              <i className="bi bi-door-open me-1" style={{ color: "var(--blue-700)" }}></i>
              Class & Subject
            </label>
            <select 
              className="form-select" 
              value={selectedAllocation} 
              onChange={(e) => setSelectedAllocation(e.target.value)}
            >
              <option value="">Select...</option>
              {allocations.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.subject_name} — {a.classroom_label}
                </option>
              ))}
            </select>
            {allocations.length === 0 && !loading && (
              <div className="form-text-hint">
                <i className="bi bi-info-circle me-1"></i>
                You have no allocated classes yet.
              </div>
            )}
          </div>
          <div className="col-md-4">
            <label className="form-label">
              <i className="bi bi-clipboard me-1" style={{ color: "var(--blue-700)" }}></i>
              Exam
            </label>
            <select 
              className="form-select" 
              value={selectedExam} 
              onChange={(e) => setSelectedExam(e.target.value)}
              disabled={!allocation || examsLoading}
            >
              <option value="">
                {!allocation ? "Pick a class first..." : examsLoading ? "Loading exams..." : "Select..."}
              </option>
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name} ({ex.exam_type_name}){!ex.is_published ? " — unpublished" : ""}
                </option>
              ))}
            </select>
            {allocation && !examsLoading && exams.length === 0 && (
              <div className="form-text-hint">
                <i className="bi bi-info-circle me-1"></i>
                No exams set up yet for this grade this academic year.
              </div>
            )}
          </div>
          <div className="col-md-3">
            <label className="form-label">
              <i className="bi bi-123 me-1" style={{ color: "var(--blue-700)" }}></i>
              Max Marks
            </label>
            <input 
              type="number" 
              className="form-control" 
              value={maxMarks} 
              onChange={(e) => setMaxMarks(e.target.value)}
              min="1"
              disabled={paperColumns.length > 1 || paperColumns[0]?.id !== null}
              title={paperColumns[0]?.id !== null ? "This subject has its own paper max-marks configured below" : ""}
            />
          </div>
        </div>
      </div>

      {/* Mark Entry Table */}
      {selectedAllocation && selectedExam && (
        <>
          {loading ? (
            <div className="table-wrap">
              <div className="table-wrap__header">
                <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                  <i className="bi bi-person-lines-fill me-2"></i>
                  Students
                </span>
                <span className="skeleton skeleton-text" style={{ width: "100px" }}></span>
              </div>
              <div className="table-responsive">
                <table className="table mb-0">
                  <thead>
                    <tr>
                      <th><div className="skeleton skeleton-text" style={{ width: "80px" }}></div></th>
                      <th><div className="skeleton skeleton-text" style={{ width: "120px" }}></div></th>
                      <th><div className="skeleton skeleton-text" style={{ width: "100px" }}></div></th>
                      <th><div className="skeleton skeleton-text" style={{ width: "80px" }}></div></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <tr key={i}>
                        <td><div className="skeleton skeleton-text" style={{ width: "60px" }}></div></td>
                        <td><div className="skeleton skeleton-text" style={{ width: "100px" }}></div></td>
                        <td><div className="skeleton skeleton-text" style={{ width: "80px" }}></div></td>
                        <td><div className="skeleton skeleton-text" style={{ width: "40px" }}></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : enrollments.length === 0 ? (
            <div className="table-wrap">
              <div className="empty-state">
                <i className="bi bi-person-x"></i>
                <h6>No students found</h6>
                <p className="text-muted-soft">
                  This class has no active students enrolled.
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={submit}>
              <div className="table-wrap">
                <div className="table-wrap__header">
                  <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                    <i className="bi bi-person-lines-fill me-2"></i>
                    Students
                    <span className="badge badge-neutral ms-2">{totalStudents}</span>
                  </span>
                  <div className="d-flex align-items-center gap-3">
                    <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
                      {marksLoading ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                          Loading saved marks...
                        </>
                      ) : (
                        <>
                          <i className="bi bi-check-circle me-1" style={{ color: "var(--success-600)" }}></i>
                          {getMarksCount()} of {totalCells} entered
                        </>
                      )}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary"
                      onClick={addPaperColumn}
                      disabled={addingPaper || !subject}
                      title="Add another paper for this subject (e.g. Paper 2, Paper 3)"
                    >
                      {addingPaper ? (
                        <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                      ) : (
                        <i className="bi bi-plus-lg me-1"></i>
                      )}
                      Add Paper
                    </button>
                  </div>
                </div>
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead>
                      <tr>
                        <th style={{ width: "120px" }}>Admission No</th>
                        <th>Student</th>
                        {paperColumns.map((col) => (
                          <th key={col.key} style={{ minWidth: "170px" }}>
                            {col.label}{col.id !== null ? ` (out of ${col.max_marks})` : ""}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {enrollments.map((en) => (
                        <tr key={en.id}>
                          <td>
                            <span style={{ fontWeight: 600, color: "var(--blue-700)", fontSize: "var(--fs-sm)" }}>
                              {en.admission_no}
                            </span>
                          </td>
                          <td>
                            <div className="table-avatar-cell">
                              <div className="avatar-sm">
                                {en.student_name?.split(' ').map(n => n[0]).join('') || 'S'}
                              </div>
                              <span className="cell-name">{en.student_name}</span>
                            </div>
                          </td>
                          {paperColumns.map((col) => {
                            const cell = marks[en.id]?.[col.key] || { marks_obtained: "", is_absent: false };
                            return (
                              <td key={col.key}>
                                <div className="d-flex align-items-center gap-2">
                                  <input
                                    type="number"
                                    className="form-control form-control-sm"
                                    min="0"
                                    max={col.max_marks}
                                    disabled={cell.is_absent}
                                    value={cell.marks_obtained}
                                    onChange={(e) => updateMark(en.id, col.key, "marks_obtained", e.target.value)}
                                    style={{ maxWidth: "90px" }}
                                    placeholder={`0-${col.max_marks}`}
                                  />
                                  <div className="form-check d-flex align-items-center gap-1" style={{ paddingLeft: "0" }}>
                                    <input
                                      type="checkbox"
                                      className="form-check-input"
                                      id={`absent-${en.id}-${col.key}`}
                                      checked={cell.is_absent}
                                      onChange={(e) => updateMark(en.id, col.key, "is_absent", e.target.checked)}
                                      style={{ marginLeft: "0" }}
                                    />
                                    <label className="form-check-label" htmlFor={`absent-${en.id}-${col.key}`} style={{ fontSize: "var(--fs-xs)" }}>
                                      Abs
                                    </label>
                                  </div>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-3 d-flex gap-2">
                <button 
                  className="btn btn-success" 
                  type="submit" 
                  disabled={!selectedExam || saving || loading}
                >
                  {saving ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      Saving...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-check2 me-2"></i>
                      Save Marks
                    </>
                  )}
                </button>
                {getMarksCount() > 0 && (
                  <span className="badge badge-success d-flex align-items-center" style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem" }}>
                    <i className="bi bi-check-circle me-1"></i>
                    {getMarksCount()} marks ready to save
                  </span>
                )}
              </div>
            </form>
          )}
        </>
      )}

      {/* Helpful Info */}
      {selectedAllocation && selectedExam && enrollments.length > 0 && (
        <div className="card mt-3" style={{ background: "var(--bg-app)" }}>
          <div className="card-body" style={{ padding: "0.75rem 1rem" }}>
            <div className="d-flex flex-wrap gap-3" style={{ fontSize: "var(--fs-sm)", color: "var(--ink-600)" }}>
              <span>
                <i className="bi bi-info-circle me-1" style={{ color: "var(--blue-700)" }}></i>
                <strong>{allocation?.subject_name}</strong> — {allocation?.classroom_label}
              </span>
              <span>
                <i className="bi bi-clipboard me-1" style={{ color: "var(--blue-700)" }}></i>
                <strong>{exams.find(e => String(e.id) === selectedExam)?.name}</strong>
              </span>
              <span>
                <i className="bi bi-file-earmark-text me-1" style={{ color: "var(--blue-700)" }}></i>
                Papers: <strong>{paperColumns.length}</strong>
              </span>
              <span>
                <i className="bi bi-people me-1" style={{ color: "var(--blue-700)" }}></i>
                Students: <strong>{totalStudents}</strong>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}