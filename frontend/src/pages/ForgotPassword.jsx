import { useState } from "react";
import { Link } from "react-router-dom";
import { authApi } from "../services/api";

export default function ForgotPassword() {
  const [admissionNo, setAdmissionNo] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await authApi.forgotPassword(admissionNo.trim());
    } finally {
      setSubmitting(false);
      setSent(true); // always show the same neutral confirmation
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div style={{ maxWidth: "420px", width: "100%", padding: "2.5rem", background: "#fff", borderRadius: "var(--radius-lg)", boxShadow: "0 8px 40px rgba(11,37,69,0.08)", border: "1px solid var(--border-color)" }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.5rem" }}>Reset your password</h1>
        <p style={{ fontSize: "var(--fs-sm)", color: "var(--ink-600)", marginBottom: "1.5rem" }}>
          This is for <strong>students only</strong>. Staff accounts (Admin, Teacher, Finance) must be
          reset by the school Administrator.
        </p>

        {sent ? (
          <div className="alert alert-success" style={{ fontSize: "var(--fs-sm)" }}>
            If that admission number is registered, reset instructions have been sent to the contact on file.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label" style={{ fontWeight: 600 }}>Admission Number</label>
              <input className="form-control" value={admissionNo} maxLength={30} onChange={(e) => setAdmissionNo(e.target.value)} required placeholder="e.g., ADM-2024-001" />
            </div>
            <button className="btn btn-primary w-100" type="submit" disabled={submitting}>
              {submitting ? "Sending..." : "Send Reset Link"}
            </button>
          </form>
        )}

        <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
          <Link to="/login" style={{ fontSize: "var(--fs-sm)" }}>Back to login</Link>
        </div>
      </div>
    </div>
  );
}