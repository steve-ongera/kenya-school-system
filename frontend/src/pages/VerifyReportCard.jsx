// src/pages/public/VerifyReportCard.jsx
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { reportCardsApi } from "../services/api";
import logoImage from "../assets/masomo_logo.png";

export default function VerifyReportCard() {
  const { token } = useParams();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const verify = async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await reportCardsApi.verify(token);
        if (!cancelled) setResult(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err.response?.data?.detail ||
              "Could not verify this report card. The link may be invalid or expired."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (token) verify();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // ---- Loading state ----
  if (loading) {
    return (
      <div className="verify-page">
        <div className="verify-card verify-card--loading">
          <span className="spinner-border text-primary" role="status" aria-hidden="true"></span>
          <p className="mt-3 mb-0 text-muted-soft">Checking report card authenticity…</p>
        </div>
      </div>
    );
  }

  // ---- Error / network failure ----
  if (error) {
    return (
      <div className="verify-page">
        <div className="verify-card verify-card--error">
          <div className="verify-icon verify-icon--error">
            <i className="bi bi-exclamation-triangle"></i>
          </div>
          <h2 className="verify-title">Verification Failed</h2>
          <p className="verify-message">{error}</p>
          <Link to="/" className="btn btn-outline-primary btn-sm mt-2">
            <i className="bi bi-house me-1"></i> Return Home
          </Link>
        </div>
      </div>
    );
  }

  // ---- Invalid token / report not found ----
  if (!result || !result.valid) {
    return (
      <div className="verify-page">
        <div className="verify-card verify-card--invalid">
          <div className="verify-icon verify-icon--invalid">
            <i className="bi bi-shield-x"></i>
          </div>
          <h2 className="verify-title">Not a Genuine Report Card</h2>
          <p className="verify-message">
            {result?.detail ||
              "This document could not be verified against our records. It may be a forgery, or the link may have expired."}
          </p>
          <p className="verify-hint">
            If you believe this is a mistake, please contact the Academics Office at Masomo School.
          </p>
          <Link to="/" className="btn btn-outline-primary btn-sm mt-2">
            <i className="bi bi-house me-1"></i> Return Home
          </Link>
        </div>
      </div>
    );
  }

  // ---- Valid report card ----
  return (
    <div className="verify-page">
      <div className="verify-card verify-card--valid">
        {/* Header */}
        <div className="verify-header">
          <img src={logoImage} alt="Masomo School" className="verify-logo" />
          <div>
            <div className="verify-school">Masomo School</div>
            <div className="verify-subtitle">Report Card Verification</div>
          </div>
        </div>

        {/* Success banner */}
        <div className="verify-success-banner">
          <i className="bi bi-patch-check-fill"></i>
          <div>
            <strong> Genuine Report Card</strong>
            <div className="verify-success-note">
              This document matches our official records.
            </div>
          </div>
        </div>

        {/* Student info */}
        <div className="verify-section">
          <h3 className="verify-section-title">
            <i className="bi bi-person-badge me-2"></i>Student
          </h3>
          <div className="verify-grid">
            <div className="verify-field">
              <span className="verify-label">Full Name</span>
              <span className="verify-value">{result.student_name}</span>
            </div>
            <div className="verify-field">
              <span className="verify-label">Admission No</span>
              <span className="verify-value">{result.admission_no}</span>
            </div>
            <div className="verify-field">
              <span className="verify-label">Classroom</span>
              <span className="verify-value">{result.classroom}</span>
            </div>
            {result.enrollment_status_display && (
              <div className="verify-field">
                <span className="verify-label">Status</span>
                <span className="verify-value">{result.enrollment_status_display}</span>
              </div>
            )}
          </div>
        </div>

        {/* Academic info */}
        <div className="verify-section">
          <h3 className="verify-section-title">
            <i className="bi bi-journal-text me-2"></i>Academic Record
          </h3>
          <div className="verify-grid">
            <div className="verify-field">
              <span className="verify-label">Term</span>
              <span className="verify-value">{result.term}</span>
            </div>
            <div className="verify-field">
              <span className="verify-label">Exam</span>
              <span className="verify-value">{result.exam}</span>
            </div>
            <div className="verify-field">
              <span className="verify-label">Average</span>
              <span className="verify-value">
                {result.average_marks != null ? `${result.average_marks}%` : "—"}
              </span>
            </div>
            <div className="verify-field">
              <span className="verify-label">Overall Grade</span>
              <span className="verify-value">{result.overall_grade || "—"}</span>
            </div>
            <div className="verify-field">
              <span className="verify-label">Points (Avg)</span>
              <span className="verify-value">
                {result.average_points != null ? result.average_points : "—"}
              </span>
            </div>
            <div className="verify-field">
              <span className="verify-label">Class Position</span>
              <span className="verify-value">
                {result.class_position != null
                  ? `${result.class_position}${
                      result.class_size ? ` of ${result.class_size}` : ""
                    }`
                  : "Not ranked"}
              </span>
            </div>
          </div>
        </div>

        {/* Footer note */}
        <div className="verify-footer">
          <i className="bi bi-shield-check me-1"></i>
          Verified on {new Date().toLocaleDateString("en-KE", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
          {" · "}
          © Masomo School — Academics Office
        </div>
      </div>
    </div>
  );
}