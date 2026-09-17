import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { academicsApi, calendarApi, timetableApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";
import logoImage from "../../assets/masomo_logo.png";

const DAYS = [
  { value: "MON", label: "Monday" }, { value: "TUE", label: "Tuesday" },
  { value: "WED", label: "Wednesday" }, { value: "THU", label: "Thursday" },
  { value: "FRI", label: "Friday" }, { value: "SAT", label: "Saturday" },
];

const SLOT_TYPES = [
  { value: "LESSON", label: "Lesson" },
  { value: "BREAK", label: "Short/Long Break" },
  { value: "LUNCH", label: "Lunch" },
  { value: "ASSEMBLY", label: "Assembly" },
  { value: "GAMES", label: "Games / Sports" },
  { value: "PREP", label: "Evening Prep / Study" },
];

const TYPE_STYLE = {
  LESSON:   { bg: "#eaf2ff", border: "#b6d4fe", text: "#0b5ed7" },
  BREAK:    { bg: "#fff8e1", border: "#ffe08a", text: "#8a6d00" },
  LUNCH:    { bg: "#e8f8ee", border: "#a3e4bb", text: "#1a7d3f" },
  ASSEMBLY: { bg: "#f1f1f4", border: "#d8d8de", text: "#55555f" },
  GAMES:    { bg: "#f3ecff", border: "#d9c4fb", text: "#6f36c9" },
  PREP:     { bg: "#eef1ff", border: "#c8d0ff", text: "#39449e" },
};

// Abbreviate a teacher's name to "A. Omondi" style — first initial(s)
// followed by the surname. Handles 1, 2, or 3+ word names:
//   "Alex Omondi"        -> "A. Omondi"
//   "Alex Juma Omondi"   -> "A. J. Omondi"
//   "Omondi"             -> "Omondi"
//   "" / null / "—"      -> "—"
const shortTeacherName = (fullName) => {
  if (!fullName) return "—";
  const trimmed = String(fullName).trim();
  if (!trimmed || trimmed === "—" || trimmed === "-") return "—";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0];
  const surname = parts[parts.length - 1];
  const initials = parts.slice(0, -1).map((p) => `${p[0].toUpperCase()}.`).join(" ");
  return `${initials} ${surname}`;
};

// Shared helper: load an image URL as a base64 data URL (for the PDF logo)
const getImageBase64 = (url) =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = url;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(null);
  });

