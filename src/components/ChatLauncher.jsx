"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCheck, Pencil, MessageCircle, MessagesSquare, Search, Send, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import { authFetch } from "@/lib/authFetch";
import { supabase } from "@/lib/supabaseClient";
import CrmTooltip from "@/components/CrmTooltip";
import { formatDateTimeDDMonYYYY } from "@/lib/dateFormat";

function nameOf(profile) {
  return profile?.name || profile?.full_name || profile?.email || "CRM User";
}

function initials(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
}

function formatMessageTime(value) {
  return formatDateTimeDDMonYYYY(value, "-");
}

function formatSeenTime(value) {
  return value ? formatDateTimeDDMonYYYY(value, "") : "";
}

export default function ChatLauncher() {
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState([]);
  const [users, setUsers] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [query, setQuery] = useState("");
  const [body, setBody] = useState("");
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentRole, setCurrentRole] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editBody, setEditBody] = useState("");
  const [messageBusy, setMessageBusy] = useState(null);
  const seenRealtimeIds = useRef(new Set());
  const messagesEndRef = useRef(null);

  const unreadCount = useMemo(
    () => threads.reduce((sum, thread) => sum + (thread.unread_count || 0), 0),
    [threads]
  );

  const activeThread = threads.find((thread) => thread.id === activeThreadId);
  const filteredUsers = users.filter((user) =>
    [user.name, user.email, user.role].filter(Boolean).join(" ").toLowerCase().includes(query.toLowerCase())
  );

  const loadThreads = useCallback(async () => {
    const response = await authFetch("/api/chat/threads", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setThreads(data.threads || []);
  }, []);

  const loadUsers = useCallback(async () => {
    const response = await authFetch("/api/chat/users", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setUsers(data.users || []);
  }, []);

  const loadMessages = useCallback(async (threadId, options = {}) => {
    if (!threadId) return;
    const silent = Boolean(options.silent);
    if (!silent) setLoadingMessages(true);
    const response = await authFetch(`/api/chat/threads/${threadId}/messages`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      setMessages(data.messages || []);
      await loadThreads();
    }
    if (!silent) setLoadingMessages(false);
  }, [loadThreads]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const userId = data?.user?.id || null;
      setCurrentUserId(userId);
      if (userId) {
        const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
        setCurrentRole(String(profile?.role || "").toLowerCase());
      }
    });
    loadThreads();
    loadUsers();
  }, [loadThreads, loadUsers]);

  useEffect(() => {
    if (!activeThreadId) return;
    loadMessages(activeThreadId);
  }, [activeThreadId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const threadId = params.get("chat");
    if (threadId) {
      setOpen(true);
      setActiveThreadId(threadId);
    }
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("crm-chat-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, (payload) => {
        if (!payload.new?.id) return;
        if (payload.eventType === "INSERT" && seenRealtimeIds.current.has(payload.new.id)) return;
        if (payload.eventType === "INSERT") seenRealtimeIds.current.add(payload.new.id);

        loadThreads();
        if (payload.new.thread_id === activeThreadId) {
          loadMessages(activeThreadId, { silent: true });
        } else if (!open && payload.eventType === "INSERT" && payload.new.sender_id !== currentUserId) {
          toast("New CRM chat message", { duration: 4000 });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_message_reads" }, (payload) => {
        loadThreads();
        if (payload.new?.user_id === currentUserId) return;
        if (activeThreadId) loadMessages(activeThreadId, { silent: true });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeThreadId, currentUserId, loadMessages, loadThreads, open]);

  async function startThread(userId) {
    const response = await authFetch("/api/chat/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(data.error || "Unable to start chat");
      return;
    }

    await loadThreads();
    setActiveThreadId(data.thread.id);
    setQuery("");
  }

  async function sendMessage(event) {
    event?.preventDefault();
    const text = body.trim();
    if (!text || !activeThreadId || sending) return;
    setSending(true);
    const response = await authFetch(`/api/chat/threads/${activeThreadId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    const data = await response.json().catch(() => ({}));
    setSending(false);
    if (!response.ok) {
      toast.error(data.error || "Message failed");
      return;
    }
    setBody("");
    setMessages((current) => [...current, data.message]);
    await loadThreads();
  }

  function closeActiveThread() {
    setActiveThreadId(null);
    setMessages([]);
    setBody("");
    setEditingMessageId(null);
    setEditBody("");
  }

  function startEditing(message) {
    setEditingMessageId(message.id);
    setEditBody(message.body || "");
  }

  async function saveEditedMessage(messageId) {
    const nextBody = editBody.trim();
    if (!nextBody) {
      toast.error("Message cannot be empty");
      return;
    }

    setMessageBusy(messageId);
    const response = await authFetch(`/api/chat/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: nextBody }),
    });
    const data = await response.json().catch(() => ({}));
    setMessageBusy(null);

    if (!response.ok) {
      toast.error(data.error || "Message update failed");
      return;
    }

    setMessages((current) => current.map((message) => message.id === messageId ? data.message : message));
    setEditingMessageId(null);
    setEditBody("");
    await loadThreads();
  }

  async function deleteMessage(messageId) {
    setMessageBusy(messageId);
    const response = await authFetch(`/api/chat/messages/${messageId}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    setMessageBusy(null);

    if (!response.ok) {
      toast.error(data.error || "Message delete failed");
      return;
    }

    setMessages((current) => current.map((message) => message.id === messageId ? data.message : message));
    await loadThreads();
  }

  function handleComposerKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  function readStatusFor(message) {
    if (currentRole === "operations") return "";
    if (message.sender_id !== currentUserId || message.deleted_at) return "";
    const reads = (message.read_receipts || []).filter((receipt) => receipt.user_id !== currentUserId);
    if (!reads.length) return "Sent";
    if (activeThread?.thread_type === "group") return `Seen by ${reads.length}`;
    const latestRead = reads
      .map((receipt) => receipt.read_at)
      .filter(Boolean)
      .sort()
      .at(-1);
    return latestRead ? `Seen at ${formatSeenTime(latestRead)}` : "Seen";
  }

  return (
    <div className="relative shrink-0">
      <CrmTooltip content="CRM Chat" side="bottom">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 shadow-sm transition hover:bg-emerald-50 hover:text-emerald-700 sm:h-11 sm:w-11"
          aria-label="CRM Chat"
        >
          <MessagesSquare size={20} />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-emerald-500 px-1.5 text-center text-[11px] font-semibold leading-5 text-white">
              {unreadCount}
            </span>
          )}
        </button>
      </CrmTooltip>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close chat"
            className="fixed inset-0 z-40 cursor-default bg-transparent"
            onClick={() => setOpen(false)}
          />
          <section className="fixed bottom-4 right-3 top-[4.5rem] z-50 flex w-[min(760px,calc(100vw-1.5rem))] overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl sm:right-5">
            <aside className="flex w-72 shrink-0 flex-col border-r border-gray-100 bg-slate-50/70">
              <div className="border-b border-gray-100 bg-gradient-to-br from-white via-blue-50 to-emerald-50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-gray-900">CRM Chat</h2>
                    <p className="text-xs text-gray-500">Internal team messages</p>
                  </div>
                  <button type="button" onClick={() => setOpen(false)} className="rounded-xl p-2 text-gray-500 hover:bg-white">
                    <X size={18} />
                  </button>
                </div>
                <div className="relative mt-3">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search users"
                    className="w-full rounded-2xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm"
                  />
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {query ? (
                  <div className="space-y-2">
                    {filteredUsers.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => startThread(user.id)}
                        className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 text-left hover:border-blue-200 hover:bg-blue-50"
                      >
                        <Avatar name={user.name} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-gray-900">{user.name}</span>
                          <span className="block truncate text-xs capitalize text-gray-500">{user.role}</span>
                        </span>
                      </button>
                    ))}
                    {filteredUsers.length === 0 && <p className="p-3 text-sm text-gray-500">No users found.</p>}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {threads.map((thread) => (
                      <button
                        key={thread.id}
                        type="button"
                        onClick={() => setActiveThreadId(thread.id)}
                        className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition ${
                          activeThreadId === thread.id ? "border-blue-200 bg-blue-50" : "border-gray-100 bg-white hover:bg-gray-50"
                        }`}
                      >
                        <Avatar name={thread.display_title} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-semibold text-gray-900">{thread.display_title}</span>
                            {thread.unread_count > 0 && (
                              <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-bold text-white">
                                {thread.unread_count}
                              </span>
                            )}
                          </span>
                          <span className="mt-1 block truncate text-xs text-gray-500">
                            {thread.last_message?.deleted_at ? "This message was deleted" : thread.last_message?.body || "No messages yet"}
                          </span>
                        </span>
                      </button>
                    ))}
                    {threads.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-4 text-sm text-gray-500">
                        No conversations yet. Search a teammate to start one.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </aside>

            <main className="flex min-w-0 flex-1 flex-col bg-white">
              {activeThread ? (
                <>
                  <div className="flex items-center justify-between border-b border-gray-100 p-4">
                    <div className="flex min-w-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={closeActiveThread}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100"
                        aria-label="Back to chat list"
                      >
                        <ArrowLeft size={18} />
                      </button>
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold text-gray-900">{activeThread.display_title}</h3>
                        <p className="text-xs text-gray-500">{activeThread.members?.length || 0} member(s)</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={closeActiveThread}
                      className="rounded-xl p-2 text-gray-500 hover:bg-gray-100"
                      aria-label="Close conversation"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-4">
                    {loadingMessages ? (
                      <p className="text-sm text-gray-500">Loading messages...</p>
                    ) : messages.length === 0 ? (
                      <div className="rounded-3xl border border-dashed border-gray-200 bg-white p-8 text-center">
                        <MessagesSquare className="mx-auto text-gray-400" />
                        <p className="mt-3 text-sm font-semibold text-gray-800">No messages yet</p>
                        <p className="mt-1 text-xs text-gray-500">Send the first internal CRM message.</p>
                      </div>
                    ) : (
                      messages.map((message) => {
                        const mine = message.sender_id === currentUserId;
                        const senderName = nameOf(message.sender_profile);
                        const canEdit = mine && !message.deleted_at;
                        const canDelete = !message.deleted_at && (mine || currentRole === "admin");
                        const readStatus = readStatusFor(message);
                        return (
                          <div key={message.id} className={`flex gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                            {!mine && <Avatar name={senderName} small />}
                            <div className={`group relative max-w-[78%] rounded-3xl px-4 py-2 shadow-sm ${
                              mine ? "bg-blue-600 text-white" : "border border-gray-100 bg-white text-gray-800"
                            }`}>
                              {!mine && <p className="mb-1 text-xs font-semibold text-blue-700">{senderName}</p>}
                              {message.deleted_at ? (
                                <p className={`text-sm italic leading-5 ${mine ? "text-blue-100" : "text-gray-500"}`}>
                                  This message was deleted
                                </p>
                              ) : editingMessageId === message.id ? (
                                <div className="space-y-2">
                                  <textarea
                                    value={editBody}
                                    onChange={(event) => setEditBody(event.target.value)}
                                    rows={2}
                                    className="w-full min-w-[220px] resize-none rounded-2xl border border-blue-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none"
                                  />
                                  <div className="flex justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingMessageId(null);
                                        setEditBody("");
                                      }}
                                      className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-600"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => saveEditedMessage(message.id)}
                                      disabled={messageBusy === message.id}
                                      className="rounded-full bg-blue-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
                                    >
                                      Save
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <p className="whitespace-pre-wrap text-sm leading-5">{message.body}</p>
                                  {message.edited_at && (
                                    <p className={`mt-1 text-[11px] ${mine ? "text-blue-100" : "text-gray-400"}`}>
                                      edited
                                    </p>
                                  )}
                                </>
                              )}
                              <div className={`mt-1 flex items-center justify-end gap-2 text-[11px] ${mine ? "text-blue-100" : "text-gray-400"}`}>
                                <span>{formatMessageTime(message.created_at)}</span>
                                {readStatus && (
                                  <span className="inline-flex items-center gap-1">
                                    <CheckCheck size={12} />
                                    {readStatus}
                                  </span>
                                )}
                              </div>
                              {(canEdit || canDelete) && editingMessageId !== message.id && (
                                <div className={`absolute top-1 hidden gap-1 rounded-full border border-gray-100 bg-white p-1 shadow-lg group-hover:flex ${mine ? "-left-16" : "-right-16"}`}>
                                  {canEdit && (
                                    <button
                                      type="button"
                                      onClick={() => startEditing(message)}
                                      className="rounded-full p-1.5 text-gray-500 hover:bg-blue-50 hover:text-blue-700"
                                      aria-label="Edit message"
                                    >
                                      <Pencil size={13} />
                                    </button>
                                  )}
                                  {canDelete && (
                                    <button
                                      type="button"
                                      onClick={() => deleteMessage(message.id)}
                                      disabled={messageBusy === message.id}
                                      className="rounded-full p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                                      aria-label="Delete message"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  <form onSubmit={sendMessage} className="border-t border-gray-100 p-3">
                    <div className="flex items-end gap-2 rounded-3xl border border-gray-200 bg-white p-2 shadow-sm">
                      <textarea
                        value={body}
                        onChange={(event) => setBody(event.target.value)}
                        onKeyDown={handleComposerKeyDown}
                        rows={1}
                        placeholder="Message the team..."
                        className="max-h-28 min-h-10 flex-1 resize-none border-0 bg-transparent px-3 py-2 text-sm outline-none"
                      />
                      <button
                        type="submit"
                        disabled={sending || !body.trim()}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        <Send size={17} />
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-gray-400">Enter to send, Shift+Enter for a new line.</p>
                  </form>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center p-8 text-center">
                  <div>
                    <MessagesSquare className="mx-auto text-gray-400" size={36} />
                    <h3 className="mt-3 font-semibold text-gray-900">Select or start a chat</h3>
                    <p className="mt-1 text-sm text-gray-500">Search an admin or operations user to begin.</p>
                  </div>
                </div>
              )}
            </main>
          </section>
        </>
      )}
    </div>
  );
}

function Avatar({ name, small = false }) {
  return (
    <span className={`${small ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm"} inline-flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-emerald-500 font-bold text-white shadow-sm`}>
      {initials(name)}
    </span>
  );
}
