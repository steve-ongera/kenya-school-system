import { useEffect, useRef, useState } from "react";
import { messagingApi } from "../services/api";
import { useAuth } from "../hooks/useAuth";
import Breadcrumb from "../components/Breadcrumb";

const STAFF_ROLES = ["ADMIN", "TEACHER", "FINANCE"];

const ROLE_BADGE = {
  STUDENT: "badge-blue",
  PARENT: "badge-gold",
  TEACHER: "badge-success",
  ADMIN: "badge-danger",
  FINANCE: "badge-neutral",
};

const ROLE_ICON = {
  STUDENT: "bi-person",
  PARENT: "bi-people",
  TEACHER: "bi-person-workspace",
  ADMIN: "bi-shield-lock",
  FINANCE: "bi-cash-stack",
};

export default function Messages() {
  const { user } = useAuth();
  const canStartConversation = STAFF_ROLES.includes(user?.role);

  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [thread, setThread] = useState([]);
  const [draft, setDraft] = useState("");
  const [loadingThread, setLoadingThread] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const bottomRef = useRef(null);

  // new conversation composer
  const [composing, setComposing] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [recipientResults, setRecipientResults] = useState([]);
  const [selectedRecipient, setSelectedRecipient] = useState(null);
  const [firstMessage, setFirstMessage] = useState("");
  const [starting, setStarting] = useState(false);
  const [searchingRecipients, setSearchingRecipients] = useState(false);

  const loadConversations = async () => {
    try {
      const { data } = await messagingApi.conversations();
      setConversations(data.results ?? data);
    } catch (error) {
      console.error("Failed to load conversations:", error);
    } finally {
      setLoadingConversations(false);
    }
  };

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (!recipientSearch.trim()) {
      setRecipientResults([]);
      return;
    }
    setSearchingRecipients(true);
    const t = setTimeout(() => {
      messagingApi.searchRecipients({ search: recipientSearch })
        .then(({ data }) => setRecipientResults(data.results ?? data))
        .finally(() => setSearchingRecipients(false));
    }, 350);
    return () => clearTimeout(t);
  }, [recipientSearch]);

  const openConversation = async (id) => {
    setActiveId(id);
    setComposing(false);
    setLoadingThread(true);
    try {
      const { data } = await messagingApi.messages(id);
      setThread(data.results ?? data);
      loadConversations();
    } finally {
      setLoadingThread(false);
    }
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread]);

  const sendReply = async (e) => {
    e.preventDefault();
    if (!draft.trim() || !activeId) return;
    const { data } = await messagingApi.send(activeId, draft.trim());
    setThread((prev) => [...prev, data]);
    setDraft("");
    loadConversations();
  };

  const startConversation = async (e) => {
    e.preventDefault();
    if (!selectedRecipient || !firstMessage.trim()) return;
    setStarting(true);
    try {
      const { data } = await messagingApi.start({
        recipient_id: selectedRecipient.user_id,
        student_id: selectedRecipient.student_id || null,
        body: firstMessage.trim(),
      });
      setFirstMessage("");
      setSelectedRecipient(null);
      setRecipientSearch("");
      setComposing(false);
      await loadConversations();
      openConversation(data.id);
    } finally {
      setStarting(false);
    }
  };

  const otherParticipants = (conv) => (conv.participants || []).filter((p) => p.id !== user?.id);

  const getInitials = (firstName, lastName) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}` || "?";
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-KE', { month: 'short', day: 'numeric' });
  };

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: "Dashboard", href: "/" },
        { label: "Messages", href: "#" },
      ]} />

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Messages</h1>
          <p className="page-subtitle">
            Communicate with teachers, parents, and staff
          </p>
        </div>
        {canStartConversation && !composing && (
          <button className="btn btn-primary" onClick={() => setComposing(true)}>
            <i className="bi bi-plus-lg me-1"></i>
            New Message
          </button>
        )}
      </div>

      <div className="row g-3" style={{ minHeight: "65vh" }}>
        {/* ---- Conversation List ---- */}
        <div className="col-md-4">
          <div className="card h-100" style={{ overflow: "hidden" }}>
            <div className="card-header" style={{
              background: "transparent",
              borderBottom: "1px solid var(--border-color)",
              padding: "1rem 1.25rem",
              fontWeight: 700,
              color: "var(--ink-900)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}>
              <span>
                <i className="bi bi-chat-dots me-2" style={{ color: "var(--blue-700)" }}></i>
                Conversations
                {conversations.length > 0 && (
                  <span className="badge badge-neutral ms-2">{conversations.length}</span>
                )}
              </span>
            </div>

            <div style={{ maxHeight: "60vh", overflowY: "auto", flex: 1 }}>
              {loadingConversations ? (
                <div style={{ padding: "1rem" }}>
                  {[1, 2, 3].map((i) => (
                    <div key={i} style={{ display: "flex", gap: "0.75rem", padding: "0.75rem", borderBottom: "1px solid var(--border-color)" }}>
                      <div className="skeleton skeleton-avatar" style={{ width: "36px", height: "36px" }}></div>
                      <div style={{ flex: 1 }}>
                        <div className="skeleton skeleton-text" style={{ width: "60%", height: "16px" }}></div>
                        <div className="skeleton skeleton-text" style={{ width: "80%", height: "12px", marginTop: "4px" }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : conversations.length === 0 ? (
                <div className="empty-state" style={{ padding: "2rem 1rem" }}>
                  <i className="bi bi-chat-dots" style={{ fontSize: "1.5rem" }}></i>
                  <h6 style={{ marginTop: "0.5rem" }}>No conversations</h6>
                  <p className="text-muted-soft" style={{ fontSize: "var(--fs-xs)" }}>
                    {canStartConversation ? "Start a new conversation" : "Messages will appear here"}
                  </p>
                </div>
              ) : (
                conversations.map((conv) => {
                  const others = otherParticipants(conv);
                  const other = others[0];
                  const isActive = activeId === conv.id;

                  return (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => openConversation(conv.id)}
                      style={{
                        display: "flex",
                        gap: "0.75rem",
                        width: "100%",
                        padding: "0.85rem 1rem",
                        border: "none",
                        borderBottom: "1px solid var(--border-color)",
                        background: isActive ? "var(--blue-50)" : "transparent",
                        borderLeft: isActive ? "3px solid var(--blue-700)" : "3px solid transparent",
                        textAlign: "left",
                        cursor: "pointer",
                        transition: "background 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) e.currentTarget.style.background = "var(--bg-app)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <div className="avatar-sm" style={{
                        background: isActive ? "var(--blue-700)" : "var(--blue-100)",
                        color: isActive ? "#fff" : "var(--blue-700)",
                        flexShrink: 0,
                      }}>
                        {other ? getInitials(other.first_name, other.last_name) : "?"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <strong style={{
                            fontSize: "var(--fs-sm)",
                            color: isActive ? "var(--blue-800)" : "var(--ink-900)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}>
                            {others.map((p) => `${p.first_name} ${p.last_name}`).join(", ") || "Conversation"}
                          </strong>
                          {conv.unread_count > 0 && (
                            <span className="badge badge-danger" style={{ flexShrink: 0, marginLeft: "0.5rem" }}>
                              {conv.unread_count}
                            </span>
                          )}
                        </div>
                        {conv.student_name && (
                          <div style={{ fontSize: "var(--fs-xs)", color: "var(--blue-700)", marginTop: "2px" }}>
                            <i className="bi bi-person me-1"></i>
                            {conv.student_name}
                          </div>
                        )}
                        {conv.last_message && (
                          <div style={{
                            fontSize: "var(--fs-xs)",
                            color: "var(--ink-400)",
                            marginTop: "2px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}>
                            {conv.last_message.body}
                          </div>
                        )}
                        {conv.last_message && (
                          <div style={{ fontSize: "0.65rem", color: "var(--ink-400)", marginTop: "2px" }}>
                            <i className="bi bi-clock me-1"></i>
                            {formatTime(conv.last_message.created_at)}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ---- Thread / Composer ---- */}
        <div className="col-md-8">
          <div className="card h-100 d-flex flex-column" style={{ overflow: "hidden" }}>
            {/* Compose New Message */}
            {composing && (
              <div className="card-body">
                <h5 style={{ fontWeight: 700, color: "var(--ink-900)", marginBottom: "1rem" }}>
                  <i className="bi bi-pencil-square me-2" style={{ color: "var(--blue-700)" }}></i>
                  New Message
                </h5>
                <form onSubmit={startConversation}>
                  {!selectedRecipient ? (
                    <>
                      <label className="form-label">
                        <i className="bi bi-person-plus me-1" style={{ color: "var(--blue-700)" }}></i>
                        To (student or parent/guardian)
                      </label>
                      <div style={{ position: "relative", marginBottom: "0.75rem" }}>
                        <i className="bi bi-search" style={{
                          position: "absolute",
                          left: "0.85rem",
                          top: "50%",
                          transform: "translateY(-50%)",
                          color: "var(--ink-400)",
                        }}></i>
                        <input
                          className="form-control"
                          placeholder="Search by name or admission no..."
                          value={recipientSearch}
                          onChange={(e) => setRecipientSearch(e.target.value)}
                          autoFocus
                          style={{ paddingLeft: "2.4rem" }}
                        />
                      </div>

                      {searchingRecipients && (
                        <div className="text-center py-3">
                          <div className="spinner-border spinner-border-sm text-primary" role="status"></div>
                        </div>
                      )}

                      {!searchingRecipients && recipientResults.length > 0 && (
                        <div style={{ maxHeight: "300px", overflowY: "auto", border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)" }}>
                          {recipientResults.map((r) => (
                            <button
                              type="button"
                              key={`${r.role}-${r.user_id}`}
                              onClick={() => setSelectedRecipient(r)}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.75rem",
                                width: "100%",
                                padding: "0.75rem 1rem",
                                border: "none",
                                borderBottom: "1px solid var(--border-color)",
                                background: "transparent",
                                textAlign: "left",
                                cursor: "pointer",
                                transition: "background 0.15s ease",
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-app)"}
                              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                            >
                              <div className="avatar-sm" style={{ flexShrink: 0 }}>
                                {getInitials(r.name?.split(' ')[0], r.name?.split(' ')[1])}
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                  <strong style={{ fontSize: "var(--fs-sm)", color: "var(--ink-900)" }}>{r.name}</strong>
                                  <span className={`badge ${ROLE_BADGE[r.role] || "badge-neutral"}`}>
                                    <i className={`bi ${ROLE_ICON[r.role] || "bi-person"} me-1`}></i>
                                    {r.role}
                                  </span>
                                </div>
                                <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)", marginTop: "2px" }}>
                                  {r.detail}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {!searchingRecipients && recipientSearch.trim() && recipientResults.length === 0 && (
                        <div className="empty-state" style={{ padding: "1.5rem" }}>
                          <i className="bi bi-search" style={{ fontSize: "1.25rem" }}></i>
                          <p className="text-muted-soft" style={{ fontSize: "var(--fs-sm)", marginTop: "0.5rem" }}>
                            No recipients found for "{recipientSearch}"
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        background: "var(--blue-50)",
                        border: "1px solid var(--blue-200)",
                        borderRadius: "var(--radius-md)",
                        padding: "0.75rem 1rem",
                        marginBottom: "1rem",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                          <div className="avatar-sm">
                            {getInitials(selectedRecipient.name?.split(' ')[0], selectedRecipient.name?.split(' ')[1])}
                          </div>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <strong style={{ fontSize: "var(--fs-sm)", color: "var(--ink-900)" }}>
                                {selectedRecipient.name}
                              </strong>
                              <span className={`badge ${ROLE_BADGE[selectedRecipient.role] || "badge-neutral"}`}>
                                {selectedRecipient.role}
                              </span>
                            </div>
                            <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
                              {selectedRecipient.detail}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          onClick={() => setSelectedRecipient(null)}
                        >
                          <i className="bi bi-arrow-repeat me-1"></i>
                          Change
                        </button>
                      </div>

                      <label className="form-label">
                        <i className="bi bi-chat-text me-1" style={{ color: "var(--blue-700)" }}></i>
                        Message
                      </label>
                      <textarea
                        className="form-control mb-3"
                        rows={4}
                        required
                        placeholder="Type your message here..."
                        value={firstMessage}
                        onChange={(e) => setFirstMessage(e.target.value)}
                        autoFocus
                      />

                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button className="btn btn-primary" disabled={starting || !firstMessage.trim()}>
                          {starting ? (
                            <>
                              <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                              Sending...
                            </>
                          ) : (
                            <>
                              <i className="bi bi-send me-2"></i>
                              Send
                            </>
                          )}
                        </button>
                        <button type="button" className="btn btn-outline-secondary" onClick={() => setComposing(false)}>
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </form>
              </div>
            )}

            {/* Empty State - No Active Conversation */}
            {!composing && !activeId && (
              <div style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "3rem 1rem",
                color: "var(--ink-400)",
              }}>
                <div style={{
                  width: "80px",
                  height: "80px",
                  borderRadius: "50%",
                  background: "var(--blue-50)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "1rem",
                }}>
                  <i className="bi bi-chat-dots" style={{ fontSize: "2rem", color: "var(--blue-200)" }}></i>
                </div>
                <h6 style={{ color: "var(--ink-700)", marginBottom: "0.3rem" }}>No conversation selected</h6>
                <p style={{ fontSize: "var(--fs-sm)", textAlign: "center" }}>
                  Select a conversation from the list, or start a new one.
                </p>
                {canStartConversation && (
                  <button className="btn btn-primary btn-sm mt-2" onClick={() => setComposing(true)}>
                    <i className="bi bi-plus-lg me-1"></i>
                    New Message
                  </button>
                )}
              </div>
            )}

            {/* Active Thread */}
            {!composing && activeId && (
              <>
                {/* Thread Header */}
                <div className="card-header" style={{
                  background: "transparent",
                  borderBottom: "1px solid var(--border-color)",
                  padding: "0.85rem 1.25rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                }}>
                  {(() => {
                    const conv = conversations.find(c => c.id === activeId);
                    const others = conv ? otherParticipants(conv) : [];
                    const other = others[0];
                    return (
                      <>
                        <div className="avatar-sm">
                          {other ? getInitials(other.first_name, other.last_name) : "?"}
                        </div>
                        <div style={{ flex: 1 }}>
                          <strong style={{ fontSize: "var(--fs-sm)", color: "var(--ink-900)" }}>
                            {others.map((p) => `${p.first_name} ${p.last_name}`).join(", ") || "Conversation"}
                          </strong>
                          {conv?.student_name && (
                            <div style={{ fontSize: "var(--fs-xs)", color: "var(--blue-700)" }}>
                              <i className="bi bi-person me-1"></i>
                              Re: {conv.student_name}
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Messages */}
                <div className="card-body flex-grow-1" style={{ overflowY: "auto", maxHeight: "50vh", background: "var(--bg-app)" }}>
                  {loadingThread ? (
                    <div className="text-center py-4">
                      <div className="spinner-border spinner-border-sm text-primary" role="status"></div>
                    </div>
                  ) : thread.length === 0 ? (
                    <div className="empty-state" style={{ padding: "2rem" }}>
                      <i className="bi bi-chat"></i>
                      <h6>No messages yet</h6>
                      <p className="text-muted-soft" style={{ fontSize: "var(--fs-sm)" }}>
                        Send the first message below.
                      </p>
                    </div>
                  ) : (
                    thread.map((m) => {
                      const mine = m.sender === user?.id;
                      return (
                        <div key={m.id} className={`d-flex mb-3 ${mine ? "justify-content-end" : "justify-content-start"}`}>
                          {!mine && (
                            <div className="avatar-xs" style={{ marginRight: "0.5rem", flexShrink: 0, alignSelf: "flex-end" }}>
                              {getInitials(m.sender_name?.split(' ')[0], m.sender_name?.split(' ')[1])}
                            </div>
                          )}
                          <div
                            style={{
                              maxWidth: "75%",
                              padding: "0.6rem 0.85rem",
                              borderRadius: mine ? "var(--radius-md) var(--radius-md) 0 var(--radius-md)" : "var(--radius-md) var(--radius-md) var(--radius-md) 0",
                              background: mine ? "var(--blue-700)" : "var(--surface)",
                              color: mine ? "#fff" : "var(--ink-900)",
                              border: mine ? "none" : "1px solid var(--border-color)",
                              boxShadow: "var(--shadow-xs)",
                            }}
                          >
                            {!mine && (
                              <div style={{ fontSize: "var(--fs-xs)", fontWeight: 700, color: "var(--blue-700)", marginBottom: "0.2rem" }}>
                                {m.sender_name}
                              </div>
                            )}
                            <div style={{ fontSize: "var(--fs-sm)", lineHeight: 1.5 }}>{m.body}</div>
                            <div style={{
                              fontSize: "0.65rem",
                              color: mine ? "rgba(255,255,255,0.6)" : "var(--ink-400)",
                              marginTop: "0.25rem",
                              textAlign: mine ? "right" : "left",
                            }}>
                              {new Date(m.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={bottomRef} />
                </div>

                {/* Reply Form */}
                <form className="card-footer" style={{
                  padding: "0.75rem 1rem",
                  background: "var(--surface)",
                  borderTop: "1px solid var(--border-color)",
                }} onSubmit={sendReply}>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <input
                      className="form-control"
                      placeholder="Type a message..."
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      style={{ borderRadius: "var(--radius-pill)" }}
                    />
                    <button className="btn btn-primary" disabled={!draft.trim()} style={{ borderRadius: "var(--radius-pill)", padding: "0.5rem 1.25rem" }}>
                      <i className="bi bi-send me-1"></i>
                      Send
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}