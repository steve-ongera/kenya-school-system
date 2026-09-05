import { useEffect, useState } from "react";
import { teacherApi, examsApi, studentsApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";

export default function TeacherMarkEntry() {
  const [allocations, setAllocations] = useState([]);
  const [exams, setExams] = useState([]);
  const [selectedAllocation, setSelectedAllocation] = useState("");
  const [selectedExam, setSelectedExam] = useState("");
  const [maxMarks, setMaxMarks] = useState(100);
  const [enrollments, setEnrollments] = useState([]);
  const [marks, setMarks] = useState({}); // enrollment_id -> { marks_obtained, is_absent }
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [allocRes, examRes] = await Promise.all([
          teacherApi.myAllocations(),
          examsApi.exams(),
        ]);
        setAllocations(allocRes.data.results ?? allocRes.data);
        setExams(examRes.data.results ?? examRes.data);
      } catch (error) {
        console.error("Failed to load data:", error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const allocation = allocations.find((a) => String(a.id) === String(selectedAllocation));

  useEffect(() => {
    if (!allocation) { setEnrollments([]); return; }
    setLoading(true);
    studentsApi.enrollments({ classroom: allocation.classroom, status: "ACTIVE" }).then(({ data }) => {
      const list = data.results ?? data;
      setEnrollments(list);
      const initial = {};
      list.forEach((e) => { initial[e.id] = { marks_obtained: "", is_absent: false }; });
      setMarks(initial);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [selectedAllocation]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateMark = (enrollmentId, field, value) => {
    setMarks((prev) => ({ ...prev, [enrollmentId]: { ...prev[enrollmentId], [field]: value } }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setMessage("");
    if (!allocation || !selectedExam) return;
    setSaving(true);
    const rows = Object.entries(marks).map(([enrollment_id, m]) => ({
      enrollment_id: Number(enrollment_id),
      marks_obtained: m.is_absent ? null : (m.marks_obtained === "" ? null : Number(m.marks_obtained)),
      is_absent: m.is_absent,
    }));
    try {
      const { data } = await examsApi.bulkEntry({
        exam_id: Number(selectedExam),
        subject_id: allocation.subject,
        max_marks: Number(maxMarks),
        rows,
      });
      setMessage(` Saved ${data.saved.length} mark(s).${data.errors.length ? ` ${data.errors.length} error(s).` : ""}`);
      setMessageType(data.errors.length ? "warning" : "success");
    } catch (err) {
      setMessage(err.response?.data?.detail || "Could not save marks.");
      setMessageType("danger");
    } finally {
      setSaving(false);
    }
  };

  // Get count of students with marks entered
  const getMarksCount = () => {
    const entered = Object.values(marks).filter(m => m.marks_obtained !== "" && !m.is_absent);
    return entered.length;
  };

  const totalStudents = enrollments.length;

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
            Pick one of your allocated classes and an exam, then key in the whole class at once.
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
            >
              <option value="">Select...</option>
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name} ({ex.exam_type_name})
                </option>
              ))}
            </select>
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
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
                    <i className="bi bi-check-circle me-1" style={{ color: "var(--success-600)" }}></i>
                    {getMarksCount()} of {totalStudents} entered
                  </span>
                </div>
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead>
                      <tr>
                        <th style={{ width: "120px" }}>Admission No</th>
                        <th>Student</th>
                        <th style={{ width: "200px" }}>Marks</th>
                        <th style={{ width: "100px" }}>Absent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrollments.map((en) => (
                        <tr key={en.id} className={marks[en.id]?.is_absent ? "table-light" : ""}>
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
                          <td>
                            <input 
                              type="number" 
                              className="form-control form-control-sm" 
                              min="0" 
                              max={maxMarks}
                              disabled={marks[en.id]?.is_absent}
                              value={marks[en.id]?.marks_obtained ?? ""}
                              onChange={(e) => updateMark(en.id, "marks_obtained", e.target.value)}
                              style={{ maxWidth: "120px" }}
                              placeholder={`0-${maxMarks}`}
                            />
                          </td>
                          <td>
                            <div className="form-check d-flex align-items-center gap-2" style={{ paddingLeft: "0" }}>
                              <input 
                                type="checkbox" 
                                className="form-check-input" 
                                id={`absent-${en.id}`}
                                checked={marks[en.id]?.is_absent ?? false}
                                onChange={(e) => updateMark(en.id, "is_absent", e.target.checked)}
                                style={{ marginLeft: "0" }}
                              />
                              <label className="form-check-label" htmlFor={`absent-${en.id}`} style={{ fontSize: "var(--fs-sm)" }}>
                                Absent
                              </label>
                            </div>
                          </td>
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
                <i className="bi bi-123 me-1" style={{ color: "var(--blue-700)" }}></i>
                Max: <strong>{maxMarks}</strong>
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