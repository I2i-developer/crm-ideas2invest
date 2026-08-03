"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  Bell,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  Clipboard,
  Copy,
  FileQuestion,
  FileText,
  Gift,
  HeartPulse,
  IndianRupee,
  ListChecks,
  Mic,
  MicOff,
  Plus,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  UsersRound,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import FormInput from "../clients/components/FormInput";
import FormSelect from "../clients/components/FormSelect";
import CrmTooltip from "@/components/CrmTooltip";
import ConfirmDialog from "@/components/ConfirmDialog";
import { authFetch } from "@/lib/authFetch";
import { supabase } from "@/lib/supabaseClient";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { formatDateTimeDDMonYYYY } from "@/lib/dateFormat";

const MEETING_TYPES = [
  "First meeting",
  "Review meeting",
  "Insurance discussion",
  "Investment planning",
  "Goal planning",
  "KYC/document discussion",
  "Other",
];

const PRIORITY_OPTIONS = ["Low", "Medium", "High", "Urgent"];

const emptySummary = {
  overview: "",
  major_discussion_points: [],
  client_current_situation: [],
  existing_investments: [],
  existing_insurance: [],
  income_details: [],
  family_dependents: [],
  financial_goals: [],
  risk_profile_notes: [],
  kyc_concerns: [],
  detected_pans: [],
  important_figures: [],
  product_opportunities: {
    mutual_funds: [],
    sip_swp_stp: [],
    pms_aif: [],
    gift_city: [],
    insurance: [],
  },
  documents_required: [],
  follow_up_actions: [],
  suggested_tasks: [],
  suggested_reminders: [],
  open_questions: [],
  sentiment: "Neutral",
  priority: "Medium",
};

function initialForm() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return {
    id: "",
    client_id: "",
    title: "",
    meeting_type: "Review meeting",
    meeting_datetime: now.toISOString().slice(0, 16),
    raw_notes: "",
    status: "Draft",
  };
}

function listText(items, fallback = "No specific notes captured.") {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!list.length) return fallback;
  return list.map((item) => `• ${typeof item === "string" ? item : JSON.stringify(item)}`).join("\n");
}

function summaryToText(summary, form) {
  return [
    `Meeting: ${form.title || "Client meeting"}`,
    `Date: ${form.meeting_datetime ? formatDateTimeDDMonYYYY(form.meeting_datetime) : "-"}`,
    "",
    "Overview",
    summary.overview || "-",
    "",
    "Major Discussion",
    listText(summary.major_discussion_points),
    "",
    "KYC",
    listText(summary.kyc_concerns),
    "",
    "Follow-ups",
    listText(summary.follow_up_actions),
    "",
    "Documents Required",
    listText(summary.documents_required),
  ].join("\n");
}

function overviewPointers(summary = {}) {
  const points = [];
  const add = (label, value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.filter(Boolean).slice(0, 3).forEach((item) => points.push(`${label}: ${typeof item === "string" ? item : JSON.stringify(item)}`));
      return;
    }
    String(value)
      .split(/(?<=[.!?])\s+|\n+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 3)
      .forEach((item) => points.push(item));
  };

  add("Overview", summary.overview);
  add("Discussion", summary.major_discussion_points);
  add("Current situation", summary.client_current_situation);
  add("Investments", summary.existing_investments);
  add("Insurance", summary.existing_insurance);
  add("Goals", summary.financial_goals);
  add("Risk", summary.risk_profile_notes);
  add("KYC", summary.kyc_concerns);
  add("Figures", summary.important_figures);
  add("Documents", summary.documents_required);
  add("Follow-up", summary.follow_up_actions);

  return [...new Set(points)].slice(0, 12);
}

