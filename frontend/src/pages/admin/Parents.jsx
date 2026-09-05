import { useEffect, useState, useMemo } from "react";
import { guardiansApi, studentsApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";
import Pagination from "../../components/Pagination";

export default function AdminParents() {
  const [guardians, setGuardians] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [linkForm, setLinkForm] = useState({ parent: "", student: "", relationship: "GUARDIAN" });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const load = async () => {
    setLoading(true);
    try {
      const [g, s] = await Promise.all([
        guardiansApi.list(), 
        studentsApi.list({ page_size: 200 })
      ]);
      setGuardians(g.data.results ?? g.data ?? []);
      setStudents(s.data.results ?? s.data ?? []);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const submitLink = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      await guardiansApi.linkStudent(linkForm);
      setLinkForm({ parent: "", student: "", relationship: "GUARDIAN" });
      await load();
      setSuccess(" Guardian linked to student successfully.");
    } catch (err) {
      setError(err.response?.data ? JSON.stringify(err.response.data) : "Failed to link.");
    } finally {
      setLoading(false);
    }
  };

  // Filter guardians by search
  const filteredGuardians = useMemo(() => {
    if (!searchQuery.trim()) return guardians;
    
    const query = searchQuery.toLowerCase().trim();
    return guardians.filter(g => 
      g.full_name?.toLowerCase().includes(query) ||
      g.user?.toLowerCase().includes(query) ||
      g.phone_number?.toLowerCase().includes(query)
    );
  }, [guardians, searchQuery]);

  const totalItems = filteredGuardians.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentItems = filteredGuardians.slice(startIndex, endIndex);

  useEffect(() => setCurrentPage(1), [searchQuery]);

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  const clearSearch = () => {
    setSearchQuery("");
    setCurrentPage(1);
  };

  // Get relationship badge color
  const getRelationshipBadge = (relationship) => {
    const colors = {
      MOTHER: "badge-gold",
      FATHER: "badge-blue",
      GUARDIAN: "badge-success",
    };
    return colors[relationship] || "badge-neutral";
  };

  // Get relationship icon
  const getRelationshipIcon = (relationship) => {
    const icons = {
      MOTHER: "bi-person-female",
      FATHER: "bi-person",
      GUARDIAN: "bi-shield",
    };
    return icons[relationship] || "bi-person";
  };

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: "Dashboard", href: "/admin" },
        { label: "Parents", href: "/admin/parents" },
        { label: "All Parents & Guardians", href: "#" },
      ]} />

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Parents &amp; Guardians</h1>
          <p className="page-subtitle">
            Manage parent/guardian accounts and link them to students
          </p>
        </div>
        <button className="btn btn-outline-primary btn-sm">
          <i className="bi bi-download me-1"></i>Export
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="alert alert-danger alert-dismissible fade show" role="alert">
          <i className="bi bi-exclamation-circle me-2"></i>
          {error}
          <button type="button" className="btn-close" onClick={() => setError(null)}></button>
        </div>
      )}
      {success && (
        <div className="alert alert-success alert-dismissible fade show" role="alert">
          <i className="bi bi-check-circle me-2"></i>
          {success}
          <button type="button" className="btn-close" onClick={() => setSuccess(null)}></button>
        </div>
      )}

      {/* Link Form Card */}
      <div className="card p-4 mb-4">
        <h6 className="mb-3" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
          <i className="bi bi-link-45deg me-2" style={{ color: "var(--blue-700)" }}></i>
          Link a Guardian to a Student
        </h6>
        <form onSubmit={submitLink}>
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label">Guardian</label>
              <select 
                className="form-select" 
                value={linkForm.parent}
                onChange={(e) => setLinkForm({ ...linkForm, parent: e.target.value })} 
                required
              >
                <option value="">Select Guardian</option>
                {guardians.map((g) => (
                  <option key={g.id} value={g.id}>{g.full_name}</option>
                ))}
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label">Student</label>
              <select 
                className="form-select" 
                value={linkForm.student}
                onChange={(e) => setLinkForm({ ...linkForm, student: e.target.value })} 
                required
              >
                <option value="">Select Student</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.admission_no} - {s.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">Relationship</label>
              <select 
                className="form-select" 
                value={linkForm.relationship}
                onChange={(e) => setLinkForm({ ...linkForm, relationship: e.target.value })}
              >
                <option value="MOTHER">Mother</option>
                <option value="FATHER">Father</option>
                <option value="GUARDIAN">Guardian</option>
              </select>
            </div>
            <div className="col-md-1 d-flex align-items-end">
              <button 
                className="btn btn-primary w-100" 
                type="submit" 
                disabled={loading}
                style={{ height: "38px" }}
              >
                <i className="bi bi-link"></i>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Guardians Table */}
      <div className="table-wrap">
        <div className="table-wrap__header" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.75rem" }}>
          {/* Search inside table header */}
          <div className="d-flex flex-wrap gap-2" style={{ width: "100%" }}>
            <div style={{ flex: 1, minWidth: "200px", position: "relative" }}>
              <i className="bi bi-search" style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--ink-400)" }}></i>
              <input 
                type="text" 
                className="form-control" 
                placeholder="Search by name, username, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: "2.4rem" }}
              />
            </div>
            {searchQuery && (
              <button className="btn btn-sm btn-light" onClick={clearSearch}>
                <i className="bi bi-x-lg"></i> Clear
              </button>
            )}
            <div className="toolbar__spacer"></div>
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
              {totalItems} guardian{totalItems !== 1 ? "s" : ""}
            </span>
          </div>
          {searchQuery && (
            <div className="d-flex flex-wrap gap-1">
              <span className="filter-chip">
                Search: "{searchQuery}"
                <button onClick={() => setSearchQuery("")}><i className="bi bi-x"></i></button>
              </span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
            <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
              <i className="bi bi-people me-2"></i>
              All Guardians
            </span>
            {totalItems > 0 && (
              <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
                Showing {startIndex + 1}-{Math.min(endIndex, totalItems)} of {totalItems}
              </span>
            )}
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={5} columns={4} />
        ) : currentItems.length === 0 ? (
          <div className="empty-state">
            <i className="bi bi-people"></i>
            <h6>
              {searchQuery ? "No guardians match your search" : "No guardians registered yet"}
            </h6>
            <p className="text-muted-soft">
              {searchQuery 
                ? "Try adjusting your search" 
                : "Guardians can be created through the User Accounts page"}
            </p>
          </div>
        ) : (
          <>
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Username</th>
                    <th>Phone</th>
                    <th>Linked Students</th>
                    <th style={{ width: "80px" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentItems.map((g) => (
                    <tr key={g.id}>
                      <td>
                        <div className="table-avatar-cell">
                          <div className="avatar-sm">
                            {g.full_name?.split(' ').map(n => n[0]).join('') || 'G'}
                          </div>
                          <span className="cell-name">{g.full_name}</span>
                        </div>
                      </td>
                      <td>
                        <span style={{ fontWeight: 500, color: "var(--ink-700)" }}>
                          {g.user || "-"}
                        </span>
                      </td>
                      <td>
                        {g.phone_number ? (
                          <span style={{ color: "var(--ink-600)" }}>{g.phone_number}</span>
                        ) : (
                          <span className="text-muted-soft">-</span>
                        )}
                      </td>
                      <td>
                        {(g.students ?? []).length > 0 ? (
                          <span className="badge badge-blue">
                            <i className="bi bi-person me-1"></i>
                            {(g.students ?? []).length}
                          </span>
                        ) : (
                          <span className="text-muted-soft">-</span>
                        )}
                      </td>
                      <td>
                        <div className="table-actions">
                          <button className="btn btn-sm btn-outline-primary btn-icon" title="View">
                            <i className="bi bi-eye"></i>
                          </button>
                          <button className="btn btn-sm btn-outline-secondary btn-icon" title="Edit">
                            <i className="bi bi-pencil"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalItems > itemsPerPage && (
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
            )}
          </>
        )}
      </div>
    </div>
  );
}