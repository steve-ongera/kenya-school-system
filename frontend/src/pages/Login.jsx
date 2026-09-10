import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import logo from "../assets/masomo_logo.png";

const HOME_BY_ROLE = {
  ADMIN: "/admin",
  TEACHER: "/teacher",
  STUDENT: "/student",
  PARENT: "/parent",
  FINANCE: "/finance",
};

const USERNAME_MAX_LENGTH = 30;

export default function Login() {
  const { login, verifyOtp } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState("credentials"); // "credentials" | "otp"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [challengeToken, setChallengeToken] = useState(null);
  const [maskedContact, setMaskedContact] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleCredentialsSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await login(username, password);
      if (result.otpRequired) {
        setChallengeToken(result.challengeToken);
        setMaskedContact(result.maskedContact);
        setStep("otp");
      } else {
        navigate(HOME_BY_ROLE[result.user.role] || "/");
      }
    } catch (err) {
      if (err?.response?.status === 423) {
        setError(err.response.data?.detail || "Account locked. Contact your administrator.");
      } else {
        setError("Invalid admission/staff number or password.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const user = await verifyOtp(challengeToken, otpCode);
      navigate(HOME_BY_ROLE[user.role] || "/");
    } catch (err) {
      if (err?.response?.status === 423) {
        setError("Too many failed attempts. Account locked - contact your administrator.");
        setStep("credentials");
      } else {
        setError("Invalid or expired code. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page" style={{ background: "#ffffff", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div className="login-card" style={{ maxWidth: "420px", width: "100%", padding: "2.5rem", background: "#ffffff", borderRadius: "var(--radius-lg)", boxShadow: "0 8px 40px rgba(11, 37, 69, 0.08)", border: "1px solid var(--border-color)" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem" }}>
          <img src={logo} alt="Moi Forces Academy Logo" style={{ width: "100px", height: "100px", objectFit: "contain", borderRadius: "var(--radius-md)" }} />
        </div>

        <div style={{ marginBottom: "0.5rem", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--blue-900)", margin: 0, fontFamily: "var(--font-display)" }}>
            Masomo System
          </h1>
          <p style={{ fontSize: "0.72rem", color: "var(--ink-400)", margin: "0.2rem 0 0 0", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            School Management System
          </p>
        </div>

        <p style={{ color: "var(--ink-600)", marginBottom: "1.75rem", marginTop: "0.5rem", fontSize: "var(--fs-sm)", textAlign: "center" }}>
          {step === "credentials" ? "Sign in to your school portal" : "Enter the verification code sent to your registered contact"}
        </p>

        {error && (
          <div className="alert alert-danger py-2" style={{ fontSize: "var(--fs-sm)", borderRadius: "var(--radius-sm)" }}>
            <i className="bi bi-exclamation-circle me-1"></i> {error}
          </div>
        )}

        {step === "credentials" ? (
          <form onSubmit={handleCredentialsSubmit}>
            <div className="mb-3">
              <label className="form-label" style={{ fontWeight: 600 }}>Admission / Staff Number</label>
              <div className="input-icon-group">
                <i className="bi bi-person input-icon-leading"></i>
                <input
                  className="form-control"
                  placeholder="e.g., ADM-2024-001"
                  value={username}
                  maxLength={USERNAME_MAX_LENGTH}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  style={{ paddingLeft: "2.5rem" }}
                />
              </div>
            </div>

            <div className="mb-3">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label className="form-label" style={{ fontWeight: 600 }}>Password</label>
                <Link to="/forgot-password" style={{ fontSize: "var(--fs-xs)", color: "var(--blue-700)", textDecoration: "none" }}>
                  Forgot password?
                </Link>
              </div>
              <div className="input-icon-group has-toggle">
                <i className="bi bi-lock input-icon-leading"></i>
                <input
                  type={showPassword ? "text" : "password"}
                  className="form-control"
                  placeholder="Enter your password"
                  value={password}
                  maxLength={128}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{ paddingLeft: "2.5rem", paddingRight: "2.5rem" }}
                />
                <button type="button" className="input-password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>
                  <i className={`bi bi-${showPassword ? "eye-slash" : "eye"}`}></i>
                </button>
              </div>
            </div>

            <button className={`btn btn-primary w-100 ${submitting ? "btn--loading" : ""}`} type="submit" disabled={submitting} style={{ padding: "0.7rem", fontSize: "var(--fs-md)", fontWeight: 600, borderRadius: "var(--radius-md)" }}>
              {submitting ? "Signing in..." : "Sign In"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleOtpSubmit}>
            <p style={{ fontSize: "var(--fs-sm)", color: "var(--ink-600)", marginBottom: "1rem" }}>
              A 6-digit code was sent to your {maskedContact}. It expires shortly, so enter it now.
            </p>
            <div className="mb-3">
              <label className="form-label" style={{ fontWeight: 600 }}>Verification Code</label>
              <input
                className="form-control"
                placeholder="352092"
                value={otpCode}
                inputMode="numeric"
                maxLength={6}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                required
                autoFocus
                style={{ letterSpacing: "0.3em", fontSize: "1.2rem", textAlign: "center" }}
              />
            </div>
            <button className={`btn btn-primary w-100 ${submitting ? "btn--loading" : ""}`} type="submit" disabled={submitting || otpCode.length !== 6} style={{ padding: "0.7rem", fontSize: "var(--fs-md)", fontWeight: 600, borderRadius: "var(--radius-md)" }}>
              {submitting ? "Verifying..." : "Verify & Sign In"}
            </button>
            <button type="button" className="btn btn-link w-100 mt-2" onClick={() => setStep("credentials")} style={{ fontSize: "var(--fs-sm)" }}>
              Back to login
            </button>
          </form>
        )}

        <div style={{ marginTop: "1.5rem", textAlign: "center", fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
          <span>© {new Date().getFullYear()} Innovationhub Softwares. All rights reserved.</span>
        </div>
      </div>
    </div>
  );
}