import { useEffect, useMemo, useState } from "react";
import { communicationApi, calendarApi, academicsApi, studentsApi } from "../services/api";
import Breadcrumb from "../components/Breadcrumb";

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Administrators", icon: "bi-shield-lock" },
  { value: "TEACHER", label: "Teachers", icon: "bi-person-workspace" },
  { value: "STUDENT", label: "Students", icon: "bi-person" },
  { value: "PARENT", label: "Parents/Guardians", icon: "bi-people" },
  { value: "FINANCE", label: "Finance Officers", icon: "bi-cash-stack" },
];

const CATEGORY_OPTIONS = [
  { value: "GENERAL", label: "General Announcement", icon: "bi-megaphone", badge: "badge-blue" },
  { value: "EVENT", label: "Event / Visiting Day", icon: "bi-calendar-event", badge: "badge-gold" },
  { value: "CLOSING", label: "School Closing", icon: "bi-door-closed", badge: "badge-neutral" },
  { value: "FEE_REMINDER", label: "Fee Balance Reminder", icon: "bi-cash-coin", badge: "badge-danger" },
  { value: "ACADEMIC", label: "Academic", icon: "bi-book", badge: "badge-success" },
];

const AUDIENCE_OPTIONS = [
  { value: "ROLE", label: "By Role", icon: "bi-people" },
  { value: "GRADE", label: "By Grade / Year", icon: "bi-book" },
  { value: "CLASSROOM", label: "By Classroom", icon: "bi-door-open" },
  { value: "INDIVIDUAL", label: "Specific Students", icon: "bi-person" },
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
  const [targetStudents, setTargetStudents] = useState([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentResults, setStudentResults] = useState([]);
  const [searchingStudents, setSearchingStudents] = useState(false);

  const [academicYears, setAcademicYears] = useState([]);
  const [gradeLevels, setGradeLevels] = useState([]);
  const [classrooms, setClassrooms] = useState([]);

  const [log, setLog] = useState([]);
  const [loadingLog, setLoadingLog] = useState(true);
  const [message, setMessage] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    calendarApi.academicYears().then(({ data }) => setAcademicYears(data.results ?? data));
    academicsApi.gradeLevels().then(({ data }) => setGradeLevels(data.results ?? data));
    academicsApi.classrooms().then(({ data }) => setClassrooms(data.results ?? data));
    loadLog();
  }, []);

  const loadLog = async () => {
    setLoadingLog(true);
    try {
      const { data } = await communicationApi.list();
      setLog(data.results ?? data);
    } catch (error) {
      console.error("Failed to load communications:", error);
    } finally {
      setLoadingLog(false);
    }
  };

  // debounced student search
  useEffect(() => {
    if (!studentSearch.trim()) {
      setStudentResults([]);
      return;
    }
    setSearchingStudents(true);
    const t = setTimeout(() => {
      studentsApi.list({ search: studentSearch })
        .then(({ data }) => setStudentResults(data.results ?? data))
        .finally(() => setSearchingStudents(false));
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
      setMessage({ type: "success", text: "✅ Communication sent successfully." });
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
    if (comm.send_in_app) badges.push({ label: "In-App", icon: "bi-bell", className: "badge-blue" });
    if (comm.send_sms) badges.push({ label: "SMS", icon: "bi-phone", className: "badge-success" });
    if (comm.send_email) badges.push({ label: "Email", icon: "bi-envelope", className: "badge-gold" });
    return badges;
  };

  const getCategoryBadge = (categoryValue) => {
    const cat = CATEGORY_OPTIONS.find((o) => o.value === categoryValue);
    return cat || CATEGORY_OPTIONS[0];
  };

  const getAudienceLabel = (c) => {
    if (c.audience_type === "ROLE") return (c.target_roles || []).join(", ") || "-";
    if (c.audience_type === "GRADE") return `${c.grade_level_name || ""} ${c.academic_year_year || ""}`.trim() || "-";
    if (c.audience_type === "CLASSROOM") return c.classroom_label || "-";
    if (c.audience_type === "INDIVIDUAL") return "Specific students";
    return "-";
  };

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: "Dashboard", href: "/admin" },
        { label: "Communications", href: "/admin/communications" },
        { label: "Send Message", href: "#" },
      ]} />

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Communications</h1>
          <p className="page-subtitle">
            Send announcements to a role, a whole grade, a specific class, or hand-picked students.
          </p>
        </div>
      </div>

      {/* Messages */}
      {message && (
        <div className={`alert alert-${message.type} alert-dismissible fade show`} role="alert">
          {message.text}
          <button type="button" className="btn-close" onClick={() => setMessage(null)}></button>
        </div>
      )}

      {/* Compose Form */}
      <div className="card p-4 mb-4">
        <h6 className="mb-3" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
          <i className="bi bi-megaphone me-2" style={{ color: "var(--blue-700)" }}></i>
          Compose New Communication
        </h6>
        <form onSubmit={submit}>
          <div className="row g-3 mb-3">
            <div className="col-md-8">
              <label className="form-label">
                <i className="bi bi-chat-left-text me-1" style={{ color: "var(--blue-700)" }}></i>
                Subject
              </label>
              <input
                className="form-control"
                required
                placeholder="Enter the subject of your message"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label">
                <i className="bi bi-tag me-1" style={{ color: "var(--blue-700)" }}></i>
                Category
              </label>
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
            <label className="form-label">
              <i className="bi bi-pencil me-1" style={{ color: "var(--blue-700)" }}></i>
              Message
            </label>
            <textarea
              className="form-control"
              rows={4}
              required
              placeholder="Type your message here..."
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
            {form.category === "FEE_REMINDER" && (
              <div className="form-text-hint">
                <i className="bi bi-info-circle me-1"></i>
                Each guardian/student will automatically see their own current outstanding balance appended below this
                message.
              </div>
            )}
          </div>

          <label className="form-label">
            <i className="bi bi-people me-1" style={{ color: "var(--blue-700)" }}></i>
            Audience
          </label>
          <div className="d-flex flex-wrap gap-2 mb-3">
            {AUDIENCE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`btn ${form.audience_type === opt.value ? "btn-primary" : "btn-outline-primary"}`}
                onClick={() => setForm({ ...form, audience_type: opt.value })}
              >
                <i className={`bi ${opt.icon} me-1`}></i>
                {opt.label}
              </button>
            ))}
          </div>

          {form.audience_type === "ROLE" && (
            <div className="mb-3">
              <div className="d-flex flex-wrap gap-3">
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
                      <i className={`bi ${r.icon} me-1`} style={{ color: "var(--ink-400)" }}></i>
                      {r.label}
                    </label>
                  </div>
                ))}
              </div>
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
              <label className="form-label">
                <i className="bi bi-person-plus me-1" style={{ color: "var(--blue-700)" }}></i>
                Students
              </label>
              <div style={{ position: "relative", marginBottom: "0.5rem" }}>
                <i className="bi bi-search" style={{
                  position: "absolute",
                  left: "0.85rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--ink-400)",
                }}></i>
                <input
                  className="form-control"
                  placeholder="Search by admission no. or name..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  style={{ paddingLeft: "2.4rem" }}
                />
              </div>

              {searchingStudents && (
                <div className="text-center py-3">
                  <div className="spinner-border spinner-border-sm text-primary" role="status"></div>
                </div>
              )}

              {!searchingStudents && studentResults.length > 0 && (
                <div style={{
                  maxHeight: "200px",
                  overflowY: "auto",
                  border: "1px solid var(--border-color)",
                  borderRadius: "var(--radius-md)",
                  marginBottom: "0.75rem",
                }}>
                  {studentResults.map((s) => (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => addStudent(s)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        width: "100%",
                        padding: "0.6rem 1rem",
                        border: "none",
                        borderBottom: "1px solid var(--border-color)",
                        background: "transparent",
                        textAlign: "left",
                        cursor: "pointer",
                        transition: "background 0.15s ease",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-app)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      <div className="avatar-sm" style={{ flexShrink: 0 }}>
                        {s.full_name?.split(' ').map(n => n[0]).join('') || 'S'}
                      </div>
                      <div>
                        <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-900)" }}>
                          {s.full_name}
                        </div>
                        <div style={{ fontSize: "var(--fs-xs)", color: "var(--blue-700)" }}>
                          <i className="bi bi-hash me-1"></i>
                          {s.admission_no}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {targetStudents.length > 0 && (
                <div className="d-flex flex-wrap gap-2">
                  {targetStudents.map((s) => (
                    <span key={s.id} className="filter-chip" style={{ padding: "0.4rem 0.6rem", fontSize: "var(--fs-sm)" }}>
                      <span style={{ fontWeight: 600 }}>{s.admission_no}</span>
                      <span style={{ marginLeft: "0.25rem" }}>{s.full_name}</span>
                      <button onClick={() => removeStudent(s.id)}>
                        <i className="bi bi-x"></i>
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {targetStudents.length === 0 && !studentSearch && (
                <div className="form-text-hint">
                  <i className="bi bi-info-circle me-1"></i>
                  Search and select students to send this message to.
                </div>
              )}
            </div>
          )}

          <div className="row g-3 mb-3">
            <div className="col-md-6">
              <label className="form-label d-block">
                <i className="bi bi-send me-1" style={{ color: "var(--blue-700)" }}></i>
                Send To
              </label>
              <div className="d-flex gap-3">
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="include_students"
                    checked={form.include_students}
                    onChange={(e) => setForm({ ...form, include_students: e.target.checked })}
                  />
                  <label className="form-check-label" htmlFor="include_students">
                    <i className="bi bi-person me-1" style={{ color: "var(--ink-400)" }}></i>
                    Students
                  </label>
                </div>
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="include_guardians"
                    checked={form.include_guardians}
                    onChange={(e) => setForm({ ...form, include_guardians: e.target.checked })}
                  />
                  <label className="form-check-label" htmlFor="include_guardians">
                    <i className="bi bi-people me-1" style={{ color: "var(--ink-400)" }}></i>
                    Parents/Guardians
                  </label>
                </div>
              </div>
            </div>
            <div className="col-md-6">
              <label className="form-label d-block">
                <i className="bi bi-broadcast me-1" style={{ color: "var(--blue-700)" }}></i>
                Channels
              </label>
              <div className="d-flex gap-3 flex-wrap">
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="send_in_app"
                    checked={form.send_in_app}
                    onChange={(e) => setForm({ ...form, send_in_app: e.target.checked })}
                  />
                  <label className="form-check-label" htmlFor="send_in_app">
                    <i className="bi bi-bell me-1" style={{ color: "var(--ink-400)" }}></i>
                    In-App
                  </label>
                </div>
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="send_sms"
                    checked={form.send_sms}
                    onChange={(e) => setForm({ ...form, send_sms: e.target.checked })}
                  />
                  <label className="form-check-label" htmlFor="send_sms">
                    <i className="bi bi-phone me-1" style={{ color: "var(--ink-400)" }}></i>
                    SMS
                  </label>
                </div>
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="send_email"
                    checked={form.send_email}
                    onChange={(e) => setForm({ ...form, send_email: e.target.checked })}
                  />
                  <label className="form-check-label" htmlFor="send_email">
                    <i className="bi bi-envelope me-1" style={{ color: "var(--ink-400)" }}></i>
                    Email
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className="d-flex gap-2 mt-3">
            <button className="btn btn-primary" disabled={sending} type="submit">
              {sending ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  Sending...
                </>
              ) : (
                <>
                  <i className="bi bi-send me-2"></i>
                  Send Communication
                </>
              )}
            </button>
            <button className="btn btn-secondary" type="button" onClick={resetForm}>
              <i className="bi bi-arrow-counterclockwise me-2"></i>
              Reset
            </button>
          </div>
        </form>
      </div>

      {/* Sent Communications Log */}
      <div className="table-wrap">
        <div className="table-wrap__header">
          <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
            <i className="bi bi-clock-history me-2" style={{ color: "var(--blue-700)" }}></i>
            Sent Communications
          </span>
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
            {log.length} communication{log.length !== 1 ? "s" : ""}
          </span>
        </div>

        {loadingLog ? (
          <div style={{ padding: "1.5rem" }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton skeleton-text" style={{ height: 18, marginBottom: 14 }} />
            ))}
          </div>
        ) : log.length === 0 ? (
          <div className="empty-state">
            <i className="bi bi-megaphone"></i>
            <h6>No communications sent yet</h6>
            <p className="text-muted-soft">Your sent communications will appear here.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover mb-0">
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
                {log.map((c) => {
                  const category = getCategoryBadge(c.category);
                  const channels = channelBadges(c);
                  return (
                    <tr key={c.id}>
                      <td style={{ fontSize: "var(--fs-sm)", color: "var(--ink-600)" }}>
                        {new Date(c.created_at).toLocaleString('en-KE', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                          {c.subject}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${category.badge}`}>
                          <i className={`bi ${category.icon} me-1`}></i>
                          {category.label}
                        </span>
                      </td>
                      <td>{getAudienceLabel(c)}</td>
                      <td>
                        <div className="d-flex flex-wrap gap-1">
                          {channels.map((ch, idx) => (
                            <span key={idx} className={`badge ${ch.className}`}>
                              <i className={`bi ${ch.icon} me-1`}></i>
                              {ch.label}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="text-end">
                        <span className="badge badge-neutral">
                          <i className="bi bi-people me-1"></i>
                          {c.recipient_count}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}