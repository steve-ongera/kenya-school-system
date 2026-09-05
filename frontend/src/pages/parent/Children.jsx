import { useEffect, useState } from "react";
import { studentsApi } from "../../services/api";

export default function ParentChildren() {
  const [children, setChildren] = useState([]);

  useEffect(() => {
    studentsApi.list().then(({ data }) => setChildren(data.results ?? data));
  }, []);

  return (
    <div>
      <h2 className="page-title">My Children</h2>
      <div className="table-responsive card">
        <table className="table table-hover mb-0">
          <thead><tr><th>Admission No</th><th>Name</th><th>Curriculum</th><th>Current Class</th></tr></thead>
          <tbody>
            {children.map((c) => (
              <tr key={c.id}>
                <td>{c.admission_no}</td>
                <td>{c.full_name}</td>
                <td>{c.curriculum_type}</td>
                <td>{c.current_classroom || "-"}</td>
              </tr>
            ))}
            {children.length === 0 && (
              <tr><td colSpan={4} className="text-center text-muted py-3">No children linked yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
