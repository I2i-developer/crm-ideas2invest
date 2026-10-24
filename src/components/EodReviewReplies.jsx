"use client";

import { useState } from "react";
import { Reply, SendHorizontal } from "lucide-react";
import toast from "react-hot-toast";
import { authFetch } from "@/lib/authFetch";
import { formatDateTimeDDMonYYYY } from "@/lib/dateFormat";

export default function EodReviewReplies({ report, canReply = false, onSent }) {
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function sendReply(event) {
    event.preventDefault();
    if (saving || !message.trim()) return;
    setSaving(true);
    try {
      const response = await authFetch(`/api/operations/eod-reports/${report.id}/replies`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to send reply");
      setMessage("");
      setExpanded(false);
      toast.success("Reply sent");
      await onSent?.();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      {(report.replies || []).map((reply) => (
        <div key={reply.id} className="border-l-2 border-blue-300 pl-3 text-sm dark:border-blue-700">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <strong className="text-slate-800 dark:text-slate-100">{reply.author_name}</strong>
            <time dateTime={reply.created_at} className="text-xs text-slate-500 dark:text-slate-400">{formatDateTimeDDMonYYYY(reply.created_at)}</time>
          </div>
          {reply.review_note !== report.review_note && (
            <p className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-500 dark:text-slate-400">In reply to: {reply.review_note}</p>
          )}
          <p className="mt-1 whitespace-pre-wrap break-words text-slate-700 dark:text-slate-200">{reply.message}</p>
        </div>
      ))}
      {canReply && report.review_note && !expanded && (
        <div className="flex justify-end">
        <button type="button" onClick={() => setExpanded(true)} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 transition duration-150 hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-100 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 active:translate-y-0 motion-reduce:transform-none dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200 dark:hover:border-blue-600 dark:hover:bg-blue-900">
          <Reply size={15} /> Reply to review
        </button>
        </div>
      )}
      {canReply && report.review_note && expanded && (
        <form onSubmit={sendReply} className="space-y-2">
          <label htmlFor={`reply-${report.id}`} className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Your reply</label>
          <textarea id={`reply-${report.id}`} autoFocus rows={3} required maxLength={2500} disabled={saving} value={message} onChange={(event) => setMessage(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" disabled={saving} onClick={() => setExpanded(false)} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition duration-150 hover:border-rose-300 hover:bg-rose-100 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 active:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-900/40">Cancel</button>
            <button type="submit" disabled={saving || !message.trim()} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition duration-150 hover:bg-blue-700 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-blue-600">
              <SendHorizontal size={15} /> {saving ? "Sending..." : "Send reply"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
