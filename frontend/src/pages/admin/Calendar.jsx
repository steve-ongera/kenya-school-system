import { useEffect, useState } from "react";
import { calendarApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";

export default function AdminCalendar() {
  const [years, setYears] = useState([]);
  const [terms, setTerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [yearForm, setYearForm] = useState({ year: "", start_date: "", end_date: "", is_current: false });
  const [termForm, setTermForm] = useState({ academic_year: "", term_number: 1, start_date: "", end_date: "", is_current: false });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [y, t] = await Promise.all([calendarApi.academicYears(), calendarApi.terms()]);
      setYears(y.data.results ?? y.data ?? []);
      setTerms(t.data.results ?? t.data ?? []);
    } catch (error) {
      console.error("Failed to load calendar data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const submitYear = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      await calendarApi.createAcademicYear(yearForm);
      setYearForm({ year: "", start_date: "", end_date: "", is_current: false });
      await load();
      setSuccess("✅ Academic year created successfully.");
    } catch (err) {
      setError(err.response?.data ? JSON.stringify(err.response.data) : "Failed to save academic year.");
    } finally {
      setLoading(false);
    }
  };

  const submitTerm = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      await calendarApi.createTerm(termForm);
      setTermForm({ academic_year: "", term_number: 1, start_date: "", end_date: "", is_current: false });
      await load();
      setSuccess("✅ Term created successfully.");
    } catch (err) {
      setError(err.response?.data ? JSON.stringify(err.response.data) : "Failed to save term.");
    } finally {
      setLoading(false);
    }
  };

  const makeCurrent = async (id, is_year) => {
    setLoading(true);
    try {
      if (is_year) await calendarApi.updateAcademicYear(id, { is_current: true });
      else await calendarApi.updateTerm(id, { is_current: true });
      await load();
      setSuccess(`✅ ${is_year ? 'Academic year' : 'Term'} set as current.`);
    } catch (err) {
      setError("Failed to update status.");
    } finally {
      setLoading(false);
    }
  };

  // Format date for display
  const formatDate = (date) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: "Dashboard", href: "/admin" },
        { label: "Calendar", href: "/admin/calendar" },
        { label: "Academic Calendar", href: "#" },
      ]} />

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Academic Calendar</h1>
          <p className="page-subtitle">
            Manage academic years and terms for the school
          </p>
        </div>
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

      <div className="row g-3">
        {/* Academic Years Section */}
        <div className="col-12 col-lg-6">
          <div className="card">
            <div className="card-header" style={{ 
              background: "transparent",
              borderBottom: "1px solid var(--border-color)",
              padding: "1rem 1.25rem",
              fontWeight: 700,
              color: "var(--ink-900)"
            }}>
              <i className="bi bi-calendar3 me-2" style={{ color: "var(--blue-700)" }}></i>
              Academic Years
              <span className="badge badge-neutral ms-2">{years.length}</span>
            </div>
            <div className="card-body">
              <form onSubmit={submitYear}>
                <div className="row g-2">
                  <div className="col-12">
                    <label className="form-label">Year</label>
                    <input 
                      className="form-control" 
                      placeholder="e.g. 2027" 
                      value={yearForm.year}
                      onChange={(e) => setYearForm({ ...yearForm, year: e.target.value })} 
                      required 
                    />
                  </div>
                  <div className="col-6">
                    <label className="form-label">Start Date</label>
                    <input 
                      type="date" 
                      className="form-control" 
                      value={yearForm.start_date}
                      onChange={(e) => setYearForm({ ...yearForm, start_date: e.target.value })} 
                      required 
                    />
                  </div>
                  <div className="col-6">
                    <label className="form-label">End Date</label>
                    <input 
                      type="date" 
                      className="form-control" 
                      value={yearForm.end_date}
                      onChange={(e) => setYearForm({ ...yearForm, end_date: e.target.value })} 
                      required 
                    />
                  </div>
                  <div className="col-12">
                    <button className="btn btn-primary w-100" type="submit" disabled={loading}>
                      <i className="bi bi-plus-lg me-1"></i>
                      {loading ? "Saving..." : "Add Academic Year"}
                    </button>
                  </div>
                </div>
              </form>

              <hr className="divider" />

              {loading ? (
                <TableSkeleton rows={3} columns={4} />
              ) : years.length === 0 ? (
                <div className="empty-state" style={{ padding: "1.5rem" }}>
                  <i className="bi bi-calendar3" style={{ fontSize: "1.5rem" }}></i>
                  <h6 style={{ marginTop: "0.5rem" }}>No academic years</h6>
                  <p className="text-muted-soft" style={{ fontSize: "var(--fs-sm)" }}>
                    Add your first academic year above
                  </p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead>
                      <tr>
                        <th>Year</th>
                        <th>Start</th>
                        <th>End</th>
                        <th>Status</th>
                        <th style={{ width: "120px" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {years.map((y) => (
                        <tr key={y.id}>
                          <td>
                            <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                              {y.year}
                            </span>
                          </td>
                          <td style={{ fontSize: "var(--fs-sm)", color: "var(--ink-600)" }}>
                            {formatDate(y.start_date)}
                          </td>
                          <td style={{ fontSize: "var(--fs-sm)", color: "var(--ink-600)" }}>
                            {formatDate(y.end_date)}
                          </td>
                          <td>
                            {y.is_current ? (
                              <span className="badge badge-success">
                                <i className="bi bi-check-circle me-1"></i>
                                Current
                              </span>
                            ) : (
                              <span className="badge badge-neutral">Inactive</span>
                            )}
                          </td>
                          <td>
                            {!y.is_current && (
                              <button 
                                className="btn btn-sm btn-outline-primary" 
                                onClick={() => makeCurrent(y.id, true)}
                                disabled={loading}
                                style={{ width: "100%" }}
                              >
                                <i className="bi bi-check2 me-1"></i>
                                Set Current
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Terms Section */}
        <div className="col-12 col-lg-6">
          <div className="card">
            <div className="card-header" style={{ 
              background: "transparent",
              borderBottom: "1px solid var(--border-color)",
              padding: "1rem 1.25rem",
              fontWeight: 700,
              color: "var(--ink-900)"
            }}>
              <i className="bi bi-clock me-2" style={{ color: "var(--blue-700)" }}></i>
              Terms
              <span className="badge badge-neutral ms-2">{terms.length}</span>
            </div>
            <div className="card-body">
              <form onSubmit={submitTerm}>
                <div className="row g-2">
                  <div className="col-6">
                    <label className="form-label">Academic Year</label>
                    <select 
                      className="form-select" 
                      value={termForm.academic_year}
                      onChange={(e) => setTermForm({ ...termForm, academic_year: e.target.value })} 
                      required
                    >
                      <option value="">Select Year</option>
                      {years.map((y) => (
                        <option key={y.id} value={y.id}>
                          {y.year} {y.is_current ? "(Current)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-6">
                    <label className="form-label">Term Number</label>
                    <select 
                      className="form-select" 
                      value={termForm.term_number}
                      onChange={(e) => setTermForm({ ...termForm, term_number: Number(e.target.value) })}
                    >
                      <option value={1}>Term 1</option>
                      <option value={2}>Term 2</option>
                      <option value={3}>Term 3</option>
                    </select>
                  </div>
                  <div className="col-6">
                    <label className="form-label">Start Date</label>
                    <input 
                      type="date" 
                      className="form-control" 
                      value={termForm.start_date}
                      onChange={(e) => setTermForm({ ...termForm, start_date: e.target.value })} 
                      required 
                    />
                  </div>
                  <div className="col-6">
                    <label className="form-label">End Date</label>
                    <input 
                      type="date" 
                      className="form-control" 
                      value={termForm.end_date}
                      onChange={(e) => setTermForm({ ...termForm, end_date: e.target.value })} 
                      required 
                    />
                  </div>
                  <div className="col-12">
                    <button className="btn btn-primary w-100" type="submit" disabled={loading}>
                      <i className="bi bi-plus-lg me-1"></i>
                      {loading ? "Saving..." : "Add Term"}
                    </button>
                  </div>
                </div>
              </form>

              <hr className="divider" />

              {loading ? (
                <TableSkeleton rows={3} columns={5} />
              ) : terms.length === 0 ? (
                <div className="empty-state" style={{ padding: "1.5rem" }}>
                  <i className="bi bi-clock" style={{ fontSize: "1.5rem" }}></i>
                  <h6 style={{ marginTop: "0.5rem" }}>No terms</h6>
                  <p className="text-muted-soft" style={{ fontSize: "var(--fs-sm)" }}>
                    Add your first term above
                  </p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead>
                      <tr>
                        <th>Term</th>
                        <th>Year</th>
                        <th>Start</th>
                        <th>End</th>
                        <th>Status</th>
                        <th style={{ width: "100px" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {terms.map((t) => (
                        <tr key={t.id}>
                          <td>
                            <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                              Term {t.term_number}
                            </span>
                          </td>
                          <td style={{ fontSize: "var(--fs-sm)", color: "var(--ink-600)" }}>
                            {t.academic_year_label}
                          </td>
                          <td style={{ fontSize: "var(--fs-sm)", color: "var(--ink-600)" }}>
                            {formatDate(t.start_date)}
                          </td>
                          <td style={{ fontSize: "var(--fs-sm)", color: "var(--ink-600)" }}>
                            {formatDate(t.end_date)}
                          </td>
                          <td>
                            {t.is_current ? (
                              <span className="badge badge-success">
                                <i className="bi bi-check-circle me-1"></i>
                                Current
                              </span>
                            ) : (
                              <span className="badge badge-neutral">Inactive</span>
                            )}
                          </td>
                          <td>
                            {!t.is_current && (
                              <button 
                                className="btn btn-sm btn-outline-primary" 
                                onClick={() => makeCurrent(t.id, false)}
                                disabled={loading}
                                style={{ width: "100%" }}
                              >
                                <i className="bi bi-check2 me-1"></i>
                                Set Current
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}