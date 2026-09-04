// components/Navbar.jsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const ROLE_LABELS = {
  ADMIN: "Administrator",
  TEACHER: "Teacher",
  STUDENT: "Student",
  PARENT: "Parent/Guardian",
  FINANCE: "Finance Officer",
};

// Replace with real data from your API/context.
const MOCK_NOTIFICATIONS = [
  { id: 1, icon: "bi-pencil-square", title: "Term 2 exams published", text: "Results are ready for review across all streams.", time: "10m ago", unread: true },
  { id: 2, icon: "bi-cash-coin", title: "Fee payment received", text: "Kamau, J. — Grade 7B paid KES 12,000.", time: "1h ago", unread: true },
  { id: 3, icon: "bi-people", title: "New student enrolled", text: "Wanjiru Otieno added to Grade 4A.", time: "Yesterday", unread: false },
];

const MOCK_MESSAGES = [
  { id: 1, initials: "MN", title: "Mary Njoroge", text: "Can we move the parents' meeting to Friday?", time: "5m ago", unread: true },
  { id: 2, initials: "PO", title: "Peter Otieno", text: "Marksheet for Grade 6 uploaded.", time: "2h ago", unread: false },
];

export default function Navbar({ onToggleSidebar }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [openMenu, setOpenMenu] = useState(null); // 'notifications' | 'messages' | 'profile' | null
  const [query, setQuery] = useState("");
  const containerRef = useRef(null);

  const unreadNotifications = MOCK_NOTIFICATIONS.filter((n) => n.unread).length;
  const unreadMessages = MOCK_MESSAGES.filter((m) => m.unread).length;

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpenMenu(null);
      }
    }
    function handleEscape(e) {
      if (e.key === "Escape") setOpenMenu(null);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const toggleMenu = (menu) => setOpenMenu((prev) => (prev === menu ? null : menu));

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    // wire up to your search/results route
    navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <header className="app-navbar">
      <button className="app-navbar__toggle" onClick={onToggleSidebar} aria-label="Toggle menu">
        <i className="bi bi-list"></i>
      </button>

      <form className="app-navbar__search" onSubmit={handleSearchSubmit}>
        <i className="bi bi-search"></i>
        <input
          type="text"
          placeholder="Search students, classes, invoices…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <kbd>⌘K</kbd>
      </form>

      <div className="app-navbar__spacer" />

      <div ref={containerRef} className="d-flex align-items-center gap-1">
        {/* Notifications */}
        <div className="position-relative">
          <button
            className="app-navbar__icon-btn"
            onClick={() => toggleMenu("notifications")}
            aria-label="Notifications"
            aria-expanded={openMenu === "notifications"}
          >
            <i className="bi bi-bell"></i>
            {unreadNotifications > 0 && (
              <span className="badge-count">{unreadNotifications}</span>
            )}
          </button>

          {openMenu === "notifications" && (
            <div className="app-navbar__dropdown">
              <div className="app-navbar__dropdown-header">
                <span>Notifications</span>
                <a href="#" onClick={(e) => e.preventDefault()}>Mark all read</a>
              </div>
              <div className="app-navbar__dropdown-list">
                {MOCK_NOTIFICATIONS.length === 0 ? (
                  <div className="app-navbar__dropdown-empty">You're all caught up.</div>
                ) : (
                  MOCK_NOTIFICATIONS.map((n) => (
                    <div
                      key={n.id}
                      className={`app-navbar__dropdown-item ${n.unread ? "app-navbar__dropdown-item--unread" : ""}`}
                    >
                      <div className="app-navbar__dropdown-avatar">
                        <i className={`bi ${n.icon}`}></i>
                      </div>
                      <div className="app-navbar__dropdown-body">
                        <div className="app-navbar__dropdown-title">{n.title}</div>
                        <div className="app-navbar__dropdown-text">{n.text}</div>
                        <div className="app-navbar__dropdown-time">{n.time}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="position-relative">
          <button
            className="app-navbar__icon-btn"
            onClick={() => toggleMenu("messages")}
            aria-label="Messages"
            aria-expanded={openMenu === "messages"}
          >
            <i className="bi bi-chat-right"></i>
            {unreadMessages > 0 && <span className="badge-count">{unreadMessages}</span>}
          </button>

          {openMenu === "messages" && (
            <div className="app-navbar__dropdown">
              <div className="app-navbar__dropdown-header">
                <span>Messages</span>
                <a href="#" onClick={(e) => e.preventDefault()}>New message</a>
              </div>
              <div className="app-navbar__dropdown-list">
                {MOCK_MESSAGES.length === 0 ? (
                  <div className="app-navbar__dropdown-empty">No messages yet.</div>
                ) : (
                  MOCK_MESSAGES.map((m) => (
                    <div
                      key={m.id}
                      className={`app-navbar__dropdown-item ${m.unread ? "app-navbar__dropdown-item--unread" : ""}`}
                    >
                      <div className="app-navbar__dropdown-avatar">{m.initials}</div>
                      <div className="app-navbar__dropdown-body">
                        <div className="app-navbar__dropdown-title">{m.title}</div>
                        <div className="app-navbar__dropdown-text">{m.text}</div>
                        <div className="app-navbar__dropdown-time">{m.time}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Profile */}
        <div className="position-relative">
          <button
            className="app-navbar__user"
            onClick={() => toggleMenu("profile")}
            aria-expanded={openMenu === "profile"}
          >
            <span className="app-navbar__avatar">
              <i className="bi bi-person-circle"></i>
            </span>
            <span className="app-navbar__user-info">
              <strong>{user?.first_name} {user?.last_name}</strong>
              <small>{ROLE_LABELS[user?.role] || user?.role}</small>
            </span>
            <i className="bi bi-chevron-down"></i>
          </button>

          {openMenu === "profile" && (
            <div className="app-navbar__dropdown" style={{ width: 220 }}>
              <div className="app-navbar__profile-menu">
                <button
                  className="app-navbar__profile-menu-item"
                  onClick={() => {
                    setOpenMenu(null);
                    navigate("/change-password");
                  }}
                >
                  <i className="bi bi-key"></i>Change password
                </button>
                <div className="app-navbar__profile-menu-divider" />
                <button
                  className="app-navbar__profile-menu-item app-navbar__profile-menu-item--danger"
                  onClick={handleLogout}
                >
                  <i className="bi bi-box-arrow-right"></i>Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}