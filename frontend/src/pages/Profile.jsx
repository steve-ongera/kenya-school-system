import { useEffect, useState } from "react";
import { profileApi } from "../services/api";
import Breadcrumb from "../components/Breadcrumb";

const ROLE_LABELS = {
  ADMIN: "Administrator",
  TEACHER: "Teacher",
  STUDENT: "Student",
  PARENT: "Parent/Guardian",
  FINANCE: "Finance Officer",
};

const ROLE_BADGE_COLORS = {
  ADMIN: "badge-danger",
  TEACHER: "badge-blue",
  STUDENT: "badge-success",
  PARENT: "badge-gold",
  FINANCE: "badge-neutral",
};

const ROLE_ICONS = {
  ADMIN: "bi-shield-lock",
  TEACHER: "bi-person-workspace",
  STUDENT: "bi-person",
  PARENT: "bi-people",
  FINANCE: "bi-cash-stack",
};

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({
    email: "", phone_number: "", national_id: "", gender: "", date_of_birth: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await profileApi.me();
      setProfile(data);
      setForm({
        email: data.email || "",
        phone_number: data.phone_number || "",
        national_id: data.national_id || "",
        gender: data.student_profile?.gender || "",
        date_of_birth: data.student_profile?.date_of_birth || "",
      });
    } catch (error) {
      console.error("Failed to load profile:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");
    setSaving(true);
    const payload = {
      email: form.email,
      phone_number: form.phone_number,
      national_id: form.national_id,
    };
    if (profile?.student_profile) {
      payload.gender = form.gender;
      payload.date_of_birth = form.date_of_birth || null;
    }
    try {
      const { data } = await profileApi.update(payload);
      setProfile(data);
      setMessage(" Profile updated successfully.");
    } catch (err) {
      const detail = err.response?.data;
      setError(typeof detail === "object" ? Object.values(detail).flat().join(" ") : "Could not update profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div>
        <Breadcrumb items={[
          { label: "Dashboard", href: "/" },
          { label: "Profile", href: "#" },
        ]} />
        <div className="page-header">
          <div>
            <h1 className="page-title">My Profile</h1>
            <p className="page-subtitle">Loading...</p>
          </div>
        </div>
        <div className="row g-4">
          <div className="col-md-5">
            <div className="card p-3">
              <div className="skeleton skeleton-text" style={{ width: "150px", height: "20px", marginBottom: "1rem" }}></div>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} style={{ display: "flex", marginBottom: "0.5rem" }}>
                  <div className="skeleton skeleton-text" style={{ width: "80px", height: "16px", marginRight: "1rem" }}></div>
                  <div className="skeleton skeleton-text" style={{ width: "120px", height: "16px" }}></div>
                </div>
              ))}
            </div>
          </div>
          <div className="col-md-7">
            <div className="card p-3">
              <div className="skeleton skeleton-text" style={{ width: "180px", height: "20px", marginBottom: "1rem" }}></div>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} style={{ marginBottom: "1rem" }}>
                  <div className="skeleton skeleton-text" style={{ width: "80px", height: "14px", marginBottom: "0.25rem" }}></div>
                  <div className="skeleton skeleton-text" style={{ width: "100%", height: "38px" }}></div>
                </div>
              ))}
              <div className="skeleton skeleton-text" style={{ width: "120px", height: "40px" }}></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  // Get user initials
  const getInitials = () => {
    return `${profile.first_name?.[0] || ''}${profile.last_name?.[0] || ''}` || "U";
  };

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: "Dashboard", href: "/" },
        { label: "Profile", href: "#" },
      ]} />

      
      {/* Messages */}
      {message && (
        <div className="alert alert-success alert-dismissible fade show" role="alert">
          {message}
          <button type="button" className="btn-close" onClick={() => setMessage("")}></button>
        </div>
      )}
      {error && (
        <div className="alert alert-danger alert-dismissible fade show" role="alert">
          <i className="bi bi-exclamation-circle me-2"></i>
          {error}
          <button type="button" className="btn-close" onClick={() => setError("")}></button>
        </div>
      )}

      <div className="row g-4">
        {/* Read-only Account Info */}
        <div className="col-md-5">
          <div className="card">
            <div className="card-header" style={{
              background: "transparent",
              borderBottom: "1px solid var(--border-color)",
              padding: "1rem 1.25rem",
              fontWeight: 700,
              color: "var(--ink-900)"
            }}>
              <i className="bi bi-person-badge me-2" style={{ color: "var(--blue-700)" }}></i>
              Account Information
            </div>
            <div className="card-body">
              <div className="profile-info-row">
                <span>Full Name</span>
                <span>{profile.first_name} {profile.last_name}</span>
              </div>
              <div className="profile-info-row">
                <span>Username</span>
                <span>{profile.username}</span>
              </div>
              <div className="profile-info-row">
                <span>Role</span>
                <span>
                  <span className={`badge ${ROLE_BADGE_COLORS[profile.role] || "badge-neutral"}`}>
                    <i className={`bi ${ROLE_ICONS[profile.role] || "bi-person"} me-1`}></i>
                    {ROLE_LABELS[profile.role] || profile.role}
                  </span>
                </span>
              </div>
              {profile.student_profile && (
                <>
                  <div className="profile-info-row">
                    <span>Admission No</span>
                    <span style={{ fontWeight: 700, color: "var(--blue-700)" }}>
                      {profile.student_profile.admission_no}
                    </span>
                  </div>
                  <div className="profile-info-row">
                    <span>Curriculum</span>
                    <span>
                      <span className="badge badge-neutral">
                        {profile.student_profile.curriculum_type}
                      </span>
                    </span>
                  </div>
                  {profile.student_profile.current_classroom && (
                    <div className="profile-info-row">
                      <span>Current Class</span>
                      <span>
                        <span className="badge badge-blue">
                          <i className="bi bi-door-open me-1"></i>
                          {profile.student_profile.current_classroom}
                        </span>
                      </span>
                    </div>
                  )}
                </>
              )}
              {profile.email && (
                <div className="profile-info-row">
                  <span>Email</span>
                  <span>{profile.email}</span>
                </div>
              )}
              {profile.phone_number && (
                <div className="profile-info-row">
                  <span>Phone</span>
                  <span>{profile.phone_number}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Editable Form */}
        <div className="col-md-7">
          <div className="card">
            <div className="card-header" style={{
              background: "transparent",
              borderBottom: "1px solid var(--border-color)",
              padding: "1rem 1.25rem",
              fontWeight: 700,
              color: "var(--ink-900)"
            }}>
              <i className="bi bi-pencil-square me-2" style={{ color: "var(--blue-700)" }}></i>
              Edit Profile
            </div>
            <div className="card-body">
              <form onSubmit={submit}>
                <div className="mb-3">
                  <label className="form-label">
                    <i className="bi bi-envelope me-1" style={{ color: "var(--blue-700)" }}></i>
                    Email
                  </label>
                  <input 
                    type="email" 
                    className="form-control" 
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })} 
                    placeholder="your.email@example.com"
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">
                    <i className="bi bi-phone me-1" style={{ color: "var(--blue-700)" }}></i>
                    Phone Number
                  </label>
                  <input 
                    className="form-control" 
                    value={form.phone_number}
                    onChange={(e) => setForm({ ...form, phone_number: e.target.value })} 
                    placeholder="e.g., 0712345678"
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">
                    <i className="bi bi-card-text me-1" style={{ color: "var(--blue-700)" }}></i>
                    National ID
                  </label>
                  <input 
                    className="form-control" 
                    value={form.national_id}
                    onChange={(e) => setForm({ ...form, national_id: e.target.value })} 
                    placeholder="Enter your national ID number"
                  />
                </div>

                {profile.student_profile && (
                  <div className="row g-3 mb-2">
                    <div className="col-md-6">
                      <label className="form-label">
                        <i className="bi bi-gender-ambiguous me-1" style={{ color: "var(--blue-700)" }}></i>
                        Gender
                      </label>
                      <select 
                        className="form-select" 
                        value={form.gender}
                        onChange={(e) => setForm({ ...form, gender: e.target.value })}
                      >
                        <option value="">Select...</option>
                        <option value="M">Male</option>
                        <option value="F">Female</option>
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">
                        <i className="bi bi-calendar-date me-1" style={{ color: "var(--blue-700)" }}></i>
                        Date of Birth
                      </label>
                      <input 
                        type="date" 
                        className="form-control" 
                        value={form.date_of_birth || ""}
                        onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} 
                      />
                    </div>
                  </div>
                )}

                <div className="mt-3 d-flex gap-2">
                  <button 
                    className="btn btn-primary" 
                    type="submit" 
                    disabled={saving}
                  >
                    {saving ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        Saving...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-check2 me-2"></i>
                        Save Changes
                      </>
                    )}
                  </button>
                  <button 
                    className="btn btn-secondary" 
                    type="button"
                    onClick={() => {
                      setForm({
                        email: profile.email || "",
                        phone_number: profile.phone_number || "",
                        national_id: profile.national_id || "",
                        gender: profile.student_profile?.gender || "",
                        date_of_birth: profile.student_profile?.date_of_birth || "",
                      });
                    }}
                  >
                    <i className="bi bi-arrow-counterclockwise me-2"></i>
                    Reset
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Info Note */}
      <div className="card mt-3" style={{ background: "var(--bg-app)" }}>
        <div className="card-body" style={{ padding: "0.75rem 1.25rem" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", fontSize: "var(--fs-sm)" }}>
            <i className="bi bi-info-circle" style={{ color: "var(--blue-700)", fontSize: "1.1rem", marginTop: "0.1rem" }}></i>
            <span style={{ color: "var(--ink-600)" }}>
              <strong>Note:</strong> Your name, username, role
              {profile.student_profile ? " and admission number" : ""} are managed by the school
              administration and cannot be changed here. To update these details, please contact
              the school administration.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}