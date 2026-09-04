import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const HOME_BY_ROLE = {
  ADMIN: "/admin",
  TEACHER: "/teacher",
  STUDENT: "/student",
  PARENT: "/parent",
  FINANCE: "/finance",
};

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const user = await login(username, password);
      navigate(HOME_BY_ROLE[user.role] || "/");
    } catch {
      setError("Invalid admission/staff number or password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page" style={{ 
      background: "#ffffff",
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1rem"
    }}>
      {/* Login Card */}
      <div className="login-card" style={{
        maxWidth: "400px",
        width: "100%",
        padding: "2.5rem",
        background: "#ffffff",
        borderRadius: "var(--radius-lg)",
        boxShadow: "0 8px 40px rgba(11, 37, 69, 0.08)",
        border: "1px solid var(--border-color)"
      }}>
        <div className="login-card__brand" style={{ marginBottom: "0.5rem" }}>
          <div style={{
            width: "52px",
            height: "52px",
            borderRadius: "var(--radius-md)",
            background: "var(--blue-50)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <i className="bi bi-mortarboard-fill" style={{ fontSize: "1.8rem", color: "var(--blue-700)" }}></i>
          </div>
          <div style={{ marginLeft: "0.5rem" }}>
            <h1 style={{ 
              fontSize: "1.5rem", 
              fontWeight: 700, 
              color: "var(--blue-900)",
              margin: 0,
              fontFamily: "var(--font-display)"
            }}>
              Masomo System
            </h1>
            <p style={{ 
              fontSize: "0.72rem", 
              color: "var(--ink-400)",
              margin: 0,
              letterSpacing: "0.06em",
              textTransform: "uppercase"
            }}>
              School Management System
            </p>
          </div>
        </div>

        <p className="login-card__subtitle" style={{ 
          color: "var(--ink-600)",
          marginBottom: "1.75rem",
          fontSize: "var(--fs-sm)"
        }}>
          Sign in to your school portal
        </p>

        {error && (
          <div className="alert alert-danger py-2" style={{ 
            fontSize: "var(--fs-sm)",
            borderRadius: "var(--radius-sm)"
          }}>
            <i className="bi bi-exclamation-circle me-1"></i> {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label" style={{ fontWeight: 600 }}>
              Admission / Staff Number
            </label>
            <div className="input-icon-group">
              <i className="bi bi-person input-icon-leading"></i>
              <input
                className="form-control"
                placeholder="e.g., ADM-2024-001"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                style={{ paddingLeft: "2.5rem" }}
              />
            </div>
          </div>

          <div className="mb-3">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label className="form-label" style={{ fontWeight: 600 }}>Password</label>
              <a href="#" style={{ 
                fontSize: "var(--fs-xs)", 
                color: "var(--blue-700)",
                textDecoration: "none"
              }}>
                Forgot password?
              </a>
            </div>
            <div className="input-icon-group has-toggle">
              <i className="bi bi-lock input-icon-leading"></i>
              <input
                type={showPassword ? "text" : "password"}
                className="form-control"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ paddingLeft: "2.5rem", paddingRight: "2.5rem" }}
              />
              <button
                type="button"
                className="input-password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <i className={`bi bi-${showPassword ? "eye-slash" : "eye"}`}></i>
              </button>
            </div>
          </div>

          <div className="mb-3 d-flex align-items-center gap-2">
            <input type="checkbox" className="form-check-input" id="remember" />
            <label htmlFor="remember" style={{ fontSize: "var(--fs-sm)", color: "var(--ink-600)" }}>
              Remember me
            </label>
          </div>

          <button 
            className={`btn btn-primary w-100 ${submitting ? "btn--loading" : ""}`}
            type="submit" 
            disabled={submitting}
            style={{
              padding: "0.7rem",
              fontSize: "var(--fs-md)",
              fontWeight: 600,
              borderRadius: "var(--radius-md)"
            }}
          >
            {submitting ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="login-card__footer" style={{
          marginTop: "1.5rem",
          textAlign: "center",
          fontSize: "var(--fs-xs)",
          color: "var(--ink-400)"
        }}>
          <span>© {new Date().getFullYear()} Shule MS. All rights reserved.</span>
        </div>
      </div>
    </div>
  );
}