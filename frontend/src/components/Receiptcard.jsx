// components/ReceiptCard.jsx
export default function ReceiptCard({ receipt, showQr = true }) {
  if (!receipt) return null;

  return (
    <div className="receipt-card" style={{
      padding: "1.5rem",
      background: "#ffffff",
      borderRadius: "var(--radius-md)",
      border: "1px solid var(--border-color)",
    }}>
      <div className="text-center mb-3">
        <div style={{
          width: "56px",
          height: "56px",
          borderRadius: "50%",
          background: "var(--blue-50)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 0.75rem"
        }}>
          <i className="bi bi-receipt" style={{ fontSize: "1.8rem", color: "var(--blue-700)" }}></i>
        </div>
        <h5 className="mt-1 mb-0" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
          Official Fee Payment Receipt
        </h5>
        <div className="text-muted small" style={{ fontSize: "var(--fs-xs)" }}>
          Receipt No: <strong style={{ color: "var(--blue-700)" }}>{receipt.receipt_no}</strong>
        </div>
      </div>

      <hr style={{ borderColor: "var(--border-color)" }} />

      <div className="profile-info-row">
        <span>Student</span>
        <span style={{ fontWeight: 600 }}>{receipt.student_name}</span>
      </div>

      <div className="profile-info-row">
        <span>Admission No</span>
        <span style={{ fontWeight: 600, color: "var(--blue-700)" }}>{receipt.admission_no}</span>
      </div>

      <div className="profile-info-row">
        <span>Term</span>
        <span>{receipt.term}</span>
      </div>

      <div className="profile-info-row">
        <span>Method</span>
        <span>
          <span className="badge badge-neutral">
            <i className="bi bi-phone me-1"></i>
            {receipt.method}
          </span>
        </span>
      </div>

      {receipt.reference && (
        <div className="profile-info-row">
          <span>Reference</span>
          <span style={{ fontSize: "var(--fs-sm)", color: "var(--ink-600)" }}>{receipt.reference}</span>
        </div>
      )}

      <div className="profile-info-row">
        <span>Date</span>
        <span style={{ fontSize: "var(--fs-sm)", color: "var(--ink-600)" }}>
          {new Date(receipt.paid_at).toLocaleString('en-KE', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </span>
      </div>

      <div className="profile-info-row" style={{ borderBottom: "none", paddingBottom: 0 }}>
        <span style={{ fontWeight: 700 }}>Amount Paid</span>
        <span style={{ 
          fontWeight: 700, 
          fontSize: "1.2rem", 
          color: "var(--success-600)"
        }}>
          KES {Number(receipt.amount).toLocaleString()}
        </span>
      </div>

      {showQr && receipt.qr_code_base64 && (
        <>
          <hr style={{ borderColor: "var(--border-color)" }} />
          <div className="text-center">
            <div style={{
              display: "inline-block",
              padding: "0.5rem",
              background: "#ffffff",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-color)"
            }}>
              <img
                src={`data:image/png;base64,${receipt.qr_code_base64}`}
                alt="Receipt verification QR code"
                style={{ width: 130, height: 130 }}
              />
            </div>
            <div className="text-muted small mt-1">Scan to verify this receipt</div>
          </div>
        </>
      )}
    </div>
  );
}