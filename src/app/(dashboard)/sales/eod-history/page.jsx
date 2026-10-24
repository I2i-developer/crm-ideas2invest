"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, History, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import BrandLoader from "@/components/BrandLoader";
import { authFetch } from "@/lib/authFetch";
import { formatDateDDMonYYYY } from "@/lib/dateFormat";

const FIELDS = [["work_summary", "Overall Work Summary"], ["completed_work", "Completed Work"], ["pending_work", "Pending Work"], ["blockers", "Blockers"], ["tomorrow_plan", "Tomorrow's Plan"], ["client_followups", "Client Follow-ups"], ["review_note", "Review Notes"]];

export default function SalesEodHistory() {
  const [reports, setReports] = useState(null), [selected, setSelected] = useState(null), [error, setError] = useState("");
  const dialog = useRef(null);
  useEffect(() => {
    let alive = true;
    authFetch("/api/operations/eod-reports", { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load history");
      if (alive) setReports(data.reports || []);
    }).catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, []);
  useEffect(() => { if (selected) dialog.current?.showModal(); }, [selected]);
  const close = () => { dialog.current?.close(); setSelected(null); };
  return <div className="space-y-5">
    <PageHeader eyebrow="My reports" title="EOD History" icon={History} />
    {error && <p role="alert" className="bg-red-50 p-4 text-red-700">{error}</p>}
    {!reports && !error ? <BrandLoader label="Loading EOD history" /> : <div className="divide-y divide-gray-200 dark:divide-slate-700">{reports?.map((report) => <article key={report.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><h2 className="font-semibold">{formatDateDDMonYYYY(report.report_date)}</h2><p className="text-sm text-gray-500">{report.status}{report.reviewed_by_profile?.name ? ` / Reviewed by ${report.reviewed_by_profile.name}` : ""}</p></div><button type="button" className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100" onClick={() => setSelected(report)}><Eye size={16} />View</button></article>)}{reports?.length === 0 && <p className="py-8 text-center text-gray-500">No EOD reports.</p>}</div>}
    <dialog ref={dialog} onCancel={close} className="m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-lg border border-gray-200 bg-white p-0 text-gray-900 shadow-xl backdrop:bg-black/40 dark:border-slate-700 dark:bg-slate-900 dark:text-white" aria-labelledby="eod-history-title">
      {selected && <><div className="sticky top-0 flex items-center justify-between gap-4 border-b border-gray-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900"><h2 id="eod-history-title" className="font-semibold">EOD / {formatDateDDMonYYYY(selected.report_date)}</h2><button type="button" aria-label="Close EOD report" onClick={close} className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-slate-800"><X size={18} /></button></div><div className="space-y-5 p-5">{FIELDS.filter(([key]) => selected[key]?.trim()).map(([key, label]) => <section key={key}><h3 className="text-sm font-semibold text-blue-700 dark:text-blue-300">{label}</h3>{key === "completed_work" ? <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">{selected[key].split(/\r?\n/).filter((line) => line.trim()).map((line, index) => <li key={index}>{line.replace(/^\s*\d+[).]\s*/, "")}</li>)}</ol> : <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{selected[key]}</p>}</section>)}{["tasks_completed", "tasks_pending"].filter((key) => Number(selected[key]) > 0).map((key) => <p key={key} className="text-sm">{key === "tasks_completed" ? "Tasks completed" : "Tasks pending"}: {selected[key]}</p>)}</div></>}
    </dialog>
  </div>;
}
