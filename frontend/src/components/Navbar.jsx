// components/Navbar.jsx
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useFullscreen } from "../hooks/useFullscreen";
import { notificationApi, messagingApi } from "../services/api";
import { NAV_BY_ROLE } from "../config/navigation";

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
const MAX_SUGGESTIONS = 8;

export default function Navbar({ onToggleSidebar }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();

  const [openMenu, setOpenMenu] = useState(null); // 'notifications' | 'messages' | 'profile' | null
  const [query, setQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef(null);
  const searchRef = useRef(null);

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

  // Flat, ROLE-SCOPED list of every page this user actually has a sidebar
  // link to - this is what the search box is allowed to suggest. A student
  // (or any other role) can only ever be pulled from NAV_BY_ROLE[user.role],
  // so they can't search their way into a page outside their own section.
  const searchablePages = useMemo(() => {
    const groups = user ? NAV_BY_ROLE[user.role] || [] : [];
    const pages = [];
    groups.forEach((group) => {
      group.items.forEach((item) => {
        pages.push({ ...item, group: group.label || "" });
      });
    });
    return pages;
  }, [user]);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return searchablePages
      .filter((p) => p.label.toLowerCase().includes(q) || p.group.toLowerCase().includes(q))
      .slice(0, MAX_SUGGESTIONS);
  }, [query, searchablePages]);

  useEffect(() => {
    setActiveIndex(suggestions.length > 0 ? 0 : -1);
  }, [suggestions]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpenMenu(null);
      }
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    }
    function handleEscape(e) {
      if (e.key === "Escape") {
        setOpenMenu(null);
        setShowSuggestions(false);
      }
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

  const goToPage = (page) => {
    if (!page) return;
    navigate(page.to);
    setQuery("");
    setShowSuggestions(false);
    setActiveIndex(-1);
  };

  const handleSearchChange = (e) => {
    setQuery(e.target.value);
    setShowSuggestions(true);
  };

  const handleSearchKeyDown = (e) => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      goToPage(suggestions[activeIndex] ?? suggestions[0]);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (suggestions.length > 0) {
      goToPage(suggestions[activeIndex] ?? suggestions[0]);
    }
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

      <div ref={searchRef} style={{ position: "relative", flex: 1, maxWidth: 420 }}>
        <form className="app-navbar__search" onSubmit={handleSearchSubmit} autoComplete="off">
          <i className="bi bi-search"></i>
          <input
            type="text"
            placeholder="Search pages…"
            value={query}
            onChange={handleSearchChange}
            onFocus={() => query.trim() && setShowSuggestions(true)}
            onKeyDown={handleSearchKeyDown}
          />
          <kbd>⌘K</kbd>
        </form>

        {showSuggestions && query.trim() && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              right: 0,
              background: "#fff",
              border: "1px solid rgba(0,0,0,0.08)",
              borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              zIndex: 50,
              maxHeight: 360,
              overflowY: "auto",
            }}
          >
            {suggestions.length === 0 ? (
              <div className="app-navbar__dropdown-empty">No matching pages.</div>
            ) : (
              suggestions.map((page, idx) => (
                <div
                  key={page.to}
                  onMouseDown={(e) => e.preventDefault()} // keep focus so the click still registers
                  onClick={() => goToPage(page)}
                  onMouseEnter={() => setActiveIndex(idx)}
                  role="button"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "0.6rem 0.9rem",
                    cursor: "pointer",
                    background: idx === activeIndex ? "rgba(13,110,253,0.08)" : "transparent",
                  }}
                >
                  <i className={`bi ${page.icon}`} style={{ width: 18, textAlign: "center" }}></i>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: "0.9rem" }}>{page.label}</div>
                    {page.group && (
                      <div style={{ fontSize: "0.75rem", color: "var(--bs-secondary-color, #6c757d)" }}>
                        {page.group}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div className="app-navbar__spacer" />

      <div ref={containerRef} className="d-flex align-items-center gap-1">
        {/* Fullscreen toggle */}
        <button
          className="app-navbar__icon-btn"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? "Exit fullscreen" : "Maximize screen"}
          title={isFullscreen ? "Exit fullscreen" : "Maximize screen"}
        >
          <i className={`bi ${isFullscreen ? "bi-fullscreen-exit" : "bi-arrows-fullscreen"}`}></i>
        </button>

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
              <div className="d-flex gap-2">
                <a href="#" onClick={markAllRead}>
                  Mark all read
                </a>
                
                 <a href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setOpenMenu(null);
                    navigate("/notifications");
                  }}
                >
                  Open Notifications
                </a>
              </div>
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
                
                 <a href="#"
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