// pages/NotFound.jsx
import { useNavigate } from "react-router-dom";

/**
 * Catch-all 404. Rendered two ways:
 *  - inside AppLayout (guarded), for a signed-in user who hits a path
 *    that doesn't exist within their role's section.
 *  - standalone, for anyone who lands on a URL outside the app shell
 *    entirely (typo'd link, old bookmark, no session).
 * Kept deliberately plain: the number, one line, one way back.
 */
export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        minHeight: "60vh",
        padding: "3rem 1.5rem",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: "5rem",
          lineHeight: 1,
          color: "var(--ink-900)",
        }}
      >
        404
      </div>

      <p
        style={{
          color: "var(--ink-600)",
          fontSize: "var(--fs-base)",
          margin: "0.75rem 0 1.25rem",
        }}
      >
        This page doesn't exist.
      </p>

      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          navigate(-1);
        }}
        style={{
          color: "var(--blue-700)",
          fontWeight: 600,
          fontSize: "var(--fs-sm)",
          textDecoration: "underline",
        }}
      >
        Go back
      </a>
    </div>
  );
}