"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, CheckCircle2, ClipboardCheck, Edit3, Save, SendHorizontal, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import PageHeader from "@/components/PageHeader";
import { authFetch } from "@/lib/authFetch";
import FormInput from "@/app/(dashboard)/admin/clients/components/FormInput";
import FormSelect from "@/app/(dashboard)/admin/clients/components/FormSelect";
import { formatDateDDMonYYYY, formatDateTimeDDMonYYYY } from "@/lib/dateFormat";

const emptyForm = {
  report_date: "",
  work_summary: "",
  completed_work: "",
  pending_work: "",
  blockers: "",
  tomorrow_plan: "",
  client_followups: "",
  tasks_completed: 0,
  tasks_pending: 0,
};

function statusClass(status) {
  const styles = {
    Draft: "border-slate-200 bg-slate-50 text-slate-700",
    Submitted: "border-blue-100 bg-blue-50 text-blue-700",
    Reviewed: "border-emerald-100 bg-emerald-50 text-emerald-700",
  };
  return styles[status] || styles.Submitted;
}

function numberValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function completedItems(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim().replace(/^\d+[\).]\s*/, ""))
    .filter(Boolean);
}

function NumberedText({ text }) {
  const items = completedItems(text);
  if (!items.length) return null;
  return (
    <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-6 text-slate-700">
      {items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
    </ol>
  );
}

export default function OperationsEodReportPage() {
  const [reports, setReports] = useState([]);
  const [summary, setSummary] = useState({});
  const [today, setToday] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [editOverlayOpen, setEditOverlayOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [filters, setFilters] = useState({ status: "", date_from: "", date_to: "", search: "" });
  const initializedFormRef = useRef(false);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      const response = await authFetch(`/api/operations/eod-reports?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load EOD reports");
      setReports(data.reports || []);
      setSummary(data.summary || {});
      setToday(data.today || new Date().toISOString().slice(0, 10));
      if (!initializedFormRef.current) {
        initializedFormRef.current = true;
        const todayReport = (data.reports || []).find((report) => report.report_date === data.today);
        if (todayReport) {
          setForm({
            report_date: todayReport.report_date || data.today,
            work_summary: todayReport.work_summary || "",
            completed_work: todayReport.completed_work || "",
            pending_work: todayReport.pending_work || "",
            blockers: todayReport.blockers || "",
            tomorrow_plan: todayReport.tomorrow_plan || "",
            client_followups: todayReport.client_followups || "",
            tasks_completed: numberValue(todayReport.tasks_completed),
            tasks_pending: numberValue(todayReport.tasks_pending),
          });
        } else {
          setForm((current) => ({ ...current, report_date: data.today || new Date().toISOString().slice(0, 10) }));
        }
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  function setField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function resetForm() {
    setEditingId("");
    setEditOverlayOpen(false);
    setForm({ ...emptyForm, report_date: today || new Date().toISOString().slice(0, 10) });
  }

  function editReport(report) {
    setEditingId(report.id);
    setForm({
      report_date: report.report_date || today,
      work_summary: report.work_summary || "",
      completed_work: report.completed_work || "",
      pending_work: report.pending_work || "",
      blockers: report.blockers || "",
      tomorrow_plan: report.tomorrow_plan || "",
      client_followups: report.client_followups || "",
      tasks_completed: numberValue(report.tasks_completed),
      tasks_pending: numberValue(report.tasks_pending),
    });
    setEditOverlayOpen(true);
  }

  async function submitReport(event, statusOverride = null) {
    event.preventDefault();
    setSaving(true);
    const isEditing = Boolean(editingId);
    try {
      const payload = {
        ...form,
        status: statusOverride || "Submitted",
        tasks_completed: numberValue(form.tasks_completed),
        tasks_pending: numberValue(form.tasks_pending),
      };
      const response = await authFetch(editingId ? `/api/operations/eod-reports/${editingId}` : "/api/operations/eod-reports", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save EOD report");
      toast.success(payload.status === "Draft" ? "EOD draft saved" : "EOD report submitted");
      if (isEditing) resetForm();
      await loadReports();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteReport() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const response = await authFetch(`/api/operations/eod-reports/${deleteTarget.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to delete EOD report");
      toast.success("EOD report hidden from your list");
      if (editingId === deleteTarget.id) resetForm();
      setDeleteTarget(null);
      await loadReports();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  const cards = useMemo(() => [
    ["Total reports", summary.total || 0, "bg-blue-50 text-blue-700"],
    ["Submitted", summary.submitted || 0, "bg-indigo-50 text-indigo-700"],
    ["Reviewed", summary.reviewed || 0, "bg-emerald-50 text-emerald-700"],
    ["Drafts", summary.drafts || 0, "bg-slate-50 text-slate-700"],
  ], [summary]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operations EOD"
        title="End of Day Report"
        description="Submit your daily work summary, pending items, blockers, and next-day plan for admin review."
        icon={ClipboardCheck}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, tone]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className={`inline-flex rounded-lg px-2 py-1 text-xs font-bold ${tone}`}>{label}</span>
            <p className="mt-2 text-3xl font-bold text-slate-950">{value}</p>
          </div>
        ))}
      </section>

      <form onSubmit={submitReport} className="rounded-2xl border border-blue-100 bg-gradient-to-br from-white via-blue-50/60 to-emerald-50/50 p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Create EOD report</h2>
            <p className="text-sm text-slate-600">One EOD report is maintained per date. Saving the same date updates the existing report.</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <FormInput label="Report Date" name="report_date" type="date" required maxDate={today} value={form.report_date} onValueChange={(value) => setField("report_date", value)} />
          <FormInput label="Tasks Completed" name="tasks_completed" type="number" value={form.tasks_completed} onValueChange={(value) => setField("tasks_completed", value)} />
          <FormInput label="Tasks Pending" name="tasks_pending" type="number" value={form.tasks_pending} onValueChange={(value) => setField("tasks_pending", value)} />
          <div className="lg:col-span-3">
            <FormInput label="Overall Work Summary" name="work_summary" multiline rows={3} value={form.work_summary} onValueChange={(value) => setField("work_summary", value)} />
          </div>
          <div className="lg:col-span-3">
            <FormInput label="Completed Work (one item per line)" name="completed_work" required multiline rows={4} value={form.completed_work} onValueChange={(value) => setField("completed_work", value)} />
          </div>
          <FormInput label="Pending Work" name="pending_work" multiline rows={3} value={form.pending_work} onValueChange={(value) => setField("pending_work", value)} />
          <FormInput label="Blockers / Support Needed" name="blockers" multiline rows={3} value={form.blockers} onValueChange={(value) => setField("blockers", value)} />
          <FormInput label="Tomorrow's Plan" name="tomorrow_plan" multiline rows={3} value={form.tomorrow_plan} onValueChange={(value) => setField("tomorrow_plan", value)} />
          <div className="lg:col-span-3">
            <FormInput label="Client Follow-ups / Important Notes" name="client_followups" multiline rows={3} value={form.client_followups} onValueChange={(value) => setField("client_followups", value)} />
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" disabled={saving} onClick={(event) => submitReport(event, "Draft")} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60">
            <Save size={16} /> Save Draft
          </button>
          <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60">
            <SendHorizontal size={16} /> {saving ? "Saving..." : "Submit EOD"}
          </button>
        </div>
      </form>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <FormInput name="search" placeholder="Search reports" value={filters.search} onValueChange={(value) => setFilters((current) => ({ ...current, search: value }))} />
            <FormSelect name="status_filter" value={filters.status} onValueChange={(value) => setFilters((current) => ({ ...current, status: value }))} includeAll allLabel="All status" options={["Draft", "Submitted", "Reviewed"]} />
            <FormInput name="date_from" type="date" placeholder="From date" value={filters.date_from} onValueChange={(value) => setFilters((current) => ({ ...current, date_from: value }))} />
            <FormInput name="date_to" type="date" placeholder="To date" value={filters.date_to} onValueChange={(value) => setFilters((current) => ({ ...current, date_to: value }))} />
          </div>
        </div>

        <div className="grid gap-3 p-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">Loading EOD reports...</p>
          ) : !reports.length ? (
            <p className="py-8 text-center text-sm text-slate-500">No EOD reports found.</p>
          ) : reports.map((report) => (
            <article key={report.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusClass(report.status)}`}>{report.status}</span>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-700"><CalendarDays size={15} /> {formatDateDDMonYYYY(report.report_date)}</span>
                    {report.submitted_at && <span className="text-xs text-slate-500">Submitted {formatDateTimeDDMonYYYY(report.submitted_at)}</span>}
                  </div>
                  <h3 className="mt-3 text-base font-bold text-slate-950">{report.work_summary}</h3>
                  <NumberedText text={report.completed_work} />
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button type="button" onClick={() => editReport(report)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-700">
                    <Edit3 size={15} /> Edit
                  </button>
                  <button type="button" onClick={() => setDeleteTarget(report)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-100">
                    <Trash2 size={15} /> Delete
                  </button>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <p className="rounded-xl bg-white p-3 text-sm text-slate-700"><strong>Pending:</strong><br />{report.pending_work || "-"}</p>
                <p className="rounded-xl bg-white p-3 text-sm text-slate-700"><strong>Blockers:</strong><br />{report.blockers || "-"}</p>
                <p className="rounded-xl bg-white p-3 text-sm text-slate-700"><strong>Tomorrow:</strong><br />{report.tomorrow_plan || "-"}</p>
              </div>
              {report.review_note && (
                <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800">
                  <strong>Admin review:</strong> {report.review_note}
                </div>
              )}
              {report.status === "Reviewed" && <p className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-emerald-700"><CheckCircle2 size={14} /> Reviewed by admin</p>}
            </article>
          ))}
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Hide EOD report?"
        message={`This will hide the EOD report for ${formatDateDDMonYYYY(deleteTarget?.report_date)} from your list. Admins can still view it.`}
        confirmLabel="Hide report"
        loading={saving}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={deleteReport}
      />

      {editOverlayOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 px-3 py-6 backdrop-blur-sm">
          <form onSubmit={submitReport} className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Edit EOD report</p>
                <h2 className="mt-1 text-lg font-bold text-slate-950">{formatDateDDMonYYYY(form.report_date)}</h2>
              </div>
              <button type="button" onClick={resetForm} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100" aria-label="Close edit EOD report">
                <X size={18} />
              </button>
            </div>
            <div className="max-h-[calc(92vh-88px)] overflow-y-auto p-4 sm:p-5">
              <div className="grid gap-4 lg:grid-cols-3">
                <FormInput label="Report Date" name="edit_report_date" type="date" required maxDate={today} value={form.report_date} onValueChange={(value) => setField("report_date", value)} />
                <FormInput label="Tasks Completed" name="edit_tasks_completed" type="number" value={form.tasks_completed} onValueChange={(value) => setField("tasks_completed", value)} />
                <FormInput label="Tasks Pending" name="edit_tasks_pending" type="number" value={form.tasks_pending} onValueChange={(value) => setField("tasks_pending", value)} />
                <div className="lg:col-span-3">
                  <FormInput label="Overall Work Summary" name="edit_work_summary" multiline rows={3} value={form.work_summary} onValueChange={(value) => setField("work_summary", value)} />
                </div>
                <div className="lg:col-span-3">
                  <FormInput label="Completed Work (one item per line)" name="edit_completed_work" required multiline rows={4} value={form.completed_work} onValueChange={(value) => setField("completed_work", value)} />
                </div>
                <FormInput label="Pending Work" name="edit_pending_work" multiline rows={3} value={form.pending_work} onValueChange={(value) => setField("pending_work", value)} />
                <FormInput label="Blockers / Support Needed" name="edit_blockers" multiline rows={3} value={form.blockers} onValueChange={(value) => setField("blockers", value)} />
                <FormInput label="Tomorrow's Plan" name="edit_tomorrow_plan" multiline rows={3} value={form.tomorrow_plan} onValueChange={(value) => setField("tomorrow_plan", value)} />
                <div className="lg:col-span-3">
                  <FormInput label="Client Follow-ups / Important Notes" name="edit_client_followups" multiline rows={3} value={form.client_followups} onValueChange={(value) => setField("client_followups", value)} />
                </div>
              </div>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={resetForm} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60">
                  Cancel
                </button>
                <button type="button" disabled={saving} onClick={(event) => submitReport(event, "Draft")} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60">
                  <Save size={16} /> Save Draft
                </button>
                <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60">
                  <SendHorizontal size={16} /> {saving ? "Saving..." : "Update EOD"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
