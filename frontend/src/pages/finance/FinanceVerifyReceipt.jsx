import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { financeApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";

const currency = (value) =>
  Number(value || 0).toLocaleString("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const METHOD_LABEL = {
  MPESA: "M-Pesa",
  BANK: "Bank",
  CASH: "Cash",
  CHEQUE: "Cheque",
};

// Pulls a receipt number (e.g. RCT-2026-00028) out of whatever was scanned or
// typed: the full QR link (http://.../verify-receipt/RCT-2026-00028) or the
// bare number.
const extractReceiptNo = (text) => {
  const match = String(text || "").match(/RCT-\d{4}-\d+/i);
  return match ? match[0].toUpperCase() : null;
};

const READER_ID = "receipt-qr-reader";

export default function FinanceVerifyReceipt() {
  const { receiptNo: routeReceiptNo } = useParams(); // set when opened from the QR link

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // response body (valid or not)
  const [error, setError] = useState("");
  const [printedAmount, setPrintedAmount] = useState("");
  const [recent, setRecent] = useState([]); // this session's checks

  // ---- camera scanner ----
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [scanHint, setScanHint] = useState("");
  const scannerRef = useRef(null);
  const handledRef = useRef(false);

  const verify = async (no) => {
    setLoading(true);
    setError("");
    setResult(null);
    setPrintedAmount("");
    setInput(no);
    try {
      const { data } = await financeApi.verifyReceiptSecure(no);
      setResult(data);
      setRecent((prev) =>
        [{ receipt_no: data.receipt_no, valid: true, amount: data.amount, at: new Date() }, ...prev].slice(0, 5)
      );
    } catch (err) {
      const status = err.response?.status;
      if (status === 404) {
        setResult({ valid: false, receipt_no: no, detail: err.response?.data?.detail });
        setRecent((prev) => [{ receipt_no: no, valid: false, amount: null, at: new Date() }, ...prev].slice(0, 5));
      } else if (status === 403) {
        setError("Only Finance and Admin staff can verify receipts.");
      } else {
        setError("Could not verify this receipt. Check your connection and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // opened straight from the QR link -> verify immediately
  useEffect(() => {
    if (routeReceiptNo) {
      const no = extractReceiptNo(routeReceiptNo);
      if (no) verify(no);
      else setError("That link does not contain a valid receipt number.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeReceiptNo]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const no = extractReceiptNo(input);
    if (!no) {
      setError("Enter a receipt number like RCT-2026-00001, or scan the QR code.");
      return;
    }
    verify(no);
  };

  const stopScanner = async () => {
    const sc = scannerRef.current;
    scannerRef.current = null;
    if (sc) {
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
    }
  };

  useEffect(() => {
    if (!scanning) return undefined;
    let cancelled = false;
    handledRef.current = false;
    setScanError("");
    setScanHint("");

    const scanner = new Html5Qrcode(READER_ID);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          if (handledRef.current) return;
          const no = extractReceiptNo(decodedText);
          if (!no) {
            setScanHint("That QR code is not a receipt QR code. Keep scanning.");
            return;
          }
          handledRef.current = true;
          stopScanner();
          setScanning(false);
          verify(no);
        },
        () => {} // per-frame "no QR found" noise
      )
      .catch(() => {
        if (!cancelled) {
          setScanError(
            "Could not open the camera. Allow camera access in the browser (needs HTTPS or localhost), or type the receipt number instead."
          );
          setScanning(false);
        }
      });

    return () => {
      cancelled = true;
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  const reset = () => {
    setResult(null);
    setError("");
    setInput("");
    setPrintedAmount("");
  };

  // ---- amount cross-check against the paper receipt ----
  const printedNumber = printedAmount === "" ? null : Number(printedAmount);
  const amountMatches =
    result?.valid && printedNumber !== null ? Math.abs(printedNumber - Number(result.amount)) < 0.005 : null;

  const balance = result?.valid ? Number(result.current_balance) : 0;

  return (
    <div>
      <Breadcrumb
        items={[
          { label: "Dashboard", href: "/finance" },
          { label: "Payments", href: "/finance/payments" },
          { label: "Verify Receipt", href: "#" },
        ]}
      />

      <div className="page-header">
        <div>
          <h1 className="page-title">Verify Receipt</h1>
          <p className="page-subtitle">
            Scan the QR code on a receipt, or type its number, to confirm it is genuine and matches our records.
          </p>
        </div>
      </div>

      {/* ================= SCAN / ENTER ================= */}
      <div className="card p-4 mb-4">
        <form onSubmit={handleSubmit}>
          <label className="form-label">Receipt number or scanned link</label>
          <div className="input-group">
            <span className="input-group-text bg-white">
              <i className="bi bi-upc-scan"></i>
            </span>
            <input
              className="form-control"
              placeholder="Scan with a handheld scanner, paste the link, or type RCT-2026-00001"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              autoFocus={!routeReceiptNo}
            />
            <button className="btn btn-primary" type="submit" disabled={loading || !input.trim()}>
              <i className="bi bi-shield-check me-1"></i>
              Verify
            </button>
          </div>
        </form>

        <div className="mt-3 d-flex flex-wrap gap-2 align-items-center">
          {!scanning ? (
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => {
                setScanError("");
                setScanning(true);
              }}
            >
              <i className="bi bi-camera me-2"></i>
              Scan QR with camera
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-outline-danger"
              onClick={() => {
                stopScanner();
                setScanning(false);
              }}
            >
              <i className="bi bi-x-circle me-2"></i>
              Stop camera
            </button>
          )}
          <span className="text-muted-soft" style={{ fontSize: "var(--fs-sm)" }}>
            A USB/handheld QR scanner also works: click the box above and scan.
          </span>
        </div>

        {scanError && (
          <div className="alert alert-warning py-2 mt-3 mb-0" style={{ fontSize: "var(--fs-sm)" }}>
            {scanError}
          </div>
        )}

        {scanning && (
          <div className="mt-3">
            <div id={READER_ID} style={{ width: "100%", maxWidth: 360 }}></div>
            <div className="text-muted-soft mt-2" style={{ fontSize: "var(--fs-sm)" }}>
              {scanHint || "Point the camera at the QR code on the receipt."}
            </div>
          </div>
        )}
      </div>

      {loading && (
        <div className="card p-4 mb-4 d-flex flex-row align-items-center text-muted-soft">
          <span className="spinner-border spinner-border-sm me-2"></span>
          Checking receipt...
        </div>
      )}

      {error && !loading && (
        <div className="alert alert-danger mb-4" role="alert">
          <i className="bi bi-exclamation-triangle me-2"></i>
          {error}
        </div>
      )}

      {/* ================= RESULT: NOT FOUND ================= */}
      {result && !result.valid && !loading && (
        <div className="card p-4 mb-4" style={{ borderColor: "#dc3545" }}>
          <div className="d-flex align-items-center gap-3">
            <i className="bi bi-x-octagon-fill" style={{ fontSize: "2.4rem", color: "#dc3545" }}></i>
            <div>
              <h5 className="mb-1" style={{ color: "#dc3545", fontWeight: 700 }}>
                Receipt not found
              </h5>
              <div className="text-muted-soft">
                No payment in the system has the number <strong>{result.receipt_no}</strong>. Do not accept this
                receipt as proof of payment.
              </div>
            </div>
          </div>
          <div className="mt-3">
            <button className="btn btn-outline-secondary" type="button" onClick={reset}>
              Verify another receipt
            </button>
          </div>
        </div>
      )}

      {/* ================= RESULT: GENUINE ================= */}
      {result && result.valid && !loading && (
        <div className="card p-4 mb-4" style={{ borderColor: "#198754" }}>
          <div className="d-flex align-items-center gap-3 mb-3">
            <i className="bi bi-patch-check-fill" style={{ fontSize: "2.4rem", color: "#198754" }}></i>
            <div>
              <h5 className="mb-1" style={{ color: "#198754", fontWeight: 700 }}>
                Genuine receipt
              </h5>
              <div className="text-muted-soft">
                This payment is recorded in the system. Compare the details below with the paper receipt.
              </div>
            </div>
          </div>

          <div className="row g-4">
            <div className="col-md-7">
              <table className="table table-sm mb-0">
                <tbody>
                  <tr>
                    <th style={{ width: "38%" }}>Receipt No.</th>
                    <td className="fw-bold">{result.receipt_no}</td>
                  </tr>
                  <tr>
                    <th>Student</th>
                    <td>{result.student_name}</td>
                  </tr>
                  <tr>
                    <th>Admission No.</th>
                    <td>{result.admission_no}</td>
                  </tr>
                  <tr>
                    <th>Class</th>
                    <td>{result.classroom || "-"}</td>
                  </tr>
                  <tr>
                    <th>Amount paid</th>
                    <td className="fw-bold fs-5" style={{ color: "#198754" }}>
                      KES {currency(result.amount)}
                    </td>
                  </tr>
                  <tr>
                    <th>Method</th>
                    <td>{METHOD_LABEL[result.method] || result.method}</td>
                  </tr>
                  <tr>
                    <th>Reference</th>
                    <td>{result.reference || "-"}</td>
                  </tr>
                  <tr>
                    <th>Date paid</th>
                    <td>{new Date(result.paid_at).toLocaleString("en-KE")}</td>
                  </tr>
                  <tr>
                    <th>Recorded by</th>
                    <td>{result.recorded_by_name || "-"}</td>
                  </tr>
                  <tr>
                    <th>Student balance now</th>
                    <td className="fw-bold">
                      {balance > 0 && (
                        <span style={{ color: "#dc3545" }}>KES {currency(balance)} owing</span>
                      )}
                      {balance < 0 && (
                        <span style={{ color: "#198754" }}>KES {currency(Math.abs(balance))} credit</span>
                      )}
                      {balance === 0 && <span style={{ color: "#198754" }}>Cleared</span>}
                    </td>
                  </tr>
                </tbody>
              </table>

              {result.allocations?.length > 1 && (
                <div className="mt-3">
                  <div className="text-muted-soft mb-1">This payment was applied to</div>
                  <table className="table table-sm mb-0">
                    <tbody>
                      {result.allocations.map((a, i) => (
                        <tr key={i}>
                          <td>{a.term}</td>
                          <td className="text-end">KES {currency(a.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="col-md-5">
              <div className="border rounded-3 p-3">
                <div className="fw-bold mb-1">Check the amount on the paper receipt</div>
                <div className="text-muted-soft mb-2" style={{ fontSize: "var(--fs-sm)" }}>
                  Type the amount printed on the receipt you were given. A tampered receipt will not match.
                </div>
                <input
                  type="number"
                  className="form-control"
                  min="0"
                  step="0.01"
                  placeholder="Amount on paper receipt (KES)"
                  value={printedAmount}
                  onChange={(e) => setPrintedAmount(e.target.value)}
                />
                {amountMatches === true && (
                  <div className="alert alert-success py-2 mt-2 mb-0" style={{ fontSize: "var(--fs-sm)" }}>
                    <i className="bi bi-check-circle me-1"></i>
                    Amount matches our records.
                  </div>
                )}
                {amountMatches === false && (
                  <div className="alert alert-danger py-2 mt-2 mb-0" style={{ fontSize: "var(--fs-sm)" }}>
                    <i className="bi bi-exclamation-octagon me-1"></i>
                    MISMATCH. Our records show KES {currency(result.amount)}. Do not accept this receipt.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-3">
            <button className="btn btn-outline-secondary" type="button" onClick={reset}>
              Verify another receipt
            </button>
          </div>
        </div>
      )}

      {/* ================= RECENT CHECKS (this session) ================= */}
      {recent.length > 0 && (
        <div className="card p-4">
          <h6 className="mb-3" style={{ fontWeight: 700 }}>
            Checked in this session
          </h6>
          <div className="table-responsive">
            <table className="table table-sm mb-0">
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Result</th>
                  <th className="text-end">Amount</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r, i) => (
                  <tr key={`${r.receipt_no}-${i}`}>
                    <td>
                      <button
                        type="button"
                        className="btn btn-link p-0"
                        style={{ textDecoration: "none" }}
                        onClick={() => verify(r.receipt_no)}
                      >
                        {r.receipt_no}
                      </button>
                    </td>
                    <td>
                      {r.valid ? (
                        <span className="badge badge-success">Genuine</span>
                      ) : (
                        <span className="badge bg-danger">Not found</span>
                      )}
                    </td>
                    <td className="text-end">{r.amount !== null ? `KES ${currency(r.amount)}` : "-"}</td>
                    <td>{r.at.toLocaleTimeString("en-KE")}</td>
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