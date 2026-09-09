import { useEffect, useState, useCallback } from "react";
import api from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";
import Pagination from "../../components/Pagination";

const ROLE_OPTIONS = ["ADMIN", "TEACHER", "PARENT", "FINANCE"]; // students are created via Admit Student

const ROLE_BADGE_COLORS = {
  ADMIN: "badge-danger",
  TEACHER: "badge-blue",
  PARENT: "badge-gold",
  FINANCE: "badge-success",
};

const ROLE_ICONS = {
  ADMIN: "bi-shield-lock",
  TEACHER: "bi-person-workspace",
  PARENT: "bi-people",
  FINANCE: "bi-cash-stack",
};

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");

  const [form, setForm] = useState({
    username: "", first_name: "", last_name: "", email: "", phone_number: "", role: "TEACHER", password: "",
  });
  const [formSaving, setFormSaving] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: currentPage, page_size: itemsPerPage };
      if (searchQuery) params.search = searchQuery;
      if (roleFilter) params.role = roleFilter;

      const { data } = await api.get("/users/", { params });
      if (Array.isArray(data)) {
        // Pagination disabled server-side — fall back gracefully.
        setUsers(data);
        setTotalItems(data.length);
      } else {
        setUsers(data.results ?? []);
        setTotalItems(data.count ?? 0);
      }
    } catch (error) {
      console.error("Failed to load users:", error);
      setMessage("Could not load users.");
      setMessageType("danger");
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, searchQuery, roleFilter]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const submit = async (e) => {
    e.preventDefault();
    setMessage("");
    setFormSaving(true);
    try {
      await api.post("/users/", form);
      setForm({ username: "", first_name: "", last_name: "", email: "", phone_number: "", role: "TEACHER", password: "" });
      setCurrentPage(1);
      await loadUsers();
      setMessage("Account created successfully.");
      setMessageType("success");
    } catch (err) {
      const data = err.response?.data;
      let readable = "Could not create account.";
      if (data && typeof data === "object") {
        readable = Object.entries(data)
          .map(([field, errors]) => `${field}: ${Array.isArray(errors) ? errors.join(" ") : errors}`)
          .join(" | ");
      }
      setMessage(readable);
      setMessageType("danger");
    } finally {
      setFormSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + users.length;
  const hasActiveFilters = !!(searchInput || roleFilter);

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  const clearFilters = () => {
    setSearchInput("");
    setSearchQuery("");
    setRoleFilter("");
    setCurrentPage(1);
  };

  const getRoleBadge = (role) => ROLE_BADGE_COLORS[role] || "badge-neutral";
  const getRoleIcon = (role) => ROLE_ICONS[role] || "bi-person";

  return (
    <div>
      <Breadcrumb items={[
        { label: "Dashboard", href: "/admin" },
        { label: "Users", href: "/admin/users" },
        { label: "All Users", href: "#" },
      ]} />

      <div className="page-header">
        <div>
          <h1 className="page-title">User Accounts</h1>
          <p className="page-subtitle">
            Admin, Teacher, Parent and Finance accounts. Students are created via Admit Student.
          </p>
        </div>
      </div>

      {message && (
        <div className={`alert alert-${messageType} alert-dismissible fade show`} role="alert">
          {message}
          <button type="button" className="btn-close" onClick={() => setMessage("")}></button>
        </div>
      )}

      {/* Create User Form */}
      <form className="card p-4 mb-4" onSubmit={submit}>
        <h5 className="mb-3" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
          <i className="bi bi-person-plus me-2" style={{ color: "var(--blue-700)" }}></i>
          Create New User Account
        </h5>
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
            <select className="form-select" value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
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
            <label className="form-label">Password</label>
            <input type="password" className="form-control" required value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
        </div>
        <div className="mt-3 d-flex gap-2">
          <button className="btn btn-primary" type="submit" disabled={formSaving}>
            {formSaving ? "Creating..." : "Create Account"}
          </button>
        </div>
      </form>

      {/* Table with Search & Filters */}
      <div className="table-wrap">
        <div className="table-wrap__header" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.75rem" }}>
          <div className="d-flex flex-wrap gap-2" style={{ width: "100%" }}>
            <div style={{ flex: 1, minWidth: "200px", position: "relative" }}>
              <i className="bi bi-search" style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--ink-400)" }}></i>
              <input
                type="text"
                className="form-control"
                placeholder="Search by name, username, email, or phone..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                style={{ paddingLeft: "2.4rem" }}
              />
            </div>
            <select
              className="form-select"
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value); setCurrentPage(1); }}
              style={{ width: "auto", minWidth: "140px" }}
            >
              <option value="">All Roles</option>
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            {hasActiveFilters && (
              <button className="btn btn-sm btn-light" onClick={clearFilters}>
                <i className="bi bi-x-lg"></i> Clear
              </button>
            )}
          </div>

          {hasActiveFilters && (
            <div className="d-flex flex-wrap gap-1">
              {searchQuery && (
                <span className="filter-chip">
                  Search: "{searchQuery}"
                  <button onClick={() => setSearchInput("")}><i className="bi bi-x"></i></button>
                </span>
              )}
              {roleFilter && (
                <span className="filter-chip">
                  Role: {roleFilter}
                  <button onClick={() => { setRoleFilter(""); setCurrentPage(1); }}><i className="bi bi-x"></i></button>
                </span>
              )}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
            <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
              <i className="bi bi-people me-2"></i>
              All Users
            </span>
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
              {totalItems} user{totalItems !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={Math.min(itemsPerPage, 10)} columns={5} />
        ) : users.length === 0 ? (
          <div className="empty-state">
            <i className="bi bi-people"></i>
            <h6>{hasActiveFilters ? "No users match your search" : "No users created yet"}</h6>
            <p className="text-muted-soft">
              {hasActiveFilters
                ? "Try adjusting your search or filters"
                : "Use the form above to create your first user account"}
            </p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th style={{ width: "80px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <span style={{ fontWeight: 600, color: "var(--blue-700)", fontSize: "var(--fs-sm)" }}>
                        {u.username}
                      </span>
                    </td>
                    <td>
                      <div className="table-avatar-cell">
                        <div className="avatar-sm">
                          {u.first_name?.[0]}{u.last_name?.[0]}
                        </div>
                        <span className="cell-name">{u.first_name} {u.last_name}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${getRoleBadge(u.role)}`}>
                        <i className={`bi ${getRoleIcon(u.role)} me-1`}></i>
                        {u.role}
                      </span>
                    </td>
                    <td>{u.email || <span className="text-muted-soft">-</span>}</td>
                    <td>{u.phone_number || <span className="text-muted-soft">-</span>}</td>
                    <td>
                      <div className="table-actions">
                        <button className="btn btn-sm btn-outline-primary btn-icon" title="Edit">
                          <i className="bi bi-pencil"></i>
                        </button>
                        <button className="btn btn-sm btn-outline-danger btn-icon" title="Delete">
                          <i className="bi bi-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && users.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          itemsPerPage={itemsPerPage}
          setItemsPerPage={(n) => { setItemsPerPage(n); setCurrentPage(1); }}
          startIndex={startIndex}
          endIndex={endIndex}
          totalItems={totalItems}
        />
      )}
    </div>
  );
}