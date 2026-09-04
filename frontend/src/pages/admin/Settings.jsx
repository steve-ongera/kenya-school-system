import { useEffect, useState } from "react";
import { schoolApi } from "../../services/api";

export default function AdminSettings() {
  const [school, setSchool] = useState(null);
  const [form, setForm] = useState({ name: "", school_type: "MIXED", knec_code: "", county: "", address: "" });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      const res = await schoolApi.list();
      const existing = (res.data.results ?? res.data ?? [])[0];
      if (existing) {
        setSchool(existing);
        setForm({
          name: existing.name || "",
          school_type: existing.school_type || "MIXED",
          knec_code: existing.knec_code || "",
          county: existing.county || "",
          address: existing.address || "",
        });
      }
    })();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      if (school) {
        await schoolApi.update(school.id, form);
      } else {
        const res = await schoolApi.create(form);
        setSchool(res.data);
      }
      setSaved(true);
    } catch (err) {
      setError(err.response?.data ? JSON.stringify(err.response.data) : "Failed to save.");
    }
  };

  return (
    <div>
      <h2 className="page-title">School Settings</h2>
      {error && <div className="alert alert-danger">{error}</div>}
      {saved && <div className="alert alert-success">Saved.</div>}

      <div className="card p-3" style={{ maxWidth: 560 }}>
        <form onSubmit={submit}>
          <div className="mb-3">
            <label className="form-label">School Name</label>
            <input className="form-control" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="mb-3">
            <label className="form-label">Type</label>
            <select className="form-select" value={form.school_type}
              onChange={(e) => setForm({ ...form, school_type: e.target.value })}>
              <option value="MIXED">Mixed</option>
              <option value="BOYS">Boys</option>
              <option value="GIRLS">Girls</option>
            </select>
          </div>
          <div className="mb-3">
            <label className="form-label">KNEC Code</label>
            <input className="form-control" value={form.knec_code}
              onChange={(e) => setForm({ ...form, knec_code: e.target.value })} />
          </div>
          <div className="mb-3">
            <label className="form-label">County</label>
            <input className="form-control" value={form.county}
              onChange={(e) => setForm({ ...form, county: e.target.value })} />
          </div>
          <div className="mb-3">
            <label className="form-label">Address</label>
            <textarea className="form-control" rows={3} value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <button className="btn btn-primary" type="submit">Save Settings</button>
        </form>
      </div>
    </div>
  );
}