function Pill({ children, tone = "slate" }) {
  const tones = {
    slate: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100",
    blue: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-300/40 dark:bg-blue-500/20 dark:text-blue-100",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-300/40 dark:bg-emerald-500/20 dark:text-emerald-100",
    amber: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-300/40 dark:bg-amber-400/20 dark:text-amber-100",
    red: "border-red-200 bg-red-50 text-red-700 dark:border-red-300/40 dark:bg-red-500/20 dark:text-red-100",
  };

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${tones[tone]}`}>{children}</span>;
}

function HighlightCard({ title, icon: Icon, items, tone = "blue" }) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  const toneClass = {
    blue: "border-blue-100 bg-blue-50/70 text-blue-700 dark:border-blue-400/30 dark:bg-blue-500/15 dark:text-blue-100",
    green: "border-emerald-100 bg-emerald-50/70 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-100",
    amber: "border-amber-100 bg-amber-50/70 text-amber-700 dark:border-amber-300/30 dark:bg-amber-400/15 dark:text-amber-100",
    violet: "border-violet-100 bg-violet-50/70 text-violet-700 dark:border-violet-400/30 dark:bg-violet-500/15 dark:text-violet-100",
    red: "border-red-100 bg-red-50/70 text-red-700 dark:border-red-400/30 dark:bg-red-500/15 dark:text-red-100",
  }[tone];

  return (
    <article className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="flex items-center gap-2">
        <Icon size={17} />
        <h3 className="text-sm font-bold">{title}</h3>
      </div>
      {list.length ? (
        <ul className="mt-3 space-y-2 text-sm leading-5">
          {list.slice(0, 4).map((item, index) => (
            <li key={`${title}-${index}`}>{typeof item === "string" ? item : JSON.stringify(item)}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm opacity-75">No specific point detected.</p>
      )}
    </article>
  );
}

export default function MeetingNotesPage() {
  const [role, setRole] = useState(null);
  const [clients, setClients] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [summary, setSummary] = useState(emptySummary);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [search, setSearch] = useState("");
  const [kycRecords, setKycRecords] = useState([]);
  const [manualPan, setManualPan] = useState("");
  const [deleteMeetingOpen, setDeleteMeetingOpen] = useState(false);
  const [deleteMeetingTarget, setDeleteMeetingTarget] = useState(null);
  const [deletingMeeting, setDeletingMeeting] = useState(false);
  const [reminderDraft, setReminderDraft] = useState({
    title: "",
    reminder_at: "",
    priority: "Medium",
    notes: "",
  });

  const selectedClient = clients.find((client) => client.id === form.client_id);
  const isAdmin = role === "admin";

  const voiceInput = useVoiceInput({
    language: "en-IN",
    onResult: (transcript) => {
      setForm((current) => ({
        ...current,
        raw_notes: current.raw_notes ? `${current.raw_notes}\n${transcript}` : transcript,
      }));
    },
  });

  const clientOptions = [{ value: "", label: "Select client" }, ...clients.map((client) => ({ value: client.id, label: client.full_name }))];
  const meetingTypeOptions = MEETING_TYPES.map((type) => ({ value: type, label: type }));
  const priorityOptions = PRIORITY_OPTIONS.map((priority) => ({ value: priority, label: priority }));

  const filteredMeetings = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return meetings;
    return meetings.filter((meeting) =>
      [meeting.title, meeting.client?.full_name, meeting.overview, meeting.raw_notes]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [meetings, search]);

  async function loadData() {
    setLoading(true);
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const clientId = params.get("client_id") || "";
    const meetingId = params.get("meeting_id") || "";

    const [{ data: userData }, meetingsRes] = await Promise.all([
      supabase.auth.getUser(),
      authFetch(`/api/meeting-notes${meetingId ? `?meeting_id=${meetingId}` : ""}`),
    ]);

    if (userData?.user?.id) {
      const [{ data: profile }, { data: clientRows }] = await Promise.all([
        supabase.from("profiles").select("role").eq("id", userData.user.id).maybeSingle(),
        supabase.from("clients").select("id, full_name, email, mobile, kyc_status, tax_status, risk_category").order("full_name", { ascending: true }),
      ]);
      setRole(profile?.role || null);
      setClients(clientRows || []);
      if (clientId) setForm((current) => ({ ...current, client_id: clientId }));
    }

    const meetingsData = await meetingsRes.json().catch(() => ({}));
    if (meetingsRes.ok) {
      setMeetings(meetingsData.meetings || []);
      if (meetingId && meetingsData.meetings?.[0]) selectMeeting(meetingsData.meetings[0]);
    } else {
      toast.error(meetingsData.error || "Failed to load meeting notes");
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const pan = summary.detected_pans?.[0];
    if (!pan) {
      setKycRecords([]);
      return;
    }
    authFetch(`/api/kyc-statuses?search=${encodeURIComponent(pan)}&limit=5`)
      .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
      .then(({ ok, data }) => setKycRecords(ok ? data.records || [] : []))
      .catch(() => setKycRecords([]));
  }, [summary.detected_pans]);

  function selectMeeting(meeting) {
    setSelectedMeeting(meeting);
    setForm({
      id: meeting.id,
      client_id: meeting.client_id || "",
      title: meeting.title || "",
      meeting_type: meeting.meeting_type || "Review meeting",
      meeting_datetime: meeting.meeting_datetime ? new Date(meeting.meeting_datetime).toISOString().slice(0, 16) : initialForm().meeting_datetime,
      raw_notes: meeting.raw_notes || "",
      status: meeting.status || "Draft",
    });
    setSummary(meeting.summary_json && Object.keys(meeting.summary_json).length ? meeting.summary_json : emptySummary);
  }

  function startNew() {
    setSelectedMeeting(null);
    setForm(initialForm());
    setSummary(emptySummary);
    setKycRecords([]);
  }

  async function saveMeeting(nextStatus = form.status || "Draft", summaryOverride = null) {
    if (!form.title.trim()) {
      toast.error("Meeting title is required");
      return null;
    }

    setSaving(true);
    const activeSummary = summaryOverride || summary;
    const payload = {
      ...form,
      status: nextStatus,
      summary_json: activeSummary,
      overview: activeSummary.overview,
      detected_pans: activeSummary.detected_pans || [],
      important_figures: activeSummary.important_figures || [],
      sentiment: activeSummary.sentiment || "Neutral",
      priority: activeSummary.priority || "Medium",
    };

    const url = form.id ? `/api/meeting-notes/${form.id}` : "/api/meeting-notes";
    const response = await authFetch(url, {
      method: form.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    setSaving(false);

    if (!response.ok) {
      toast.error(data.error || "Failed to save meeting note");
      return null;
    }

    toast.success(nextStatus === "Finalized" ? "Meeting finalized" : "Meeting note saved");
    selectMeeting(data.meeting);
    await loadMeetingsOnly();
    return data.meeting;
  }

  async function loadMeetingsOnly() {
    const response = await authFetch("/api/meeting-notes");
    const data = await response.json().catch(() => ({}));
    if (response.ok) setMeetings(data.meetings || []);
  }

  async function generateSummary() {
    if (!form.raw_notes.trim()) {
      toast.error("Add meeting notes before generating summary");
      return;
    }
    setSummarizing(true);
    const response = await authFetch("/api/meeting-notes/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meeting_id: form.id || null,
        client_id: form.client_id || null,
        raw_notes: form.raw_notes,
      }),
    });
    const data = await response.json().catch(() => ({}));
    setSummarizing(false);

    if (!response.ok) {
      toast.error(data.error || "Summary generation failed");
      return;
    }

    const nextSummary = data.summary || emptySummary;
    setSummary(nextSummary);
    if (data.ai_error) toast(data.ai_error);
    else toast.success(data.ai_enabled ? "AI summary generated" : "Fallback summary generated");

    if (!form.id) await saveMeeting("Summarized", nextSummary);
    else {
      setForm((current) => ({ ...current, status: "Summarized" }));
      setSelectedMeeting((current) => current ? ({
        ...current,
        raw_notes: form.raw_notes,
        summary_json: nextSummary,
        overview: nextSummary.overview,
        major_discussion: (nextSummary.major_discussion_points || []).join("\n"),
        detected_pans: nextSummary.detected_pans || [],
        important_figures: nextSummary.important_figures || [],
        sentiment: nextSummary.sentiment || "Neutral",
        priority: nextSummary.priority || "Medium",
        status: "Summarized",
      }) : current);
      await loadMeetingsOnly();
    }
  }

  async function createReminder(seed = null) {
    const meeting = form.id ? selectedMeeting : await saveMeeting("Draft");
    if (!meeting?.id) return;

    const payload = seed || reminderDraft;
    if (!payload.title?.trim()) {
      toast.error("Reminder title is required");
      return;
    }
    if (!payload.reminder_at) {
      toast.error("Reminder date/time is required");
      return;
    }

    const response = await authFetch(`/api/meeting-notes/${meeting.id}/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(data.error || "Failed to create reminder");
      return;
    }
    toast.success("Reminder created");
    setReminderDraft({ title: "", reminder_at: "", priority: "Medium", notes: "" });
    await loadMeetingsOnly();
  }

  async function completeReminder(reminderId) {
    const response = await authFetch(`/api/meeting-reminders/${reminderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Completed" }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(data.error || "Failed to complete reminder");
      return;
    }
    toast.success("Reminder completed");
    await loadMeetingsOnly();
  }

  async function createTask(task) {
    if (!isAdmin) {
      toast.error("Task creation from meeting notes is admin-only");
      return;
    }
    const response = await authFetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: task.title,
        description: `${task.description || task.title}\n\nCreated from meeting note: ${form.title}`,
        category: task.category || "Follow-up",
        priority: task.priority || summary.priority || "Medium",
        due_date: "",
        client_id: form.client_id || null,
        assigned_to: [],
        tags: ["meeting-note"],
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(data.error || "Task creation failed");
      return;
    }
    toast.success("Task created");
    if (data.task?.id) window.location.href = `/dashboard/tasks/${data.task.id}`;
  }

  async function copySummary() {
    await navigator.clipboard.writeText(summaryToText(summary, form));
    toast.success("Meeting summary copied");
  }

  async function deleteMeeting() {
    const target = deleteMeetingTarget || (form.id ? { id: form.id, title: form.title } : null);
    if (!target?.id) return;

    setDeletingMeeting(true);
    const response = await authFetch(`/api/meeting-notes/${target.id}`, {
      method: "DELETE",
    });
    const data = await response.json().catch(() => ({}));
    setDeletingMeeting(false);

    if (!response.ok) {
      toast.error(data.error || "Failed to delete meeting note");
      return;
    }

    setDeleteMeetingOpen(false);
    setDeleteMeetingTarget(null);
    if (form.id === target.id) startNew();
    await loadMeetingsOnly();
    toast.success("Meeting note deleted");
  }

  const detectedPans = [...new Set([...(summary.detected_pans || []), ...(manualPan ? [manualPan.toUpperCase()] : [])])];
  const activeReminders = selectedMeeting?.reminders || [];
  const overviewItems = overviewPointers(summary);

  return (
    <main className="min-h-full bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <PageHeader
        eyebrow="Meeting intelligence"
        title="Client Meeting Notes"
        description="Capture the meeting journey, generate a structured summary, check KYC prompts, and create self reminders."
        icon={Sparkles}
        actions={
          <button
            type="button"
            onClick={startNew}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
          >
            <Plus size={17} /> New Meeting
          </button>
        }
      />

      <div className="mt-6 grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-200 p-4 dark:border-slate-700">
            <label className="relative block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search meeting history"
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
              />
            </label>
          </div>
          <div className="max-h-[calc(100vh-250px)] overflow-y-auto p-3">
            {loading ? (
              <p className="p-6 text-center text-sm text-slate-500 dark:text-slate-300">Loading meetings...</p>
            ) : filteredMeetings.length ? (
              <div className="space-y-2">
                {filteredMeetings.map((meeting) => (
                  <div
                    key={meeting.id}
                    className={`w-full rounded-xl border p-3 text-left transition hover:border-blue-200 hover:bg-blue-50/70 dark:hover:bg-blue-500/15 ${
                      form.id === meeting.id
                        ? "border-blue-300 bg-blue-50 dark:border-blue-300/50 dark:bg-blue-500/20"
                        : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => selectMeeting(meeting)}
                      className="block w-full text-left"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-50">{meeting.title}</p>
                          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-300">{meeting.client?.full_name || "No client linked"}</p>
                        </div>
                        <Pill tone={meeting.status === "Finalized" ? "green" : meeting.status === "Summarized" ? "blue" : "amber"}>{meeting.status}</Pill>
                      </div>
                      <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-300">
                        {formatDateTimeDDMonYYYY(meeting.meeting_datetime, "-")}
                      </p>
                    </button>
                    {isAdmin && (
                      <div className="mt-3 flex justify-end">
                        <CrmTooltip content="Delete meeting" side="left">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setDeleteMeetingTarget(meeting);
                              setDeleteMeetingOpen(true);
                            }}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 transition hover:bg-red-100 dark:border-red-300/40 dark:bg-red-500/20 dark:text-red-100 dark:hover:bg-red-500/30"
                            aria-label={`Delete ${meeting.title}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </CrmTooltip>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="p-6 text-center text-sm text-slate-500 dark:text-slate-300">No meeting notes found.</p>
            )}
          </div>
        </aside>

        <section className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="grid gap-4 lg:grid-cols-2">
              <FormSelect label="Link Client" value={form.client_id} options={clientOptions} onValueChange={(value) => setForm((current) => ({ ...current, client_id: value }))} isSearchable />
              <FormInput label="Meeting Title" value={form.title} onValueChange={(value) => setForm((current) => ({ ...current, title: value }))} placeholder="Example: Portfolio review and KYC discussion" required />
              <FormInput label="Meeting Date/Time" type="datetime-local" value={form.meeting_datetime} onValueChange={(value) => setForm((current) => ({ ...current, meeting_datetime: value }))} />
              <FormSelect label="Meeting Type" value={form.meeting_type} options={meetingTypeOptions} onValueChange={(value) => setForm((current) => ({ ...current, meeting_type: value }))} />
            </div>

            {selectedClient && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Pill tone="blue">{selectedClient.tax_status || "Client"}</Pill>
                <Pill tone="green">KYC: {selectedClient.kyc_status || "Not captured"}</Pill>
                <Pill tone="amber">Risk: {selectedClient.risk_category || "Pending"}</Pill>
                <Link href={`/admin/clients/${selectedClient.id}/client-details`} className="text-xs font-bold text-blue-700 hover:underline dark:text-blue-200">
                  Open complete profile
                </Link>
              </div>
            )}

            <div className="mt-5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <label className="text-sm font-bold text-slate-800 dark:text-slate-100">Raw Meeting Journey / Notes</label>
                <CrmTooltip content={voiceInput.unsupported ? "Voice input is not supported in this browser" : "Dictate meeting notes"}>
                  <button
                    type="button"
                    onClick={voiceInput.toggle}
                    disabled={voiceInput.unsupported}
                    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition ${
                      voiceInput.listening
                        ? "border-red-200 bg-red-50 text-red-700 dark:border-red-300/40 dark:bg-red-500/20 dark:text-red-100"
                        : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-300/40 dark:bg-blue-500/20 dark:text-blue-100"
                    } disabled:opacity-60`}
                  >
                    {voiceInput.listening ? <MicOff size={16} /> : <Mic size={16} />}
                    {voiceInput.listening ? "Listening..." : "Dictate"}
                  </button>
                </CrmTooltip>
              </div>
              <textarea
                value={form.raw_notes}
                onChange={(event) => setForm((current) => ({ ...current, raw_notes: event.target.value }))}
                rows={10}
                placeholder="Paste or dictate the full client meeting conversation, notes, concerns, figures, goals, documents, follow-ups..."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50 dark:placeholder:text-slate-400 dark:focus:bg-slate-950"
              />
              {(voiceInput.error || voiceInput.unsupported) && (
                <p className="mt-2 text-xs font-semibold text-amber-600 dark:text-amber-200">
                  {voiceInput.error || "Voice input is unavailable in this browser. Manual notes still work."}
                </p>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={generateSummary} disabled={summarizing} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-70">
                <Sparkles size={14} /> {summarizing ? "Summarizing..." : "Generate Summary"}
              </button>
              <button type="button" onClick={() => saveMeeting("Draft")} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700">
                <Save size={14} /> {saving ? "Saving..." : "Save Draft"}
              </button>
              <button type="button" onClick={() => saveMeeting("Finalized")} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-70">
                <CheckCircle2 size={14} /> Finalize
              </button>
              <button type="button" onClick={copySummary} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 transition hover:bg-violet-100 dark:border-violet-300/40 dark:bg-violet-500/20 dark:text-violet-100">
                <Copy size={14} /> Copy Summary
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-blue-600 dark:text-blue-300">Structured overview</p>
                <h2 className="mt-1 text-xl font-bold text-slate-950 dark:text-slate-50">{summary.overview ? "Meeting Summary" : "Summary will appear here"}</h2>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Pill tone={summary.priority === "Urgent" || summary.priority === "High" ? "red" : "blue"}>{summary.priority || "Medium"}</Pill>
                <Pill tone={summary.sentiment === "Positive" ? "green" : summary.sentiment === "Concerned" ? "amber" : "slate"}>{summary.sentiment || "Neutral"}</Pill>
              </div>
            </div>
            <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
              <div className="flex items-center gap-2">
                <ListChecks size={17} className="text-blue-600 dark:text-blue-300" />
                <h3 className="text-sm font-black uppercase tracking-wide text-slate-800 dark:text-slate-100">Overview</h3>
              </div>
              {overviewItems.length ? (
                <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700 dark:text-slate-200">
                  {overviewItems.map((item, index) => (
                    <li key={`${item}-${index}`} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600 dark:bg-blue-300" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-slate-200">
                  Add meeting notes and generate a structured summary. If AI is not configured, the CRM will still extract PANs, figures, documents, and likely follow-ups using a local fallback.
                </p>
              )}
            </section>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <HighlightCard title="KYC" icon={ShieldCheck} items={summary.kyc_concerns} tone="blue" />
              <HighlightCard title="Major Discussion" icon={ListChecks} items={summary.major_discussion_points} tone="violet" />
              <HighlightCard title="Important Figures" icon={IndianRupee} items={summary.important_figures} tone="green" />
              <HighlightCard title="Insurance" icon={HeartPulse} items={summary.existing_insurance} tone="red" />
              <HighlightCard title="Investments" icon={BriefcaseBusiness} items={summary.existing_investments} tone="green" />
              <HighlightCard title="Goals" icon={Target} items={summary.financial_goals} tone="blue" />
              <HighlightCard title="Risk Profile" icon={AlertTriangle} items={summary.risk_profile_notes} tone="amber" />
              <HighlightCard title="Family/Dependents" icon={UsersRound} items={summary.family_dependents} tone="violet" />
              <HighlightCard title="Documents Required" icon={FileText} items={summary.documents_required} tone="amber" />
            </div>
          </div>

          <div className="grid items-start gap-5 xl:grid-cols-2">
            <section className="self-start rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center gap-2">
                <ShieldCheck className="text-blue-600 dark:text-blue-300" size={18} />
                <h2 className="text-base font-bold text-slate-950 dark:text-slate-50">KYC Prompt</h2>
              </div>
              <div className="mt-3 space-y-2.5">
                {detectedPans.length ? detectedPans.map((pan) => (
                  <div key={pan} className="rounded-xl border border-blue-100 bg-blue-50 p-3 dark:border-blue-300/40 dark:bg-blue-500/15">
                    <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                      <div>
                        <p className="text-xs font-bold uppercase text-blue-600 dark:text-blue-200">Detected PAN</p>
                        <p className="font-mono text-lg font-black text-slate-950 dark:text-white">{pan}</p>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        <button type="button" onClick={() => navigator.clipboard.writeText(pan)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 text-xs font-bold text-blue-700 hover:bg-blue-50 dark:border-blue-300/40 dark:bg-slate-900 dark:text-blue-100">
                          <Clipboard size={14} className="inline" /> Copy
                        </button>
                        <Link href={`/admin/kyc-status?search=${encodeURIComponent(pan)}`} className="inline-flex h-9 items-center justify-center rounded-lg bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700">
                          Open KYC Tracker
                        </Link>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No PAN detected. Enter one manually to check KYC.</p>
                    <div className="mt-3 grid gap-2">
                      <input
                        value={manualPan}
                        onChange={(event) => setManualPan(event.target.value.toUpperCase())}
                        placeholder="ABCDE1234F"
                        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
                      />
                      <Link
                        href={`/admin/kyc-status?search=${encodeURIComponent(manualPan)}`}
                        className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-blue-600 px-3 text-xs font-bold text-white transition hover:bg-blue-700"
                      >
                        Check
                      </Link>
                    </div>
                  </div>
                )}
                {kycRecords.length > 0 && (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 dark:border-emerald-300/40 dark:bg-emerald-500/15">
                    <p className="text-sm font-bold text-emerald-800 dark:text-emerald-100">KYC tracker matches</p>
                    {kycRecords.map((record) => (
                      <p key={record.id} className="mt-1 text-sm text-emerald-700 dark:text-emerald-200">
                        {record.client_name}: {record.kyc_status}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center gap-2">
                <Bell className="text-amber-600 dark:text-amber-200" size={20} />
                <h2 className="text-lg font-bold text-slate-950 dark:text-slate-50">Self Reminders</h2>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <FormInput label="Reminder Title" value={reminderDraft.title} onValueChange={(value) => setReminderDraft((current) => ({ ...current, title: value }))} />
                <FormInput label="Reminder Date/Time" type="datetime-local" value={reminderDraft.reminder_at} onValueChange={(value) => setReminderDraft((current) => ({ ...current, reminder_at: value }))} />
                <FormSelect label="Priority" value={reminderDraft.priority} options={priorityOptions} onValueChange={(value) => setReminderDraft((current) => ({ ...current, priority: value }))} />
                <FormInput label="Notes" value={reminderDraft.notes} onValueChange={(value) => setReminderDraft((current) => ({ ...current, notes: value }))} />
              </div>
              <button type="button" onClick={() => createReminder()} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-amber-600">
                <CalendarClock size={16} /> Create Reminder
              </button>

              {(summary.suggested_reminders || []).length > 0 && (
                <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-3 dark:border-amber-300/30 dark:bg-amber-400/15">
                  <p className="text-sm font-bold text-amber-800 dark:text-amber-100">Suggested reminders</p>
                  <div className="mt-2 space-y-2">
                    {summary.suggested_reminders.slice(0, 3).map((reminder, index) => (
                      <button
                        key={`${reminder.title}-${index}`}
                        type="button"
                        onClick={() => setReminderDraft((current) => ({
                          ...current,
                          title: reminder.title,
                          priority: reminder.priority || summary.priority || "Medium",
                          notes: reminder.notes || reminder.title,
                        }))}
                        className="block w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-left text-xs font-semibold text-amber-800 transition hover:bg-amber-100 dark:border-amber-300/30 dark:bg-slate-950 dark:text-amber-100 dark:hover:bg-amber-400/20"
                      >
                        {reminder.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 space-y-2">
                {activeReminders.length ? activeReminders.map((reminder) => (
                  <div key={reminder.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-950">
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-50">{reminder.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-300">{formatDateTimeDDMonYYYY(reminder.reminder_at, "-")} · {reminder.status}</p>
                    </div>
                    {reminder.status !== "Completed" && (
                      <button type="button" onClick={() => completeReminder(reminder.id)} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 dark:border-emerald-300/40 dark:bg-emerald-500/20 dark:text-emerald-100">
                        Done
                      </button>
                    )}
                  </div>
                )) : (
                  <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-300">No reminders created for this meeting yet.</p>
                )}
              </div>
            </section>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center gap-2">
                <Send className="text-blue-600 dark:text-blue-300" size={20} />
                <h2 className="text-lg font-bold text-slate-950 dark:text-slate-50">Suggested Tasks</h2>
              </div>
              <div className="mt-4 space-y-2">
                {(summary.suggested_tasks || []).length ? summary.suggested_tasks.map((task, index) => (
                  <div key={`${task.title}-${index}`} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-950">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-slate-50">{task.title}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">{task.category || "Follow-up"} · {task.priority || summary.priority}</p>
                      </div>
                      <button type="button" onClick={() => createTask(task)} disabled={!isAdmin} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                        Create Task
                      </button>
                    </div>
                  </div>
                )) : (
                  <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-300">Generate a summary to see suggested task actions.</p>
                )}
                {!isAdmin && <p className="text-xs font-semibold text-amber-600 dark:text-amber-200">Task conversion is admin-only because assigned task creation is controlled by the existing task permission model.</p>}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center gap-2">
                <FileQuestion className="text-violet-600 dark:text-violet-200" size={20} />
                <h2 className="text-lg font-bold text-slate-950 dark:text-slate-50">Open Questions & Opportunities</h2>
              </div>
              <div className="mt-4 grid gap-3">
                <HighlightCard title="PMS / AIF / GIFT City" icon={Gift} items={[...(summary.product_opportunities?.pms_aif || []), ...(summary.product_opportunities?.gift_city || [])]} tone="violet" />
                <HighlightCard title="SIP / SWP / STP / Mutual Funds" icon={BriefcaseBusiness} items={[...(summary.product_opportunities?.mutual_funds || []), ...(summary.product_opportunities?.sip_swp_stp || [])]} tone="green" />
                <HighlightCard title="Open Questions" icon={FileQuestion} items={summary.open_questions} tone="amber" />
              </div>
            </section>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={deleteMeetingOpen}
        title="Delete complete meeting note?"
        message={`This will permanently delete "${deleteMeetingTarget?.title || form.title || "this meeting note"}" and its meeting reminders. This action cannot be undone.`}
        confirmLabel="Delete Meeting"
        loading={deletingMeeting}
        onConfirm={deleteMeeting}
        onCancel={() => {
          setDeleteMeetingOpen(false);
          setDeleteMeetingTarget(null);
        }}
      />
    </main>
  );
}
