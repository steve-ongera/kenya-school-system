import { useEffect, useRef, useState } from "react";
import { messagingApi } from "../services/api";
import { useAuth } from "../hooks/useAuth";

const STAFF_ROLES = ["ADMIN", "TEACHER", "FINANCE"];

export default function Messages() {
  const { user } = useAuth();
  const canStartConversation = STAFF_ROLES.includes(user?.role);

  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [thread, setThread] = useState([]);
  const [draft, setDraft] = useState("");
  const [loadingThread, setLoadingThread] = useState(false);
  const bottomRef = useRef(null);

  // new conversation composer
  const [composing, setComposing] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [recipientResults, setRecipientResults] = useState([]);
  const [selectedRecipient, setSelectedRecipient] = useState(null);
  const [firstMessage, setFirstMessage] = useState("");
  const [starting, setStarting] = useState(false);

  const loadConversations = async () => {
    const { data } = await messagingApi.conversations();
    setConversations(data);
  };

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (!recipientSearch.trim()) {
      setRecipientResults([]);
      return;
    }
    const t = setTimeout(() => {
      messagingApi.searchRecipients({ search: recipientSearch }).then(({ data }) => setRecipientResults(data));
    }, 350);
    return () => clearTimeout(t);
  }, [recipientSearch]);

  const openConversation = async (id) => {
    setActiveId(id);
    setComposing(false);
    setLoadingThread(true);
    try {
      const { data } = await messagingApi.messages(id);
      setThread(data);
      loadConversations(); // refresh unread counts in the list
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

  return (
    <div>
      <h2 className="page-title">Messages</h2>
      <div className="row g-3" style={{ minHeight: "60vh" }}>
        {/* ---- conversation list ---- */}
        <div className="col-md-4">
          <div className="card h-100">
            <div className="card-header d-flex justify-content-between align-items-center">
              <span>Conversations</span>
              {canStartConversation && (
                <button className="btn btn-sm btn-primary" onClick={() => setComposing(true)}>
                  <i className="bi bi-plus-lg me-1"></i> New
                </button>
              )}
            </div>
            <div className="list-group list-group-flush" style={{ maxHeight: "60vh", overflowY: "auto" }}>
              {conversations.length === 0 && !composing && (
                <div className="text-center text-muted p-3">No conversations yet.</div>
              )}
              {conversations.map((conv) => {
                const others = otherParticipants(conv);
                return (
                  <button
                    key={conv.id}
                    className={`list-group-item list-group-item-action ${activeId === conv.id ? "active" : ""}`}
                    onClick={() => openConversation(conv.id)}
                  >
                    <div className="d-flex justify-content-between">
                      <strong>{others.map((p) => `${p.first_name} ${p.last_name}`).join(", ") || "Conversation"}</strong>
                      {conv.unread_count > 0 && <span className="badge bg-danger rounded-pill">{conv.unread_count}</span>}
                    </div>
                    {conv.student_name && <div className="small text-muted">Re: {conv.student_name}</div>}
                    {conv.last_message && (
                      <div className="small text-truncate text-muted">{conv.last_message.body}</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ---- thread / composer ---- */}
        <div className="col-md-8">
          <div className="card h-100 d-flex flex-column">
            {composing && (
              <div className="card-body">
                <h5 className="card-title">New Message</h5>
                <form onSubmit={startConversation}>
                  {!selectedRecipient ? (
                    <>
                      <label className="form-label">To (student or parent/guardian)</label>
                      <input
                        className="form-control mb-2"
                        placeholder="Search by name or admission no..."
                        value={recipientSearch}
                        onChange={(e) => setRecipientSearch(e.target.value)}
                        autoFocus
                      />
                      <div className="list-group">
                        {recipientResults.map((r) => (
                          <button
                            type="button"
                            key={`${r.role}-${r.user_id}`}
                            className="list-group-item list-group-item-action"
                            onClick={() => setSelectedRecipient(r)}
                          >
                            <strong>{r.name}</strong>{" "}
                            <span className="badge bg-secondary">{r.role}</span>
                            <div className="small text-muted">{r.detail}</div>
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="alert alert-light border d-flex justify-content-between align-items-center">
                        <div>
                          <strong>{selectedRecipient.name}</strong> ({selectedRecipient.role})
                          <div className="small text-muted">{selectedRecipient.detail}</div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          onClick={() => setSelectedRecipient(null)}
                        >
                          Change
                        </button>
                      </div>
                      <label className="form-label">Message</label>
                      <textarea
                        className="form-control mb-2"
                        rows={4}
                        required
                        value={firstMessage}
                        onChange={(e) => setFirstMessage(e.target.value)}
                        autoFocus
                      />
                      <button className="btn btn-primary" disabled={starting}>
                        {starting ? "Sending..." : "Send"}
                      </button>
                      <button type="button" className="btn btn-link" onClick={() => setComposing(false)}>
                        Cancel
                      </button>
                    </>
                  )}
                </form>
              </div>
            )}

            {!composing && !activeId && (
              <div className="d-flex align-items-center justify-content-center text-muted flex-grow-1">
                Select a conversation, or start a new one.
              </div>
            )}

            {!composing && activeId && (
              <>
                <div className="card-body flex-grow-1" style={{ overflowY: "auto", maxHeight: "50vh" }}>
                  {loadingThread ? (
                    <div className="text-center py-4">
                      <div className="spinner-border spinner-border-sm" role="status" />
                    </div>
                  ) : (
                    thread.map((m) => {
                      const mine = m.sender === user?.id;
                      return (
                        <div key={m.id} className={`d-flex mb-2 ${mine ? "justify-content-end" : "justify-content-start"}`}>
                          <div
                            className={`p-2 rounded ${mine ? "bg-primary text-white" : "bg-light border"}`}
                            style={{ maxWidth: "75%" }}
                          >
                            {!mine && <div className="small fw-bold">{m.sender_name}</div>}
                            <div>{m.body}</div>
                            <div className={`small ${mine ? "text-white-50" : "text-muted"}`}>
                              {new Date(m.created_at).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={bottomRef} />
                </div>
                <form className="card-footer d-flex gap-2" onSubmit={sendReply}>
                  <input
                    className="form-control"
                    placeholder="Type a message..."
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <button className="btn btn-primary">Send</button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}