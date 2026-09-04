// src/pages/admin/Dashboard.jsx
import { useEffect, useState } from "react";
import { studentsApi, calendarApi } from "../../services/api";

export default function AdminDashboard() {
  const [stats, setStats] = useState({ students: 0, years: [] });

  useEffect(() => {
    (async () => {
      const [studentsRes, yearsRes] = await Promise.all([
        studentsApi.list({ page_size: 1 }),
        calendarApi.academicYears(),
      ]);
      setStats({
        students: studentsRes.data.count ?? studentsRes.data.length ?? 0,
        years: yearsRes.data.results ?? yearsRes.data ?? [],
      });
    })();
  }, []);

  const currentYear = (stats.years ?? []).find((y) => y.is_current);

  return (
    <div>
      <h2 className="page-title">Admin Dashboard</h2>
      <div className="row g-3">
        <div className="col-6 col-md-3">
          <div className="stat-card">
            <i className="bi bi-people"></i>
            <div>
              <div className="stat-card__value">{stats.students}</div>
              <div className="stat-card__label">Students Enrolled</div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="stat-card">
            <i className="bi bi-calendar3"></i>
            <div>
              <div className="stat-card__value">{currentYear?.year ?? "-"}</div>
              <div className="stat-card__label">Current Academic Year</div>
            </div>
          </div>
        </div>
      </div>

      <div className="alert alert-light border mt-4">
        Use the sidebar to manage classes, subjects, teacher allocations, exams, rankings,
        promotions, fee structures and user accounts.
      </div>
    </div>
  );
}