export default function AdminTimetableManagement() {
  const [activeTab, setActiveTab] = useState("grid"); // "structure" | "grid"

  return (
    <div>
      <Breadcrumb items={[
        { label: "Dashboard", href: "/admin" },
        { label: "Timetable Management", href: "#" },
      ]} />
      <div className="page-header">
        <div>
          <h1 className="page-title">Timetable Management</h1>
          <p className="page-subtitle">
            Set up your weekly period structure once, then build or auto-generate each class's timetable.
          </p>
        </div>
      </div>

      <ul className="nav nav-tabs mb-4">
        <li className="nav-item">
          <button className={`nav-link ${activeTab === "structure" ? "active" : ""}`} onClick={() => setActiveTab("structure")}>
            <i className="bi bi-sliders me-2"></i>Structure Setup
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${activeTab === "grid" ? "active" : ""}`} onClick={() => setActiveTab("grid")}>
            <i className="bi bi-grid-3x3 me-2"></i>Timetable Grid
          </button>
        </li>
      </ul>

      {activeTab === "structure" ? <StructureSetup /> : <TimetableGrid />}
    </div>
  );
}

// ===========================================================================
// STRUCTURE SETUP — a real timetable grid: rows are DAYS, columns are the
// week's TIME SLOTS (shared across days). Cells are click-to-edit.
// ===========================================================================
function StructureSetup() {
  const [rows, setRows] = useState([]); // {day, order, slot_type, label, start_time, end_time}
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [copyFromDay, setCopyFromDay] = useState("MON");
  const [editingCell, setEditingCell] = useState(null); // `${day}-${order}`
  const [cellDraft, setCellDraft] = useState({ slot_type: "LESSON", label: "" });

  useEffect(() => {
    (async () => {
      try {
        const res = await timetableApi.periodSlots();
        const data = res.data.results ?? res.data;
        setRows(data.length ? data : defaultTemplate());
      } catch {
        setRows(defaultTemplate());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function defaultTemplate() {
    const weekday = [
      { order: 1,  slot_type: "LESSON",  label: "Period 1",     start_time: "07:00", end_time: "07:35" },
      { order: 2,  slot_type: "LESSON",  label: "Period 2",     start_time: "07:35", end_time: "08:10" },
      { order: 3,  slot_type: "BREAK",   label: "Short Break",  start_time: "08:10", end_time: "08:25" },
      { order: 4,  slot_type: "LESSON",  label: "Period 3",     start_time: "08:25", end_time: "09:00" },
      { order: 5,  slot_type: "LESSON",  label: "Period 4",     start_time: "09:00", end_time: "09:35" },
      { order: 6,  slot_type: "BREAK",   label: "Long Break",   start_time: "09:35", end_time: "10:05" },
      { order: 7,  slot_type: "LESSON",  label: "Period 5",     start_time: "10:05", end_time: "10:40" },
      { order: 8,  slot_type: "LESSON",  label: "Period 6",     start_time: "10:40", end_time: "11:15" },
      { order: 9,  slot_type: "LUNCH",   label: "Lunch",        start_time: "11:15", end_time: "12:15" },
      { order: 10, slot_type: "LESSON",  label: "Period 7",     start_time: "12:15", end_time: "12:50" },
      { order: 11, slot_type: "LESSON",  label: "Period 8",     start_time: "12:50", end_time: "13:25" },
      { order: 12, slot_type: "LESSON",  label: "Period 9",     start_time: "13:25", end_time: "14:00" },
      { order: 13, slot_type: "GAMES",   label: "Games",        start_time: "14:00", end_time: "15:00" },
      { order: 14, slot_type: "LESSON",  label: "Period 10",    start_time: "15:00", end_time: "15:35" },
      { order: 15, slot_type: "PREP",    label: "Evening Prep", start_time: "15:35", end_time: "18:00" },
    ];
    const saturday = [
      { order: 1, slot_type: "LESSON", label: "Period 1",       start_time: "07:00", end_time: "07:35" },
      { order: 2, slot_type: "LESSON", label: "Period 2",       start_time: "07:35", end_time: "08:10" },
      { order: 3, slot_type: "BREAK",  label: "Short Break",    start_time: "08:10", end_time: "08:25" },
      { order: 4, slot_type: "LESSON", label: "Period 3",       start_time: "08:25", end_time: "09:00" },
      { order: 5, slot_type: "LESSON", label: "Period 4",       start_time: "09:00", end_time: "09:35" },
      { order: 6, slot_type: "BREAK",  label: "Long Break",     start_time: "09:35", end_time: "10:05" },
      { order: 7, slot_type: "GAMES",  label: "Games / Sports", start_time: "10:05", end_time: "12:00" },
    ];
    return [
      ...["MON", "TUE", "WED", "THU", "FRI"].flatMap((day) => weekday.map((t) => ({ ...t, day }))),
      ...saturday.map((t) => ({ ...t, day: "SAT" })),
    ];
  }

  const orders = useMemo(() => {
    const set = new Set(rows.map((r) => r.order));
    return Array.from(set).sort((a, b) => a - b);
  }, [rows]);

  const getCell = (day, order) => rows.find((r) => r.day === day && r.order === order);

  const getColumnTime = (order) => {
    for (const d of DAYS.map((x) => x.value)) {
      const r = rows.find((row) => row.day === d && row.order === order);
      if (r) return { start_time: r.start_time, end_time: r.end_time };
    }
    return { start_time: "08:00", end_time: "08:35" };
  };

  const updateColumnTime = (order, field, value) => {
    setRows((prev) => prev.map((r) => (r.order === order ? { ...r, [field]: value } : r)));
  };

  const openCellEditor = (day, order) => {
    const existing = getCell(day, order);
    setCellDraft(existing
      ? { slot_type: existing.slot_type, label: existing.label }
      : { slot_type: "LESSON", label: "Period" });
    setEditingCell(`${day}-${order}`);
  };

  const saveCellEditor = (day, order) => {
    setRows((prev) => {
      const exists = prev.some((r) => r.day === day && r.order === order);
      if (exists) {
        return prev.map((r) =>
          r.day === day && r.order === order
            ? { ...r, slot_type: cellDraft.slot_type, label: cellDraft.label }
            : r
        );
      }
      const { start_time, end_time } = getColumnTime(order);
      return [...prev, { day, order, slot_type: cellDraft.slot_type, label: cellDraft.label, start_time, end_time }];
    });
    setEditingCell(null);
  };

  const removeCell = (day, order) => {
    setRows((prev) => prev.filter((r) => !(r.day === day && r.order === order)));
    setEditingCell(null);
  };

  const addOrderColumn = () => {
    const nextOrder = orders.length ? Math.max(...orders) + 1 : 1;
    const { end_time: prevEnd } = orders.length ? getColumnTime(Math.max(...orders)) : { end_time: "07:00" };
    const [h, m] = prevEnd.split(":").map(Number);
    const endDate = new Date(2000, 0, 1, h, m + 35);
    const end = `${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`;
    setRows((prev) => [
      ...prev,
      ...DAYS.map((d) => ({
        day: d.value, order: nextOrder, slot_type: "LESSON", label: `Period`,
        start_time: prevEnd, end_time: end,
      })),
    ]);
  };

  const removeOrderColumn = (order) => {
    setRows((prev) => prev.filter((r) => r.order !== order));
  };

  const copyToOtherDays = () => {
    const source = rows.filter((r) => r.day === copyFromDay);
    setRows((prev) => {
      const kept = prev.filter((r) => r.day === copyFromDay);
      const others = DAYS.filter((d) => d.value !== copyFromDay)
        .flatMap((d) => source.map((r) => ({ ...r, day: d.value })));
      return [...kept, ...others];
    });
  };

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      await timetableApi.bulkSetStructure(rows.map((r) => ({
        day: r.day, order: r.order, slot_type: r.slot_type,
        label: r.label, start_time: r.start_time, end_time: r.end_time,
      })));
      setMessage("Timetable structure saved.");
    } catch (err) {
      setMessage(err.response?.data ? JSON.stringify(err.response.data) : "Could not save structure.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <TableSkeleton rows={8} columns={7} />;

  return (
    <div>
      {message && (
        <div className="alert alert-info alert-dismissible fade show">
          {message}
          <button type="button" className="btn-close" onClick={() => setMessage("")}></button>
        </div>
      )}

      {/* Legend */}
      <div className="d-flex flex-wrap gap-2 mb-3">
        {SLOT_TYPES.map((t) => {
          const style = TYPE_STYLE[t.value];
          return (
            <span key={t.value} className="d-inline-flex align-items-center gap-1 px-2 py-1"
              style={{ background: style.bg, border: `1px solid ${style.border}`, borderRadius: "6px", fontSize: "var(--fs-xs)", color: style.text, fontWeight: 600 }}>
              {t.label}
            </span>
          );
        })}
      </div>

      <div className="card p-3 mb-3 d-flex flex-row align-items-center gap-2 flex-wrap">
        <span className="fw-semibold">Quick setup:</span>
        <select className="form-select form-select-sm" style={{ width: "auto" }} value={copyFromDay} onChange={(e) => setCopyFromDay(e.target.value)}>
          {DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        <button className="btn btn-sm btn-outline-primary" onClick={copyToOtherDays}>
          <i className="bi bi-copy me-1"></i>Copy this day's full structure to every other day
        </button>
        <span className="text-muted-soft" style={{ fontSize: "var(--fs-xs)" }}>
          (Saturday is set up shorter by default — feel free to overwrite it too)
        </span>
      </div>

      {/* The real timetable grid: DAY rows x TIME columns */}
      <div className="table-wrap">
        <div className="table-responsive">
          <table className="table table-bordered mb-0" style={{ tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th style={{ width: "110px" }}>Day</th>
                {orders.map((order) => {
                  const time = getColumnTime(order);
                  return (
                    <th key={order} className="text-center" style={{ minWidth: "150px", width: "150px" }}>
                      <div className="d-flex flex-column gap-1 align-items-center">
                        <input
                          type="time"
                          className="form-control"
                          style={{ fontSize: "14px", padding: "4px 6px", minWidth: "130px" }}
                          value={time.start_time}
                          onChange={(e) => updateColumnTime(order, "start_time", e.target.value)}
                        />
                        <input
                          type="time"
                          className="form-control"
                          style={{ fontSize: "14px", padding: "4px 6px", minWidth: "130px" }}
                          value={time.end_time}
                          onChange={(e) => updateColumnTime(order, "end_time", e.target.value)}
                        />
                        <button className="btn btn-sm btn-outline-danger btn-icon" title="Remove this time column from the whole week"
                          onClick={() => removeOrderColumn(order)}>
                          <i className="bi bi-trash"></i>
                        </button>
                      </div>
                    </th>
                  );
                })}
                <th style={{ width: "60px" }}></th>
              </tr>
            </thead>
            <tbody>
              {DAYS.map((d) => (
                <tr key={d.value}>
                  <td className="fw-semibold align-middle">{d.label}</td>
                  {orders.map((order) => {
                    const cell = getCell(d.value, order);
                    const key = `${d.value}-${order}`;
                    const isEditing = editingCell === key;

                    if (isEditing) {
                      return (
                        <td key={key} style={{ verticalAlign: "top" }}>
                          <div className="d-flex flex-column gap-1">
                            <select className="form-select form-select-sm" value={cellDraft.slot_type}
                              onChange={(e) => setCellDraft((c) => ({ ...c, slot_type: e.target.value }))}>
                              {SLOT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                            <input className="form-control form-control-sm" value={cellDraft.label}
                              placeholder="Label" onChange={(e) => setCellDraft((c) => ({ ...c, label: e.target.value }))} />
                            <div className="d-flex gap-1">
                              <button className="btn btn-sm btn-primary" onClick={() => saveCellEditor(d.value, order)}>Save</button>
                              {cell && (
                                <button className="btn btn-sm btn-outline-danger" onClick={() => removeCell(d.value, order)}>
                                  <i className="bi bi-trash"></i>
                                </button>
                              )}
                              <button className="btn btn-sm btn-light" onClick={() => setEditingCell(null)}>
                                <i className="bi bi-x"></i>
                              </button>
                            </div>
                          </div>
                        </td>
                      );
                    }

                    if (!cell) {
                      return (
                        <td key={key} className="text-center align-middle" style={{ background: "#fafafa" }}>
                          <button className="btn btn-sm btn-outline-secondary" title="Add a slot for this day"
                            onClick={() => openCellEditor(d.value, order)}>
                            <i className="bi bi-plus"></i>
                          </button>
                        </td>
                      );
                    }

                    const style = TYPE_STYLE[cell.slot_type] || TYPE_STYLE.LESSON;
                    return (
                      <td key={key} className="text-center align-middle" style={{ cursor: "pointer", background: style.bg, borderColor: style.border }}
                        onClick={() => openCellEditor(d.value, order)} title="Click to edit">
                        <div style={{ fontWeight: 600, fontSize: "var(--fs-xs)", color: style.text }}>{cell.label}</div>
                        <div style={{ fontSize: "10px", color: style.text, opacity: 0.75 }}>
                          {SLOT_TYPES.find((t) => t.value === cell.slot_type)?.label}
                        </div>
                      </td>
                    );
                  })}
                  <td></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <button className="btn btn-sm btn-light mt-3" onClick={addOrderColumn}>
        <i className="bi bi-plus-lg me-1"></i>Add a time column
      </button>

      <div className="mt-4">
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save Structure"}
        </button>
        <p className="text-muted-soft mt-2" style={{ fontSize: "var(--fs-xs)" }}>
          Saving replaces the whole weekly structure. Existing timetable entries tied to removed slots are cleared —
          regenerate or rebuild the grid afterward if you change the structure mid-term.
        </p>
      </div>
    </div>
  );
}

// ===========================================================================
// TIMETABLE GRID — pick term + class, view/edit, or auto-generate.
// Also transposed: DAY rows x TIME columns, matching Structure Setup.
// ===========================================================================
function TimetableGrid() {
  const [years, setYears] = useState([]);
  const [terms, setTerms] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [selectedTerm, setSelectedTerm] = useState("");
  const [selectedClassroom, setSelectedClassroom] = useState("");
  const [gridDays, setGridDays] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [allocations, setAllocations] = useState([]);
  const [editingCell, setEditingCell] = useState(null);
  const [pickAlloc, setPickAlloc] = useState("");
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    (async () => {
      const [y, c] = await Promise.all([calendarApi.academicYears(), academicsApi.classrooms({ page_size: 200 })]);
      const yearList = y.data.results ?? y.data;
      setYears(yearList);
      setClassrooms(c.data.results ?? c.data);
      const current = yearList.find((yr) => yr.is_current) || yearList[0];
      if (current) {
        const t = await calendarApi.terms({ academic_year: current.id });
        const termList = t.data.results ?? t.data;
        setTerms(termList);
        const curTerm = termList.find((tm) => tm.is_current) || termList[0];
        if (curTerm) setSelectedTerm(curTerm.id);
      }
    })();
  }, []);

  const loadGrid = async () => {
    if (!selectedTerm || !selectedClassroom) return;
    setLoading(true);
    try {
      const res = await timetableApi.grid(selectedTerm, selectedClassroom);
      setGridDays(res.data.days);
      const allocRes = await api_teacherAllocations(selectedClassroom, selectedTerm);
      setAllocations(allocRes);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const api_teacherAllocations = async (classroomId) => {
    const mod = await import("../../services/api");
    const res = await mod.default.get("/teacher-allocations/", { params: { classroom: classroomId } });
    return res.data.results ?? res.data;
  };

  useEffect(() => { loadGrid(); /* eslint-disable-next-line */ }, [selectedTerm, selectedClassroom]);

  const runAutoGenerate = async () => {
    setGenerating(true);
    setMessage("");
    try {
      const res = await timetableApi.autoGenerate(selectedTerm);
      const skipped = res.data.skipped || [];
      setMessage(
        skipped.length
          ? `Generated ${res.data.created_count} lessons. ${skipped.length} could not be placed automatically — fix them manually below (clashes or a fully-booked week).`
          : `Generated ${res.data.created_count} lessons across the timetable.`
      );
      setMessageType(skipped.length ? "warning" : "success");
      await loadGrid();
    } catch (err) {
      const data = err.response?.data;
      if (data?.gaps) {
        setMessage(`Cannot auto-generate yet — some classrooms still need teachers: ` +
          data.gaps.map((g) => `${g.classroom} (${g.subjects.join(", ")})`).join("; "));
      } else {
        setMessage(data?.detail || "Could not auto-generate the timetable.");
      }
      setMessageType("danger");
    } finally {
      setGenerating(false);
    }
  };

  const assignCell = async (periodSlotId) => {
    if (!pickAlloc) return;
    try {
      await timetableApi.createEntry({
        classroom: selectedClassroom, period_slot: periodSlotId, term: selectedTerm, allocation: pickAlloc,
      });
      setEditingCell(null);
      setPickAlloc("");
      await loadGrid();
    } catch (err) {
      setMessage(err.response?.data ? JSON.stringify(err.response.data) : "Could not place this lesson.");
      setMessageType("danger");
    }
  };

  const clearCell = async (entryId) => {
    await timetableApi.deleteEntry(entryId);
    await loadGrid();
  };

  const onYearChange = async (yearId) => {
    const t = await calendarApi.terms({ academic_year: yearId });
    const termList = t.data.results ?? t.data;
    setTerms(termList);
    setSelectedTerm(termList[0]?.id || "");
  };

  const columnPeriods = useMemo(() => {
    if (!gridDays.length) return [];
    return gridDays.reduce((longest, d) => (d.periods.length > longest.length ? d.periods : longest), gridDays[0].periods);
  }, [gridDays]);

  // ---- metadata used by the PDF header ----
  const selectedClassroomObj = useMemo(
    () => classrooms.find((c) => String(c.id) === String(selectedClassroom)),
    [classrooms, selectedClassroom]
  );
  const selectedTermObj = useMemo(
    () => terms.find((t) => String(t.id) === String(selectedTerm)),
    [terms, selectedTerm]
  );
  const selectedYearObj = useMemo(() => {
    if (!selectedTermObj) return null;
    return (
      years.find((y) => y.id === selectedTermObj.academic_year) ||
      years.find((y) => y.is_current) ||
      null
    );
  }, [years, selectedTermObj]);

  // ---- Landscape A4 PDF of the timetable for the selected class ----
  const downloadTimetablePdf = async () => {
    if (!gridDays.length || !selectedClassroomObj) return;
    setDownloadingPdf(true);
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      const base64Logo = await getImageBase64(logoImage);
      const generatedOn = new Date().toLocaleDateString("en-KE", {
        year: "numeric", month: "long", day: "numeric",
      });

      // --- Header ---
      if (base64Logo) {
        doc.addImage(base64Logo, "PNG", 12, 10, 14, 14);
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.setTextColor(15, 23, 42);
      doc.text("Masomo School", base64Logo ? 30 : 12, 17);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(71, 85, 105);
      doc.text("Class Weekly Timetable", base64Logo ? 30 : 12, 23);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`Generated ${generatedOn}`, pageWidth - 12, 15, { align: "right" });

      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.line(12, 28, pageWidth - 12, 28);

      // --- Class meta strip (teacher name abbreviated) ---
      const classLabel = `${selectedClassroomObj.grade_level_name} ${selectedClassroomObj.stream_name}`;
      const yearLabel = selectedYearObj?.year || selectedClassroomObj.academic_year_year || "—";
      const termLabel = selectedTermObj
        ? selectedTermObj.get_term_number_display || `Term ${selectedTermObj.term_number}`
        : "—";

      const metaParts = [
        `Class: ${classLabel}`,
        `Academic Year: ${yearLabel}${selectedYearObj?.is_current ? " (current)" : ""}`,
        `Term: ${termLabel}${selectedTermObj?.is_current ? " (current)" : ""}`,
        `Class Teacher: ${shortTeacherName(selectedClassroomObj.class_teacher_name)}`,
      ];

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(51, 65, 85);
      doc.text(metaParts.join("   |   "), 12, 34);

      // --- Table: DAY rows × time columns (teacher names abbreviated) ---
      const tableHead = [
        "Day",
        ...columnPeriods.map((p) => `${(p.start_time || "").slice(0, 5)}\n${(p.end_time || "").slice(0, 5)}`),
      ];

      const tableBody = gridDays.map((d) => {
        const row = [d.day_label];
        columnPeriods.forEach((colPeriod, idx) => {
          const cell = d.periods[idx];
          if (!cell) { row.push(""); return; }
          if (cell.slot_type !== "LESSON") {
            row.push(cell.label || cell.slot_type);
            return;
          }
          if (cell.entry) {
            const subject = cell.entry.subject_code || cell.entry.subject_name || "";
            const teacher = shortTeacherName(cell.entry.teacher_name);
            row.push(teacher && teacher !== "—" ? `${subject}\n${teacher}` : subject);
          } else {
            row.push("—");
          }
        });
        return row;
      });

      autoTable(doc, {
        startY: 39,
        head: [tableHead],
        body: tableBody,
        theme: "grid",
        styles: {
          fontSize: 8,
          cellPadding: 1.8,
          lineColor: [203, 213, 225],
          lineWidth: 0.15,
          textColor: [30, 41, 59],
          valign: "middle",
          halign: "center",
          overflow: "linebreak",
        },
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 7.5,
          halign: "center",
          cellPadding: 2,
        },
        bodyStyles: {
          fontSize: 7.5,
          minCellHeight: 12,
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 20, halign: "left", fontStyle: "bold" },
        },
        margin: { left: 12, right: 12 },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index > 0) {
            const day = gridDays[data.row.index];
            if (!day) return;
            const cell = day.periods[data.column.index - 1];
            if (!cell) return;
            if (cell.slot_type !== "LESSON") {
              data.cell.styles.fillColor = [244, 244, 245];
              data.cell.styles.textColor = [100, 116, 139];
              data.cell.styles.fontStyle = "italic";
            } else if (cell.entry) {
              data.cell.styles.fontStyle = "bold";
            }
          }
        },
        didDrawPage: () => {
          const footerY = pageHeight - 6;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor(148, 163, 184);
          doc.text("Masomo School — Timetable Office", 12, footerY);
          doc.text(
            `Page ${doc.internal.getCurrentPageInfo().pageNumber} of ${doc.internal.getNumberOfPages()}`,
            pageWidth - 12,
            footerY,
            { align: "right" }
          );
        },
      });

      // --- Signature / stamp blocks ---
      let finalY = doc.lastAutoTable.finalY + 14;
      if (finalY > pageHeight - 30) {
        doc.addPage();
        finalY = 26;
      }

      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.2);

      // Class Teacher (left)
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text("Class Teacher's Signature:", 12, finalY);
      doc.line(12, finalY + 10, 90, finalY + 10);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text("Sign & Official Stamp", 12, finalY + 14);

      // Principal (right)
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text("Principal's Signature:", pageWidth - 90, finalY);
      doc.line(pageWidth - 90, finalY + 10, pageWidth - 12, finalY + 10);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text("Sign & Official Stamp", pageWidth - 90, finalY + 14);

      // --- Copyright footer ---
      const copyrightY = pageHeight - 8;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(148, 163, 184);
      doc.text(
        "© Masomo School. All rights reserved. Duplication or unauthorized printing is prohibited.",
        12,
        copyrightY
      );

      const safeClass = `${selectedClassroomObj.grade_level_name}_${selectedClassroomObj.stream_name}`.replace(/\s+/g, "_");
      const safeYear = String(yearLabel).replace(/\s+/g, "_");
      doc.save(`timetable_${safeClass}_${safeYear}.pdf`);
    } catch (err) {
      console.error("Failed to generate timetable PDF:", err);
      setMessage("Could not generate the timetable PDF.");
      setMessageType("danger");
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div>
      {message && (
        <div className={`alert alert-${messageType} alert-dismissible fade show`}>
          {message}
          <button type="button" className="btn-close" onClick={() => setMessage("")}></button>
        </div>
      )}

      <div className="card p-3 mb-3 d-flex flex-row flex-wrap align-items-center gap-2">
        <select className="form-select" style={{ width: "auto" }} onChange={(e) => onYearChange(e.target.value)}
          value={years.find((y) => terms.some((t) => t.academic_year === y.id && t.id === selectedTerm))?.id || ""}>
          {years.map((y) => <option key={y.id} value={y.id}>{y.year}{y.is_current ? " (current)" : ""}</option>)}
        </select>
        <select className="form-select" style={{ width: "auto" }} value={selectedTerm} onChange={(e) => setSelectedTerm(e.target.value)}>
          <option value="">Select term...</option>
          {terms.map((t) => <option key={t.id} value={t.id}>{t.academic_year_label} - {t.get_term_number_display || `Term ${t.term_number}`}{t.is_current ? " (current)" : ""}</option>)}
        </select>
        <select className="form-select" style={{ width: "auto", minWidth: "200px" }} value={selectedClassroom} onChange={(e) => setSelectedClassroom(e.target.value)}>
          <option value="">Select class...</option>
          {classrooms.map((c) => <option key={c.id} value={c.id}>{c.grade_level_name} {c.stream_name} ({c.academic_year_year})</option>)}
        </select>

        <button
          className="btn btn-outline-primary"
          onClick={downloadTimetablePdf}
          disabled={!selectedClassroom || !gridDays.length || downloadingPdf}
          title="Download this class's timetable as a landscape PDF"
        >
          {downloadingPdf ? (
            <>
              <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
              Preparing...
            </>
          ) : (
            <>
              <i className="bi bi-file-earmark-pdf me-1"></i>
              Download PDF
            </>
          )}
        </button>

        <button className="btn btn-primary ms-auto" onClick={runAutoGenerate} disabled={!selectedTerm || generating}>
          <i className="bi bi-magic me-1"></i>{generating ? "Generating..." : "Auto-Generate Timetable"}
        </button>
      </div>
      <p className="text-muted-soft mb-3" style={{ fontSize: "var(--fs-xs)" }}>
        Auto-generate runs for the whole term across every class at once (it needs every subject in every class/stream
        allocated to a teacher first — check the "Unallocated Subjects" tab on Teacher Allocation if it's blocked).
      </p>

      {!selectedClassroom ? (
        <div className="empty-state"><i className="bi bi-grid-3x3"></i><h6>Pick a term and class to view its timetable</h6></div>
      ) : loading ? (
        <TableSkeleton rows={6} columns={6} />
      ) : (
        <div className="table-wrap">
          <div className="table-responsive">
            <table className="table table-bordered mb-0" style={{ tableLayout: "fixed" }}>
              <thead>
                <tr>
                  <th style={{ width: "100px" }}>Day</th>
                  {columnPeriods.map((p, i) => (
                    <th key={i} className="text-center" style={{ minWidth: "110px", fontSize: "var(--fs-xs)" }}>
                      {p.start_time?.slice(0, 5)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gridDays.map((d) => (
                  <tr key={d.day}>
                    <td className="fw-semibold align-middle">{d.day_label}</td>
                    {d.periods.map((cell, colIdx) => {
                      if (cell.slot_type !== "LESSON") {
                        return (
                          <td key={colIdx} className="text-center align-middle" style={{ background: "var(--gray-50, #f4f4f5)" }}>
                            <span className="badge badge-neutral">{cell.label}</span>
                          </td>
                        );
                      }
                      const key = cell.period_slot_id;
                      return (
                        <td key={colIdx} style={{ minHeight: "60px", verticalAlign: "middle" }}>
                          {cell.entry ? (
                            <div className="d-flex flex-column">
                              <span className="badge badge-blue">{cell.entry.subject_code || cell.entry.subject_name}</span>
                              <small className="text-muted-soft">
                                {shortTeacherName(cell.entry.teacher_name)}
                                {cell.entry.is_double ? " (double)" : ""}
                              </small>
                              <button className="btn btn-sm btn-link text-danger p-0" onClick={() => clearCell(cell.entry.id)}>
                                <i className="bi bi-x"></i> clear
                              </button>
                            </div>
                          ) : editingCell === key ? (
                            <div className="d-flex flex-column gap-1">
                              <select className="form-select form-select-sm" value={pickAlloc} onChange={(e) => setPickAlloc(e.target.value)}>
                                <option value="">Subject / Teacher...</option>
                                {allocations.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.subject_name} — {shortTeacherName(a.teacher_name)}
                                  </option>
                                ))}
                              </select>
                              <div className="d-flex gap-1">
                                <button className="btn btn-sm btn-primary" onClick={() => assignCell(key)}>Set</button>
                                <button className="btn btn-sm btn-light" onClick={() => { setEditingCell(null); setPickAlloc(""); }}>Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <button className="btn btn-sm btn-outline-secondary w-100" onClick={() => setEditingCell(key)}>
                              <i className="bi bi-plus"></i> Free
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}