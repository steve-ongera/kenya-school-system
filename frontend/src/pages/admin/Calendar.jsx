import { useEffect, useMemo, useState } from "react";
import { calendarApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";

// ---------------------------------------------------------------------------
// Standard Kenyan high-school term calendar (approximate — schools vary by a
// few days/weeks year to year, so these are sensible defaults, not gospel).
// Term 1: early Jan -> early Apr
// Term 2: early May -> early Aug
// Term 3: late Aug  -> mid/late Oct
// ---------------------------------------------------------------------------
function defaultTermsForYear(year) {
  return [
    { term_number: 1, start_date: `${year}-01-06`, end_date: `${year}-04-04` },
    { term_number: 2, start_date: `${year}-05-03`, end_date: `${year}-08-01` },
    { term_number: 3, start_date: `${year}-08-31`, end_date: `${year}-10-24` },
  ];
}

function defaultYearDates(year) {
  const terms = defaultTermsForYear(year);
  return {
    start_date: terms[0].start_date,
    end_date: terms[terms.length - 1].end_date,
  };
}

export default function AdminCalendar() {
  const [years, setYears] = useState([]);
  const [terms, setTerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // ---- suggested next year (no need to type it, just confirm/adjust) ----
  const suggestedYear = useMemo(() => {
    if (!years.length) return new Date().getFullYear();
    return Math.max(...years.map((y) => Number(y.year))) + 1;
  }, [years]);

  const [yearForm, setYearForm] = useState({
    year: "",
    ...defaultYearDates(new Date().getFullYear()),
    is_current: false,
  });

  // ---- create terms alongside the year ----
  const [createTermsWithYear, setCreateTermsWithYear] = useState(true);
  const [showCustomTermDates, setShowCustomTermDates] = useState(false);
  const [termsDraft, setTermsDraft] = useState(defaultTermsForYear(new Date().getFullYear()));
  const [termsTouched, setTermsTouched] = useState(false);

  // once academic years load, prefill the Year field with the suggestion
  useEffect(() => {
    setYearForm((f) => (f.year ? f : { ...f, year: suggestedYear, ...defaultYearDates(suggestedYear) }));
    if (!termsTouched) setTermsDraft(defaultTermsForYear(suggestedYear));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedYear]);

  // when the Year field changes, resync the year's own dates + (if
  // untouched) the term dates to that year, so switching 2026 -> 2027
  // just works without the admin re-typing everything.
  const handleYearChange = (value) => {
    const y = value;
    const numeric = Number(y);
    setYearForm((f) => ({
      ...f,
      year: y,
      ...(y && !Number.isNaN(numeric) ? defaultYearDates(numeric) : {}),
    }));
    if (y && !Number.isNaN(numeric) && !termsTouched) {
      setTermsDraft(defaultTermsForYear(numeric));
    }
  };

  const handleTermDraftChange = (index, field, value) => {
    setTermsTouched(true);
    setTermsDraft((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  };

  const resetTermDraftToDefaults = () => {
    const numeric = Number(yearForm.year) || suggestedYear;
    setTermsDraft(defaultTermsForYear(numeric));
    setTermsTouched(false);
  };

  const [termForm, setTermForm] = useState({ academic_year: "", term_number: 1, start_date: "", end_date: "", is_current: false });

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
      const yearRes = await calendarApi.createAcademicYear(yearForm);
      const newYear = yearRes.data;

      let termsCreated = 0;
      if (createTermsWithYear) {
        for (const t of termsDraft) {
          await calendarApi.createTerm({
            academic_year: newYear.id,
            term_number: t.term_number,
            start_date: t.start_date,
            end_date: t.end_date,
            is_current: false,
          });
          termsCreated += 1;
        }
      }

      const nextYear = Number(yearForm.year) + 1;
      setYearForm({ year: nextYear, ...defaultYearDates(nextYear), is_current: false });
      setTermsDraft(defaultTermsForYear(nextYear));
      setTermsTouched(false);

      await load();
      setSuccess(
        termsCreated
          ? ` Academic year ${newYear.year} created with ${termsCreated} term(s).`
          : ` Academic year ${newYear.year} created.`
      );
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
      setSuccess(" Term created successfully.");
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
      setSuccess(` ${is_year ? 'Academic year' : 'Term'} set as current.`);
    } catch (err) {
      setError("Failed to update status.");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <div>
      <Breadcrumb items={[
        { label: "Dashboard", href: "/admin" },
        { label: "Calendar", href: "/admin/calendar" },
        { label: "Academic Calendar", href: "#" },
      ]} />

      <div className="page-header">
        <div>
          <h1 className="page-title">Academic Calendar</h1>
          <p className="page-subtitle">
            Manage academic years and terms for the school
          </p>
        </div>
      </div>

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
                      type="number"
                      placeholder="e.g. 2027"
                      value={yearForm.year}
                      onChange={(e) => handleYearChange(e.target.value)}
                      required
                    />
                    <div className="form-text" style={{ fontSize: "var(--fs-xs, 0.75rem)" }}>
                      Suggested: {suggestedYear}. Year dates default to a standard Jan–Oct school calendar.
                    </div>
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

                  {/* ---- inline term creation ---- */}
                  <div className="col-12">
                    <div className="form-check" style={{ marginTop: "0.5rem" }}>
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="createTermsWithYear"
                        checked={createTermsWithYear}
                        onChange={(e) => setCreateTermsWithYear(e.target.checked)}
                      />
                      <label className="form-check-label" htmlFor="createTermsWithYear">
                        Also create Term 1, 2 &amp; 3 for this year
                      </label>
                    </div>
                  </div>

                  {createTermsWithYear && (
                    <div className="col-12">
                      <div
                        style={{
                          border: "1px solid var(--border-color)",
                          borderRadius: "8px",
                          padding: "0.75rem",
                          background: "var(--bg-subtle, rgba(0,0,0,0.02))",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                          <strong style={{ fontSize: "var(--fs-sm)" }}>Term dates</strong>
                          <div>
                            <button
                              type="button"
                              className="btn btn-sm btn-link p-0 me-3"
                              onClick={() => setShowCustomTermDates((v) => !v)}
                            >
                              {showCustomTermDates ? "Hide" : "Customize dates"}
                            </button>
                            {termsTouched && (
                              <button type="button" className="btn btn-sm btn-link p-0" onClick={resetTermDraftToDefaults}>
                                Reset to default
                              </button>
                            )}
                          </div>
                        </div>

                        {!showCustomTermDates ? (
                          <ul className="mb-0" style={{ fontSize: "var(--fs-sm)", color: "var(--ink-600)", paddingLeft: "1.1rem" }}>
                            {termsDraft.map((t) => (
                              <li key={t.term_number}>
                                Term {t.term_number}: {formatDate(t.start_date)} – {formatDate(t.end_date)}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="row g-2">
                            {termsDraft.map((t, idx) => (
                              <div className="col-12" key={t.term_number}>
                                <div className="row g-2 align-items-end">
                                  <div className="col-3">
                                    <label className="form-label mb-0" style={{ fontSize: "var(--fs-xs, 0.75rem)" }}>
                                      Term {t.term_number}
                                    </label>
                                  </div>
                                  <div className="col-4">
                                    <input
                                      type="date"
                                      className="form-control form-control-sm"
                                      value={t.start_date}
                                      onChange={(e) => handleTermDraftChange(idx, "start_date", e.target.value)}
                                    />
                                  </div>
                                  <div className="col-5">
                                    <input
                                      type="date"
                                      className="form-control form-control-sm"
                                      value={t.end_date}
                                      onChange={(e) => handleTermDraftChange(idx, "end_date", e.target.value)}
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="col-12">
                    <button className="btn btn-primary w-100" type="submit" disabled={loading}>
                      <i className="bi bi-plus-lg me-1"></i>
                      {loading ? "Saving..." : createTermsWithYear ? "Add Academic Year + Terms" : "Add Academic Year"}
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

        {/* Terms Section (for adding an extra/one-off term to an existing year) */}
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
              <p className="text-muted-soft" style={{ fontSize: "var(--fs-sm)" }}>
                New years get their terms created automatically on the left. Use this form only to add an extra term to an existing year.
              </p>
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