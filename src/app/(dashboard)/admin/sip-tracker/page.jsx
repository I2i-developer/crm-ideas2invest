"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  FileSpreadsheet,
  PauseCircle,
  PlusCircle,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { authFetch } from "@/lib/authFetch";
import { supabase } from "@/lib/supabaseClient";
import FormSelect from "@/app/(dashboard)/admin/clients/components/FormSelect";
import { formatDateDDMonYYYY } from "@/lib/dateFormat";

const FOLLOW_UP_STATUSES = [
  ["pending", "Pending"],
  ["contacted", "Contacted"],
  ["client_informed", "Client informed"],
  ["restarted", "Restarted"],
  ["not_interested", "Not interested"],
  ["resolved", "Resolved"],
];

const EVENT_TYPES = [
  ["all", "All event types"],
  ["terminated", "Terminated"],
  ["paused", "Paused"],
  ["rejected", "Rejected"],
  ["unknown", "Unknown"],
];

function formatCurrency(value) {
  if (value === null || value === undefined || value === "") return "-";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function normalizedRawValue(rawRow, candidates) {
  if (!rawRow) return "";
  const normalizedCandidates = candidates.map((candidate) => candidate.replace(/[^a-zA-Z0-9]/g, "").toUpperCase());
  const match = Object.entries(rawRow).find(([key, value]) =>
    value !== null &&
    value !== undefined &&
    normalizedCandidates.includes(String(key).replace(/[^a-zA-Z0-9]/g, "").toUpperCase())
  );
  return match ? String(match[1]).trim().replace(/\.0$/, "") : "";
}

function displayContact(event) {
  const mobile = normalizedRawValue(event.raw_row, ["MOBILE"]) || event.mobile || "";
  const phone = normalizedRawValue(event.raw_row, ["PHONE"]) || event.phone || "";
  return {
    mobile,
    phone: phone && phone !== mobile ? phone : "",
  };
}

function displayFrequency(value) {
  const text = String(value || "").trim();
  if (text.toUpperCase() === "D") return "Daily";
  return text || "Frequency not set";
}

function formatSipDate(value) {
  return formatDateDDMonYYYY(value, "-");
}

function sipEventDate(event) {
  return event.termination_date || event.end_date || event.start_date || event.sip_registration_date;
}

function chipClass(value) {
  const styles = {
    terminated: "bg-orange-100 text-orange-800 border-orange-200",
    paused: "bg-yellow-100 text-yellow-800 border-yellow-200",
    cancelled: "bg-yellow-100 text-yellow-800 border-yellow-200",
    canceled: "bg-yellow-100 text-yellow-800 border-yellow-200",
    rejected: "bg-red-100 text-red-800 border-red-200",
    unknown: "bg-slate-100 text-slate-800 border-slate-200",
    pending: "bg-amber-50 text-amber-700 border-amber-100",
    resolved: "bg-green-50 text-green-700 border-green-100",
    restarted: "bg-blue-50 text-blue-700 border-blue-100",
    matched: "bg-green-50 text-green-700 border-green-100",
    unmatched: "bg-red-50 text-red-700 border-red-100",
    possible_match: "bg-violet-50 text-violet-700 border-violet-100",
  };
  return styles[value] || "bg-slate-50 text-slate-700 border-slate-100";
}

function followUpSelectClass(value) {
  const styles = {
    pending: "border-amber-300 bg-amber-100 text-amber-900",
    contacted: "border-blue-300 bg-blue-100 text-blue-900",
    client_informed: "border-cyan-300 bg-cyan-100 text-cyan-900",
    restarted: "border-emerald-300 bg-emerald-100 text-emerald-900",
    not_interested: "border-rose-300 bg-rose-100 text-rose-900",
    resolved: "border-green-300 bg-green-100 text-green-900",
  };
  return styles[value] || "border-slate-300 bg-slate-100 text-slate-800";
}

function rowClass(eventType) {
  const styles = {
    terminated: "border-l-4 border-blue-500 bg-blue-50/75",
    paused: "border-l-4 border-green-500 bg-green-50/75",
    rejected: "border-l-4 border-cyan-500 bg-cyan-50/75",
    unknown: "border-l-4 border-emerald-500 bg-emerald-50/75",
  };
  return styles[eventType] || styles.unknown;
}

function RemarksCell({ text, onTooltip, onTooltipMove, onTooltipLeave }) {
  if (!text) return <span className="text-gray-400">-</span>;

  return (
    <div
      className="max-w-[260px] cursor-help"
      onMouseEnter={(event) => onTooltip?.(text, event)}
      onMouseMove={(event) => onTooltipMove?.(event)}
      onMouseLeave={onTooltipLeave}
    >
      <p className="line-clamp-2 text-gray-700">{text}</p>
    </div>
  );
}

function SummaryCard({ title, value, icon: Icon, tone = "blue" }) {
  const tones = {
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    green: "bg-green-50 text-green-700",
    violet: "bg-violet-50 text-violet-700",
  };

  return (
    <div className="glass-card p-5 flex items-center gap-4">
      <span className={`rounded-xl p-3 ${tones[tone] || tones.blue}`}>
        <Icon size={22} />
      </span>
      <div>
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-3xl font-semibold text-gray-900">{value || 0}</p>
      </div>
    </div>
  );
}

export default function SipTrackerPage() {
  const [role, setRole] = useState(null);
  const [events, setEvents] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [uploadSummary, setUploadSummary] = useState(null);
  const [error, setError] = useState("");
  const [rowBusy, setRowBusy] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [remarksTooltip, setRemarksTooltip] = useState(null);
  const [remarkDrafts, setRemarkDrafts] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    event_type: "all",
    follow_up_status: "all",
    search: "",
  });
  const importAbortRef = useRef(null);
  const importProgressTimerRef = useRef(null);

  const isAdmin = role === "admin";

  const loadProfile = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) return;

    const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
    setRole(String(data?.role || "").trim().toLowerCase());
  }, []);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError("");

    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== "all") params.set(key, value);
    });

    const response = await authFetch(`/api/sip-reports?${params.toString()}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(data.error || "Failed to load SIP tracker data");
    } else {
      setEvents(data.events || []);
      setSummary(data.summary || {});
    }
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFilters((current) => ({
      ...current,
      event_type: params.get("event_type") || current.event_type,
      follow_up_status: params.get("follow_up_status") || current.follow_up_status,
      search: params.get("search") || current.search,
    }));
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    setPage(1);
  }, [filters.event_type, filters.follow_up_status, filters.search]);

  useEffect(() => {
    const eventIds = new Set(events.map((event) => event.id));
    setSelectedIds((current) => current.filter((id) => eventIds.has(id)));
  }, [events]);

  useEffect(() => {
    return () => {
      window.clearInterval(importProgressTimerRef.current);
      importAbortRef.current?.abort();
    };
  }, []);

  async function handleImport(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("file");
    const file = fileInput?.files?.[0];
    if (!file) return;

    setUploading(true);
    setImportProgress(4);
    setError("");
    setUploadSummary(null);
    const controller = new AbortController();
    importAbortRef.current = controller;
    window.clearInterval(importProgressTimerRef.current);
    importProgressTimerRef.current = window.setInterval(() => {
      setImportProgress((current) => {
        if (current >= 92) return current;
        const step = current < 45 ? 8 : current < 75 ? 4 : 2;
        return Math.min(current + step, 92);
      });
    }, 450);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await authFetch("/api/sip-reports/import", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error || "SIP report import failed");
      } else {
        setImportProgress(100);
        setUploadSummary(data);
        form.reset();
        await loadEvents();
      }
    } catch (importError) {
      setError(importError.name === "AbortError" ? "Import cancelled" : "SIP report import failed");
    } finally {
      window.clearInterval(importProgressTimerRef.current);
      importAbortRef.current = null;
      setUploading(false);
    }
  }

  function cancelImport() {
    importAbortRef.current?.abort();
    window.clearInterval(importProgressTimerRef.current);
    setUploading(false);
    setImportProgress(0);
  }

  async function updateFollowUp(eventId, followUpStatus) {
    const response = await authFetch(`/api/sip-reports/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ follow_up_status: followUpStatus }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || "Failed to update SIP follow-up");
      return;
    }
    await loadEvents();
  }

  async function createTask(eventId) {
    setRowBusy(eventId);
    const response = await authFetch(`/api/sip-reports/${eventId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create_task" }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setError(data.error || "Failed to create SIP follow-up task");
    else await loadEvents();
    setRowBusy(null);
  }

  async function saveRemark(eventId) {
    setRowBusy(eventId);
    const response = await authFetch(`/api/sip-reports/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ internal_remarks: remarkDrafts[eventId] || "" }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setError(data.error || "Failed to save remark");
    else await loadEvents();
    setRowBusy(null);
  }

  async function deleteEvent() {
    if (!deleteTarget) return;
    const ids = deleteTarget.ids || [deleteTarget.id];
    setRowBusy(deleteTarget.id || "bulk");
    const response = ids.length > 1
      ? await authFetch("/api/sip-reports/bulk", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        })
      : await authFetch(`/api/sip-reports/${ids[0]}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setError(data.error || "Failed to delete SIP event");
    else {
      setDeleteTarget(null);
      setSelectedIds([]);
      await loadEvents();
    }
    setRowBusy(null);
  }

  function showRemarksTooltip(text, event) {
    setRemarksTooltip({
      text,
      x: Math.max(12, Math.min(event.clientX + 16, window.innerWidth - 360)),
      y: Math.max(12, Math.min(event.clientY + 16, window.innerHeight - 180)),
    });
  }

  function moveRemarksTooltip(event) {
    setRemarksTooltip((current) => current ? {
      ...current,
      x: Math.max(12, Math.min(event.clientX + 16, window.innerWidth - 360)),
      y: Math.max(12, Math.min(event.clientY + 16, window.innerHeight - 180)),
    } : null);
  }

  const filterSummary = useMemo(() => {
    const active = Object.entries(filters).filter(([, value]) => value && value !== "all");
    return active.length ? `${active.length} active filter${active.length > 1 ? "s" : ""}` : "All SIP events";
  }, [filters]);
  const pageSize = 10;
  const totalPages = Math.max(Math.ceil(events.length / pageSize), 1);
  const currentPage = Math.min(page, totalPages);
  const paginatedEvents = events.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const allVisibleIds = paginatedEvents.map((event) => event.id);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds.includes(id));
  const tableColumnCount = isAdmin ? 11 : 10;

  function toggleSelectAll() {
    setSelectedIds(allSelected ? [] : allVisibleIds);
  }

  function toggleSelected(id) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow="Operations tracker"
        title="SIP Pause & Termination Tracker"
        description="Import AMC reports, match SIP events to clients, and track follow-up work."
        icon={FileSpreadsheet}
      />

      {isAdmin && (
        <form onSubmit={handleImport} className="glass-card p-5 space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Manual report import</h2>
              <p className="text-sm text-gray-500">Upload Excel or CSV SIP pause, termination, or rejection reports.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                name="file"
                type="file"
                accept=".xlsx,.xls,.csv,.txt"
                className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700"
              />
              <button
                type="submit"
                disabled={uploading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:opacity-60"
              >
                {uploading ? <RefreshCw size={16} className="animate-spin" /> : <Upload size={16} />}
                {uploading ? "Importing..." : "Import SIP Report"}
              </button>
              {uploading && (
                <button
                  type="button"
                  onClick={cancelImport}
                  className="inline-flex items-center justify-center rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-100"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>

          {uploading && (
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <div className="mb-2 flex items-center justify-between text-sm font-semibold text-blue-800">
                <span>Import progress</span>
                <span>{importProgress}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-white">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-600 to-emerald-500 transition-all duration-300"
                  style={{ width: `${importProgress}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-blue-700">
                Large Excel files may take a moment while rows are parsed, matched, and follow-up tasks are prepared.
              </p>
            </div>
          )}

          {uploadSummary && (
            <div className="grid gap-3 rounded-xl border border-green-100 bg-green-50 p-4 text-sm text-green-800 sm:grid-cols-3 lg:grid-cols-6">
              <span>Total: {uploadSummary.total_rows}</span>
              <span>New: {uploadSummary.new_records}</span>
              <span>Duplicates: {uploadSummary.duplicate_records}</span>
              <span>Matched: {uploadSummary.matched_rows}</span>
              <span>Unmatched: {uploadSummary.unmatched_rows}</span>
              <span>Failed: {uploadSummary.failed_rows}</span>
            </div>
          )}
        </form>
      )}

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="Terminated This Week" value={summary.terminated_this_week} icon={XCircle} tone="red" />
        <SummaryCard title="Paused This Week" value={summary.paused_this_week} icon={PauseCircle} tone="amber" />
        <SummaryCard title="Rejected This Week" value={summary.rejected_this_week} icon={AlertTriangle} tone="violet" />
        <SummaryCard title="Pending Follow-ups" value={summary.pending_followups} icon={RefreshCw} tone="blue" />
        <SummaryCard title="Total Terminated" value={summary.total_terminated} icon={XCircle} tone="red" />
        <SummaryCard title="Total Rejected" value={summary.total_rejected} icon={AlertTriangle} tone="violet" />
        <SummaryCard title="Resolved" value={summary.total_resolved} icon={CheckCircle2} tone="green" />
      </div>

      <div className="glass-card p-5 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">SIP event queue</h2>
            <p className="text-sm text-gray-500">{filterSummary}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && selectedIds.length > 0 && (
              <button
                type="button"
                onClick={() => setDeleteTarget({ ids: selectedIds, investor_name: `${selectedIds.length} selected rows` })}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
              >
                <Trash2 size={15} />
                Delete selected ({selectedIds.length})
              </button>
            )}
            <button
              type="button"
              onClick={loadEvents}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              <RefreshCw size={15} />
              Refresh
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <FormSelect
            name="event_type"
            value={filters.event_type}
            onValueChange={(value) => setFilters((current) => ({ ...current, event_type: value }))}
            options={EVENT_TYPES.map(([value, label]) => ({ value, label }))}
            placeholder="Event type"
          />
          <FormSelect
            name="follow_up_status"
            value={filters.follow_up_status}
            onValueChange={(value) => setFilters((current) => ({ ...current, follow_up_status: value }))}
            options={[{ value: "all", label: "All follow-up statuses" }, ...FOLLOW_UP_STATUSES.map(([value, label]) => ({ value, label }))]}
            placeholder="Follow-up status"
          />
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Search name, mobile, email, folio"
              className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1240px] w-full border-separate border-spacing-y-2 text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-gray-500">
                {isAdmin && (
                  <th className="px-3 py-2">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-blue-50"
                      aria-label={allSelected ? "Clear selected SIP rows" : "Select all visible SIP rows"}
                    >
                      <CheckSquare size={16} className={allSelected ? "text-blue-700" : ""} />
                    </button>
                  </th>
                )}
                <th className="px-3 py-2">Event</th>
                <th className="px-3 py-2">Investor</th>
                <th className="px-3 py-2">Remarks</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Folio</th>
                <th className="px-3 py-2">Follow-up</th>
                <th className="px-3 py-2">Task</th>
                <th className="px-3 py-2">Add Remark</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={tableColumnCount} className="rounded-xl bg-white p-6 text-center text-gray-500">Loading SIP events...</td></tr>
              ) : events.length === 0 ? (
                <tr><td colSpan={tableColumnCount} className="rounded-xl bg-white p-6 text-center text-gray-500">No SIP events found.</td></tr>
              ) : (
                paginatedEvents.map((event) => (
                  <tr key={event.id} className={`shadow-sm ${rowClass(event.event_type)}`}>
                    {isAdmin && (
                      <td className="rounded-l-xl px-3 py-3 align-top">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(event.id)}
                          onChange={() => toggleSelected(event.id)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-700 focus:ring-blue-500"
                          aria-label={`Select SIP event for ${event.investor_name || "investor"}`}
                        />
                      </td>
                    )}
                    <td className={`${isAdmin ? "" : "rounded-l-xl"} px-3 py-3 align-top`}>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${chipClass(event.event_type)}`}>
                        {event.event_type}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <p className="font-semibold text-gray-900">{event.investor_name || "-"}</p>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <RemarksCell
                        text={event.rejection_remarks || event.remarks || ""}
                        onTooltip={showRemarksTooltip}
                        onTooltipMove={moveRemarksTooltip}
                        onTooltipLeave={() => setRemarksTooltip(null)}
                      />
                    </td>
                    <td className="px-3 py-3 align-top text-gray-700">{formatSipDate(sipEventDate(event))}</td>
                    <td className="px-3 py-3 align-top">
                      {(() => {
                        const contact = displayContact(event);
                        return (
                          <>
                            <p className="whitespace-nowrap font-medium text-gray-800">{contact.mobile || contact.phone || "-"}</p>
                            {contact.phone && <p className="whitespace-nowrap text-xs text-gray-500">{contact.phone}</p>}
                          </>
                        );
                      })()}
                      <p className="text-xs text-gray-500">{event.email || "-"}</p>
                    </td>
                    <td className="px-3 py-3 align-top text-gray-700">
                      <p className="font-semibold">{formatCurrency(event.amount)}</p>
                      <p className="text-xs text-gray-500">{displayFrequency(event.frequency)}</p>
                    </td>
                    <td className="px-3 py-3 align-top text-gray-700">{event.folio_no || "-"}</td>
                    <td className="px-3 py-3 align-top">
                      <select
                        name={`follow_up_${event.id}`}
                        value={event.follow_up_status}
                        disabled={rowBusy === event.id}
                        onChange={(changeEvent) => updateFollowUp(event.id, changeEvent.target.value)}
                        className={`w-36 rounded-full border px-3 py-1.5 text-xs font-bold capitalize shadow-sm outline-none transition hover:brightness-95 focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60 ${followUpSelectClass(event.follow_up_status)}`}
                      >
                        {FOLLOW_UP_STATUSES.map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3 align-top">
                      {event.task_id ? (
                        <Link href={`/dashboard/tasks/${event.task_id}`} className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline">
                          <CheckCircle2 size={14} />
                          Open task
                        </Link>
                      ) : isAdmin ? (
                          <button
                            type="button"
                            disabled={rowBusy === event.id}
                            onClick={() => createTask(event.id)}
                            className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <PlusCircle size={14} />
                            Create task
                          </button>
                      ) : (
                        <span className="text-xs text-gray-400">No task</span>
                      )}
                    </td>
                    <td className="rounded-r-xl px-3 py-3 align-top">
                      <div className="flex min-w-[230px] items-start gap-2">
                        <div className="w-52 space-y-2">
                          <textarea
                            value={remarkDrafts[event.id] ?? event.internal_remarks ?? ""}
                            onChange={(changeEvent) =>
                              setRemarkDrafts((current) => ({
                                ...current,
                                [event.id]: changeEvent.target.value,
                              }))
                            }
                            rows={2}
                            placeholder="Add internal remark"
                            className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          />
                          <button
                            type="button"
                            onClick={() => saveRemark(event.id)}
                            disabled={rowBusy === event.id}
                            className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Save remark
                          </button>
                        </div>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(event)}
                            disabled={rowBusy === event.id}
                            className="rounded-lg border border-red-100 bg-white p-2 text-red-600 hover:bg-red-50 disabled:opacity-50"
                            aria-label="Delete SIP event"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-500">
            Showing {events.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
            -{Math.min(currentPage * pageSize, events.length)} of {events.length} SIP events
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(current - 1, 1))}
              disabled={currentPage === 1}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <span className="rounded-xl bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700">
              Page {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(current + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-gray-900">
              {deleteTarget.ids?.length > 1 ? "Delete selected SIP events?" : "Delete SIP event?"}
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              This will remove the SIP tracker row{deleteTarget.ids?.length > 1 ? "s" : ""} for {deleteTarget.investor_name || "this investor"}. Linked tasks are not deleted.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={deleteEvent}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Delete row
              </button>
            </div>
          </div>
        </div>
      )}

      {remarksTooltip && (
        <div
          className="pointer-events-none fixed z-[9999] max-w-sm rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs leading-relaxed text-slate-700 shadow-2xl"
          style={{ left: remarksTooltip.x, top: remarksTooltip.y }}
        >
          {remarksTooltip.text}
        </div>
      )}
    </div>
  );
}
