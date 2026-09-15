"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  AlarmClock,
  BellRing,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Link2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import FormInput from "@/app/(dashboard)/admin/clients/components/FormInput";
import FormSelect from "@/app/(dashboard)/admin/clients/components/FormSelect";
import { authFetch } from "@/lib/authFetch";
import { supabase } from "@/lib/supabaseClient";
import { formatDateTimeDDMonYYYY } from "@/lib/dateFormat";

const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
const STATUS_FILTERS = [
  { value: "active", label: "Active" },
  { value: "Pending", label: "Pending" },
  { value: "Snoozed", label: "Snoozed" },
  { value: "Completed", label: "Completed" },
  { value: "Cancelled", label: "Cancelled" },
  { value: "all", label: "All reminders" },
];
const DUE_FILTERS = [
  { value: "all", label: "All due dates" },
  { value: "now", label: "Due now" },
  { value: "today", label: "Due today" },
  { value: "upcoming", label: "Upcoming" },
];

function localDateTimeInput(minutesFromNow = 60) {
  const date = new Date(Date.now() + minutesFromNow * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function inputValueFromIso(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function effectiveReminderAt(reminder) {
  if (reminder?.status === "Snoozed" && reminder.snoozed_until) return reminder.snoozed_until;
  return reminder?.reminder_at;
}

function priorityTone(priority) {
  if (priority === "Urgent") return "border-red-200 bg-red-50 text-red-700";
  if (priority === "High") return "border-amber-200 bg-amber-50 text-amber-700";
  if (priority === "Low") return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function statusTone(status) {
  if (status === "Completed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "Snoozed") return "border-violet-200 bg-violet-50 text-violet-700";
  if (status === "Cancelled") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function SummaryCard({ title, value, icon: Icon, tone = "blue" }) {
  const tones = {
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    green: "bg-emerald-50 text-emerald-700",
    violet: "bg-violet-50 text-violet-700",
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center gap-3">
        <span className={`rounded-xl p-3 ${tones[tone] || tones.blue}`}>
          <Icon size={20} />
        </span>
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-300">{title}</p>
          <p className="text-2xl font-bold text-slate-950 dark:text-white">{value || 0}</p>
        </div>
      </div>
    </div>
  );
}

export default function SelfRemindersPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [summary, setSummary] = useState({});
  const [filters, setFilters] = useState({ status: "active", due: "all", search: "" });
  const [draft, setDraft] = useState({
    title: "",
    reminder_at: localDateTimeInput(),
    priority: "Medium",
    client_id: "",
    notes: "",
  });

  const clientOptions = useMemo(
    () => [
      { value: "", label: "No client linked" },
      ...clients.map((client) => ({ value: client.id, label: client.full_name })),
    ],
    [clients]
  );
  const priorityOptions = PRIORITIES.map((priority) => ({ value: priority, label: priority }));

  async function loadClients() {
    const { data } = await supabase
      .from("clients")
      .select("id, full_name, email, mobile")
      .order("full_name", { ascending: true })
      .limit(1000);
    setClients(data || []);
  }

  async function loadReminders(nextFilters = filters) {
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(nextFilters).forEach(([key, value]) => {
      if (value && value !== "all") params.set(key, value);
    });

    const response = await authFetch(`/api/self-reminders?${params.toString()}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(data.error || "Failed to load reminders");
    } else {
      setReminders(data.reminders || []);
      setSummary(data.summary || {});
    }
    setLoading(false);
  }

  useEffect(() => {
    loadClients();
    loadReminders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => loadReminders(filters), 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.status, filters.due, filters.search]);

  async function createReminder(event) {
    event.preventDefault();
    if (!draft.title.trim()) return toast.error("Reminder title is required");
    if (!draft.reminder_at) return toast.error("Reminder date/time is required");

    setSaving(true);
    const response = await authFetch("/api/self-reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = await response.json().catch(() => ({}));
    setSaving(false);

    if (!response.ok) {
      toast.error(data.error || "Failed to create reminder");
      return;
    }

    toast.success("Reminder created");
    setDraft({ title: "", reminder_at: localDateTimeInput(), priority: "Medium", client_id: "", notes: "" });
    await loadReminders();
  }

  async function updateReminder(reminderId, payload, successMessage) {
    const response = await authFetch(`/api/self-reminders/${reminderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(data.error || "Failed to update reminder");
      return;
    }
    if (successMessage) toast.success(successMessage);
    await loadReminders();
  }

  async function deleteReminder(reminder) {
    if (!window.confirm(`Delete "${reminder.title}"?`)) return;
    const response = await authFetch(`/api/self-reminders/${reminder.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(data.error || "Failed to delete reminder");
      return;
    }
    toast.success("Reminder deleted");
    await loadReminders();
  }

  return (
    <main className="space-y-6 p-6">
      <PageHeader
        eyebrow="Personal workspace"
        title="Self Reminders"
        description="Create personal CRM reminders, link them to clients, and receive due alerts through CRM notifications and web push."
        icon={BellRing}
        actions={
          <button
            type="button"
            onClick={() => loadReminders()}
            className="inline-flex items-center gap-2 rounded-xl border border-white bg-white/80 px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-white"
          >
            <RefreshCw size={16} /> Refresh
          </button>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="Due now" value={summary.due_now} icon={AlarmClock} tone="amber" />
        <SummaryCard title="Due today" value={summary.due_today} icon={CalendarClock} tone="blue" />
        <SummaryCard title="Pending" value={summary.pending} icon={Clock3} tone="violet" />
        <SummaryCard title="Completed" value={summary.completed} icon={CheckCircle2} tone="green" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
        <form onSubmit={createReminder} className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-blue-600 dark:text-blue-300">Create reminder</p>
            <h2 className="mt-1 text-lg font-bold text-slate-950 dark:text-white">New self reminder</h2>
          </div>

          <div className="mt-5 space-y-4">
            <FormInput
              label="Title"
              value={draft.title}
              onValueChange={(value) => setDraft((current) => ({ ...current, title: value }))}
              placeholder="Example: Call client for pending KYC"
              required
            />
            <FormInput
              label="Reminder Date/Time"
              type="datetime-local"
              value={draft.reminder_at}
              onValueChange={(value) => setDraft((current) => ({ ...current, reminder_at: value }))}
              required
            />
            <FormSelect
              label="Priority"
              value={draft.priority}
              options={priorityOptions}
              onValueChange={(value) => setDraft((current) => ({ ...current, priority: value }))}
            />
            <FormSelect
              label="Link Client"
              value={draft.client_id}
              options={clientOptions}
              onValueChange={(value) => setDraft((current) => ({ ...current, client_id: value }))}
              isSearchable
            />
            <FormInput
              label="Notes"
              value={draft.notes}
              onValueChange={(value) => setDraft((current) => ({ ...current, notes: value }))}
              placeholder="Optional context"
              multiline
              rows={3}
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-70"
          >
            <Plus size={17} /> {saving ? "Creating..." : "Create Reminder"}
          </button>
        </form>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="grid items-end gap-3 lg:grid-cols-[170px_170px_minmax(260px,1fr)]">
            <FormSelect
              label="Status"
              value={filters.status}
              options={STATUS_FILTERS}
              onValueChange={(value) => setFilters((current) => ({ ...current, status: value }))}
            />
            <FormSelect
              label="Due"
              value={filters.due}
              options={DUE_FILTERS}
              onValueChange={(value) => setFilters((current) => ({ ...current, due: value }))}
            />
            <label className="block">
              <span className="mb-1 ml-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Search</span>
              <span className="relative block">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={filters.search}
                  onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                  placeholder="Search title or notes"
                  className="h-[42px] w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </span>
            </label>
          </div>

          <div className="mt-5 space-y-3">
            {loading ? (
              <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-300">Loading reminders...</p>
            ) : reminders.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-300">No reminders found.</p>
            ) : (
              reminders.map((reminder) => {
                const dueAt = effectiveReminderAt(reminder);
                const isDue = ["Pending", "Snoozed"].includes(reminder.status) && dueAt && dueAt <= new Date().toISOString();

                return (
                  <article key={reminder.id} className={`rounded-2xl border p-4 transition ${isDue ? "border-amber-200 bg-amber-50/60 dark:border-amber-300/40 dark:bg-amber-400/10" : "border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-950"}`}>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-bold text-slate-950 dark:text-white">{reminder.title}</h3>
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusTone(reminder.status)}`}>{reminder.status}</span>
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${priorityTone(reminder.priority)}`}>{reminder.priority}</span>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                          {reminder.status === "Snoozed" && reminder.snoozed_until ? "Snoozed until " : "Due "}
                          {formatDateTimeDDMonYYYY(dueAt, "-")}
                        </p>
                        {reminder.client && (
                          <Link href={`/admin/clients/${reminder.client.id}`} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline dark:text-blue-200">
                            <Link2 size={14} /> {reminder.client.full_name}
                          </Link>
                        )}
                        {reminder.notes && <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{reminder.notes}</p>}
                      </div>

                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        {reminder.status !== "Completed" && reminder.status !== "Cancelled" && (
                          <button type="button" onClick={() => updateReminder(reminder.id, { status: "Completed" }, "Reminder completed")} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">
                            <CheckCircle2 size={14} /> Done
                          </button>
                        )}
                        {reminder.status !== "Completed" && reminder.status !== "Cancelled" && (
                          <button type="button" onClick={() => updateReminder(reminder.id, { status: "Snoozed", snooze_minutes: 1440 }, "Reminder snoozed")} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 hover:bg-violet-100">
                            <Clock3 size={14} /> Snooze 1 day
                          </button>
                        )}
                        {(reminder.status === "Completed" || reminder.status === "Cancelled") && (
                          <button type="button" onClick={() => updateReminder(reminder.id, { status: "Pending", reminder_at: inputValueFromIso(reminder.reminder_at) || localDateTimeInput(30) }, "Reminder reopened")} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100">
                            <RefreshCw size={14} /> Reopen
                          </button>
                        )}
                        {reminder.status !== "Cancelled" && reminder.status !== "Completed" && (
                          <button type="button" onClick={() => updateReminder(reminder.id, { status: "Cancelled" }, "Reminder cancelled")} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                            <XCircle size={14} /> Cancel
                          </button>
                        )}
                        <button type="button" onClick={() => deleteReminder(reminder)} className="inline-flex items-center gap-1 rounded-lg border border-red-100 bg-white px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 dark:border-red-300/40 dark:bg-slate-900 dark:text-red-100">
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
