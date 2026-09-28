import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { academicsApi, gatepassApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import logoImage from "../../assets/junda_high_logo.png";

// Compact card: 60 x 36 mm, sitting in a 64 x 40 mm cut cell (2 mm margin all round).
// 3 columns x 7 rows = 21 cards per A4 page. To change the layout, edit COLS / ROWS here and the
// matching mm values in CARD_CSS (.fuc-page columns/rows, .fuc-cell, .fuc-card).
const COLS = 3;
const ROWS = 7;
const CARDS_PER_PAGE = COLS * ROWS;
const STATUS_COLOR = { CLEARED: "#15803d", GRACE: "#d97706", OWING: "#b91c1c" };

const currency = (value) =>
  Number(value || 0).toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const fmtDate = (iso) =>
  iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" })
    : "-";

const toIso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const CARD_CSS = `
/* Cut grid: every cell is 64 x 40 mm; dashed lines between cells are the ruler cut lines */
.fuc-page { display:grid; grid-template-columns:repeat(3,64mm); grid-auto-rows:40mm; justify-content:center; align-content:start;
  width:fit-content; margin:0 auto; border-top:0.2mm dashed #64748b; border-left:0.2mm dashed #64748b; }
.fuc-cell { box-sizing:border-box; display:flex; align-items:center; justify-content:center;
  border-right:0.2mm dashed #64748b; border-bottom:0.2mm dashed #64748b; }

/* The card itself: 60 x 36 mm with a solid ID-style border */
.fuc-card { width:60mm; height:36mm; box-sizing:border-box; border:0.3mm solid #475569;
  border-radius:2mm; overflow:hidden; background:#fff; color:#0f172a; display:flex; flex-direction:column;
  font-family:Arial,Helvetica,sans-serif; -webkit-print-color-adjust:exact; print-color-adjust:exact; break-inside:avoid; }
.fuc-head { display:flex; align-items:center; gap:1mm; padding:0.8mm 1.6mm; border-bottom:0.2mm solid #e2e8f0; }
.fuc-head img { height:5.6mm; width:auto; }
.fuc-headtxt { min-width:0; flex:1; }
.fuc-school { font-size:5.2pt; font-weight:800; line-height:1.1; white-space:nowrap; }
.fuc-addr { font-size:3.8pt; color:#475569; line-height:1.1; }
.fuc-status { flex:0 0 auto; color:#fff; font-size:4.2pt; font-weight:800; letter-spacing:0.1mm; padding:0.5mm 1.3mm; border-radius:0.6mm; white-space:nowrap; }
.fuc-title { background:#0f2947; color:#fff; text-align:center; font-size:4.2pt; font-weight:700; letter-spacing:0.15mm; padding:0.5mm 0; }
.fuc-body { flex:1; display:flex; gap:1.5mm; padding:1mm 1.6mm; min-height:0; }
.fuc-info { flex:1; min-width:0; }
.fuc-name { font-size:6.2pt; font-weight:800; text-transform:uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.fuc-meta { font-size:4.8pt; color:#334155; margin-bottom:0.9mm; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.fuc-lbl { font-size:3.8pt; color:#64748b; text-transform:uppercase; letter-spacing:0.1mm; }
.fuc-bal { font-size:7.6pt; font-weight:800; line-height:1.15; margin-bottom:0.9mm; white-space:nowrap; }
.fuc-grace { font-size:4.8pt; font-weight:700; white-space:nowrap; }
.fuc-qr { width:17mm; text-align:center; flex:0 0 17mm; }
.fuc-qr img { width:17mm; height:17mm; display:block; }
.fuc-qr div { font-size:3.6pt; color:#64748b; margin-top:0.3mm; }
.fuc-foot { display:flex; justify-content:space-between; font-size:3.6pt; color:#64748b; padding:0.4mm 1.6mm; border-top:0.2mm solid #e2e8f0; }

.fuc-preview .fuc-page { background:#fff; margin-bottom:10px; box-shadow:0 1px 4px rgba(0,0,0,.15); }
.fuc-print-root { display:none; }
@media print {
  #root { display:none !important; }
  .fuc-print-root { display:block !important; }
  .fuc-print-root .fuc-page { break-after:page; page-break-after:always; }
  .fuc-print-root .fuc-page:last-child { break-after:auto; page-break-after:auto; }
  @page { size:A4 portrait; margin:6mm; }
}
`;

function FeeCard({ card, meta }) {
  const color = STATUS_COLOR[card.status];
  const bal = Number(card.balance || 0);
  const balText = bal < 0 ? `Credit KES ${currency(Math.abs(bal))}` : `KES ${currency(bal)}`;

  // Access line: CLEARED learners have no window at all; GRACE learners
  // get a window sized to their own balance; OWING (no/expired band) get
  // a plain "see Finance" note instead of blank/misleading dates.
  let accessLine;
  if (card.status === "CLEARED") {
    accessLine = "Fully cleared \u2014 full access";
  } else if (card.status === "GRACE" && card.grace_to) {
    accessLine = `Allowed in school until ${fmtDate(card.grace_to)}`;
  } else {
    accessLine = "No grace period \u2014 see Finance office";
  }

  return (
    <div className="fuc-card">
      <div className="fuc-head">
        <img src={logoImage} alt="" />
        <div className="fuc-headtxt">
          <div className="fuc-school">JUNDA HIGH SCHOOL SHANZU</div>
          <div className="fuc-addr">P.O. Box 87073 Mombasa</div>
        </div>
        <div className="fuc-status" style={{ background: color , width: "50px", height: "15px",}}></div>
      </div>
      <div className="fuc-title">SCHOOL FEE UPDATE CARD &amp; GATEPASS</div>

      <div className="fuc-body">
        <div className="fuc-info">
          <div className="fuc-name">{card.name}</div>
          <div className="fuc-meta">
            Adm: <b>{card.admission_no}</b> &middot; {card.classroom}
          </div>
          <div className="fuc-lbl">Fee balance</div>
          <div className="fuc-bal" style={{ color }}>{balText}</div>
          <div className="fuc-lbl">Access</div>
          <div className="fuc-grace">{accessLine}</div>
        </div>
        <div className="fuc-qr">
          <img src={`data:image/png;base64,${card.qr_code_base64}`} alt="Verification QR" />
          <div>Scan to verify</div>
        </div>
      </div>

      <div className="fuc-foot">
        <span>{card.serial}</span>
        <span>
          Issued {fmtDate(meta.issue_date)}
          {meta.term ? ` · ${meta.term}` : ""}
        </span>
      </div>
    </div>
  );
}

function CardSheet({ cards, meta }) {
  return chunk(cards, CARDS_PER_PAGE).map((pageCards, i) => (
    <div className="fuc-page" key={i}>
      {pageCards.map((c) => (
        <div className="fuc-cell" key={c.student_id}>
          <FeeCard card={c} meta={meta} />
        </div>
      ))}
    </div>
  ));
}

export default function FeeUpdateCards() {
  const [classrooms, setClassrooms] = useState([]);
  const [classroomId, setClassroomId] = useState("");
  const [issueDate, setIssueDate] = useState(toIso(new Date()));
  const [show, setShow] = useState("ALL"); // ALL | UNPAID | CLEARED
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    academicsApi.allClassrooms().then(({ data }) => {
      const rows = data.results ?? data;
      const current = rows.filter((r) => r.academic_year_is_current);
      setClassrooms(current.length ? current : rows);
    });
  }, []);

  const generate = async () => {
    if (!classroomId) {
      setError("Select a classroom first.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data } = await gatepassApi.classCards({
        classroom: classroomId,
        issue_date: issueDate,
      });
      setData(data);
    } catch (err) {
      setData(null);
      setError(err.response?.data?.detail || "Could not generate the cards. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const visibleCards = useMemo(() => {
    if (!data) return [];
    if (show === "UNPAID") return data.cards.filter((c) => c.status !== "CLEARED");
    if (show === "CLEARED") return data.cards.filter((c) => c.status === "CLEARED");
    return data.cards;
  }, [data, show]);

  return (
    <div>
      <style>{CARD_CSS}</style>

      <Breadcrumb
        items={[
          { label: "Dashboard", href: "#" },
          { label: "Payments", href: "#" },
          { label: "Fee Update Cards", href: "#" },
        ]}
      />

      <div className="page-header">
        <div>
          <h1 className="page-title">School Fee Update Card &amp; Gatepass</h1>
          <p className="page-subtitle">
            Generate ID-size fee status cards for a whole class. Each card has a QR code that shows the
            learner's live status when scanned.
          </p>
        </div>
      </div>

      <div className="card p-4 mb-4">
        <div className="row g-3 align-items-end">
          <div className="col-md-4">
            <label className="form-label">Classroom</label>
            <select className="form-select" value={classroomId} onChange={(e) => setClassroomId(e.target.value)}>
              <option value="">Select classroom...</option>
              {classrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.grade_level_name} {c.stream_name} ({c.academic_year_year})
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">Issue date</label>
            <input type="date" className="form-control" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            <div className="form-text" style={{ fontSize: "6pt" }}>
              Each learner's grace window is sized to their own balance from this date.
            </div>
          </div>
          <div className="col-md-2">
            <label className="form-label">Print</label>
            <select className="form-select" value={show} onChange={(e) => setShow(e.target.value)}>
              <option value="ALL">All learners</option>
              <option value="UNPAID">Owing / Grace only</option>
              <option value="CLEARED">Cleared only</option>
            </select>
          </div>
          <div className="col-md-2">
            <button type="button" className="btn btn-primary w-100" onClick={generate} disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2"></span>Generating...
                </>
              ) : (
                <>
                  <i className="bi bi-credit-card-2-front me-1"></i>Generate
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="alert alert-danger py-2 mt-3 mb-0" style={{ fontSize: "var(--fs-sm)" }}>
            {error}
          </div>
        )}
      </div>

      {data && (
        <>
          <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
            <span className="badge" style={{ background: STATUS_COLOR.CLEARED }}>Cleared: {data.counts.CLEARED}</span>
            <span className="badge" style={{ background: STATUS_COLOR.GRACE }}>Grace: {data.counts.GRACE}</span>
            <span className="badge" style={{ background: STATUS_COLOR.OWING }}>Owing: {data.counts.OWING}</span>
            <span className="text-muted-soft" style={{ fontSize: "var(--fs-sm)" }}>
              {data.classroom} &middot; {visibleCards.length} card{visibleCards.length !== 1 ? "s" : ""} to print
            </span>
            <button
              type="button"
              className="btn btn-success ms-auto"
              onClick={() => window.print()}
              disabled={visibleCards.length === 0}
            >
              <i className="bi bi-printer me-2"></i>Print / Save as PDF
            </button>
          </div>

          {visibleCards.length === 0 ? (
            <div className="empty-state">
              <i className="bi bi-credit-card"></i>
              <h6>No cards to show</h6>
              <p className="text-muted-soft">No active learners match this selection.</p>
            </div>
          ) : (
            <div className="fuc-preview" style={{ overflowX: "auto" }}>
              <CardSheet cards={visibleCards} meta={data} />
            </div>
          )}

          {/* Print-only copy, mounted straight on <body> so the app layout can't clip or paginate it wrongly */}
          {visibleCards.length > 0 &&
            createPortal(
              <div className="fuc-print-root">
                <CardSheet cards={visibleCards} meta={data} />
              </div>,
              document.body
            )}
        </>
      )}
    </div>
  );
}