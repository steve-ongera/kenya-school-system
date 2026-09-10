// components/Navbar.jsx
import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { notificationApi, messagingApi } from "../services/api";

const ROLE_LABELS = {
  ADMIN: "Administrator",
  TEACHER: "Teacher",
  STUDENT: "Student",
  PARENT: "Parent/Guardian",
  FINANCE: "Finance Officer",
};

const CATEGORY_ICON = {
  GENERAL: "bi-megaphone",
  EVENT: "bi-calendar-event",
  CLOSING: "bi-door-closed",
  FEE_REMINDER: "bi-cash-coin",
  ACADEMIC: "bi-mortarboard",
};

function timeAgo(dateString) {
  const seconds = Math.floor((Date.now() - new Date(dateString)) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

const POLL_INTERVAL_MS = 30000;

export default function Navbar({ onToggleSidebar }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [openMenu, setOpenMenu] = useState(null); // 'notifications' | 'messages' | 'profile' | null
  const [query, setQuery] = useState("");
  const containerRef = useRef(null);

  const [notifications, setNotifications] = useState([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [conversations, setConversations] = useState([]);
  const [unreadMessages, setUnreadMessages] = useState(0);

  const refreshCounts = useCallback(() => {
    notificationApi.unreadCount().then(({ data }) => setUnreadNotifications(data.unread_count)).catch(() => {});
    messagingApi.unreadCount().then(({ data }) => setUnreadMessages(data.unread_count)).catch(() => {});
  }, []);

  useEffect(() => {
    refreshCounts();
    const interval = setInterval(refreshCounts, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshCounts]);

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

  const toggleMenu = (menu) => {
    setOpenMenu((prev) => (prev === menu ? null : menu));
    if (menu === "notifications" && openMenu !== "notifications") {
      notificationApi.list({ page_size: 8 }).then(({ data }) => setNotifications(data.results ?? data));
    }
    if (menu === "messages" && openMenu !== "messages") {
      messagingApi.conversations().then(({ data }) => setConversations(data.slice(0, 8)));
    }
  };

  const markAllRead = async (e) => {
    e.preventDefault();
    await notificationApi.markAllRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadNotifications(0);
  };

  const openNotification = async (n) => {
    if (!n.is_read) {
      await notificationApi.markRead(n.id);
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      setUnreadNotifications((c) => Math.max(0, c - 1));
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (!query.trim()) return;
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
            {unreadNotifications > 0 && <span className="badge-count">{unreadNotifications}</span>}
          </button>

          {openMenu === "notifications" && (
            <div className="app-navbar__dropdown">
              <div className="app-navbar__dropdown-header">
                <span>Notifications</span>
                <a href="#" onClick={markAllRead}>
                  Mark all read
                </a>
              </div>
              <div className="app-navbar__dropdown-list">
                {notifications.length === 0 ? (
                  <div className="app-navbar__dropdown-empty">You're all caught up.</div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`app-navbar__dropdown-item ${!n.is_read ? "app-navbar__dropdown-item--unread" : ""}`}
                      onClick={() => openNotification(n)}
                      role="button"
                    >
                      <div className="app-navbar__dropdown-avatar">
                        <i className={`bi ${CATEGORY_ICON[n.category] || "bi-bell"}`}></i>
                      </div>
                      <div className="app-navbar__dropdown-body">
                        <div className="app-navbar__dropdown-title">{n.subject}</div>
                        <div className="app-navbar__dropdown-text">{n.body}</div>
                        <div className="app-navbar__dropdown-time">{timeAgo(n.created_at)}</div>
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
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setOpenMenu(null);
                    navigate("/messages");
                  }}
                >
                  Open Messages
                </a>
              </div>
              <div className="app-navbar__dropdown-list">
                {conversations.length === 0 ? (
                  <div className="app-navbar__dropdown-empty">No messages yet.</div>
                ) : (
                  conversations.map((c) => {
                    const others = (c.participants || []).filter((p) => p.id !== user?.id);
                    const initials = others
                      .map((p) => `${p.first_name?.[0] || ""}${p.last_name?.[0] || ""}`)
                      .join(", ") || "?";
                    return (
                      <div
                        key={c.id}
                        className={`app-navbar__dropdown-item ${c.unread_count > 0 ? "app-navbar__dropdown-item--unread" : ""}`}
                        onClick={() => {
                          setOpenMenu(null);
                          navigate("/messages");
                        }}
                        role="button"
                      >
                        <div className="app-navbar__dropdown-avatar">{initials}</div>
                        <div className="app-navbar__dropdown-body">
                          <div className="app-navbar__dropdown-title">
                            {others.map((p) => `${p.first_name} ${p.last_name}`).join(", ") || "Conversation"}
                          </div>
                          <div className="app-navbar__dropdown-text">{c.last_message?.body || ""}</div>
                          <div className="app-navbar__dropdown-time">
                            {c.last_message ? timeAgo(c.last_message.created_at) : ""}
                          </div>
                        </div>
                      </div>
                    );
                  })
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
              <strong>
                {user?.first_name} {user?.last_name}
              </strong>
              <small>{ROLE_LABELS[user?.role] || user?.role}</small>
            </span>
            <i className="bi bi-chevron-down"></i>
          </button>

          {openMenu === "profile" && (
            <div className="app-navbar__dropdown" style={{ width: 220 }}>
              <div className="app-navbar__profile-menu">
                <li>
                  <button className="dropdown-item" onClick={() => navigate("/profile")}>
                    <i className="bi bi-person me-2"></i>My profile
                  </button>
                </li>
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