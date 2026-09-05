import { useState } from "react";
import { authApi } from "../services/api";
import Breadcrumb from "../components/Breadcrumb";

export default function ChangePassword() {
  const [form, setForm] = useState({ old_password: "", new_password: "", confirm_password: "" });
  const [showPasswords, setShowPasswords] = useState({
    old: false,
    new: false,
    confirm: false,
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");
    if (form.new_password !== form.confirm_password) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (form.new_password.length < 8) {
      setError("New password must be at least 8 characters long.");
      return;
    }
    setSaving(true);
    try {
      await authApi.changePassword({ old_password: form.old_password, new_password: form.new_password });
      setMessage(" Password updated successfully.");
      setForm({ old_password: "", new_password: "", confirm_password: "" });
    } catch (err) {
      const detail = err.response?.data;
      setError(typeof detail === "object" ? Object.values(detail).flat().join(" ") : "Could not update password.");
    } finally {
      setSaving(false);
    }
  };

  const togglePassword = (field) => {
    setShowPasswords((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  // Password strength indicator
  const getPasswordStrength = (password) => {
    if (!password) return { score: 0, label: "", color: "" };
    let score = 0;
    if (password.length >= 8) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score++;
    
    const levels = [
      { score: 0, label: "Very Weak", color: "var(--danger-600)" },
      { score: 1, label: "Weak", color: "var(--danger-600)" },
      { score: 2, label: "Fair", color: "var(--gold-500)" },
      { score: 3, label: "Strong", color: "var(--success-600)" },
      { score: 4, label: "Very Strong", color: "var(--success-600)" },
    ];
    return levels[score] || levels[0];
  };

  const strength = getPasswordStrength(form.new_password);

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: "Dashboard", href: "/" },
        { label: "Profile", href: "/profile" },
        { label: "Change Password", href: "#" },
      ]} />

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Change Password</h1>
          <p className="page-subtitle">
            Update your password to keep your account secure
          </p>
        </div>
      </div>

      {/* Messages */}
      {message && (
        <div className="alert alert-success alert-dismissible fade show" role="alert">
          <i className="bi bi-check-circle me-2"></i>
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

      <div className="row">
        <div className="col-12 col-lg-8 col-xl-6">
          <form className="card p-4" onSubmit={submit}>
            <h6 className="mb-3" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
              <i className="bi bi-lock me-2" style={{ color: "var(--blue-700)" }}></i>
              Password Update
            </h6>

            {/* Current Password */}
            <div className="mb-3">
              <label className="form-label">Current Password</label>
              <div className="input-icon-group has-toggle">
                <i className="bi bi-shield-lock input-icon-leading"></i>
                <input
                  type={showPasswords.old ? "text" : "password"}
                  className="form-control"
                  required
                  value={form.old_password}
                  onChange={(e) => setForm({ ...form, old_password: e.target.value })}
                  placeholder="Enter your current password"
                  style={{ paddingLeft: "2.5rem", paddingRight: "2.5rem" }}
                />
                <button
                  type="button"
                  className="input-password-toggle"
                  onClick={() => togglePassword("old")}
                  aria-label={showPasswords.old ? "Hide password" : "Show password"}
                >
                  <i className={`bi bi-${showPasswords.old ? "eye-slash" : "eye"}`}></i>
                </button>
              </div>
            </div>

            {/* New Password */}
            <div className="mb-3">
              <label className="form-label">New Password</label>
              <div className="input-icon-group has-toggle">
                <i className="bi bi-key input-icon-leading"></i>
                <input
                  type={showPasswords.new ? "text" : "password"}
                  className="form-control"
                  required
                  value={form.new_password}
                  onChange={(e) => setForm({ ...form, new_password: e.target.value })}
                  placeholder="Enter your new password"
                  style={{ paddingLeft: "2.5rem", paddingRight: "2.5rem" }}
                />
                <button
                  type="button"
                  className="input-password-toggle"
                  onClick={() => togglePassword("new")}
                  aria-label={showPasswords.new ? "Hide password" : "Show password"}
                >
                  <i className={`bi bi-${showPasswords.new ? "eye-slash" : "eye"}`}></i>
                </button>
              </div>
              {/* Password strength indicator */}
              {form.new_password && (
                <div style={{ marginTop: "0.5rem" }}>
                  <div style={{ 
                    display: "flex", 
                    justifyContent: "space-between", 
                    alignItems: "center",
                    marginBottom: "0.25rem"
                  }}>
                    <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
                      Password strength:
                    </span>
                    <span style={{ 
                      fontSize: "var(--fs-xs)", 
                      fontWeight: 600, 
                      color: strength.color 
                    }}>
                      {strength.label}
                    </span>
                  </div>
                  <div style={{
                    height: "4px",
                    background: "var(--ink-100)",
                    borderRadius: "var(--radius-pill)",
                    overflow: "hidden",
                    width: "100%",
                  }}>
                    <div style={{
                      height: "100%",
                      width: `${(strength.score / 4) * 100}%`,
                      background: strength.color,
                      borderRadius: "var(--radius-pill)",
                      transition: "width 0.3s ease",
                    }} />
                  </div>
                  <div style={{ 
                    fontSize: "var(--fs-xs)", 
                    color: "var(--ink-400)",
                    marginTop: "0.25rem"
                  }}>
                    <i className="bi bi-info-circle me-1"></i>
                    Min 8 chars with uppercase, lowercase, number & special character
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div className="mb-3">
              <label className="form-label">Confirm New Password</label>
              <div className="input-icon-group has-toggle">
                <i className="bi bi-check-circle input-icon-leading"></i>
                <input
                  type={showPasswords.confirm ? "text" : "password"}
                  className="form-control"
                  required
                  value={form.confirm_password}
                  onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
                  placeholder="Confirm your new password"
                  style={{ paddingLeft: "2.5rem", paddingRight: "2.5rem" }}
                />
                <button
                  type="button"
                  className="input-password-toggle"
                  onClick={() => togglePassword("confirm")}
                  aria-label={showPasswords.confirm ? "Hide password" : "Show password"}
                >
                  <i className={`bi bi-${showPasswords.confirm ? "eye-slash" : "eye"}`}></i>
                </button>
              </div>
              {/* Password match indicator */}
              {form.confirm_password && form.new_password && (
                <div style={{ marginTop: "0.25rem" }}>
                  <span style={{ 
                    fontSize: "var(--fs-xs)",
                    color: form.new_password === form.confirm_password ? "var(--success-600)" : "var(--danger-600)"
                  }}>
                    <i className={`bi ${form.new_password === form.confirm_password ? "bi-check-circle" : "bi-exclamation-circle"} me-1`}></i>
                    {form.new_password === form.confirm_password ? "Passwords match" : "Passwords do not match"}
                  </span>
                </div>
              )}
            </div>

            
            <div className="mt-2 d-flex gap-2">
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    Updating...
                  </>
                ) : (
                  <>
                    <i className="bi bi-check2 me-2"></i>
                    Update Password
                  </>
                )}
              </button>
              <button 
                className="btn btn-secondary" 
                type="button"
                onClick={() => setForm({ old_password: "", new_password: "", confirm_password: "" })}
              >
                <i className="bi bi-arrow-counterclockwise me-2"></i>
                Clear
              </button>
            </div>
          </form>

          
        </div>
      </div>
    </div>
  );
}