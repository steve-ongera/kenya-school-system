import { useEffect, useState, useMemo } from "react";
import api from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";
import Pagination from "../../components/Pagination";

const ROLE_OPTIONS = ["ADMIN", "TEACHER", "PARENT", "FINANCE"]; // students are created via Admit Student

// Role badge color mapping
const ROLE_BADGE_COLORS = {
  ADMIN: "badge-danger",
  TEACHER: "badge-blue",
  PARENT: "badge-gold",
  FINANCE: "badge-success",
};

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [form, setForm] = useState({
    username: "", first_name: "", last_name: "", email: "", phone_number: "", role: "TEACHER", password: "",
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const loadUsers = async (role) => {
    setLoading(true);
    try {
      const { data } = await api.get("/users/", { params: role ? { role } : {} });
      setUsers(data.results ?? data);
    } catch (error) {
      console.error("Failed to load users:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers(roleFilter);
  }, [roleFilter]);

  const submit = async (e) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);
    try {
      await api.post("/users/", form);
      setForm({ username: "", first_name: "", last_name: "", email: "", phone_number: "", role: "TEACHER", password: "" });
      await loadUsers(roleFilter);
      setMessage(" Account created successfully.");
      setMessageType("success");
    } catch (err) {
      setMessage(err.response?.data ? JSON.stringify(err.response.data) : "Could not create account.");
      setMessageType("danger");
    } finally {
      setLoading(false);
    }
  };

  // Filter and Search Logic
  const filteredUsers = useMemo(() => {
    let result = users;

    // Search by name, username, email, or phone
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(u =>
        u.username?.toLowerCase().includes(query) ||
        u.first_name?.toLowerCase().includes(query) ||
        u.last_name?.toLowerCase().includes(query) ||
        `${u.first_name} ${u.last_name}`.toLowerCase().includes(query) ||
        u.email?.toLowerCase().includes(query) ||
        u.phone_number?.toLowerCase().includes(query)
      );
    }

    return result;
  }, [users, searchQuery]);

  const totalItems = filteredUsers.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentItems = filteredUsers.slice(startIndex, endIndex);

  useEffect(() => setCurrentPage(1), [searchQuery, roleFilter]);

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setRoleFilter("");
    setCurrentPage(1);
  };

  // Get role badge class
  const getRoleBadge = (role) => {
    return ROLE_BADGE_COLORS[role] || "badge-neutral";
  };

  // Get role icon
  const getRoleIcon = (role) => {
    const icons = {
      ADMIN: "bi-shield-lock",
      TEACHER: "bi-person-workspace",
      PARENT: "bi-people",
      FINANCE: "bi-cash-stack",
    };
    return icons[role] || "bi-person";
  };

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: "Dashboard", href: "/admin" },
        { label: "Users", href: "/admin/users" },
        { label: "All Users", href: "#" },
      ]} />

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">User Accounts</h1>
          <p className="page-subtitle">
            Admin, Teacher, Parent and Finance accounts. Students are created via Admit Student.
          </p>
        </div>
      </div>

      {/* Message Alerts */}
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
            <label className="form-label">Temporary Password</label>
            <input type="password" className="form-control" required value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
        </div>
        <div className="mt-3 d-flex gap-2">
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create Account"}
          </button>
        </div>
      </form>

      {/* Table with Search & Filters inside */}
      {loading ? (
        <TableSkeleton rows={5} columns={5} />
      ) : currentItems.length === 0 ? (
        <div className="table-wrap">
          <div className="table-wrap__header" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.75rem" }}>
            {/* Search & Filters inside table header */}
            <div className="d-flex flex-wrap gap-2" style={{ width: "100%" }}>
              <div style={{ flex: 1, minWidth: "200px", position: "relative" }}>
                <i className="bi bi-search" style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--ink-400)" }}></i>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="Search by name, username, email, or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ paddingLeft: "2.4rem" }}
                />
              </div>
              <select 
                className="form-select" 
                value={roleFilter} 
                onChange={(e) => setRoleFilter(e.target.value)}
                style={{ width: "auto", minWidth: "140px" }}
              >
                <option value="">All Roles</option>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              {(searchQuery || roleFilter) && (
                <button className="btn btn-sm btn-light" onClick={clearFilters}>
                  <i className="bi bi-x-lg"></i> Clear
                </button>
              )}
            </div>
            {/* Active Filters Display */}
            {(searchQuery || roleFilter) && (
              <div className="d-flex flex-wrap gap-1">
                {searchQuery && (
                  <span className="filter-chip">
                    Search: "{searchQuery}"
                    <button onClick={() => setSearchQuery("")}><i className="bi bi-x"></i></button>
                  </span>
                )}
                {roleFilter && (
                  <span className="filter-chip">
                    Role: {roleFilter}
                    <button onClick={() => setRoleFilter("")}><i className="bi bi-x"></i></button>
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
          <div className="empty-state">
            <i className="bi bi-people"></i>
            <h6>
              {searchQuery || roleFilter 
                ? "No users match your search" 
                : "No users created yet"}
            </h6>
            <p className="text-muted-soft">
              {searchQuery || roleFilter
                ? "Try adjusting your search or filters"
                : "Use the form above to create your first user account"}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <div className="table-wrap__header" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.75rem" }}>
              {/* Search & Filters inside table header */}
              <div className="d-flex flex-wrap gap-2" style={{ width: "100%" }}>
                <div style={{ flex: 1, minWidth: "200px", position: "relative" }}>
                  <i className="bi bi-search" style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--ink-400)" }}></i>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="Search by name, username, email, or phone..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ paddingLeft: "2.4rem" }}
                  />
                </div>
                <select 
                  className="form-select" 
                  value={roleFilter} 
                  onChange={(e) => setRoleFilter(e.target.value)}
                  style={{ width: "auto", minWidth: "140px" }}
                >
                  <option value="">All Roles</option>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                {(searchQuery || roleFilter) && (
                  <button className="btn btn-sm btn-light" onClick={clearFilters}>
                    <i className="bi bi-x-lg"></i> Clear
                  </button>
                )}
              </div>
              {/* Active Filters Display */}
              {(searchQuery || roleFilter) && (
                <div className="d-flex flex-wrap gap-1">
                  {searchQuery && (
                    <span className="filter-chip">
                      Search: "{searchQuery}"
                      <button onClick={() => setSearchQuery("")}><i className="bi bi-x"></i></button>
                    </span>
                  )}
                  {roleFilter && (
                    <span className="filter-chip">
                      Role: {roleFilter}
                      <button onClick={() => setRoleFilter("")}><i className="bi bi-x"></i></button>
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
                  Showing {startIndex + 1}-{Math.min(endIndex, totalItems)} of {totalItems}
                </span>
              </div>
            </div>
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
                  {currentItems.map((u) => (
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
          </div>

          {/* Pagination */}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            itemsPerPage={itemsPerPage}
            setItemsPerPage={setItemsPerPage}
            startIndex={startIndex}
            endIndex={endIndex}
            totalItems={totalItems}
          />
        </>
      )}
    </div>
  );
}