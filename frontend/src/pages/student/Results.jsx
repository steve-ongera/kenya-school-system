import { useEffect, useState } from "react";
import { studentsApi, examsApi, calendarApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";

export default function StudentResults() {
  const [enrollment, setEnrollment] = useState(null);
  const [terms, setTerms] = useState([]);
  const [selectedTerm, setSelectedTerm] = useState("");
  const [checkpoint, setCheckpoint] = useState("ENDTERM");
  const [results, setResults] = useState([]);
  const [ranking, setRanking] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [enrollRes, termsRes] = await Promise.all([
          studentsApi.enrollments({ status: "ACTIVE" }),
          calendarApi.terms({ is_current: true }),
        ]);
        const list = enrollRes.data.results ?? enrollRes.data;
        setEnrollment(list[0] || null);
        const termList = termsRes.data.results ?? termsRes.data;
        setTerms(termList);
        if (termList[0]) setSelectedTerm(termList[0].id);
      } catch (error) {
        console.error("Failed to load data:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!enrollment || !selectedTerm) return;
    (async () => {
      setLoading(true);
      try {
        const { data } = await examsApi.results({ enrollment: enrollment.id });
        setResults((data.results ?? data).filter((r) => true));
        const { data: rankData } = await examsApi.rankings({ 
          enrollment: enrollment.id, 
          term: selectedTerm, 
          checkpoint 
        });
        const rankList = rankData.results ?? rankData;
        setRanking(rankList[0] || null);
      } catch (error) {
        console.error("Failed to load results:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, [enrollment, selectedTerm, checkpoint]);

  // Calculate statistics
  const calculateStats = () => {
    const validResults = results.filter(r => !r.is_absent && r.marks_obtained !== null);
    if (validResults.length === 0) return null;
    
    const totalMarks = validResults.reduce((sum, r) => sum + Number(r.marks_obtained), 0);
    const totalMax = validResults.reduce((sum, r) => sum + Number(r.max_marks), 0);
    const average = totalMax > 0 ? (totalMarks / totalMax) * 100 : 0;
    const subjectCount = validResults.length;
    
    return { totalMarks, totalMax, average, subjectCount };
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

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: "Dashboard", href: "/student" },
        { label: "Results", href: "/student/results" },
        { label: "My Results", href: "#" },
      ]} />

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">My Results</h1>
          <p className="page-subtitle">
            View your academic performance and progress
          </p>
        </div>
        {enrollment && (
          <span className="badge badge-blue" style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem" }}>
            <i className="bi bi-door-open me-1"></i>
            {enrollment.classroom_label}
          </span>
        )}
      </div>

      {/* Filter Card */}
      <div className="card p-4 mb-4">
        <h6 className="mb-3" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
          <i className="bi bi-funnel me-2" style={{ color: "var(--blue-700)" }}></i>
          Filter Results
        </h6>
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label">Term</label>
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
          <div className="col-md-6">
            <label className="form-label">Checkpoint</label>
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

      {/* Ranking Summary */}
      {ranking && !loading && (
        <div className="alert alert-success" style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.5rem",
          padding: "1rem 1.25rem",
        }}>
          <div>
            <i className="bi bi-trophy me-2" style={{ color: "var(--gold-500)" }}></i>
            <strong>Class Position:</strong> 
            <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--ink-900)", marginLeft: "0.5rem" }}>
              #{ranking.class_position}
            </span>
            {ranking.grade_position && (
              <span style={{ color: "var(--ink-600)", marginLeft: "0.5rem" }}>
                (Grade-wide #{ranking.grade_position})
              </span>
            )}
          </div>
          <div>
            <strong>Average:</strong>
            <span style={{ 
              fontSize: "1.1rem", 
              fontWeight: 700, 
              color: Number(ranking.average_marks) >= 60 ? "var(--success-600)" : "var(--danger-600)",
              marginLeft: "0.5rem"
            }}>
              {ranking.average_marks}%
            </span>
            <span className={`badge ${getPerformanceColor(Number(ranking.average_marks))} ms-2`}>
              {getGrade(Number(ranking.average_marks))}
            </span>
          </div>
        </div>
      )}

      {/* Stats Summary */}
      {stats && !loading && results.length > 0 && (
        <div className="row g-3 mb-3">
          <div className="col-6 col-md-3">
            <div className="stat-card" style={{ padding: "0.75rem 1rem" }}>
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
      {loading ? (
        <TableSkeleton rows={5} columns={4} />
      ) : results.length === 0 ? (
        <div className="table-wrap">
          <div className="empty-state">
            <i className="bi bi-journal-text"></i>
            <h6>No Results Found</h6>
            <p className="text-muted-soft">
              {selectedTerm 
                ? "No results have been published for the selected term and checkpoint yet." 
                : "Please select a term to view your results."}
            </p>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <div className="table-wrap__header">
            <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
              <i className="bi bi-journal-text me-2"></i>
              Subject Results
              <span className="badge badge-neutral ms-2">{results.length}</span>
            </span>
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
              <i className="bi bi-calendar3 me-1"></i>
              {terms.find(t => String(t.id) === String(selectedTerm))?.academic_year_label || ""}
              {checkpoint === "MIDTERM" ? " - Midterm" : " - End of Term"}
            </span>
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th style={{ width: "120px" }}>Marks</th>
                  <th style={{ width: "100px" }}>Out of</th>
                  <th style={{ width: "120px" }}>%</th>
                  <th style={{ width: "80px" }}>Grade</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const percentage = r.percentage !== null && r.percentage !== undefined ? Number(r.percentage) : null;
                  return (
                    <tr key={r.id} className={r.is_absent ? "table-light" : ""}>
                      <td>
                        <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                          {r.subject_name}
                        </span>
                      </td>
                      <td>
                        {r.is_absent ? (
                          <span className="badge badge-danger">
                            <i className="bi bi-person-x me-1"></i>
                            Absent
                          </span>
                        ) : (
                          <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                            {r.marks_obtained !== null ? r.marks_obtained : "-"}
                          </span>
                        )}
                      </td>
                      <td style={{ color: "var(--ink-600)" }}>{r.max_marks}</td>
                      <td>
                        {percentage !== null ? (
                          <span className={`badge ${getPerformanceColor(percentage)}`}>
                            {percentage.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-muted-soft">-</span>
                        )}
                      </td>
                      <td>
                        {percentage !== null ? (
                          <span className={`badge ${getPerformanceColor(percentage)}`} style={{ fontWeight: 700 }}>
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
          <div className="table-wrap__footer">
            <span className="table-wrap__footer-info">
              Showing <strong>{results.length}</strong> subject{results.length !== 1 ? "s" : ""}
            </span>
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
              {results.filter(r => !r.is_absent).length} presented · {results.filter(r => r.is_absent).length} absent
            </span>
          </div>
        </div>
      )}
    </div>
  );
}