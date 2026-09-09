import { useEffect, useMemo, useState } from "react";
import { studentsApi, examsApi, calendarApi, academicsApi, profileApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";

// ---------------------------------------------------------------------------
// Fallback grading bands, used ONLY when /grading-scales/ isn't reachable or
// doesn't have a row that covers a given percentage. Real schools should
// configure GradingScale rows in the admin so these never actually fire -
// they exist so the page still shows *something* sensible out of the box.
// ---------------------------------------------------------------------------
const FALLBACK_844 = [
  { min: 80, max: 100, letter: "A", points: 12 },
  { min: 75, max: 79.99, letter: "A-", points: 11 },
  { min: 70, max: 74.99, letter: "B+", points: 10 },
  { min: 65, max: 69.99, letter: "B", points: 9 },
  { min: 60, max: 64.99, letter: "B-", points: 8 },
  { min: 55, max: 59.99, letter: "C+", points: 7 },
  { min: 50, max: 54.99, letter: "C", points: 6 },
  { min: 45, max: 49.99, letter: "C-", points: 5 },
  { min: 40, max: 44.99, letter: "D+", points: 4 },
  { min: 35, max: 39.99, letter: "D", points: 3 },
  { min: 30, max: 34.99, letter: "D-", points: 2 },
  { min: 0, max: 29.99, letter: "E", points: 1 },
];

const FALLBACK_CBC = [
  { min: 75, max: 100, letter: "EE", points: null, remark: "Exceeding Expectation" },
  { min: 50, max: 74.99, letter: "ME", points: null, remark: "Meeting Expectation" },
  { min: 30, max: 49.99, letter: "AE", points: null, remark: "Approaching Expectation" },
  { min: 0, max: 29.99, letter: "BE", points: null, remark: "Below Expectation" },
];

function fallbackGrade(curriculumType, percentage) {
  const table = curriculumType === "CBC" ? FALLBACK_CBC : FALLBACK_844;
  return table.find((b) => percentage >= b.min && percentage <= b.max) || null;
}

export default function StudentResults() {
  // ---- identity / curriculum ----
  const [profile, setProfile] = useState(null);

  // ---- full academic history (every enrollment, every year, any status) ----
  const [enrollmentHistory, setEnrollmentHistory] = useState([]);
  const [classroomsById, setClassroomsById] = useState({});
  const [academicYears, setAcademicYears] = useState([]);
  const [gradingScales, setGradingScales] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // ---- drilldown selection: year -> term -> exam ----
  const [selectedYear, setSelectedYear] = useState("");
  const [terms, setTerms] = useState([]);
  const [termsLoading, setTermsLoading] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState("");
  const [exams, setExams] = useState([]);
  const [examsLoading, setExamsLoading] = useState(false);
  const [selectedExam, setSelectedExam] = useState("");

  // ---- results for the chosen exam ----
  const [results, setResults] = useState([]);
  const [resultsLoading, setResultsLoading] = useState(false);

  // ---- ranking: fetched automatically, no manual checkpoint picker ----
  // We prefer the End of Term ranking (the fuller picture), but fall back
  // to Midterm automatically if end-of-term hasn't been computed yet, so
  // the student always sees a position when one exists, without having to
  // choose anything themselves.
  const [ranking, setRanking] = useState(null);
  const [rankingCheckpoint, setRankingCheckpoint] = useState(null);
  const [rankingLoading, setRankingLoading] = useState(false);

  // ---------------------------------------------------------------------
  // Initial load: who is this student, their whole enrollment history,
  // every classroom (to resolve grade_level ids), every academic year
  // (for labels), and the grading scale (for correct grade/points).
  // ---------------------------------------------------------------------
  useEffect(() => {
    (async () => {
      setHistoryLoading(true);
      try {
        const [profileRes, enrollRes, classroomsRes, yearsRes] = await Promise.all([
          profileApi.me(),
          // no status filter - we want EVERY year this student has ever
          // been enrolled in, not just the current active one
          studentsApi.enrollments({ page_size: 200 }),
          academicsApi.classrooms({ page_size: 500 }),
          calendarApi.academicYears(),
        ]);

        setProfile(profileRes.data);

        const history = (enrollRes.data.results ?? enrollRes.data)
          .slice()
          .sort((a, b) => a.academic_year - b.academic_year);
        setEnrollmentHistory(history);

        const cMap = {};
        (classroomsRes.data.results ?? classroomsRes.data).forEach((c) => { cMap[c.id] = c; });
        setClassroomsById(cMap);

        const yearsList = yearsRes.data.results ?? yearsRes.data;
        setAcademicYears(yearsList);

        // grading scale is optional - if the endpoint isn't wired up yet
        // we just fall back to the hardcoded bands above
        try {
          if (academicsApi.gradingScales) {
            const { data } = await academicsApi.gradingScales();
            setGradingScales(data.results ?? data);
          }
        } catch {
          setGradingScales([]);
        }

        // default to the most recent year the student was actually
        // enrolled in (prefers the current academic year if it's among them)
        if (history.length > 0) {
          const currentYearObj = yearsList.find((y) => y.is_current);
          const hasCurrent = currentYearObj && history.some((e) => e.academic_year === currentYearObj.id);
          const defaultYear = hasCurrent
            ? currentYearObj.id
            : history[history.length - 1].academic_year;
          setSelectedYear(defaultYear);
        }
      } catch (error) {
        console.error("Failed to load student history:", error);
      } finally {
        setHistoryLoading(false);
      }
    })();
  }, []);

  const yearLabel = (yearId) => academicYears.find((y) => y.id === yearId)?.year ?? yearId;

  // the enrollment record that matches whichever year is selected
  const currentEnrollment = useMemo(
    () => enrollmentHistory.find((e) => String(e.academic_year) === String(selectedYear)),
    [enrollmentHistory, selectedYear]
  );
  const currentClassroom = currentEnrollment ? classroomsById[currentEnrollment.classroom] : null;

  // ---------------------------------------------------------------------
  // Terms for the selected year
  // ---------------------------------------------------------------------
  useEffect(() => {
    setSelectedTerm("");
    setTerms([]);
    if (!selectedYear) return;
    setTermsLoading(true);
    calendarApi.terms({ academic_year: selectedYear })
      .then(({ data }) => {
        const list = (data.results ?? data).slice().sort((a, b) => a.term_number - b.term_number);
        setTerms(list);
        const current = list.find((t) => t.is_current);
        setSelectedTerm(current ? current.id : (list[list.length - 1]?.id ?? ""));
      })
      .catch((err) => { console.error("Failed to load terms:", err); setTerms([]); })
      .finally(() => setTermsLoading(false));
  }, [selectedYear]);

  // ---------------------------------------------------------------------
  // Exams for the selected term, scoped to the grade_level the student was
  // actually in during that year - and published only, since students
  // shouldn't see draft/unpublished exams.
  // ---------------------------------------------------------------------
  useEffect(() => {
    setSelectedExam("");
    setExams([]);
    if (!selectedTerm || !currentClassroom) return;
    setExamsLoading(true);
    examsApi.exams({ term: selectedTerm, grade_level: currentClassroom.grade_level })
      .then(({ data }) => {
        const list = (data.results ?? data)
          .filter((ex) => ex.is_published)
          .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
        setExams(list);
        // default to the most recent exam so the page shows something
        // useful immediately, but the student can switch freely
        setSelectedExam(list.length ? list[list.length - 1].id : "");
      })
      .catch((err) => { console.error("Failed to load exams:", err); setExams([]); })
      .finally(() => setExamsLoading(false));
  }, [selectedTerm, currentClassroom]);

  // ---------------------------------------------------------------------
  // Results for the selected exam - properly scoped this time, unlike the
  // old "fetch everything, filter nothing" version.
  // ---------------------------------------------------------------------
  useEffect(() => {
    setResults([]);
    if (!currentEnrollment || !selectedExam) return;
    setResultsLoading(true);
    examsApi.results({ enrollment: currentEnrollment.id, exam: selectedExam, page_size: 500 })
      .then(({ data }) => setResults(data.results ?? data))
      .catch((err) => console.error("Failed to load results:", err))
      .finally(() => setResultsLoading(false));
  }, [currentEnrollment, selectedExam]);

  // ---------------------------------------------------------------------
  // Ranking (class/grade position) - a term-level checkpoint aggregate,
  // not tied to one specific exam, so it's fetched separately.
  //
  // No manual checkpoint picker: we ask for the End of Term ranking first
  // since it's the fuller picture, and only fall back to Midterm if
  // end-of-term hasn't been computed yet. Whichever one actually has data
  // is what gets shown, labelled accordingly.
  // ---------------------------------------------------------------------
  useEffect(() => {
    setRanking(null);
    setRankingCheckpoint(null);
    if (!currentEnrollment || !selectedTerm) return;

    let cancelled = false;
    const fetchCheckpoint = (checkpoint) =>
      examsApi
        .rankings({ enrollment: currentEnrollment.id, term: selectedTerm, checkpoint })
        .then(({ data }) => (data.results ?? data)[0] || null);

    setRankingLoading(true);
    fetchCheckpoint("ENDTERM")
      .then((endterm) => {
        if (cancelled) return;
        if (endterm) {
          setRanking(endterm);
          setRankingCheckpoint("ENDTERM");
          return;
        }
        // End of term isn't ready yet - try midterm instead of showing nothing
        return fetchCheckpoint("MIDTERM").then((midterm) => {
          if (cancelled) return;
          if (midterm) {
            setRanking(midterm);
            setRankingCheckpoint("MIDTERM");
          }
        });
      })
      .catch((err) => console.error("Failed to load ranking:", err))
      .finally(() => { if (!cancelled) setRankingLoading(false); });

    return () => { cancelled = true; };
  }, [currentEnrollment, selectedTerm]);

  // ---------------------------------------------------------------------
  // Group raw ExamResult rows (one per subject+paper) into one row per
  // subject, combining papers (e.g. Math PP1 + PP2) the way a report card
  // would, and attach grade/points via the grading scale.
  // ---------------------------------------------------------------------
  const curriculumType = profile?.student_profile?.curriculum_type;

  const gradeFor = (subjectId, percentage) => {
    if (percentage === null || percentage === undefined) return null;
    const scaleRows = gradingScales.filter(
      (s) => s.curriculum_type === curriculumType && percentage >= Number(s.min_percentage) && percentage <= Number(s.max_percentage)
    );
    const specific = scaleRows.find((s) => s.subject === subjectId);
    const generic = scaleRows.find((s) => s.subject === null);
    const match = specific || generic;
    if (match) {
      return { letter: match.grade_letter, points: match.points !== undefined ? Number(match.points) : null, remark: match.remark };
    }
    return fallbackGrade(curriculumType, percentage);
  };

  const subjectRows = useMemo(() => {
    const map = {};
    results.forEach((r) => {
      const key = r.subject;
      if (!map[key]) {
        map[key] = { subject_id: r.subject, subject_name: r.subject_name, papers: [], marksTotal: 0, maxTotal: 0, hasMarks: false, anyAbsent: false };
      }
      map[key].papers.push(r);
      if (r.is_absent) {
        map[key].anyAbsent = true;
      } else if (r.marks_obtained !== null && r.marks_obtained !== undefined) {
        map[key].marksTotal += Number(r.marks_obtained);
        map[key].maxTotal += Number(r.max_marks);
        map[key].hasMarks = true;
      }
    });
    return Object.values(map).map((row) => {
      const percentage = row.hasMarks && row.maxTotal > 0 ? (row.marksTotal / row.maxTotal) * 100 : null;
      const grade = percentage !== null ? gradeFor(row.subject_id, percentage) : null;
      return { ...row, percentage, grade };
    });
  }, [results, gradingScales, curriculumType]);

  // ---------------------------------------------------------------------
  // Overall stats for the selected exam
  // ---------------------------------------------------------------------
  const stats = useMemo(() => {
    const scored = subjectRows.filter((r) => r.percentage !== null);
    if (scored.length === 0) return null;
    const totalMarks = scored.reduce((s, r) => s + r.marksTotal, 0);
    const totalMax = scored.reduce((s, r) => s + r.maxTotal, 0);
    const average = totalMax > 0 ? (totalMarks / totalMax) * 100 : 0;
    const allHavePoints = scored.every((r) => r.grade && r.grade.points !== null && r.grade.points !== undefined);
    const totalPoints = allHavePoints ? scored.reduce((s, r) => s + r.grade.points, 0) : null;
    return { subjectCount: scored.length, totalMarks, totalMax, average, totalPoints };
  }, [subjectRows]);

  const perfBadgeClass = (percentage) => {
    if (percentage === null || percentage === undefined) return "badge-neutral";
    if (percentage >= 80) return "badge-success";
    if (percentage >= 60) return "badge-gold";
    if (percentage >= 40) return "badge-blue";
    return "badge-danger";
  };

  const selectedExamObj = exams.find((e) => String(e.id) === String(selectedExam));
  const selectedTermObj = terms.find((t) => String(t.id) === String(selectedTerm));

  return (
    <div>
      {/* print-only styling: hides everything except #printable-report */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable-report, #printable-report * { visibility: visible; }
          #printable-report { position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="no-print">
        <Breadcrumb items={[
          { label: "Dashboard", href: "/student" },
          { label: "Results", href: "/student/results" },
          { label: "My Results", href: "#" },
        ]} />

        <div className="page-header">
          <div>
            <h1 className="page-title">My Results</h1>
            <p className="page-subtitle">
              Browse your results by academic year, term and exam - or print a report card.
            </p>
          </div>
          <div className="d-flex gap-2 align-items-center flex-wrap">
            {curriculumType && (
              <span className="badge badge-blue" style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem" }}>
                <i className="bi bi-mortarboard me-1"></i>
                {curriculumType === "CBC" ? "CBC" : "8-4-4"}
              </span>
            )}
            {currentClassroom && (
              <span className="badge badge-neutral" style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem" }}>
                <i className="bi bi-door-open me-1"></i>
                {currentClassroom.grade_level_name} {currentClassroom.stream_name}
              </span>
            )}
          </div>
        </div>

        {/* ---- Academic history timeline ---- */}
        {!historyLoading && enrollmentHistory.length > 0 && (
          <div className="card p-3 mb-4">
            <h6 className="mb-3" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
              <i className="bi bi-clock-history me-2" style={{ color: "var(--blue-700)" }}></i>
              Academic History
            </h6>
            <div className="d-flex flex-wrap gap-2">
              {enrollmentHistory.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className={`btn btn-sm ${String(e.academic_year) === String(selectedYear) ? "btn-primary" : "btn-outline-secondary"}`}
                  onClick={() => setSelectedYear(e.academic_year)}
                  title={e.classroom_label}
                >
                  {yearLabel(e.academic_year)} — {e.classroom_label}
                  {e.status !== "ACTIVE" && (
                    <span className="ms-1" style={{ fontSize: "0.7rem", opacity: 0.8 }}>({e.status})</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {historyLoading && <TableSkeleton rows={2} columns={4} />}

        {!historyLoading && enrollmentHistory.length === 0 && (
          <div className="table-wrap">
            <div className="empty-state">
              <i className="bi bi-journal-x"></i>
              <h6>No Enrollment Records</h6>
              <p className="text-muted-soft">We couldn't find any enrollment history for your account.</p>
            </div>
          </div>
        )}

        {/* ---- Year / Term / Exam selectors ---- */}
        {enrollmentHistory.length > 0 && (
          <div className="card p-4 mb-4">
            <h6 className="mb-3" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
              <i className="bi bi-funnel me-2" style={{ color: "var(--blue-700)" }}></i>
              Choose Year, Term & Exam
            </h6>
            <div className="row g-3">
              <div className="col-md-4">
                <label className="form-label">Academic Year</label>
                <select className="form-select" value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)}>
                  {enrollmentHistory
                    .slice()
                    .sort((a, b) => b.academic_year - a.academic_year)
                    .map((e) => (
                      <option key={e.academic_year} value={e.academic_year}>
                        {yearLabel(e.academic_year)} ({e.classroom_label})
                      </option>
                    ))}
                </select>
              </div>
              <div className="col-md-4">
                <label className="form-label">Term</label>
                <select
                  className="form-select"
                  value={selectedTerm}
                  onChange={(e) => setSelectedTerm(e.target.value)}
                  disabled={termsLoading || terms.length === 0}
                >
                  {terms.length === 0 && <option value="">{termsLoading ? "Loading..." : "No terms"}</option>}
                  {terms.map((t) => (
                    <option key={t.id} value={t.id}>Term {t.term_number}</option>
                  ))}
                </select>
              </div>
              <div className="col-md-4">
                <label className="form-label">Exam</label>
                <select
                  className="form-select"
                  value={selectedExam}
                  onChange={(e) => setSelectedExam(e.target.value)}
                  disabled={examsLoading || exams.length === 0}
                >
                  {exams.length === 0 && (
                    <option value="">{examsLoading ? "Loading..." : "No published exams"}</option>
                  )}
                  {exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>{ex.name} ({ex.exam_type_name})</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ================= PRINTABLE REPORT AREA ================= */}
      {selectedExam && (
        <div id="printable-report">
          {/* print-only header, hidden on screen */}
          <div className="d-none d-print-block mb-3">
            <h4 className="mb-0">Report Card</h4>
            <div style={{ fontSize: "0.9rem" }}>
              {profile?.first_name} {profile?.last_name} ({profile?.student_profile?.admission_no}) —{" "}
              {currentClassroom ? `${currentClassroom.grade_level_name} ${currentClassroom.stream_name}` : ""} —{" "}
              {selectedTermObj ? `Term ${selectedTermObj.term_number}, ${yearLabel(selectedYear)}` : ""} —{" "}
              {selectedExamObj?.name}
            </div>
            <hr />
          </div>

          {/* ---- Ranking summary (auto-fetched, no picker needed) ---- */}
          {rankingLoading && (
            <div className="alert alert-light no-print" style={{ padding: "0.75rem 1.25rem" }}>
              <span className="text-muted-soft">
                <i className="bi bi-hourglass-split me-2"></i>
                Loading class position...
              </span>
            </div>
          )}

          {!rankingLoading && ranking && (
            <div className="alert alert-success" style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexWrap: "wrap", gap: "0.5rem", padding: "1rem 1.25rem",
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
                <strong>Term Average ({rankingCheckpoint === "MIDTERM" ? "Midterm" : "End of Term"}):</strong>
                <span style={{
                  fontSize: "1.1rem", fontWeight: 700,
                  color: Number(ranking.average_marks) >= 60 ? "var(--success-600)" : "var(--danger-600)",
                  marginLeft: "0.5rem",
                }}>
                  {ranking.average_marks}%
                </span>
              </div>
            </div>
          )}

          {/* ---- Stats for this specific exam ---- */}
          {stats && !resultsLoading && (
            <div className="row g-3 mb-3">
              <div className="col-6 col-md-3">
                <div className="stat-card" style={{ padding: "0.75rem 1rem" }}>
                  <div>
                    <div className="stat-card__value" style={{ fontSize: "1.2rem" }}>{stats.subjectCount}</div>
                    <div className="stat-card__label">Subjects</div>
                  </div>
                </div>
              </div>
              <div className="col-6 col-md-3">
                <div className="stat-card stat-card--success" style={{ padding: "0.75rem 1rem" }}>
                  <div>
                    <div className="stat-card__value" style={{ fontSize: "1.2rem" }}>
                      {stats.totalMarks} / {stats.totalMax}
                    </div>
                    <div className="stat-card__label">Total Marks (this exam)</div>
                  </div>
                </div>
              </div>
              <div className="col-6 col-md-3">
                <div className="stat-card stat-card--gold" style={{ padding: "0.75rem 1rem" }}>
                  <div>
                    <div className="stat-card__value" style={{ fontSize: "1.2rem" }}>{stats.average.toFixed(1)}%</div>
                    <div className="stat-card__label">Exam Average</div>
                  </div>
                </div>
              </div>
              <div className="col-6 col-md-3">
                <div className="stat-card stat-card--blue" style={{ padding: "0.75rem 1rem" }}>
                  <div>
                    <div className="stat-card__value" style={{ fontSize: "1.2rem" }}>
                      {curriculumType === "CBC"
                        ? (fallbackGrade("CBC", stats.average)?.remark || "-")
                        : (stats.totalPoints !== null ? stats.totalPoints : "-")}
                    </div>
                    <div className="stat-card__label">
                      {curriculumType === "CBC" ? "Overall Level" : "Total Points"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ---- Per-subject table ---- */}
          {resultsLoading ? (
            <TableSkeleton rows={5} columns={5} />
          ) : subjectRows.length === 0 ? (
            <div className="table-wrap">
              <div className="empty-state">
                <i className="bi bi-journal-text"></i>
                <h6>No Results Found</h6>
                <p className="text-muted-soft">
                  No marks have been entered for this exam yet, or it hasn't been published.
                </p>
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <div className="table-wrap__header">
                <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                  <i className="bi bi-journal-text me-2"></i>
                  {selectedExamObj?.name}
                  <span className="badge badge-neutral ms-2">{subjectRows.length}</span>
                </span>
                <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
                  <i className="bi bi-calendar3 me-1"></i>
                  Term {selectedTermObj?.term_number}, {yearLabel(selectedYear)}
                </span>
              </div>
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th style={{ width: "160px" }}>Marks</th>
                      <th style={{ width: "100px" }}>Out of</th>
                      <th style={{ width: "100px" }}>%</th>
                      <th style={{ width: "80px" }}>Grade</th>
                      {curriculumType !== "CBC" && <th style={{ width: "80px" }}>Points</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {subjectRows.map((row) => (
                      <tr key={row.subject_id} className={row.anyAbsent && !row.hasMarks ? "table-light" : ""}>
                        <td>
                          <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>{row.subject_name}</span>
                        </td>
                        <td>
                          {row.anyAbsent && !row.hasMarks ? (
                            <span className="badge badge-danger">
                              <i className="bi bi-person-x me-1"></i>Absent
                            </span>
                          ) : row.papers.length > 1 ? (
                            <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-600)" }}>
                              {row.papers.map((p, i) => (
                                <span key={p.id}>
                                  <span className="text-muted-soft">{p.paper_name || `Paper ${i + 1}`}: </span>
                                  {p.is_absent ? "Abs" : p.marks_obtained ?? "-"}
                                  {i < row.papers.length - 1 ? "  •  " : ""}
                                </span>
                              ))}
                              <br />
                              <strong style={{ color: "var(--ink-900)" }}>Total: {row.marksTotal}</strong>
                            </span>
                          ) : (
                            <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                              {row.hasMarks ? row.marksTotal : "-"}
                            </span>
                          )}
                        </td>
                        <td style={{ color: "var(--ink-600)" }}>
                          {row.papers.length > 1 ? (
                            <span style={{ fontSize: "var(--fs-xs)" }}>
                              {row.papers.map((p, i) => (
                                <span key={p.id}>
                                  <span className="text-muted-soft">{p.paper_name || `Paper ${i + 1}`}: </span>
                                  {Number(p.max_marks)}
                                  {i < row.papers.length - 1 ? "  •  " : ""}
                                </span>
                              ))}
                              <br />
                              <strong>Total: {row.maxTotal}</strong>
                            </span>
                          ) : (
                            row.maxTotal || "-"
                          )}
                        </td>
                        <td>
                          {row.percentage !== null ? (
                            <span className={`badge ${perfBadgeClass(row.percentage)}`}>
                              {row.percentage.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-muted-soft">-</span>
                          )}
                        </td>
                        <td>
                          {row.grade ? (
                            <span className={`badge ${perfBadgeClass(row.percentage)}`} style={{ fontWeight: 700 }}>
                              {row.grade.letter}
                            </span>
                          ) : (
                            <span className="text-muted-soft">-</span>
                          )}
                        </td>
                        {curriculumType !== "CBC" && (
                          <td style={{ color: "var(--ink-600)" }}>
                            {row.grade?.points !== null && row.grade?.points !== undefined ? row.grade.points : "-"}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-wrap__footer no-print">
                <span className="table-wrap__footer-info">
                  Showing <strong>{subjectRows.length}</strong> subject{subjectRows.length !== 1 ? "s" : ""}
                </span>
                <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => window.print()}>
                  <i className="bi bi-printer me-1"></i>
                  Print Report Card
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}