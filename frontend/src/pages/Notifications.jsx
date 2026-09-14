import { useEffect, useState, useCallback } from "react";
import { notificationApi } from "../services/api";
import Breadcrumb from "../components/Breadcrumb";
import Pagination from "../components/Pagination";

const CATEGORY_META = {
  GENERAL: { icon: "bi-megaphone", badge: "badge-blue", label: "General" },
  EVENT: { icon: "bi-calendar-event", badge: "badge-gold", label: "Event" },
  CLOSING: { icon: "bi-door-closed", badge: "badge-neutral", label: "Closing" },
  FEE_REMINDER: { icon: "bi-cash-coin", badge: "badge-danger", label: "Fee Reminder" },
  ACADEMIC: { icon: "bi-mortarboard", badge: "badge-success", label: "Academic" },
};

function categoryMeta(category) {
  return CATEGORY_META[category] || { icon: "bi-bell", badge: "badge-neutral", label: category || "Notice" };
}

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

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const [filter, setFilter] = useState("all"); // "all" | "unread"
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await notificationApi.list({ page: currentPage, page_size: itemsPerPage });
      if (Array.isArray(data)) {
        setNotifications(data);
        setTotalItems(data.length);
      } else {
        setNotifications(data.results ?? []);
        setTotalItems(data.count ?? (data.results ?? []).length);
      }
    } catch (error) {
      console.error("Failed to load notifications:", error);
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = filter === "unread" ? notifications.filter((n) => !n.is_read) : notifications;
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + notifications.length;

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  const openNotification = async (n) => {
    if (n.is_read) return;
    try {
      await notificationApi.markRead(n.id);
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    } catch (error) {
      console.error("Failed to mark notification read:", error);
    }
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      await notificationApi.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (error) {
      console.error("Failed to mark all read:", error);
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div>
      <Breadcrumb items={[
        { label: "Dashboard", href: "/" },
        { label: "Notifications", href: "#" },
      ]} />

      <div className="page-header">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-subtitle">Announcements and alerts sent to you.</p>
        </div>
        <button
          className="btn btn-outline-primary"
          onClick={markAllRead}
          disabled={markingAll || unreadCount === 0}
        >
          <i className="bi bi-check2-all me-1"></i>
          {markingAll ? "Marking..." : "Mark all read"}
        </button>
      </div>

      <div className="table-wrap">
        <div className="table-wrap__header">
          <div className="d-flex gap-2">
            <button
              className={`btn btn-sm ${filter === "all" ? "btn-primary" : "btn-outline-primary"}`}
              onClick={() => setFilter("all")}
            >
              All
            </button>
            <button
              className={`btn btn-sm ${filter === "unread" ? "btn-primary" : "btn-outline-primary"}`}
              onClick={() => setFilter("unread")}
            >
              Unread {unreadCount > 0 && <span className="badge badge-danger ms-1">{unreadCount}</span>}
            </button>
          </div>
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
            {totalItems} notification{totalItems !== 1 ? "s" : ""}
          </span>
        </div>

        {loading ? (
          <div style={{ padding: "1.5rem" }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton skeleton-text" style={{ height: 18, marginBottom: 14 }} />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="empty-state">
            <i className="bi bi-bell"></i>
            <h6>{filter === "unread" ? "You're all caught up" : "No notifications yet"}</h6>
            <p className="text-muted-soft">
              {filter === "unread"
                ? "No unread notifications on this page."
                : "Announcements sent to you will appear here."}
            </p>
          </div>
        ) : (
          <div>
            {visible.map((n) => {
              const meta = categoryMeta(n.category);
              return (
                <div
                  key={n.id}
                  onClick={() => openNotification(n)}
                  role="button"
                  style={{
                    display: "flex",
                    gap: "0.9rem",
                    padding: "1rem 1.25rem",
                    borderBottom: "1px solid var(--border-color)",
                    background: n.is_read ? "transparent" : "var(--bg-app)",
                    cursor: n.is_read ? "default" : "pointer",
                  }}
                >
                  <div className="avatar-sm" style={{ flexShrink: 0 }}>
                    <i className={`bi ${meta.icon}`}></i>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                      <span style={{ fontWeight: 700, color: "var(--ink-900)" }}>{n.subject}</span>
                      <span className={`badge ${meta.badge}`}>{meta.label}</span>
                      {!n.is_read && <span className="status-dot status-dot--online"></span>}
                    </div>
                    <div style={{ fontSize: "var(--fs-sm)", color: "var(--ink-600)", marginTop: "0.15rem", whiteSpace: "pre-line" }}>
                      {n.body}
                    </div>
                    <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)", marginTop: "0.3rem" }}>
                      {n.sender_name ? `${n.sender_name} · ` : ""}
                      {timeAgo(n.created_at)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!loading && notifications.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          itemsPerPage={itemsPerPage}
          setItemsPerPage={(n) => { setItemsPerPage(n); setCurrentPage(1); }}
          startIndex={startIndex}
          endIndex={endIndex}
          totalItems={totalItems}
        />
      )}
    </div>
  );
}