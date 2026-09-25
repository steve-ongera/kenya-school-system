import { useEffect, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { clearanceApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";
import logoImage from "../../assets/junda_high_logo.png";

const SCHOOL_NAME = "Junda High School Shanzu";
const DOC_COPY_NOTE = "This is a computer-generated document copy.";

const currency = (v) => Number(v || 0).toLocaleString();
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" }) : "-";

// Load an image URL as a base64 data URL (for embedding the logo in PDFs)
const getImageBase64 = (url) =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = url;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext("2d").drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(null);
  });

const STEPS = [
  { key: "applied", label: "Applied", icon: "bi-send-check" },
  { key: "review", label: "Admin review", icon: "bi-hourglass-split" },
  { key: "cleared", label: "Cleared", icon: "bi-patch-check" },
  { key: "collected", label: "Certificate collected", icon: "bi-mortarboard" },
];

const STEP_COLOR = {
  done: "var(--success-600, #16a34a)",
  current: "var(--blue-700, #1d4ed8)",
  failed: "var(--danger-600, #dc2626)",
  todo: "var(--ink-400, #94a3b8)",
};

// ---------------------------------------------------------------------------
// Clearance slip: the student brings this when they come for their certificate
// ---------------------------------------------------------------------------
async function buildClearanceSlip(state) {
  const app = state.application;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const M = 12;

  const logo = await getImageBase64(logoImage);
  const generatedOn = new Date().toLocaleDateString("en-KE", {
    year: "numeric", month: "long", day: "numeric",
  });

  // --- Header ---
  if (logo) doc.addImage(logo, "PNG", M, 8, 12, 12);
  const textX = logo ? M + 16 : M;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(SCHOOL_NAME, textX, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text("Student Clearance Slip", textX, 19);
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated ${generatedOn}`, pageWidth - M, 14, { align: "right" });
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(M, 23, pageWidth - M, 23);

  // --- Details ---
  const gridStyles = { lineColor: [226, 232, 240], lineWidth: 0.1, textColor: [51, 65, 85] };
  const labelCell = { fontStyle: "bold", fillColor: [241, 245, 249], textColor: [71, 85, 105] };
  autoTable(doc, {
    startY: 28,
    theme: "grid",
    body: [
      ["Student", state.student?.name || app.student_name, "Admission No", app.admission_no],
      ["Class", app.classroom_label, "Academic Year", String(app.academic_year_year)],
      ["Clearance No", app.clearance_no || "-", "Status", "CLEARED"],
      ["Cleared On", fmtDate(app.reviewed_at), "Cleared By", app.reviewed_by_name || "Administration"],
    ],
    styles: { fontSize: 9.5, cellPadding: 2.6, ...gridStyles },
    columnStyles: {
      0: { cellWidth: 32, ...labelCell },
      1: { cellWidth: 58 },
      2: { cellWidth: 32, ...labelCell },
      3: { cellWidth: "auto" },
    },
    margin: { left: M, right: M },
  });

  let y = doc.lastAutoTable.finalY + 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  const note = doc.splitTextToSize(
    "The school administration has cleared the student named above. Please present this slip at the " +
    "school office when you come in person to collect your certificate.",
    pageWidth - 2 * M
  );
  doc.text(note, M, y);
  y += note.length * 5 + 24;

  // --- Signatures ---
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.2);
  const lineW = 70;
  const sig = (x, label) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(label, x, y);
    doc.line(x, y + 12, x + lineW, y + 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text("Signature, name & date", x, y + 16);
  };
  sig(M, "Issued by (Administration):");
  sig(pageWidth - M - lineW, "Certificate received by (Student):");

  // --- Footer ---
  doc.setDrawColor(226, 232, 240);
  doc.line(M, pageHeight - 14, pageWidth - M, pageHeight - 14);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(DOC_COPY_NOTE, pageWidth / 2, pageHeight - 10, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(`${SCHOOL_NAME} — Document Copy`, M, pageHeight - 5.5);

  return doc;
}

export default function StudentClearance() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    clearanceApi
      .me()
      .then(({ data }) => setState(data))
      .catch((err) => {
        console.error("Failed to load clearance:", err);
        setError(err.response?.data?.detail || "Could not load your clearance status. Please try again.");
      })
      .finally(() => setLoading(false));
  }, []);

  const apply = async (e) => {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);
    try {
      const { data } = await clearanceApi.apply({ student_remarks: remarks });
      setState(data);
      setRemarks("");
    } catch (err) {
      setFormError(err.response?.data?.detail || "Could not submit your application. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const downloadSlip = async () => {
    try {
      setDownloading(true);
      const doc = await buildClearanceSlip(state);
      const app = state.application;
      doc.save(`Clearance_Slip_${app.clearance_no || app.admission_no}.pdf`);
    } catch (err) {
      console.error("Failed to generate clearance slip:", err);
    } finally {
      setDownloading(false);
    }
  };

  const app = state?.application || null;
  const balance = Number(state?.outstanding_balance || 0);

  // how many steps are finished, and how the next one looks
  const doneCount = !app ? 0 : app.status === "CLEARED" ? (app.is_collected ? 4 : 3) : 1;
  const stepState = (idx) => {
    if (app?.status === "REJECTED" && idx === 1) return "failed";
    if (idx < doneCount) return "done";
    if (idx === doneCount && app) return "current";
    return "todo";
  };
  const stepNote = (idx) => {
    const st = stepState(idx);
    if (idx === 0 && app) return fmtDate(app.submitted_at);
    if (idx === 1 && st === "failed") return "Not cleared yet";
    if (idx === 1 && st === "current") return "In progress";
    if (idx === 2 && st === "done") return fmtDate(app.reviewed_at);
    if (idx === 3 && st === "done") return fmtDate(app.collected_at);
    if (idx === 3 && st === "current") return "Come to school";
    return "";
  };

  return (
    <div>
      <Breadcrumb items={[
        { label: "Dashboard", href: "/student" },
        { label: "Academics", href: "/student" },
        { label: "Clearance", href: "#" },
      ]} />

      <div className="page-header">
        <div>
          <h1 className="page-title">Clearance</h1>
          <p className="page-subtitle">
            Apply to be cleared after your final year, then collect your certificate in person.
          </p>
        </div>
        {app && (
          <span
            className={`badge ${app.status === "CLEARED" ? "badge-success" : app.status === "REJECTED" ? "badge-danger" : "badge-gold"}`}
            style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem" }}
          >
            {app.status === "CLEARED" && app.is_collected ? "Certificate collected" : app.status_display}
          </span>
        )}
      </div>

      {loading ? (
        <TableSkeleton rows={3} columns={3} />
      ) : error ? (
        <div className="alert alert-danger">
          <i className="bi bi-exclamation-circle me-2"></i>
          {error}
        </div>
      ) : (
        <>
          {/* ---- Not eligible yet ---- */}
          {!state.eligible && !app && (
            <div className="alert alert-info d-flex align-items-start gap-2">
              <i className="bi bi-info-circle" style={{ fontSize: "1.2rem" }}></i>
              <div>
                <strong>Clearance isn't open for you yet.</strong>
                <div>{state.reason}</div>
              </div>
            </div>
          )}

          {/* ---- Progress ---- */}
          {app && (
            <div className="card p-3 mb-4">
              <div className="d-flex flex-wrap gap-3">
                {STEPS.map((s, idx) => {
                  const st = stepState(idx);
                  const color = STEP_COLOR[st];
                  return (
                    <div key={s.key} className="d-flex align-items-center gap-2" style={{ flex: "1 1 170px" }}>
                      <span
                        style={{
                          width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          background: st === "todo" ? "transparent" : color,
                          border: `2px solid ${color}`,
                          color: st === "todo" ? color : "#fff",
                        }}
                      >
                        <i className={`bi ${st === "done" ? "bi-check-lg" : st === "failed" ? "bi-x-lg" : s.icon}`}></i>
                      </span>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--ink-900)", fontSize: "0.9rem" }}>
                          {idx === 1 && st === "failed" ? "Not cleared" : s.label}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: st === "failed" ? color : "var(--ink-600)" }}>
                          {stepNote(idx)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ---- Status of the application ---- */}
          {app?.status === "PENDING" && (
            <div className="card p-4 mb-4">
              <h6 style={{ fontWeight: 700, color: "var(--ink-900)" }}>
                <i className="bi bi-hourglass-split me-2" style={{ color: "var(--blue-700)" }}></i>
                Your application is with the administration
              </h6>
              <p className="mb-2 text-muted">
                Submitted on {fmtDate(app.submitted_at)}. You'll get a notification as soon as it has been reviewed.
              </p>
              {app.student_remarks && (
                <p className="mb-0" style={{ fontSize: "var(--fs-sm)", color: "var(--ink-600)" }}>
                  <strong>Your note:</strong> {app.student_remarks}
                </p>
              )}
            </div>
          )}

          {app?.status === "REJECTED" && (
            <div className="alert alert-danger mb-4">
              <div style={{ fontWeight: 700 }}>
                <i className="bi bi-x-circle me-2"></i>
                Not cleared yet
              </div>
              <div className="mt-1">{app.admin_remarks || "The administration did not give a reason."}</div>
              <div className="mt-1" style={{ fontSize: "var(--fs-sm)" }}>
                Reviewed on {fmtDate(app.reviewed_at)}. Sort this out, then apply again below.
              </div>
            </div>
          )}

          {app?.status === "CLEARED" && (
            <div className="card p-4 mb-4" style={{ borderLeft: "4px solid var(--success-600, #16a34a)" }}>
              <h6 style={{ fontWeight: 700, color: "var(--ink-900)" }}>
                <i className="bi bi-patch-check-fill me-2" style={{ color: "var(--success-600, #16a34a)" }}></i>
                {app.is_collected ? "You have collected your certificate" : "You have been cleared"}
              </h6>
              <p className="mb-2">
                Clearance No: <strong>{app.clearance_no}</strong> · Cleared on {fmtDate(app.reviewed_at)}
                {app.reviewed_by_name ? ` by ${app.reviewed_by_name}` : ""}
              </p>
              {app.admin_remarks && (
                <p className="mb-2" style={{ fontSize: "var(--fs-sm)", color: "var(--ink-600)" }}>
                  <strong>Note from the administration:</strong> {app.admin_remarks}
                </p>
              )}
              {app.is_collected ? (
                <p className="mb-0 text-muted">Collected on {fmtDate(app.collected_at)}.</p>
              ) : (
                <>
                  <p className="text-muted">
                    Come to school in person to collect your certificate, and bring your clearance slip.
                  </p>
                  <div>
                    <button type="button" className="btn btn-primary" onClick={downloadSlip} disabled={downloading}>
                      {downloading ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                          Preparing...
                        </>
                      ) : (
                        <>
                          <i className="bi bi-file-earmark-pdf me-2"></i>
                          Download clearance slip
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ---- Apply form ---- */}
          {state.can_apply && (
            <div className="row g-4">
              <div className="col-lg-7">
                <div className="card p-4">
                  <h6 className="mb-1" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
                    <i className="bi bi-send me-2" style={{ color: "var(--blue-700)" }}></i>
                    {app ? "Apply again" : "Apply for clearance"}
                  </h6>
                  <p className="text-muted" style={{ fontSize: "var(--fs-sm)" }}>
                    {state.student?.name} ({state.student?.admission_no}) · {state.class_label}
                  </p>

                  {balance > 0 && (
                    <div className="alert alert-warning py-2">
                      <i className="bi bi-exclamation-triangle me-2"></i>
                      You still owe <strong>KES {currency(balance)}</strong> in fees. You can apply now, but the
                      administration normally can't clear you until this is paid.
                      <a href="/student/fees" className="ms-1">Go to Fee Payment</a>
                    </div>
                  )}
                  {balance < 0 && (
                    <div className="alert alert-info py-2">
                      <i className="bi bi-piggy-bank me-2"></i>
                      You have a credit of <strong>KES {currency(Math.abs(balance))}</strong> on your fee account.
                    </div>
                  )}
                  {balance === 0 && (
                    <div className="alert alert-success py-2">
                      <i className="bi bi-check-circle me-2"></i>
                      You have no outstanding fees.
                    </div>
                  )}

                  {formError && (
                    <div className="alert alert-danger py-2">
                      <i className="bi bi-exclamation-circle me-2"></i>
                      {formError}
                    </div>
                  )}

                  <form onSubmit={apply}>
                    <div className="mb-3">
                      <label className="form-label">Note for the administration (optional)</label>
                      <textarea
                        className="form-control"
                        rows={3}
                        maxLength={500}
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                        placeholder="e.g. the best phone number to reach you on"
                      />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={submitting}>
                      {submitting ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                          Submitting...
                        </>
                      ) : (
                        <>
                          <i className="bi bi-send me-2"></i>
                          {app ? "Submit again" : "Submit application"}
                        </>
                      )}
                    </button>
                  </form>
                </div>
              </div>

              <div className="col-lg-5">
                <div className="card p-4 h-100">
                  <h6 style={{ fontWeight: 700, color: "var(--ink-900)" }}>How it works</h6>
                  <ol className="mb-0 ps-3" style={{ color: "var(--ink-600)", fontSize: "var(--fs-sm)", lineHeight: 1.7 }}>
                    <li>Settle any fee balance with the finance office or under Fee Payment.</li>
                    <li>Submit your application here.</li>
                    <li>The administration reviews it and clears you. You'll get a notification.</li>
                    <li>Download your clearance slip.</li>
                    <li>Come to school in person, with your slip, to collect your certificate.</li>
                  </ol>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}