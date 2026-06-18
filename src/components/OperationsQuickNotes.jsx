"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Copy,
  FileText,
  Pencil,
  Pin,
  Plus,
  Save,
  Search,
  NotebookPen,
  Trash2,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import CrmTooltip from "@/components/CrmTooltip";
import { authFetch } from "@/lib/authFetch";
import { formatDateTimeDDMonYYYY } from "@/lib/dateFormat";

const EMPTY_FORM = { title: "", content: "", creator_name: "", pinned: false };

function formatDate(value) {
  return formatDateTimeDDMonYYYY(value, "-");
}

function notePreview(content = "") {
  const compact = content.replace(/\s+/g, " ").trim();
  return compact.length > 110 ? `${compact.slice(0, 110)}...` : compact;
}

export default function OperationsQuickNotes({ role }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState([]);
  const [query, setQuery] = useState("");
  const [activeNoteId, setActiveNoteId] = useState(null);
  const [mode, setMode] = useState("list");
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const visible = role === "operations" || role === "admin";
  const activeNote = notes.find((note) => note.id === activeNoteId) || null;

  const filteredNotes = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return notes;
    return notes.filter((note) =>
      [note.title, note.content].filter(Boolean).some((value) => value.toLowerCase().includes(term))
    );
  }, [notes, query]);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    const response = await authFetch("/api/operations/notes", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      toast.error(data.error || "Unable to load quick notes");
      return;
    }
    setNotes(data.notes || []);
  }, []);

  useEffect(() => {
    if (open && visible) loadNotes();
  }, [loadNotes, open, visible]);

  if (!visible) return null;

  function closePanel() {
    setOpen(false);
    setActiveNoteId(null);
    setMode("list");
    setForm(EMPTY_FORM);
  }

  function openNote(note) {
    setActiveNoteId(note.id);
    setMode("detail");
  }

  function startCreate() {
    setActiveNoteId(null);
    setForm(EMPTY_FORM);
    setMode("edit");
  }

  function startEdit(note) {
    setActiveNoteId(note.id);
    setForm({
      title: note.title || "",
      content: note.content || "",
      creator_name: note.creator_name || note.created_by_name || "",
      pinned: Boolean(note.pinned),
    });
    setMode("edit");
  }

  function returnToList() {
    setActiveNoteId(null);
    setMode("list");
    setForm(EMPTY_FORM);
  }

  async function saveNote(event) {
    event.preventDefault();
    if (!form.title.trim() || !form.content.trim()) {
      toast.error("Title and content are required");
      return;
    }

    setSaving(true);
    const response = await authFetch(activeNoteId ? `/api/operations/notes/${activeNoteId}` : "/api/operations/notes", {
      method: activeNoteId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await response.json().catch(() => ({}));
    setSaving(false);

    if (!response.ok) {
      toast.error(data.error || "Unable to save note");
      return;
    }

    toast.success(activeNoteId ? "Note updated" : "Note created");
    await loadNotes();
    setActiveNoteId(data.note.id);
    setMode("detail");
  }

  async function togglePin(note) {
    const response = await authFetch(`/api/operations/notes/${note.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !note.pinned }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(data.error || "Unable to update note");
      return;
    }
    toast.success(note.pinned ? "Note unpinned" : "Note pinned");
    await loadNotes();
  }

  async function deleteNote() {
    if (!deleteTarget) return;
    setSaving(true);
    const response = await authFetch(`/api/operations/notes/${deleteTarget.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      toast.error(data.error || "Unable to delete note");
      return;
    }
    setDeleteTarget(null);
    returnToList();
    toast.success("Note deleted");
    await loadNotes();
  }

  async function copyNote(note) {
    try {
      await navigator.clipboard.writeText(note.content || "");
      toast.success("Note copied");
    } catch {
      toast.error("Unable to copy note");
    }
  }

  return (
    <div className="relative shrink-0">
      <CrmTooltip content="Quick notes" side="bottom">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 hover:bg-white hover:text-amber-700 shadow-sm transition bg-amber-50 text-amber-700 sm:h-11 sm:w-11"
          aria-label="Open quick notes"
        >
          <NotebookPen size={19} />
        </button>
      </CrmTooltip>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close quick notes"
            className="fixed inset-0 z-40 cursor-default bg-transparent"
            onClick={closePanel}
          />
          <section className="fixed bottom-3 left-3 right-3 top-[4.25rem] z-50 flex overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl sm:absolute sm:bottom-auto sm:left-auto sm:right-0 sm:top-14 sm:h-[min(620px,calc(100vh-5rem))] sm:w-[min(720px,calc(100vw-2rem))]">
            <div className="flex min-w-0 flex-1 flex-col">
              <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-amber-50 via-white to-blue-50 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  {mode !== "list" && (
                    <button type="button" onClick={returnToList} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-slate-600 shadow-sm hover:text-blue-700">
                      <ArrowLeft size={17} />
                    </button>
                  )}
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
                    <NotebookPen size={19} />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-slate-950">Quick Notes</h2>
                    <p className="truncate text-xs text-slate-500">Reusable internal content and remarks</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {mode === "list" && (
                    <button type="button" onClick={startCreate} className="inline-flex h-9 items-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800">
                      <Plus size={15} /> New note
                    </button>
                  )}
                  <button type="button" onClick={closePanel} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-white hover:text-slate-900">
                    <X size={17} />
                  </button>
                </div>
              </header>

              {mode === "list" && (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="border-b border-slate-100 p-3">
                    <div className="relative">
                      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search notes"
                        className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/60 p-3">
                    {loading ? (
                      <p className="py-12 text-center text-sm text-slate-500">Loading notes...</p>
                    ) : filteredNotes.length === 0 ? (
                      <div className="mx-auto mt-12 max-w-sm rounded-2xl border border-dashed border-slate-200 bg-white p-7 text-center">
                        <FileText size={24} className="mx-auto text-slate-400" />
                        <p className="mt-3 text-sm font-semibold text-slate-800">{query ? "No notes match your search" : "No quick notes yet"}</p>
                        <p className="mt-1 text-xs text-slate-500">Create reusable internal content without leaving the current page.</p>
                      </div>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {filteredNotes.map((note) => (
                          <article key={note.id} className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-200 hover:shadow-md">
                            <div className="flex items-start justify-between gap-3">
                              <button type="button" onClick={() => openNote(note)} className="min-w-0 flex-1 text-left">
                                <span className="flex items-center gap-2">
                                  <h3 className="truncate text-sm font-semibold text-slate-950">{note.title}</h3>
                                  {note.pinned && <Pin size={13} className="shrink-0 fill-amber-400 text-amber-500" />}
                                </span>
                                <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600">{notePreview(note.content)}</p>
                              </button>
                              <button type="button" onClick={() => togglePin(note)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-amber-50 hover:text-amber-600" aria-label={note.pinned ? "Unpin note" : "Pin note"}>
                                <Pin size={15} className={note.pinned ? "fill-current" : ""} />
                              </button>
                            </div>
                            <button type="button" onClick={() => openNote(note)} className="mt-3 block w-full border-t border-slate-100 pt-3 text-left text-[11px] text-slate-400">
                              {note.created_by_name} · Updated {formatDate(note.updated_at)}
                            </button>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {mode === "detail" && activeNote && (
                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="flex items-center gap-2">
                        <h3 className="text-xl font-semibold text-slate-950">{activeNote.title}</h3>
                        {activeNote.pinned && <Pin size={15} className="fill-amber-400 text-amber-500" />}
                      </span>
                      <p className="mt-1 text-xs text-slate-500">Created by {activeNote.created_by_name} on {formatDate(activeNote.created_at)}</p>
                      <p className="text-xs text-slate-400">Last updated {formatDate(activeNote.updated_at)}</p>
                    </div>
                    <div className="flex gap-2">
                      <CrmTooltip content="Copy content" side="bottom">
                        <button type="button" onClick={() => copyNote(activeNote)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-blue-50 hover:text-blue-700"><Copy size={15} /></button>
                      </CrmTooltip>
                      <CrmTooltip content={activeNote.pinned ? "Unpin note" : "Pin note"} side="bottom">
                        <button type="button" onClick={() => togglePin(activeNote)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-amber-50 hover:text-amber-700"><Pin size={15} className={activeNote.pinned ? "fill-current" : ""} /></button>
                      </CrmTooltip>
                      <CrmTooltip content="Edit note" side="bottom">
                        <button type="button" onClick={() => startEdit(activeNote)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-blue-50 hover:text-blue-700"><Pencil size={15} /></button>
                      </CrmTooltip>
                      <CrmTooltip content="Delete note" side="bottom">
                        <button type="button" onClick={() => setDeleteTarget(activeNote)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-100 text-red-600 hover:bg-red-50"><Trash2 size={15} /></button>
                      </CrmTooltip>
                    </div>
                  </div>
                  <div className="mt-5 whitespace-pre-wrap rounded-2xl border border-amber-100 bg-amber-50/50 p-5 text-sm leading-7 text-slate-700">
                    {activeNote.content}
                  </div>
                </div>
              )}

              {mode === "edit" && (
                <form onSubmit={saveNote} className="flex min-h-0 flex-1 flex-col">
                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold text-slate-700">Title</label>
                      <input
                        value={form.title}
                        onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                        placeholder="Note title"
                        className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold text-slate-700">Content</label>
                      <textarea
                        value={form.content}
                        onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
                        placeholder="Write reusable remarks, standard content, or internal notes..."
                        rows={12}
                        className="w-full resize-none rounded-xl border border-slate-200 px-3 py-3 text-sm leading-6 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold text-slate-700">Created by</label>
                      <input
                        value={form.creator_name}
                        onChange={(event) => setForm((current) => ({ ...current, creator_name: event.target.value }))}
                        placeholder="User name"
                        className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={form.pinned}
                        onChange={(event) => setForm((current) => ({ ...current, pinned: event.target.checked }))}
                        className="h-4 w-4 rounded border-slate-300 text-amber-500"
                      />
                      Pin this note
                    </label>
                  </div>
                  <footer className="flex justify-end gap-3 border-t border-slate-200 p-4">
                    <button type="button" onClick={activeNoteId ? () => setMode("detail") : returnToList} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
                    <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
                      <Save size={15} /> {saving ? "Saving..." : "Save note"}
                    </button>
                  </footer>
                </form>
              )}
            </div>
          </section>
        </>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete quick note?"
        message="This permanently deletes the selected quick note."
        confirmLabel="Delete note"
        loading={saving}
        onConfirm={deleteNote}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
