import { useEffect, useState } from "react";
import { studentsApi, examsApi } from "../../services/api";
import { useAuth } from "../../hooks/useAuth";

export default function StudentDashboard() {
  const { user } = useAuth();
  const [enrollment, setEnrollment] = useState(null);
  const [ranking, setRanking] = useState(null);
  const [invoice, setInvoice] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await studentsApi.enrollments({ status: "ACTIVE" });
      const list = data.results ?? data;
      const current = list[0];
      setEnrollment(current);
      if (current) {
        const { data: rankData } = await examsApi.rankings({ enrollment: current.id, checkpoint: "ENDTERM" });
        const rankList = rankData.results ?? rankData;
        setRanking(rankList[rankList.length - 1] || null);
      }
    })();
  }, []);

  return (
    <div>
      <h2 className="page-title">Welcome, {user?.first_name}</h2>
      <div className="row g-3">
        <div className="col-md-4">
          <div className="stat-card">
            <i className="bi bi-door-open"></i>
            <div>
              <div className="stat-card__value">{enrollment?.classroom_label || "-"}</div>
              <div className="stat-card__label">Current Class</div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="stat-card">
            <i className="bi bi-bar-chart-line"></i>
            <div>
              <div className="stat-card__value">{ranking ? `#${ranking.class_position}` : "-"}</div>
              <div className="stat-card__label">Latest Class Position</div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="stat-card">
            <i className="bi bi-graph-up"></i>
            <div>
              <div className="stat-card__value">{ranking ? `${ranking.average_marks}%` : "-"}</div>
              <div className="stat-card__label">Latest Average</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
