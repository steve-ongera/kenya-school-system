import { useEffect, useState } from "react";
import { studentsApi } from "../../services/api";
import { useAuth } from "../../hooks/useAuth";

export default function ParentDashboard() {
  const { user } = useAuth();
  const [children, setChildren] = useState([]);

  useEffect(() => {
    studentsApi.list().then(({ data }) => setChildren(data.results ?? data));
  }, []);

  return (
    <div>
      <h2 className="page-title">Welcome, {user?.first_name}</h2>
      <div className="row g-3">
        {children.map((c) => (
          <div className="col-md-4" key={c.id}>
            <div className="card p-3">
              <h6 className="mb-1">{c.full_name}</h6>
              <div className="text-muted small mb-1">Admission No: {c.admission_no}</div>
              <div className="text-muted small">Class: {c.current_classroom || "-"}</div>
            </div>
          </div>
        ))}
        {children.length === 0 && (
          <div className="col-12"><div className="alert alert-light border">No children linked to your account yet.</div></div>
        )}
      </div>
    </div>
  );
}
