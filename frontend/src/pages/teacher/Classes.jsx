import { useEffect, useState } from "react";
import { teacherApi } from "../../services/api";

export default function TeacherClasses() {
  const [allocations, setAllocations] = useState([]);

  useEffect(() => {
    teacherApi.myAllocations().then(({ data }) => setAllocations(data.results ?? data));
  }, []);

  return (
    <div>
      <h2 className="page-title">My Classes</h2>
      <p className="text-muted">Every subject/classroom pair you're allocated to this academic year.</p>
      <div className="table-responsive card">
        <table className="table table-hover mb-0">
          <thead><tr><th>Subject</th><th>Classroom</th></tr></thead>
          <tbody>
            {allocations.map((a) => (
              <tr key={a.id}><td>{a.subject_name}</td><td>{a.classroom_label}</td></tr>
            ))}
            {allocations.length === 0 && (
              <tr><td colSpan={2} className="text-center text-muted py-3">No allocations yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
