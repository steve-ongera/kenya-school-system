import { useState } from "react";
import { authApi } from "../services/api";

export default function ChangePassword() {
  const [form, setForm] = useState({ old_password: "", new_password: "", confirm_password: "" });
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
    setSaving(true);
    try {
      await authApi.changePassword({ old_password: form.old_password, new_password: form.new_password });
      setMessage("Password updated.");
      setForm({ old_password: "", new_password: "", confirm_password: "" });
    } catch (err) {
      const detail = err.response?.data;
      setError(typeof detail === "object" ? Object.values(detail).flat().join(" ") : "Could not update password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2 className="page-title">Change Password</h2>
      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-danger">{error}</div>}

      <form className="card p-3" style={{ maxWidth: 420 }} onSubmit={submit}>
        <div className="mb-3">
          <label className="form-label">Current Password</label>
          <input type="password" className="form-control" required
            value={form.old_password}
            onChange={(e) => setForm({ ...form, old_password: e.target.value })} />
        </div>
        <div className="mb-3">
          <label className="form-label">New Password</label>
          <input type="password" className="form-control" required
            value={form.new_password}
            onChange={(e) => setForm({ ...form, new_password: e.target.value })} />
        </div>
        <div className="mb-3">
          <label className="form-label">Confirm New Password</label>
          <input type="password" className="form-control" required
            value={form.confirm_password}
            onChange={(e) => setForm({ ...form, confirm_password: e.target.value })} />
        </div>
        <button className="btn btn-primary" style={{ width: "fit-content" }} disabled={saving}>
          {saving ? "Saving..." : "Update Password"}
        </button>
      </form>
    </div>
  );
}