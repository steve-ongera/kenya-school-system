import { useEffect, useState } from "react";
import { schoolApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";

export default function AdminSettings() {
  const [school, setSchool] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ 
    name: "", 
    school_type: "MIXED", 
    knec_code: "", 
    county: "", 
    address: "" 
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
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
      } catch (error) {
        console.error("Failed to load school settings:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setLoading(true);
    try {
      if (school) {
        await schoolApi.update(school.id, form);
      } else {
        const res = await schoolApi.create(form);
        setSchool(res.data);
      }
      setSaved(true);
      // Refresh school data
      const res = await schoolApi.list();
      const existing = (res.data.results ?? res.data ?? [])[0];
      if (existing) setSchool(existing);
    } catch (err) {
      setError(err.response?.data ? JSON.stringify(err.response.data) : "Failed to save.");
    } finally {
      setLoading(false);
    }
  };

  // Get school type badge color
  const getSchoolTypeBadge = (type) => {
    const colors = {
      MIXED: "badge-blue",
      BOYS: "badge-gold",
      GIRLS: "badge-gold",
    };
    return colors[type] || "badge-neutral";
  };

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: "Dashboard", href: "/admin" },
        { label: "Settings", href: "/admin/settings" },
        { label: "School Settings", href: "#" },
      ]} />

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">School Settings</h1>
          <p className="page-subtitle">
            Configure your school's basic information and preferences
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
      {saved && (
        <div className="alert alert-success alert-dismissible fade show" role="alert">
          <i className="bi bi-check-circle me-2"></i>
          School settings saved successfully!
          <button type="button" className="btn-close" onClick={() => setSaved(false)}></button>
        </div>
      )}

      <div className="row">
        <div className="col-12 col-lg-8 col-xl-6">
          {/* Settings Form Card */}
          <div className="card">
            <div className="card-header" style={{ 
              background: "transparent",
              borderBottom: "1px solid var(--border-color)",
              padding: "1rem 1.25rem",
              fontWeight: 700,
              color: "var(--ink-900)"
            }}>
              <i className="bi bi-gear me-2" style={{ color: "var(--blue-700)" }}></i>
              School Information
              {school && (
                <span className={`badge ${getSchoolTypeBadge(school.school_type)} ms-2`}>
                  {school.school_type}
                </span>
              )}
            </div>
            <div className="card-body">
              {loading && !school ? (
                <div>
                  <div className="skeleton skeleton-text" style={{ width: "100%", height: "40px", marginBottom: "1rem" }}></div>
                  <div className="skeleton skeleton-text" style={{ width: "100%", height: "40px", marginBottom: "1rem" }}></div>
                  <div className="skeleton skeleton-text" style={{ width: "100%", height: "40px", marginBottom: "1rem" }}></div>
                  <div className="skeleton skeleton-text" style={{ width: "100%", height: "40px", marginBottom: "1rem" }}></div>
                  <div className="skeleton skeleton-text" style={{ width: "100%", height: "80px", marginBottom: "1rem" }}></div>
                  <div className="skeleton skeleton-text" style={{ width: "120px", height: "40px" }}></div>
                </div>
              ) : (
                <form onSubmit={submit}>
                  {/* School Name */}
                  <div className="mb-3">
                    <label className="form-label">
                      <i className="bi bi-building me-1" style={{ color: "var(--blue-700)" }}></i>
                      School Name <span className="text-danger">*</span>
                    </label>
                    <input 
                      className="form-control" 
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })} 
                      placeholder="Enter school name"
                      required 
                    />
                  </div>

                  {/* School Type */}
                  <div className="mb-3">
                    <label className="form-label">
                      <i className="bi bi-gender-ambiguous me-1" style={{ color: "var(--blue-700)" }}></i>
                      School Type
                    </label>
                    <select 
                      className="form-select" 
                      value={form.school_type}
                      onChange={(e) => setForm({ ...form, school_type: e.target.value })}
                    >
                      <option value="MIXED">Mixed</option>
                      <option value="BOYS">Boys</option>
                      <option value="GIRLS">Girls</option>
                    </select>
                  </div>

                  <div className="row g-3">
                    {/* KNEC Code */}
                    <div className="col-md-6">
                      <div className="mb-3">
                        <label className="form-label">
                          <i className="bi bi-hash me-1" style={{ color: "var(--blue-700)" }}></i>
                          KNEC Code
                        </label>
                        <input 
                          className="form-control" 
                          value={form.knec_code}
                          onChange={(e) => setForm({ ...form, knec_code: e.target.value })} 
                          placeholder="e.g., 123456"
                        />
                      </div>
                    </div>

                    {/* County */}
                    <div className="col-md-6">
                      <div className="mb-3">
                        <label className="form-label">
                          <i className="bi bi-geo-alt me-1" style={{ color: "var(--blue-700)" }}></i>
                          County
                        </label>
                        <input 
                          className="form-control" 
                          value={form.county}
                          onChange={(e) => setForm({ ...form, county: e.target.value })} 
                          placeholder="e.g., Nairobi"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Address */}
                  <div className="mb-3">
                    <label className="form-label">
                      <i className="bi bi-envelope me-1" style={{ color: "var(--blue-700)" }}></i>
                      Address
                    </label>
                    <textarea 
                      className="form-control" 
                      rows={3} 
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })} 
                      placeholder="P.O. Box, City, Postal Code"
                    />
                    <div className="form-text-hint">
                      Full postal address of the school
                    </div>
                  </div>

                  {/* Form Actions */}
                  <div className="d-flex gap-2 mt-3">
                    <button 
                      className="btn btn-primary" 
                      type="submit" 
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                          Saving...
                        </>
                      ) : (
                        <>
                          <i className="bi bi-check2 me-2"></i>
                          Save Settings
                        </>
                      )}
                    </button>
                    {school && (
                      <button 
                        className="btn btn-secondary" 
                        type="button"
                        onClick={() => {
                          setForm({
                            name: school.name || "",
                            school_type: school.school_type || "MIXED",
                            knec_code: school.knec_code || "",
                            county: school.county || "",
                            address: school.address || "",
                          });
                        }}
                      >
                        <i className="bi bi-arrow-counterclockwise me-2"></i>
                        Reset
                      </button>
                    )}
                  </div>
                </form>
              )}
            </div>
          </div>

        
        </div>
      </div>
    </div>
  );
}