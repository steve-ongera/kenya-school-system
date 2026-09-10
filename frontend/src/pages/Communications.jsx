import { useEffect, useMemo, useState } from "react";
import { communicationApi, calendarApi, academicsApi, studentsApi } from "../services/api";

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Administrators" },
  { value: "TEACHER", label: "Teachers" },
  { value: "STUDENT", label: "Students" },
  { value: "PARENT", label: "Parents/Guardians" },
  { value: "FINANCE", label: "Finance Officers" },
];

const CATEGORY_OPTIONS = [
  { value: "GENERAL", label: "General Announcement" },
  { value: "EVENT", label: "Event / Visiting Day" },
  { value: "CLOSING", label: "School Closing" },
  { value: "FEE_REMINDER", label: "Fee Balance Reminder" },
  { value: "ACADEMIC", label: "Academic" },
];

const emptyForm = {
  subject: "",
  body: "",
  category: "GENERAL",
  audience_type: "ROLE",
  target_roles: [],
  academic_year_id: "",
  grade_level_id: "",
  classroom_id: "",
  include_students: true,
  include_guardians: false,
  send_in_app: true,
  send_sms: false,
  send_email: false,
};

export default function Communications() {
  const [form, setForm] = useState(emptyForm);
  const [targetStudents, setTargetStudents] = useState([]); // for INDIVIDUAL audience
  const [studentSearch, setStudentSearch] = useState("");
  const [studentResults, setStudentResults] = useState([]);

  const [academicYears, setAcademicYears] = useState([]);
  const [gradeLevels, setGradeLevels] = useState([]);
  const [classrooms, setClassrooms] = useState([]);

  const [log, setLog] = useState([]);
  const [message, setMessage] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    calendarApi.academicYears().then(({ data }) => setAcademicYears(data.results ?? data));
    academicsApi.gradeLevels().then(({ data }) => setGradeLevels(data.results ?? data));
    academicsApi.classrooms().then(({ data }) => setClassrooms(data.results ?? data));
    loadLog();
  }, []);

  const loadLog = async () => {
    const { data } = await communicationApi.list();
    setLog(data.results ?? data);
  };

  // debounced student search for INDIVIDUAL audience
  useEffect(() => {
    if (!studentSearch.trim()) {
      setStudentResults([]);
      return;
    }
    const t = setTimeout(() => {
      studentsApi.list({ search: studentSearch }).then(({ data }) => setStudentResults(data.results ?? data));
    }, 350);
    return () => clearTimeout(t);
  }, [studentSearch]);

  const toggleRole = (role) => {
    setForm((f) => ({
      ...f,
      target_roles: f.target_roles.includes(role)
        ? f.target_roles.filter((r) => r !== role)
        : [...f.target_roles, role],
    }));
  };

  const addStudent = (student) => {
    if (!targetStudents.some((s) => s.id === student.id)) {
      setTargetStudents((prev) => [...prev, student]);
    }
    setStudentSearch("");
    setStudentResults([]);
  };
  const removeStudent = (id) => setTargetStudents((prev) => prev.filter((s) => s.id !== id));

  const resetForm = () => {
    setForm(emptyForm);
    setTargetStudents([]);
  };

  const submit = async (e) => {
    e.preventDefault();
    setMessage(null);

    const payload = {
      ...form,
      academic_year_id: form.academic_year_id || null,
      grade_level_id: form.audience_type === "GRADE" ? form.grade_level_id || null : null,
      classroom_id: form.audience_type === "CLASSROOM" ? form.classroom_id || null : null,
      target_student_ids: form.audience_type === "INDIVIDUAL" ? targetStudents.map((s) => s.id) : [],
    };

    setSending(true);
    try {
      await communicationApi.send(payload);
      setMessage({ type: "success", text: "Sent." });
      resetForm();
      loadLog();
    } catch (err) {
      const data = err.response?.data;
      const text = Array.isArray(data) ? data[0] : data?.detail || (typeof data === "object" ? JSON.stringify(data) : "Could not send.");
      setMessage({ type: "danger", text });
    } finally {
      setSending(false);
    }
  };

  const channelBadges = (comm) => {
    const badges = [];
    if (comm.send_in_app) badges.push("In-App");
    if (comm.send_sms) badges.push("SMS");
    if (comm.send_email) badges.push("Email");
    return badges.join(" + ");
  };

  return (
    <div>
      <h2 className="page-title">Communications</h2>
      <p className="text-muted">Send announcements to a role, a whole grade, a specific class, or hand-picked students.</p>

      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      <form className="card p-3 mb-4" onSubmit={submit}>
        <div className="row g-3 mb-3">
          <div className="col-md-8">
            <label className="form-label">Subject</label>
            <input
              className="form-control"
              required
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
            />
          </div>
          <div className="col-md-4">
            <label className="form-label">Category</label>
            <select
              className="form-select"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-3">
          <label className="form-label">Message</label>
          <textarea
            className="form-control"
            rows={4}
            required
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
          />
          {form.category === "FEE_REMINDER" && (
            <div className="form-text">
              Each guardian/student will automatically see their own current outstanding balance appended below this
              message.
            </div>
          )}
        </div>

        <label className="form-label">Audience</label>
        <div className="btn-group mb-3 d-flex" role="group">
          {["ROLE", "GRADE", "CLASSROOM", "INDIVIDUAL"].map((type) => (
            <button
              key={type}
              type="button"
              className={`btn ${form.audience_type === type ? "btn-primary" : "btn-outline-primary"}`}
              onClick={() => setForm({ ...form, audience_type: type })}
            >
              {type === "ROLE" && "By Role"}
              {type === "GRADE" && "By Grade / Year"}
              {type === "CLASSROOM" && "By Classroom"}
              {type === "INDIVIDUAL" && "Specific Students"}
            </button>
          ))}
        </div>

        {form.audience_type === "ROLE" && (
          <div className="mb-3 d-flex flex-wrap gap-3">
            {ROLE_OPTIONS.map((r) => (
              <div className="form-check" key={r.value}>
                <input
                  className="form-check-input"
                  type="checkbox"
                  id={`role-${r.value}`}
                  checked={form.target_roles.includes(r.value)}
                  onChange={() => toggleRole(r.value)}
                />
                <label className="form-check-label" htmlFor={`role-${r.value}`}>
                  {r.label}
                </label>
              </div>
            ))}
          </div>
        )}

        {form.audience_type === "GRADE" && (
          <div className="row g-3 mb-3">
            <div className="col-md-6">
              <label className="form-label">Academic Year</label>
              <select
                className="form-select"
                value={form.academic_year_id}
                onChange={(e) => setForm({ ...form, academic_year_id: e.target.value })}
              >
                <option value="">Any year</option>
                {academicYears.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.year}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label">Grade</label>
              <select
                className="form-select"
                required
                value={form.grade_level_id}
                onChange={(e) => setForm({ ...form, grade_level_id: e.target.value })}
              >
                <option value="">Select...</option>
                {gradeLevels.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {form.audience_type === "CLASSROOM" && (
          <div className="mb-3">
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
                  {c.grade_level_name} {c.stream_name} ({c.academic_year_year})
                </option>
              ))}
            </select>
          </div>
        )}

        {form.audience_type === "INDIVIDUAL" && (
          <div className="mb-3">
            <label className="form-label">Students</label>
            <input
              className="form-control mb-2"
              placeholder="Search by admission no. or name..."
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
            />
            {studentResults.length > 0 && (
              <div className="list-group mb-2">
                {studentResults.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    className="list-group-item list-group-item-action"
                    onClick={() => addStudent(s)}
                  >
                    {s.admission_no} - {s.full_name}
                  </button>
                ))}
              </div>
            )}
            <div className="d-flex flex-wrap gap-2">
              {targetStudents.map((s) => (
                <span key={s.id} className="badge bg-secondary">
                  {s.admission_no} - {s.full_name}{" "}
                  <button
                    type="button"
                    className="btn-close btn-close-white btn-sm ms-1"
                    style={{ fontSize: "0.6rem" }}
                    onClick={() => removeStudent(s.id)}
                  />
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="row g-3 mb-3">
          <div className="col-md-6">
            <label className="form-label d-block">Send To</label>
            <div className="form-check form-check-inline">
              <input
                className="form-check-input"
                type="checkbox"
                id="include_students"
                checked={form.include_students}
                onChange={(e) => setForm({ ...form, include_students: e.target.checked })}
              />
              <label className="form-check-label" htmlFor="include_students">
                Students
              </label>
            </div>
            <div className="form-check form-check-inline">
              <input
                className="form-check-input"
                type="checkbox"
                id="include_guardians"
                checked={form.include_guardians}
                onChange={(e) => setForm({ ...form, include_guardians: e.target.checked })}
              />
              <label className="form-check-label" htmlFor="include_guardians">
                Parents/Guardians
              </label>
            </div>
          </div>
          <div className="col-md-6">
            <label className="form-label d-block">Channels</label>
            <div className="form-check form-check-inline">
              <input
                className="form-check-input"
                type="checkbox"
                id="send_in_app"
                checked={form.send_in_app}
                onChange={(e) => setForm({ ...form, send_in_app: e.target.checked })}
              />
              <label className="form-check-label" htmlFor="send_in_app">
                In-App
              </label>
            </div>
            <div className="form-check form-check-inline">
              <input
                className="form-check-input"
                type="checkbox"
                id="send_sms"
                checked={form.send_sms}
                onChange={(e) => setForm({ ...form, send_sms: e.target.checked })}
              />
              <label className="form-check-label" htmlFor="send_sms">
                SMS
              </label>
            </div>
            <div className="form-check form-check-inline">
              <input
                className="form-check-input"
                type="checkbox"
                id="send_email"
                checked={form.send_email}
                onChange={(e) => setForm({ ...form, send_email: e.target.checked })}
              />
              <label className="form-check-label" htmlFor="send_email">
                Email
              </label>
            </div>
          </div>
        </div>

        <button className="btn btn-primary" disabled={sending}>
          {sending ? "Sending..." : "Send Communication"}
        </button>
      </form>

      <div className="card">
        <div className="card-body">
          <h5 className="card-title">Sent Communications</h5>
          <div className="table-responsive">
            <table className="table table-hover align-middle">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Subject</th>
                  <th>Category</th>
                  <th>Audience</th>
                  <th>Channels</th>
                  <th className="text-end">Recipients</th>
                </tr>
              </thead>
              <tbody>
                {log.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-muted py-3">
                      No communications sent yet.
                    </td>
                  </tr>
                )}
                {log.map((c) => (
                  <tr key={c.id}>
                    <td>{new Date(c.created_at).toLocaleString()}</td>
                    <td>{c.subject}</td>
                    <td>{CATEGORY_OPTIONS.find((o) => o.value === c.category)?.label || c.category}</td>
                    <td>
                      {c.audience_type === "ROLE" && (c.target_roles || []).join(", ")}
                      {c.audience_type === "GRADE" && `${c.grade_level_name || ""} ${c.academic_year_year || ""}`}
                      {c.audience_type === "CLASSROOM" && c.classroom_label}
                      {c.audience_type === "INDIVIDUAL" && "Specific students"}
                    </td>
                    <td>{channelBadges(c)}</td>
                    <td className="text-end">{c.recipient_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}