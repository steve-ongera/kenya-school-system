import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { gatepassApi } from "../services/api";

const COLORS = { CLEARED: "#15803d", GRACE: "#d97706", OWING: "#b91c1c" };
const MESSAGES = {
  CLEARED: "Fees cleared. Allow entry.",
  GRACE: "Fees owing, but within the approved grace period.",
  OWING: "Fees owing. Refer the learner to the finance office.",
};

const fmtDate = (iso) =>
  iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" })
    : "-";

export default function VerifyGatepass() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    gatepassApi
      .verify(token)
      .then(({ data }) => setData(data))
      .catch(() => setData({ valid: false, detail: "Could not verify this card. Check your connection." }))
      .finally(() => setLoading(false));
  }, [token]);

  const color = data?.valid ? COLORS[data.status] : "#64748b";

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 420, background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,.12)" }}>
        <div style={{ background: "#0f2947", color: "#fff", padding: "14px 18px", textAlign: "center" }}>
          <div style={{ fontWeight: 800 }}>Junda High School Shanzu</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>School Fee Update Card &amp; Gatepass</div>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: "center" }}>
            <span className="spinner-border"></span>
          </div>
        ) : !data?.valid ? (
          <div style={{ padding: 28, textAlign: "center" }}>
            <div style={{ fontSize: 42, color }}>&#10007;</div>
            <h5 style={{ fontWeight: 800 }}>Not verified</h5>
            <p className="text-muted-soft mb-0">{data?.detail}</p>
          </div>
        ) : (
          <>
            <div style={{ background: color, color: "#fff", padding: "22px 18px", textAlign: "center" }}>
              <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: 1 }}>{data.status_label}</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>{MESSAGES[data.status]}</div>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ fontSize: 20, fontWeight: 800, textTransform: "uppercase" }}>{data.student_name}</div>
              <div className="text-muted-soft mb-3">
                Adm No: <strong>{data.admission_no}</strong> &middot; {data.classroom}
              </div>
              <div style={{ fontSize: 13 }}>
                Grace period: <strong>{fmtDate(data.grace_from)}</strong> to <strong>{fmtDate(data.grace_to)}</strong>
              </div>
              <div className="text-muted-soft mt-3" style={{ fontSize: 11 }}>
                Checked live on {new Date(data.verified_at).toLocaleString("en-KE")}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}