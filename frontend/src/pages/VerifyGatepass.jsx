import { useContext, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { gatepassApi } from "../services/api";
import { AuthContext } from "../context/AuthContext";
import Breadcrumb from "../components/Breadcrumb";

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

// The card QR encodes  <FRONTEND_URL>/verify-gatepass/<token>.
// Accept the full link or a bare token.
const extractToken = (text) => {
  const value = String(text || "").trim();
  if (!value) return null;
  try {
    const parts = new URL(value).pathname.split("/").filter(Boolean);
    const i = parts.indexOf("verify-gatepass");
    if (i !== -1 && parts[i + 1]) return decodeURIComponent(parts[i + 1]);
    return null; // a URL, but not a gatepass link
  } catch (e) {
    // not a URL - treat as a raw token
  }
  return /\s/.test(value) ? null : value;
};

const READER_ID = "gatepass-qr-reader";
const BOX = 300; // fixed scanner size (px)

// One scan zone only: we hide anything html5-qrcode injects besides the
// video, and draw our own corners + animated scan line on top.
const SCANNER_CSS = `
#${READER_ID} { width: 100%; height: 100%; border: none !important; }
#${READER_ID} video { width: 100% !important; height: 100% !important; object-fit: cover; display: block; }
#${READER_ID} canvas, #${READER_ID} img, #${READER_ID} > div { display: none !important; }
.gp-corner { position: absolute; width: 34px; height: 34px; border-color: var(--gp-frame, #22c55e); border-style: solid; border-width: 0; transition: border-color .2s; }
.gp-tl { top: 14px; left: 14px; border-top-width: 4px; border-left-width: 4px; border-top-left-radius: 10px; }
.gp-tr { top: 14px; right: 14px; border-top-width: 4px; border-right-width: 4px; border-top-right-radius: 10px; }
.gp-bl { bottom: 14px; left: 14px; border-bottom-width: 4px; border-left-width: 4px; border-bottom-left-radius: 10px; }
.gp-br { bottom: 14px; right: 14px; border-bottom-width: 4px; border-right-width: 4px; border-bottom-right-radius: 10px; }
.gp-line { position: absolute; left: 12%; right: 12%; height: 3px; border-radius: 3px; top: 14%;
  background: linear-gradient(90deg, transparent, #22c55e, transparent);
  box-shadow: 0 0 14px 2px rgba(34,197,94,.7);
  animation: gp-sweep 1.4s ease-in-out infinite alternate; }
@keyframes gp-sweep { from { top: 14%; } to { top: 84%; } }
`;

export default function VerifyGatepass() {
  const { token: routeToken } = useParams(); // set when opened from a phone's own camera
  const { user } = useContext(AuthContext);
  const home = user?.role ? `/${String(user.role).toLowerCase()}` : "/";

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  // ---- camera scanner ----
  // The camera is started ONCE and kept running. After a scan it is only
  // paused (frame freezes), and "Scan next learner" just resumes it, so
  // there is no camera restart delay between learners.
  const [showScanner, setShowScanner] = useState(!routeToken);
  const [cameraReady, setCameraReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [scanError, setScanError] = useState("");
  const [scanHint, setScanHint] = useState("");
  const scannerRef = useRef(null);
  const startingRef = useRef(null);
  const stoppingRef = useRef(null);
  const handledRef = useRef(false);
  const requestRef = useRef(0);

  const verify = async (token) => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setData(null);
    try {
      const { data } = await gatepassApi.verify(token);
      if (requestId === requestRef.current) setData(data);
    } catch (err) {
      if (requestId === requestRef.current) {
        setData({ valid: false, detail: "Could not verify this card. Check your connection." });
      }
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  };

  // opened straight from the QR link -> verify immediately
  useEffect(() => {
    if (routeToken) verify(routeToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeToken]);

  const onDecoded = (decodedText) => {
    if (handledRef.current) return;
    const token = extractToken(decodedText);
    if (!token) {
      setScanHint("That QR code is not a gatepass card. Keep scanning.");
      return;
    }
    handledRef.current = true;
    if (navigator.vibrate) navigator.vibrate(80);
    try {
      scannerRef.current?.pause(true); // freeze frame, keep the camera open
    } catch (e) {
      // ignore
    }
    setPaused(true);
    setScanHint("");
    verify(token);
  };

  const startCamera = async () => {
    if (stoppingRef.current) await stoppingRef.current;
    if (scannerRef.current) return; // already running

    setScanError("");
    setCameraReady(false);

    const scanner = new Html5Qrcode(READER_ID, {
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      useBarCodeDetectorIfSupported: true, // native, much faster where available
      verbose: false,
    });
    scannerRef.current = scanner;

    startingRef.current = scanner
      .start(
        { facingMode: "environment" },
        { fps: 20, aspectRatio: 1, disableFlip: true }, // no qrbox: whole frame is scanned
        onDecoded,
        () => {} // per-frame "no QR found" noise
      )
      .then(() => setCameraReady(true))
      .catch(() => {
        scannerRef.current = null;
        setScanError(
          "Could not open the camera. Allow camera access in the browser (needs HTTPS or localhost) and try again."
        );
        setShowScanner(false);
      });
  };

  const stopScanner = () => {
    const sc = scannerRef.current;
    if (!sc) return Promise.resolve();
    scannerRef.current = null;
    stoppingRef.current = (async () => {
      try {
        await startingRef.current;
      } catch (e) {
        // ignore
      }
      try {
        await sc.stop();
      } catch (e) {
        // already stopped
      }
      try {
        sc.clear();
      } catch (e) {
        // ignore
      }
      setCameraReady(false);
      setPaused(false);
      stoppingRef.current = null;
    })();
    return stoppingRef.current;
  };

  useEffect(() => {
    if (showScanner) startCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showScanner]);

  // stop the camera when leaving the page
  useEffect(() => {
    return () => {
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scanNext = () => {
    requestRef.current += 1; // drop any in-flight verify
    setData(null);
    setLoading(false);
    setScanHint("");
    setScanError("");
    handledRef.current = false;

    if (scannerRef.current) {
      // camera is still open: just un-freeze it. Instant.
      try {
        scannerRef.current.resume();
      } catch (e) {
        // ignore
      }
      setPaused(false);
    } else {
      setShowScanner(true); // opened from a link: start the camera now
    }
  };

  const stopCamera = async () => {
    setShowScanner(false);
    await stopScanner();
  };

  const color = data?.valid ? COLORS[data.status] : "#64748b";
  const frameColor = data ? (data.valid ? COLORS[data.status] : "#b91c1c") : "#22c55e";
  const showResult = loading || !!data;

  return (
    <div>
      <style>{SCANNER_CSS}</style>

      <Breadcrumb
        items={[
          { label: "Dashboard", href: home },
          { label: "Verify Gatepass", href: "#" },
        ]}
      />

      <div className="page-header">
        <div>
          <h1 className="page-title">Verify Gatepass</h1>
          <p className="page-subtitle">Scan a learner's Fee Update Card to check their fee status at the gate.</p>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 24px" }}>
        <div style={{ width: "100%", maxWidth: 420, background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,.12)" }}>
          <div style={{ background: "#0f2947", color: "#fff", padding: "14px 18px", textAlign: "center" }}>
            <div style={{ fontWeight: 800 }}>Junda High School Shanzu</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>School Fee Update Card &amp; Gatepass</div>
          </div>

          {/* ================= SCANNER (single zone, always mounted) ================= */}
          <div style={{ display: showScanner ? "block" : "none", padding: 16 }}>
            <div
              style={{
                position: "relative",
                width: BOX,
                height: BOX,
                maxWidth: "100%",
                margin: "0 auto",
                background: "#000",
                borderRadius: 14,
                overflow: "hidden",
                "--gp-frame": frameColor,
              }}
            >
              <div id={READER_ID}></div>

              <span className="gp-corner gp-tl"></span>
              <span className="gp-corner gp-tr"></span>
              <span className="gp-corner gp-bl"></span>
              <span className="gp-corner gp-br"></span>

              {cameraReady && !paused && <div className="gp-line"></div>}

              {!cameraReady && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontSize: 13,
                    gap: 8,
                  }}
                >
                  <span className="spinner-border spinner-border-sm"></span>
                  Starting camera...
                </div>
              )}
            </div>

            <div className="text-muted-soft" style={{ fontSize: 12, textAlign: "center", marginTop: 10 }}>
              {scanHint || (paused ? "Card scanned." : "Hold the card steady inside the frame.")}
            </div>

            <button type="button" className="btn btn-outline-danger btn-sm w-100 mt-2" onClick={stopCamera}>
              <i className="bi bi-x-circle me-2"></i>
              Stop camera
            </button>
          </div>

          {/* ================= IDLE (camera off, nothing scanned) ================= */}
          {!showScanner && !showResult && (
            <div style={{ padding: 24, textAlign: "center" }}>
              {scanError && (
                <div className="alert alert-warning py-2" style={{ fontSize: 13 }}>
                  {scanError}
                </div>
              )}
              <button className="btn btn-primary w-100" onClick={scanNext}>
                <i className="bi bi-camera me-2"></i>
                Scan QR with camera
              </button>
            </div>
          )}

          {/* ================= LOADING ================= */}
          {loading && (
            <div style={{ padding: 24, textAlign: "center" }}>
              <span className="spinner-border spinner-border-sm me-2"></span>
              Checking card...
            </div>
          )}

          {/* ================= RESULT: NOT VERIFIED ================= */}
          {!loading && data && !data.valid && (
            <div style={{ padding: 24, textAlign: "center" }}>
              <div style={{ fontSize: 42, color }}>&#10007;</div>
              <h5 style={{ fontWeight: 800 }}>Not verified</h5>
              <p className="text-muted-soft">{data.detail}</p>
              <button className="btn btn-primary w-100" onClick={scanNext}>
                <i className="bi bi-camera me-2"></i>
                Scan another card
              </button>
            </div>
          )}

          {/* ================= RESULT: VERIFIED ================= */}
          {!loading && data?.valid && (
            <>
              <div style={{ background: color, color: "#fff", padding: "20px 18px", textAlign: "center" }}>
                <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: 1 }}>{data.status_label}</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>{MESSAGES[data.status]}</div>
              </div>
              <div style={{ padding: 20 }}>
                <div style={{ fontSize: 20, fontWeight: 800, textTransform: "uppercase" }}>{data.student_name}</div>
                <div className="text-muted-soft mb-3">
                  Adm No: <strong>{data.admission_no}</strong> &middot; {data.classroom}
                </div>
                {data.status === "GRACE" && (
                  <div style={{ fontSize: 13 }}>
                    Grace period: <strong>{fmtDate(data.grace_from)}</strong> to <strong>{fmtDate(data.grace_to)}</strong>
                  </div>
                )}
                <div className="text-muted-soft mt-3" style={{ fontSize: 11 }}>
                  Checked live on {new Date(data.verified_at).toLocaleString("en-KE")}
                </div>
                <button className="btn btn-primary w-100 mt-3" onClick={scanNext}>
                  <i className="bi bi-camera me-2"></i>
                  Scan next learner
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}