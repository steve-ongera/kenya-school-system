import { useEffect, useState } from "react";
import { studentsApi, examsApi, calendarApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";

export default function ParentResults() {
  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState("");
  const [enrollment, setEnrollment] = useState(null);
  const [results, setResults] = useState([]);
  const [ranking, setRanking] = useState(null);
  const [terms, setTerms] = useState([]);
  const [selectedTerm, setSelectedTerm] = useState("");
  const [checkpoint, setCheckpoint] = useState("ENDTERM");
  const [loading, setLoading] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);

  useEffect(() => {
    setLoading(true);
    studentsApi
      .list()
      .then(({ data }) => {
        const list = data.results ?? data;
        setChildren(list);
        if (list[0]) setSelectedChild(list[0].id);
      })
      .catch((error) => console.error("Failed to load children:", error))
      .finally(() => setLoading(false));

    calendarApi.terms({ is_current: true }).then(({ data }) => {
      const termList = data.results ?? data;
      setTerms(termList);
      if (termList[0]) setSelectedTerm(termList[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedChild) return;
    setLoadingResults(true);
    (async () => {
      try {
        const { data } = await studentsApi.enrollments({ student: selectedChild, status: "ACTIVE" });
        const list = data.results ?? data;
        const current = list[0] || null;
        setEnrollment(current);
        if (current) {
          const [resultsRes, rankRes] = await Promise.all([
            examsApi.results({ enrollment: current.id }),
            examsApi.rankings({ enrollment: current.id, checkpoint: "ENDTERM" }),
          ]);
          setResults(resultsRes.data.results ?? resultsRes.data);
          const rankList = rankRes.data.results ?? rankRes.data;
          setRanking(rankList[rankList.length - 1] || null);
        }
      } catch (error) {
        console.error("Failed to load results:", error);
      } finally {
        setLoadingResults(false);
      }
    })();
  }, [selectedChild]);

  // Calculate statistics
  const calculateStats = () => {
    const validResults = results.filter(r => !r.is_absent && r.marks_obtained !== null);
    if (validResults.length === 0) return null;

    const totalMarks = validResults.reduce((sum, r) => sum + Number(r.marks_obtained), 0);
    const totalMax = validResults.reduce((sum, r) => sum + Number(r.max_marks), 0);
    const average = totalMax > 0 ? (totalMarks / totalMax) * 100 : 0;

    return { totalMarks, totalMax, average, subjectCount: validResults.length };
  };

  const stats = calculateStats();

  // Get performance color
  const getPerformanceColor = (percentage) => {
    if (percentage === null || percentage === undefined) return "badge-neutral";
    if (percentage >= 80) return "badge-success";
    if (percentage >= 60) return "badge-gold";
    if (percentage >= 40) return "badge-blue";
    return "badge-danger";
  };

  // Get grade letter
  const getGrade = (percentage) => {
    if (percentage === null || percentage === undefined) return "-";
    if (percentage >= 80) return "A";
    if (percentage >= 70) return "B+";
    if (percentage >= 60) return "B";
    if (percentage >= 50) return "C+";
    if (percentage >= 40) return "C";
    if (percentage >= 30) return "D";
    return "E";
  };

  const selectedChildData = children.find(c => String(c.id) === String(selectedChild));

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: "Dashboard", href: "/parent" },
        { label: "Results", href: "/parent/results" },
        { label: "View Results", href: "#" },
      ]} />

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Results</h1>
          <p className="page-subtitle">
            View your children's academic performance and progress
          </p>
        </div>
        {enrollment && (
          <span className="badge badge-blue" style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem" }}>
            <i className="bi bi-door-open me-1"></i>
            {enrollment.classroom_label}
          </span>
        )}
      </div>

      {/* Child Selector + Filters */}
      <div className="card p-4 mb-4">
        <div className="row g-3">
          <div className="col-md-4">
            <label className="form-label">
              <i className="bi bi-person me-1" style={{ color: "var(--blue-700)" }}></i>
              Select Child
            </label>
            <select 
              className="form-select" 
              value={selectedChild} 
              onChange={(e) => setSelectedChild(e.target.value)}
            >
              {children.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name} ({c.admission_no})
                </option>
              ))}
              {children.length === 0 && (
                <option value="">No children linked</option>
              )}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">
              <i className="bi bi-calendar3 me-1" style={{ color: "var(--blue-700)" }}></i>
              Term
            </label>
            <select 
              className="form-select" 
              value={selectedTerm} 
              onChange={(e) => setSelectedTerm(e.target.value)}
            >
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  Term {t.term_number} - {t.academic_year_label}
                </option>
              ))}
              {terms.length === 0 && (
                <option value="">No terms available</option>
              )}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">
              <i className="bi bi-clipboard-check me-1" style={{ color: "var(--blue-700)" }}></i>
              Checkpoint
            </label>
            <select 
              className="form-select" 
              value={checkpoint} 
              onChange={(e) => setCheckpoint(e.target.value)}
            >
              <option value="MIDTERM">Midterm</option>
              <option value="ENDTERM">End of Term</option>
            </select>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading || loadingResults ? (
        <>
          <div className="row g-3 mb-4">
            {[1, 2, 3].map((i) => (
              <div className="col-6 col-md-3" key={i}>
                <div className="stat-card stat-card--skeleton">
                  <i className="bi bi-circle"></i>
                  <div>
                    <div className="skeleton skeleton-text" style={{ width: "50px", height: "24px" }}></div>
                    <div className="skeleton skeleton-text" style={{ width: "80px", height: "14px", marginTop: "4px" }}></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <TableSkeleton rows={5} columns={5} />
        </>
      ) : children.length === 0 ? (
        <div className="empty-state">
          <i className="bi bi-people"></i>
          <h6>No children linked</h6>
          <p className="text-muted-soft">
            Please contact the school administration to link your children to your account.
          </p>
        </div>
      ) : !enrollment ? (
        <div className="empty-state">
          <i className="bi bi-person-x"></i>
          <h6>No active enrollment</h6>
          <p className="text-muted-soft">
            {selectedChildData?.full_name || "This child"} is not currently enrolled in any active class.
          </p>
        </div>
      ) : (
        <>
          {/* Student Info Banner */}
          <div className="card mb-4" style={{ background: "linear-gradient(135deg, var(--blue-50) 0%, var(--blue-100) 100%)", border: "1px solid var(--blue-200)" }}>
            <div className="card-body" style={{ padding: "1rem 1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                <div style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  background: "var(--blue-700)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  flexShrink: 0,
                }}>
                  {selectedChildData?.first_name?.[0]}{selectedChildData?.last_name?.[0]}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: "var(--fs-md)", color: "var(--blue-900)" }}>
                    {selectedChildData?.full_name}
                  </div>
                  <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-600)" }}>
                    <i className="bi bi-hash me-1"></i>
                    {selectedChildData?.admission_no}
                    <span className="mx-2">·</span>
                    <i className="bi bi-door-open me-1"></i>
                    {enrollment.classroom_label}
                  </div>
                </div>
                {ranking && (
                  <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                    <div style={{
                      background: "var(--surface)",
                      borderRadius: "var(--radius-md)",
                      padding: "0.5rem 1rem",
                      textAlign: "center",
                      border: "1px solid var(--border-color)",
                    }}>
                      <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>Position</div>
                      <div style={{ fontWeight: 700, color: "var(--blue-700)", fontSize: "1.1rem" }}>
                        #{ranking.class_position}
                      </div>
                    </div>
                    <div style={{
                      background: "var(--surface)",
                      borderRadius: "var(--radius-md)",
                      padding: "0.5rem 1rem",
                      textAlign: "center",
                      border: "1px solid var(--border-color)",
                    }}>
                      <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>Average</div>
                      <div style={{ fontWeight: 700, color: getPerformanceColor(Number(ranking.average_marks)).includes("success") ? "var(--success-600)" : "var(--blue-700)", fontSize: "1.1rem" }}>
                        {ranking.average_marks}%
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Stats Summary */}
          {stats && results.length > 0 && (
            <div className="row g-3 mb-4">
              <div className="col-6 col-md-3">
                <div className="stat-card" style={{ padding: "0.75rem 1rem" }}>
                  <i className="bi bi-book"></i>
                  <div>
                    <div className="stat-card__value" style={{ fontSize: "1.2rem" }}>
                      {stats.subjectCount}
                    </div>
                    <div className="stat-card__label">Subjects</div>
                  </div>
                </div>
              </div>
              <div className="col-6 col-md-3">
                <div className="stat-card stat-card--success" style={{ padding: "0.75rem 1rem" }}>
                  <i className="bi bi-trophy"></i>
                  <div>
                    <div className="stat-card__value" style={{ fontSize: "1.2rem" }}>
                      {stats.totalMarks}
                    </div>
                    <div className="stat-card__label">Total Marks</div>
                  </div>
                </div>
              </div>
              <div className="col-6 col-md-3">
                <div className="stat-card stat-card--gold" style={{ padding: "0.75rem 1rem" }}>
                  <i className="bi bi-graph-up"></i>
                  <div>
                    <div className="stat-card__value" style={{ fontSize: "1.2rem" }}>
                      {stats.average.toFixed(1)}%
                    </div>
                    <div className="stat-card__label">Overall Average</div>
                  </div>
                </div>
              </div>
              <div className="col-6 col-md-3">
                <div className="stat-card stat-card--blue" style={{ padding: "0.75rem 1rem" }}>
                  <i className="bi bi-award"></i>
                  <div>
                    <div className="stat-card__value" style={{ fontSize: "1.2rem" }}>
                      {getGrade(stats.average)}
                    </div>
                    <div className="stat-card__label">Grade</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Results Table */}
          <div className="table-wrap">
            <div className="table-wrap__header">
              <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                <i className="bi bi-journal-text me-2" style={{ color: "var(--blue-700)" }}></i>
                Subject Results
                <span className="badge badge-neutral ms-2">{results.length}</span>
              </span>
              <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
                <i className="bi bi-calendar3 me-1"></i>
                {terms.find(t => String(t.id) === String(selectedTerm))?.academic_year_label || ""}
                {checkpoint === "MIDTERM" ? " - Midterm" : " - End of Term"}
              </span>
            </div>

            {results.length === 0 ? (
              <div className="empty-state">
                <i className="bi bi-journal-text"></i>
                <h6>No results published yet</h6>
                <p className="text-muted-soft">
                  Results for the selected term and checkpoint have not been published.
                </p>
              </div>
            ) : (
              <>
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead>
                      <tr>
                        <th>Subject</th>
                        <th style={{ width: "120px" }} className="text-center">Marks</th>
                        <th style={{ width: "100px" }} className="text-center">Out of</th>
                        <th style={{ width: "120px" }} className="text-center">%</th>
                        <th style={{ width: "80px" }} className="text-center">Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r) => {
                        const percentage = r.percentage !== null && r.percentage !== undefined ? Number(r.percentage) : null;
                        return (
                          <tr key={r.id} className={r.is_absent ? "table-light" : ""}>
                            <td>
                              <div className="table-avatar-cell">
                                <div className="avatar-sm" style={{
                                  background: r.is_absent ? "var(--ink-100)" : "var(--blue-100)",
                                  color: r.is_absent ? "var(--ink-400)" : "var(--blue-700)",
                                }}>
                                  <i className="bi bi-book" style={{ fontSize: "0.75rem" }}></i>
                                </div>
                                <span className="cell-name">{r.subject_name}</span>
                              </div>
                            </td>
                            <td className="text-center">
                              {r.is_absent ? (
                                <span className="badge badge-danger">
                                  <i className="bi bi-person-x me-1"></i>
                                  Absent
                                </span>
                              ) : (
                                <span style={{ fontWeight: 700, color: "var(--ink-900)", fontSize: "var(--fs-md)" }}>
                                  {r.marks_obtained !== null ? r.marks_obtained : "-"}
                                </span>
                              )}
                            </td>
                            <td className="text-center" style={{ color: "var(--ink-600)" }}>
                              {r.max_marks}
                            </td>
                            <td className="text-center">
                              {percentage !== null ? (
                                <span className={`badge ${getPerformanceColor(percentage)}`}>
                                  {percentage.toFixed(1)}%
                                </span>
                              ) : (
                                <span className="text-muted-soft">-</span>
                              )}
                            </td>
                            <td className="text-center">
                              {percentage !== null ? (
                                <span className={`badge ${getPerformanceColor(percentage)}`} style={{ fontWeight: 700, minWidth: "36px" }}>
                                  {getGrade(percentage)}
                                </span>
                              ) : (
                                <span className="text-muted-soft">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Footer Summary */}
                <div className="table-wrap__footer">
                  <span className="table-wrap__footer-info">
                    Showing <strong>{results.length}</strong> subject{results.length !== 1 ? "s" : ""}
                  </span>
                  <div style={{ display: "flex", gap: "1rem", fontSize: "var(--fs-xs)" }}>
                    <span style={{ color: "var(--success-600)" }}>
                      <i className="bi bi-check-circle me-1"></i>
                      Presented: {results.filter(r => !r.is_absent).length}
                    </span>
                    <span style={{ color: "var(--danger-600)" }}>
                      <i className="bi bi-person-x me-1"></i>
                      Absent: {results.filter(r => r.is_absent).length}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}