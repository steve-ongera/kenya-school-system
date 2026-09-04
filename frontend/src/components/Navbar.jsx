import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const ROLE_LABELS = {
  ADMIN: "Administrator",
  TEACHER: "Teacher",
  STUDENT: "Student",
  PARENT: "Parent/Guardian",
  FINANCE: "Finance Officer",
};

export default function Navbar({ onToggleSidebar }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <header className="app-navbar">
      <button className="app-navbar__toggle" onClick={onToggleSidebar} aria-label="Toggle menu">
        <i className="bi bi-list"></i>
      </button>

      <div className="app-navbar__spacer" />

      <div className="dropdown">
        <button
          className="app-navbar__user btn"
          type="button"
          data-bs-toggle="dropdown"
          aria-expanded="false"
        >
          <span className="app-navbar__avatar">
            <i className="bi bi-person-circle"></i>
          </span>
          <span className="app-navbar__user-info d-none d-sm-flex">
            <strong>{user?.first_name} {user?.last_name}</strong>
            <small>{ROLE_LABELS[user?.role] || user?.role}</small>
          </span>
          <i className="bi bi-chevron-down"></i>
        </button>
        <ul className="dropdown-menu dropdown-menu-end">
          <li>
            <button className="dropdown-item" onClick={() => navigate("/change-password")}>
              <i className="bi bi-key me-2"></i>Change password
            </button>
          </li>
          <li><hr className="dropdown-divider" /></li>
          <li>
            <button className="dropdown-item text-danger" onClick={handleLogout}>
              <i className="bi bi-box-arrow-right me-2"></i>Logout
            </button>
          </li>
        </ul>
      </div>
    </header>
  );
}
