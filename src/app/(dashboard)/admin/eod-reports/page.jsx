"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, Eye, MessageSquareText, Search, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import PageHeader from "@/components/PageHeader";
import { authFetch } from "@/lib/authFetch";
import FormInput from "@/app/(dashboard)/admin/clients/components/FormInput";
import FormSelect from "@/app/(dashboard)/admin/clients/components/FormSelect";
import { formatDateDDMonYYYY, formatDateTimeDDMonYYYY } from "@/lib/dateFormat";

function statusClass(status) {
  const styles = {
    Draft: "border-slate-200 bg-slate-50 text-slate-700",
    Submitted: "border-blue-100 bg-blue-50 text-blue-700",
    Reviewed: "border-emerald-100 bg-emerald-50 text-emerald-700",
  };
  return styles[status] || styles.Submitted;
}

function hasText(value) {
  return String(value || "").trim().length > 0;
}

function positiveCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0;
}

function completedItems(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim().replace(/^\d+[\).]\s*/, ""))
    .filter(Boolean);
}

function NumberedText({ text, className = "" }) {
  const items = completedItems(text);
  if (!items.length) return null;
  return (
    <ol className={`list-decimal space-y-1.5 pl-5 text-sm leading-6 text-slate-700 ${className}`}>
      {items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
    </ol>
  );
}

export default function AdminEodReportsPage() {
  const [reports, setReports] = useState([]);
  const [summary, setSummary] = useState({});
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewReport, setViewReport] = useState(null);
  const [reviewingId, setReviewingId] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filters, setFilters] = useState({
    search: "",
    user_id: "",
    status: "",
    date_from: "",
    date_to: "",
  });

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
      setUsers(data.users || []);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  async function markReviewed(report) {
    setSaving(true);
    try {
      const response = await authFetch(`/api/operations/eod-reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Reviewed", review_note: reviewingId === report.id ? reviewNote : report.review_note || "" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to review EOD report");
      toast.success("EOD report marked reviewed");
      setReviewingId("");
      setReviewNote("");
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
      toast.success("EOD report permanently deleted");
      if (viewReport?.id === deleteTarget.id) setViewReport(null);
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
    ["Today submitted", summary.today_submitted || 0, "bg-amber-50 text-amber-700"],
  ], [summary]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Admin review"
        title="Operations EOD Reports"
        description="Review daily end-of-day reports submitted by operations users."
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

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))]">
          <div className="relative">
            <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Search reports, blockers, follow-ups"
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <FormSelect
            name="user_id"
            value={filters.user_id}
            onValueChange={(value) => setFilters((current) => ({ ...current, user_id: value }))}
            includeAll
            allLabel="All users"
            options={users.map((user) => ({ value: user.id, label: user.name }))}
          />
          <FormSelect
            name="status"
            value={filters.status}
            onValueChange={(value) => setFilters((current) => ({ ...current, status: value }))}
            includeAll
            allLabel="All status"
            options={["Draft", "Submitted", "Reviewed"]}
          />
          <FormInput name="date_from" type="date" value={filters.date_from} onValueChange={(value) => setFilters((current) => ({ ...current, date_from: value }))} />
          <FormInput name="date_to" type="date" value={filters.date_to} onValueChange={(value) => setFilters((current) => ({ ...current, date_to: value }))} />
        </div>
      </section>

      <section className="grid gap-3">
        {loading ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading EOD reports...</p>
        ) : !reports.length ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No EOD reports found.</p>
        ) : reports.map((report) => {
          const reviewing = reviewingId === report.id;
          const metricCards = [
            ["Documents", report.documents_processed],
            ["Tasks Done", report.tasks_completed],
            ["Tasks Pending", report.tasks_pending],
          ].filter(([, value]) => positiveCount(value));
          const details = [
            ["Pending Work", report.pending_work],
            ["Blockers / Support Needed", report.blockers],
            ["Tomorrow's Plan", report.tomorrow_plan],
            ["Client Follow-ups", report.client_followups],
          ].filter(([, value]) => hasText(value));
          return (
            <article key={report.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusClass(report.status)}`}>{report.status}</span>
                    <span className="text-sm font-bold text-slate-900">{formatDateDDMonYYYY(report.report_date)}</span>
                    <span className="text-sm text-slate-500">by {report.created_by_profile?.name || "Operations user"}</span>
                    {report.submitted_at && <span className="text-xs text-slate-500">Submitted {formatDateTimeDDMonYYYY(report.submitted_at)}</span>}
                  </div>
                  <h2 className="mt-3 text-base font-bold text-slate-950">{report.work_summary || "EOD report"}</h2>
                  <NumberedText text={report.completed_work} className="mt-2" />
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button type="button" onClick={() => setViewReport(report)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
                    <Eye size={15} /> View
                  </button>
                  <button type="button" onClick={() => { setReviewingId(reviewing ? "" : report.id); setReviewNote(report.review_note || ""); }} className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100">
                    <MessageSquareText size={15} /> Review
                  </button>
                  <button type="button" onClick={() => setDeleteTarget(report)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-100">
                    <Trash2 size={15} /> Delete
                  </button>
                </div>
              </div>

              {metricCards.length > 0 && (
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {metricCards.map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
                      <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
                    </div>
                  ))}
                </div>
              )}

              {reviewing && (
                <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                  <FormInput label="Admin Review Note" name={`review_${report.id}`} multiline rows={3} value={reviewNote} onValueChange={setReviewNote} />
                  <div className="mt-3 flex justify-end">
                    <button type="button" disabled={saving} onClick={() => markReviewed(report)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60">
                      <CheckCircle2 size={16} /> {saving ? "Saving..." : "Mark Reviewed"}
                    </button>
                  </div>
                </div>
              )}

              {report.review_note && !reviewing && (
                <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800">
                  <strong>Review note:</strong> {report.review_note}
                </div>
              )}
            </article>
          );
        })}
      </section>

      <EodViewOverlay report={viewReport} onClose={() => setViewReport(null)} />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Permanently delete EOD report?"
        message={`This will permanently delete the EOD report for ${formatDateDDMonYYYY(deleteTarget?.report_date)} from the database.`}
        confirmLabel="Delete permanently"
        loading={saving}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={deleteReport}
      />
    </div>
  );
}

