import { useEffect, useState } from "react";
import { calendarApi } from "../../services/api";

export default function AdminCalendar() {
  const [years, setYears] = useState([]);
  const [terms, setTerms] = useState([]);
  const [yearForm, setYearForm] = useState({ year: "", start_date: "", end_date: "", is_current: false });
  const [termForm, setTermForm] = useState({ academic_year: "", term_number: 1, start_date: "", end_date: "", is_current: false });
  const [error, setError] = useState(null);

  const load = async () => {
    const [y, t] = await Promise.all([calendarApi.academicYears(), calendarApi.terms()]);
    setYears(y.data.results ?? y.data ?? []);
    setTerms(t.data.results ?? t.data ?? []);
  };

  useEffect(() => { load(); }, []);

  const submitYear = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await calendarApi.createAcademicYear(yearForm);
      setYearForm({ year: "", start_date: "", end_date: "", is_current: false });
      load();
    } catch (err) {
      setError(err.response?.data ? JSON.stringify(err.response.data) : "Failed to save academic year.");
    }
  };

  const submitTerm = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await calendarApi.createTerm(termForm);
      setTermForm({ academic_year: "", term_number: 1, start_date: "", end_date: "", is_current: false });
      load();
    } catch (err) {
      setError(err.response?.data ? JSON.stringify(err.response.data) : "Failed to save term.");
    }
  };

  const makeCurrent = async (id, is_year) => {
    if (is_year) await calendarApi.updateAcademicYear(id, { is_current: true });
    else await calendarApi.updateTerm(id, { is_current: true });
    load();
  };

  return (
    <div>
      <h2 className="page-title">Academic Calendar</h2>
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="row g-3">
        <div className="col-12 col-lg-6">
          <div className="card p-3">
            <h6 className="mb-3">Academic Years</h6>
            <form className="row g-2 mb-3" onSubmit={submitYear}>
              <div className="col-4">
                <input className="form-control" placeholder="Year e.g. 2027" value={yearForm.year}
                  onChange={(e) => setYearForm({ ...yearForm, year: e.target.value })} required />
              </div>
              <div className="col-4">
                <input type="date" className="form-control" value={yearForm.start_date}
                  onChange={(e) => setYearForm({ ...yearForm, start_date: e.target.value })} required />
              </div>
              <div className="col-4">
                <input type="date" className="form-control" value={yearForm.end_date}
                  onChange={(e) => setYearForm({ ...yearForm, end_date: e.target.value })} required />
              </div>
              <div className="col-12">
                <button className="btn btn-primary btn-sm" type="submit">Add Academic Year</button>
              </div>
            </form>
            <table className="table table-sm">
              <thead><tr><th>Year</th><th>Start</th><th>End</th><th>Current</th><th></th></tr></thead>
              <tbody>
                {years.map((y) => (
                  <tr key={y.id}>
                    <td>{y.year}</td>
                    <td>{y.start_date}</td>
                    <td>{y.end_date}</td>
                    <td>{y.is_current ? <span className="badge bg-success">Current</span> : "-"}</td>
                    <td>
                      {!y.is_current && (
                        <button className="btn btn-outline-primary btn-sm" onClick={() => makeCurrent(y.id, true)}>
                          Set Current
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col-12 col-lg-6">
          <div className="card p-3">
            <h6 className="mb-3">Terms</h6>
            <form className="row g-2 mb-3" onSubmit={submitTerm}>
              <div className="col-6">
                <select className="form-select" value={termForm.academic_year}
                  onChange={(e) => setTermForm({ ...termForm, academic_year: e.target.value })} required>
                  <option value="">Academic Year</option>
                  {years.map((y) => <option key={y.id} value={y.id}>{y.year}</option>)}
                </select>
              </div>
              <div className="col-6">
                <select className="form-select" value={termForm.term_number}
                  onChange={(e) => setTermForm({ ...termForm, term_number: Number(e.target.value) })}>
                  <option value={1}>Term 1</option>
                  <option value={2}>Term 2</option>
                  <option value={3}>Term 3</option>
                </select>
              </div>
              <div className="col-6">
                <input type="date" className="form-control" value={termForm.start_date}
                  onChange={(e) => setTermForm({ ...termForm, start_date: e.target.value })} required />
              </div>
              <div className="col-6">
                <input type="date" className="form-control" value={termForm.end_date}
                  onChange={(e) => setTermForm({ ...termForm, end_date: e.target.value })} required />
              </div>
              <div className="col-12">
                <button className="btn btn-primary btn-sm" type="submit">Add Term</button>
              </div>
            </form>
            <table className="table table-sm">
              <thead><tr><th>Term</th><th>Year</th><th>Start</th><th>End</th><th>Current</th><th></th></tr></thead>
              <tbody>
                {terms.map((t) => (
                  <tr key={t.id}>
                    <td>Term {t.term_number}</td>
                    <td>{t.academic_year_label}</td>
                    <td>{t.start_date}</td>
                    <td>{t.end_date}</td>
                    <td>{t.is_current ? <span className="badge bg-success">Current</span> : "-"}</td>
                    <td>
                      {!t.is_current && (
                        <button className="btn btn-outline-primary btn-sm" onClick={() => makeCurrent(t.id, false)}>
                          Set Current
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}