import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { authApi } from "../services/api";

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await authApi.resetPassword(token, newPassword);
      navigate("/login");
    } catch (err) {
      setError(err?.response?.data?.detail || "This reset link is invalid or has expired.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div style={{ maxWidth: "420px", width: "100%", padding: "2.5rem", background: "#fff", borderRadius: "var(--radius-lg)", boxShadow: "0 8px 40px rgba(11,37,69,0.08)", border: "1px solid var(--border-color)" }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "1rem" }}>Set a new password</h1>
        {error && <div className="alert alert-danger py-2" style={{ fontSize: "var(--fs-sm)" }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label" style={{ fontWeight: 600 }}>New Password</label>
            <input type="password" className="form-control" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
          </div>
          <div className="mb-3">
            <label className="form-label" style={{ fontWeight: 600 }}>Confirm Password</label>
            <input type="password" className="form-control" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          <button className="btn btn-primary w-100" type="submit" disabled={submitting}>
            {submitting ? "Saving..." : "Reset Password"}
          </button>
        </form>
        <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
          <Link to="/login" style={{ fontSize: "var(--fs-sm)" }}>Back to login</Link>
        </div>
      </div>
    </div>
  );
}