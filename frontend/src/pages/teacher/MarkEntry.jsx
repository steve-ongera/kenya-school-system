import { useEffect, useState } from "react";
import { teacherApi, examsApi, studentsApi } from "../../services/api";

export default function TeacherMarkEntry() {
  const [allocations, setAllocations] = useState([]);
  const [exams, setExams] = useState([]);
  const [selectedAllocation, setSelectedAllocation] = useState("");
  const [selectedExam, setSelectedExam] = useState("");
  const [maxMarks, setMaxMarks] = useState(100);
  const [enrollments, setEnrollments] = useState([]);
  const [marks, setMarks] = useState({}); // enrollment_id -> { marks_obtained, is_absent }
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    teacherApi.myAllocations().then(({ data }) => setAllocations(data.results ?? data));
    examsApi.exams().then(({ data }) => setExams(data.results ?? data));
  }, []);

  const allocation = allocations.find((a) => String(a.id) === String(selectedAllocation));

  useEffect(() => {
    if (!allocation) { setEnrollments([]); return; }
    studentsApi.enrollments({ classroom: allocation.classroom, status: "ACTIVE" }).then(({ data }) => {
      const list = data.results ?? data;
      setEnrollments(list);
      const initial = {};
      list.forEach((e) => { initial[e.id] = { marks_obtained: "", is_absent: false }; });
      setMarks(initial);
    });
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
        subject_id: allocation.subject, // note: allocation serializer includes id fields via FK ids
        max_marks: Number(maxMarks),
        rows,
      });
      setMessage(`Saved ${data.saved.length} mark(s).${data.errors.length ? ` ${data.errors.length} error(s).` : ""}`);
    } catch (err) {
      setMessage(err.response?.data?.detail || "Could not save marks.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2 className="page-title">Enter Marks</h2>
      <p className="text-muted">Pick one of your allocated classes and an exam, then key in the whole class at once.</p>
      {message && <div className="alert alert-info">{message}</div>}

      <div className="card p-3 mb-4">
        <div className="row g-3">
          <div className="col-md-5">
            <label className="form-label">Class & Subject</label>
            <select className="form-select" value={selectedAllocation} onChange={(e) => setSelectedAllocation(e.target.value)}>
              <option value="">Select...</option>
              {allocations.map((a) => (
                <option key={a.id} value={a.id}>{a.subject_name} — {a.classroom_label}</option>
              ))}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">Exam</label>
            <select className="form-select" value={selectedExam} onChange={(e) => setSelectedExam(e.target.value)}>
              <option value="">Select...</option>
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>{ex.name} ({ex.exam_type_name})</option>
              ))}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">Max Marks</label>
            <input type="number" className="form-control" value={maxMarks} onChange={(e) => setMaxMarks(e.target.value)} />
          </div>
        </div>
      </div>

      {enrollments.length > 0 && (
        <form onSubmit={submit}>
          <div className="table-responsive card mb-3">
            <table className="table mb-0">
              <thead><tr><th>Admission No</th><th>Student</th><th style={{ width: 160 }}>Marks</th><th style={{ width: 100 }}>Absent</th></tr></thead>
              <tbody>
                {enrollments.map((en) => (
                  <tr key={en.id}>
                    <td>{en.admission_no}</td>
                    <td>{en.student_name}</td>
                    <td>
                      <input type="number" className="form-control form-control-sm" min="0" max={maxMarks}
                        disabled={marks[en.id]?.is_absent}
                        value={marks[en.id]?.marks_obtained ?? ""}
                        onChange={(e) => updateMark(en.id, "marks_obtained", e.target.value)} />
                    </td>
                    <td className="text-center">
                      <input type="checkbox" className="form-check-input"
                        checked={marks[en.id]?.is_absent ?? false}
                        onChange={(e) => updateMark(en.id, "is_absent", e.target.checked)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn btn-success" disabled={!selectedExam || saving}>
            {saving ? "Saving..." : "Save Marks"}
          </button>
        </form>
      )}
    </div>
  );
}