import { useEffect, useState } from "react";
import api from "../../services/api";

const ROLE_OPTIONS = ["ADMIN", "TEACHER", "PARENT", "FINANCE"]; // students are created via Admit Student

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [roleFilter, setRoleFilter] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    username: "", first_name: "", last_name: "", email: "", phone_number: "", role: "TEACHER", password: "",
  });

  const loadUsers = async (role) => {
    const { data } = await api.get("/users/", { params: role ? { role } : {} });
    setUsers(data.results ?? data);
  };

  useEffect(() => { loadUsers(roleFilter); }, [roleFilter]);

  const submit = async (e) => {
    e.preventDefault();
    setMessage("");
    try {
      await api.post("/users/", form);
      setForm({ username: "", first_name: "", last_name: "", email: "", phone_number: "", role: "TEACHER", password: "" });
      loadUsers(roleFilter);
      setMessage("Account created.");
    } catch (err) {
      setMessage(err.response?.data ? JSON.stringify(err.response.data) : "Could not create account.");
    }
  };

  return (
    <div>
      <h2 className="page-title">User Accounts (RBAC)</h2>
      <p className="text-muted">Admin, Teacher, Parent and Finance accounts. Students are created via Admit Student.</p>
      {message && <div className="alert alert-info">{message}</div>}

      <form className="card p-3 mb-4" onSubmit={submit}>
        <div className="row g-3">
          <div className="col-md-3">
            <label className="form-label">First Name</label>
            <input className="form-control" required value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
          </div>
          <div className="col-md-3">
            <label className="form-label">Last Name</label>
            <input className="form-control" required value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
          </div>
          <div className="col-md-3">
            <label className="form-label">Username</label>
            <input className="form-control" required value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </div>
          <div className="col-md-3">
            <label className="form-label">Role</label>
            <select className="form-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">Email</label>
            <input type="email" className="form-control" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="col-md-4">
            <label className="form-label">Phone</label>
            <input className="form-control" value={form.phone_number}
              onChange={(e) => setForm({ ...form, phone_number: e.target.value })} />
          </div>
          <div className="col-md-4">
            <label className="form-label">Temporary Password</label>
            <input type="password" className="form-control" required value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
        </div>
        <button className="btn btn-primary mt-3" style={{ width: "fit-content" }}>Create Account</button>
      </form>

      <div className="d-flex align-items-center gap-2 mb-2">
        <label className="form-label mb-0">Filter by role:</label>
        <select className="form-select w-auto" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">All</option>
          {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div className="table-responsive card">
        <table className="table table-hover mb-0">
          <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Email</th><th>Phone</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{u.first_name} {u.last_name}</td>
                <td><span className="badge text-bg-secondary">{u.role}</span></td>
                <td>{u.email || "-"}</td>
                <td>{u.phone_number || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}