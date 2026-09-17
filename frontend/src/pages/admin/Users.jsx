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

const emptyEditForm = {
  first_name: "",
  last_name: "",
  email: "",
  phone_number: "",
  national_id: "",
  role: "TEACHER",
  is_active_staff: true,
};

function errorText(err, fallback) {
  const data = err?.response?.data;
  if (!data) return fallback;
  if (typeof data === "string") return data;
  if (data.detail) return data.detail;
  if (typeof data === "object") {
    return Object.entries(data)
      .map(([field, errors]) => `${field}: ${Array.isArray(errors) ? errors.join(" ") : errors}`)
      .join(" | ");
  }
  return fallback;
}

// ===========================================================================
// Edit User modal
// ===========================================================================
function EditUserModal({ user, form, setForm, saving, error, onSave, onCancel }) {
  return (
    <>
      <div className="modal d-block" tabIndex="-1" role="dialog" style={{ zIndex: 1055 }}>
        <div className="modal-dialog modal-dialog-centered" role="document">
          <form className="modal-content" onSubmit={onSave}>
            <div className="modal-header">
              <h5 className="modal-title">Edit User — {user.username}</h5>
              <button type="button" className="btn-close" onClick={onCancel} aria-label="Close" />
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-danger py-2 px-3">{error}</div>}

              <div className="row g-3">
                <div className="col-12">
                  <label className="form-label small text-muted">Username</label>
                  <input className="form-control" value={user.username} disabled />
                  <div className="form-text">Username is the login identity and can't be changed here.</div>
                </div>
                <div className="col-md-6">
                  <label className="form-label">First Name</label>
                  <input
                    className="form-control"
                    required
                    value={form.first_name}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Last Name</label>
                  <input
                    className="form-control"
                    required
                    value={form.last_name}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Role</label>
                  <select
                    className="form-select"
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div className="col-md-6">
                  <label className="form-label">National ID</label>
                  <input
                    className="form-control"
                    value={form.national_id}
                    onChange={(e) => setForm({ ...form, national_id: e.target.value })}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    className="form-control"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Phone</label>
                  <input
                    className="form-control"
                    value={form.phone_number}
                    onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
                  />
                </div>
                <div className="col-12">
                  <div className="form-check">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      id="editIsActiveStaff"
                      checked={form.is_active_staff}
                      onChange={(e) => setForm({ ...form, is_active_staff: e.target.checked })}
                    />
                    <label className="form-check-label" htmlFor="editIsActiveStaff">
                      Account active (unchecking suspends login access without deleting the account)
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onCancel}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      </div>
      <div className="modal-backdrop show" style={{ zIndex: 1050 }} />
    </>
  );
}

// ===========================================================================
// Delete confirmation modal
// ===========================================================================
function DeleteUserModal({ user, saving, error, onConfirm, onCancel }) {
  return (
    <>
      <div className="modal d-block" tabIndex="-1" role="dialog" style={{ zIndex: 1055 }}>
        <div className="modal-dialog modal-dialog-centered" role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">Delete User Account?</h5>
              <button type="button" className="btn-close" onClick={onCancel} aria-label="Close" />
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-danger py-2 px-3">{error}</div>}
              <p className="mb-0">
                Delete <strong>{user.first_name} {user.last_name}</strong> ({user.username}, {user.role})? This
                cannot be undone.
              </p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onCancel}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger btn-sm" onClick={onConfirm} disabled={saving}>
                {saving ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop show" style={{ zIndex: 1050 }} />
    </>
  );
}

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

  // ---- Edit user modal state ---------------------------------------------
  const [editingUser, setEditingUser] = useState(null); // the raw user row being edited
  const [editForm, setEditForm] = useState(emptyEditForm);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // ---- Delete user modal state --------------------------------------------
  const [deletingUser, setDeletingUser] = useState(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState("");

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
      setMessage(errorText(err, "Could not create account."));
      setMessageType("danger");
    } finally {
      setFormSaving(false);
    }
  };

  // ---------------------------------------------------------------------
  // Edit user
  // ---------------------------------------------------------------------
  const startEdit = (user) => {
    setEditingUser(user);
    setEditError("");
    setEditForm({
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      email: user.email || "",
      phone_number: user.phone_number || "",
      national_id: user.national_id || "",
      role: user.role,
      is_active_staff: user.is_active_staff ?? true,
    });
  };

  const cancelEdit = () => {
    setEditingUser(null);
    setEditForm(emptyEditForm);
    setEditError("");
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    setEditSaving(true);
    setEditError("");
    try {
      // Send "" as null for national_id so we don't trip the unique
      // constraint by round-tripping an empty string for every blank user.
      const payload = { ...editForm, national_id: editForm.national_id || null };
      await api.patch(`/users/${editingUser.id}/`, payload);
      cancelEdit();
      await loadUsers();
      setMessage("User account updated.");
      setMessageType("success");
    } catch (err) {
      setEditError(errorText(err, "Could not update this user."));
    } finally {
      setEditSaving(false);
    }
  };

  // ---------------------------------------------------------------------
  // Delete user
  // ---------------------------------------------------------------------
  const startDelete = (user) => {
    setDeletingUser(user);
    setDeleteError("");
  };

  const cancelDelete = () => {
    setDeletingUser(null);
    setDeleteError("");
  };

  const confirmDelete = async () => {
    setDeleteSaving(true);
    setDeleteError("");
    try {
      await api.delete(`/users/${deletingUser.id}/`);
      cancelDelete();
      // If we just deleted the last row on this page, step back a page.
      if (users.length === 1 && currentPage > 1) {
        setCurrentPage((p) => p - 1);
      } else {
        await loadUsers();
      }
      setMessage("User account deleted.");
      setMessageType("success");
    } catch (err) {
      setDeleteError(errorText(err, "Could not delete this user."));
    } finally {
      setDeleteSaving(false);
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
                  <th>Status</th>
                  <th style={{ width: "90px" }}>Actions</th>
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
                      {u.is_active_staff ? (
                        <span className="badge badge-success">Active</span>
                      ) : (
                        <span className="badge badge-neutral">Suspended</span>
                      )}
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary btn-icon"
                          title="Edit"
                          onClick={() => startEdit(u)}
                        >
                          <i className="bi bi-pencil"></i>
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger btn-icon"
                          title="Delete"
                          onClick={() => startDelete(u)}
                        >
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

      {editingUser && (
        <EditUserModal
          user={editingUser}
          form={editForm}
          setForm={setEditForm}
          saving={editSaving}
          error={editError}
          onSave={saveEdit}
          onCancel={cancelEdit}
        />
      )}

      {deletingUser && (
        <DeleteUserModal
          user={deletingUser}
          saving={deleteSaving}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}
    </div>
  );
}