function EodViewOverlay({ report, onClose }) {
  if (!report) return null;

  const metricCards = [
    ["Documents", report.documents_processed],
    ["Tasks Done", report.tasks_completed],
    ["Tasks Pending", report.tasks_pending],
  ].filter(([, value]) => positiveCount(value));
  const details = [
    ["Pending Work", report.pending_work],
    ["Blockers / Support Needed", report.blockers],
    ["Tomorrow's Plan", report.tomorrow_plan],
    ["Client Follow-ups", report.client_followups],
  ].filter(([, value]) => hasText(value));

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 px-3 py-6 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusClass(report.status)}`}>{report.status}</span>
              <span className="text-sm font-bold text-slate-900">{formatDateDDMonYYYY(report.report_date)}</span>
              <span className="text-sm text-slate-500">by {report.created_by_profile?.name || "Operations user"}</span>
            </div>
            <h2 className="mt-3 text-lg font-bold text-slate-950">{report.work_summary || "EOD report"}</h2>
            {report.submitted_at && <p className="mt-1 text-xs text-slate-500">Submitted {formatDateTimeDDMonYYYY(report.submitted_at)}</p>}
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100" aria-label="Close EOD report">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[calc(92vh-96px)] overflow-y-auto p-4 sm:p-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Completed Work</p>
            <NumberedText text={report.completed_work} className="mt-3" />
          </section>

          {metricCards.length > 0 && (
            <section className="mt-4 grid gap-3 sm:grid-cols-3">
              {metricCards.map(([label, value]) => (
                <div key={label} className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
                </div>
              ))}
            </section>
          )}

          {details.length > 0 && (
            <section className="mt-4 grid gap-3 md:grid-cols-2">
              {details.map(([label, value]) => <Detail key={label} label={label} value={value} />)}
            </section>
          )}

          {report.review_note && (
            <section className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800">
              <strong>Review note:</strong> {report.review_note}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{value}</p>
    </div>
  );
}
