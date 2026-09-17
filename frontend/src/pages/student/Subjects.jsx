import { useEffect, useState } from "react";
import { studentsApi, academicsApi, pathwaysApi, selectionTracksApi } from "../../services/api";

export default function StudentSubjects() {
  const [enrollment, setEnrollment] = useState(null);
  const [availableSubjects, setAvailableSubjects] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [rule, setRule] = useState(null);

  // CBC pathway (Grade 9-10 etc.)
  const [pathways, setPathways] = useState([]);
  const [selectedPathway, setSelectedPathway] = useState(null);

  // 8-4-4 elective track (Form 3-4 etc.)
  const [tracks, setTracks] = useState([]);
  const [selectedTrack, setSelectedTrack] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await studentsApi.enrollments({ status: "ACTIVE" });
        const list = data.results ?? data;
        const current = list[0];
        setEnrollment(current);
        if (!current) return;

        const gradeLevelId = current.grade_level_id;
        const isCBC = current.curriculum_type === "CBC";
        const isLegacy = current.curriculum_type === "8-4-4";

        const [gradeSubjectsRes, selectedRes, rulesRes] = await Promise.all([
          academicsApi.gradeSubjects({ grade_level: gradeLevelId }),
          studentsApi.getSubjects(current.id),
          academicsApi.selectionRules(),
        ]);

        const subjectsList = gradeSubjectsRes.data.results ?? gradeSubjectsRes.data;
        setAvailableSubjects(subjectsList);
        setSelectedIds((selectedRes.data || []).map((s) => s.subject));

        const allRules = rulesRes.data.results ?? rulesRes.data;
        const gradeRule = allRules.find((r) => r.grade_level === gradeLevelId) || null;
        setRule(gradeRule);

        if (isCBC && gradeRule?.requires_pathway) {
          const pRes = await pathwaysApi.list({ is_active: true });
          setPathways(pRes.data.results ?? pRes.data);
          setSelectedPathway(current.pathway || null);
        }

        if (isLegacy) {
          const tRes = await selectionTracksApi.list({ grade_level: gradeLevelId, is_active: true });
          const trackList = tRes.data.results ?? tRes.data;
          setTracks(trackList);
          setSelectedTrack(current.selection_track || null);
        }
      } catch (err) {
        console.error("Failed to load subject selection:", err);
        setMessageType("danger");
        setMessage("Could not load your subject selection. Please try again later.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ---- compulsory subjects are auto-selected, whether or not the student
  // has ever explicitly checked them / saved before ----
  const compulsoryIds = availableSubjects.filter((gs) => gs.is_compulsory).map((gs) => gs.subject);

  // ---- what actually counts toward min/max, combining compulsory + optional ----
  const effectiveSelectedIds = Array.from(new Set([...compulsoryIds, ...selectedIds]));
  const totalSelected = effectiveSelectedIds.length;

  const minTotal = rule?.min_total_subjects ?? null;
  const maxTotal = rule?.max_total_subjects ?? null;

  const atMax = maxTotal != null && totalSelected >= maxTotal;
  const belowMin = minTotal != null && totalSelected < minTotal;
  const aboveMax = maxTotal != null && totalSelected > maxTotal;

  const toggleSubject = (subjectId) => {
    setSelectedIds((prev) => {
      const isChecked = prev.includes(subjectId);
      // Freeze: once max_total_subjects is reached, block adding any MORE
      // subjects. Unchecking (to free up a slot) is always still allowed.
      if (!isChecked && atMax) return prev;
      return isChecked ? prev.filter((id) => id !== subjectId) : [...prev, subjectId];
    });
  };

  const handlePathwayChange = (pathwayId) => {
    setSelectedPathway(pathwayId);
    setSelectedIds((prev) =>
      prev.filter((id) => {
        const gs = availableSubjects.find((g) => g.subject === id);
        return gs?.is_compulsory || !gs?.pathway || gs.pathway === pathwayId;
      })
    );
  };

  const handleTrackChange = (trackId) => {
    setSelectedTrack(trackId);
    const track = tracks.find((t) => t.id === trackId);
    const allowedGroupIds = new Set((track?.group_rules || []).map((r) => r.group));
    setSelectedIds((prev) =>
      prev.filter((id) => {
        const gs = availableSubjects.find((g) => g.subject === id);
        return gs?.is_compulsory || !gs?.elective_group || allowedGroupIds.has(gs.elective_group);
      })
    );
  };

  const save = async () => {
    setMessage("");
    setSaving(true);
    try {
      // Send the EFFECTIVE list (compulsory + optional), not just
      // selectedIds, so a fresh selection that never touched a compulsory
      // checkbox still passes the backend's missing_compulsory check.
      await studentsApi.setSubjects(enrollment.id, effectiveSelectedIds, selectedPathway, selectedTrack);
      setMessageType("success");
      setMessage("Subjects saved.");
    } catch (err) {
      setMessageType("danger");
      setMessage(err.response?.data?.detail || "Could not save subject selection.");
    } finally {
      setSaving(false);
    }
  };

  const isCBC = enrollment?.curriculum_type === "CBC";
  const isLegacy = enrollment?.curriculum_type === "8-4-4";
  const needsPathway = isCBC && !!rule?.requires_pathway;
  const needsTrack = isLegacy && tracks.length > 0;

  const electivesToShow = availableSubjects.filter((gs) => {
    if (gs.is_compulsory) return true;
    if (needsPathway && gs.pathway) return gs.pathway === selectedPathway;
    if (needsTrack && gs.elective_group) {
      const track = tracks.find((t) => t.id === selectedTrack);
      const allowedGroupIds = new Set((track?.group_rules || []).map((r) => r.group));
      return allowedGroupIds.has(gs.elective_group);
    }
    return true;
  });

  const readyForElectives = (!needsPathway || !!selectedPathway) && (!needsTrack || !!selectedTrack);

  // Save is blocked until we're inside [min,max] — atMax alone doesn't
  // block save (max is a valid, expected end state), only belowMin/aboveMax do.
  const saveDisabled = !enrollment || saving || !readyForElectives || belowMin || aboveMax;

  if (loading) {
    return (
      <div>
        <h2 className="page-title">My Subjects</h2>
        <p className="text-muted-soft">Loading your subject selection…</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="page-title">My Subjects</h2>

      {!enrollment && (
        <div className="alert alert-warning">
          No active enrollment found for your account. Please contact the school office.
        </div>
      )}

      {enrollment && (
        <p className="text-muted-soft mb-2">
          {enrollment.classroom_label} &middot;{" "}
          {isCBC ? "CBC" : isLegacy ? "8-4-4" : enrollment.curriculum_type}
        </p>
      )}

      {rule && (
        <p className="text-muted">
          You must pick between {rule.min_optional_subjects} and {rule.max_optional_subjects} optional
          subject(s), for a total of {rule.min_total_subjects}–{rule.max_total_subjects} subjects overall.
        </p>
      )}

      {message && (
        <div className={`alert alert-${messageType}`} role="alert">
          {message}
        </div>
      )}

      {/* ---- CBC pathway picker (Grade 9-10 etc.) ---- */}
      {needsPathway && (
        <div className="card p-3 mb-3">
          <label className="form-label fw-bold">Choose your pathway</label>
          <div className="d-flex flex-wrap gap-3">
            {pathways.map((p) => (
              <div className="form-check" key={p.id}>
                <input
                  type="radio"
                  className="form-check-input"
                  id={`pathway-${p.id}`}
                  name="pathway"
                  checked={selectedPathway === p.id}
                  onChange={() => handlePathwayChange(p.id)}
                />
                <label className="form-check-label" htmlFor={`pathway-${p.id}`}>
                  {p.name}
                </label>
              </div>
            ))}
          </div>
          {pathways.length === 0 && (
            <p className="text-muted-soft mb-0 mt-2">No pathways configured yet. Contact the school office.</p>
          )}
        </div>
      )}

      {/* ---- 8-4-4 elective track picker (Form 3-4 etc.) ---- */}
      {needsTrack && (
        <div className="card p-3 mb-3">
          <label className="form-label fw-bold">Choose your subject track</label>
          <div className="d-flex flex-column gap-2">
            {tracks.map((t) => (
              <div className="form-check" key={t.id}>
                <input
                  type="radio"
                  className="form-check-input"
                  id={`track-${t.id}`}
                  name="track"
                  checked={selectedTrack === t.id}
                  onChange={() => handleTrackChange(t.id)}
                />
                <label className="form-check-label" htmlFor={`track-${t.id}`}>
                  <span style={{ fontWeight: 600 }}>{t.name}</span>
                  {t.group_rules?.length > 0 && (
                    <span className="text-muted-soft ms-2">
                      (
                      {t.group_rules
                        .map((r) =>
                          r.min_choose === r.max_choose
                            ? `${r.min_choose} ${r.group_name}`
                            : `${r.min_choose}-${r.max_choose} ${r.group_name}`
                        )
                        .join(", ")}
                      )
                    </span>
                  )}
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- subject checklist ---- */}
      <div className="card p-3 mb-3">
        {readyForElectives ? (
          <>
            {/* Live count against the min/max total rule */}
            {rule && (
              <div className={`alert ${aboveMax ? "alert-danger" : atMax ? "alert-warning" : "alert-secondary"} py-2 px-3 mb-3`}>
                {totalSelected} of {rule.min_total_subjects}–{rule.max_total_subjects} subjects selected
                {atMax && !aboveMax && " — maximum reached. Uncheck one to swap it for another."}
                {aboveMax && " — you have too many selected, please remove some."}
                {belowMin && !atMax && ` — choose at least ${rule.min_total_subjects - totalSelected} more.`}
              </div>
            )}

            {electivesToShow.map((gs) => {
              const isSelected = gs.is_compulsory || selectedIds.includes(gs.subject);
              // Freeze any currently-unchecked optional checkbox once the
              // max total has been reached; compulsory ones are always
              // disabled anyway (they're locked on regardless).
              const isFrozen = !gs.is_compulsory && !isSelected && atMax;

              return (
                <div className="form-check" key={gs.id}>
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id={`subject-${gs.subject}`}
                    checked={isSelected}
                    disabled={gs.is_compulsory || isFrozen}
                    onChange={() => toggleSubject(gs.subject)}
                  />
                  <label className="form-check-label" htmlFor={`subject-${gs.subject}`}>
                    {gs.subject_name}
                    {gs.is_compulsory && <span className="badge text-bg-success ms-1">Compulsory</span>}
                    {gs.pathway_name && <span className="badge text-bg-info ms-1">{gs.pathway_name}</span>}
                    {gs.elective_group_name && (
                      <span className="badge text-bg-secondary ms-1">{gs.elective_group_name}</span>
                    )}
                    {isFrozen && <span className="badge text-bg-light text-muted ms-1">Max reached</span>}
                  </label>
                </div>
              );
            })}
            {availableSubjects.length === 0 && (
              <p className="text-muted mb-0">No subjects configured for your grade yet.</p>
            )}
          </>
        ) : (
          <p className="text-muted-soft mb-0">
            {needsPathway && !selectedPathway && "Select a pathway above to see your subjects."}
            {needsTrack && !selectedTrack && "Select a track above to see your subjects."}
          </p>
        )}
      </div>

      <button className="btn btn-primary" onClick={save} disabled={saveDisabled}>
        {saving
          ? "Saving..."
          : belowMin
          ? `Select ${minTotal - totalSelected} more to save`
          : "Save Subject Selection"}
      </button>
    </div>
  );
}