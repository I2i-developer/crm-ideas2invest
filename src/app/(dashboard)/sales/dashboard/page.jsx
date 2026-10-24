"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BellRing, CalendarClock, CalendarDays, ClipboardList, History, PhoneCall, RefreshCw, UsersRound } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import BrandLoader from "@/components/BrandLoader";
import DashboardCharts from "@/components/dashboard/DashboardCharts";
import { authFetch } from "@/lib/authFetch";
import { supabase } from "@/lib/supabaseClient";
import { formatDateTimeDDMonYYYY } from "@/lib/dateFormat";

const TABLES = ["tasks", "task_assignments", "sales_leads", "sales_activities", "sales_followups", "sales_meetings", "client_meeting_reminders"];
const CARDS = [
  ["assigned_tasks", "Assigned Tasks", ClipboardList, "blue", "/dashboard/tasks"],
  ["overdue_tasks", "Overdue Tasks", AlertTriangle, "red", "/dashboard/tasks"],
  ["due_today_tasks", "Tasks Due Today", CalendarDays, "amber", "/dashboard/tasks"],
  ["my_leads", "My Leads", UsersRound, "green", "/sales"],
  ["pending_followups", "Pending Follow-ups", CalendarClock, "amber", "/sales?view=followups"],
  ["upcoming_meetings", "Upcoming Meetings", CalendarDays, "blue", "/sales?view=calendar"],
  ["self_reminders", "Self Reminders", BellRing, "green", "/admin/reminders"],
  ["calls_today", "Calls Today", PhoneCall, "blue", "/sales?view=eod"],
];
const TONES = { blue: "bg-blue-50 text-blue-700", red: "bg-red-50 text-red-700", amber: "bg-amber-50 text-amber-700", green: "bg-emerald-50 text-emerald-700" };
const leadLink = (row, view) => `/sales?source=${row.lead.source_id}&lead=${row.lead_id}&view=${view}`;

function WorkList({ title, rows, empty, render }) {
  return <section className="glass-card min-w-0 space-y-3 p-5"><h2 className="text-lg font-semibold">{title}</h2>{rows?.length ? <div className="space-y-2">{rows.map(render)}</div> : <p className="text-sm text-gray-500">{empty}</p>}</section>;
}

export default function SalesDashboard() {
  const [data, setData] = useState(null), [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await authFetch("/api/sales/dashboard", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load dashboard");
      setData(payload); setError("");
    } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => {
    load();
    const refresh = () => { if (!document.hidden) load(); };
    const timer = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    let debounce;
    let channel = supabase.channel("sales-dashboard-updates");
    for (const table of TABLES) channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, () => { clearTimeout(debounce); debounce = setTimeout(refresh, 250); });
    channel.subscribe();
    return () => { clearInterval(timer); clearTimeout(debounce); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); supabase.removeChannel(channel); };
  }, [load]);
  if (!data && !error) return <BrandLoader label="Loading sales dashboard" />;
  const hour = Number(new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";
  const itemClass = "block rounded-lg border border-gray-200 bg-white p-3 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800";
  return <div className="space-y-6 p-0 sm:p-6">
    <PageHeader eyebrow="Sales workspace" title={<><span className="text-blue-700">{greeting},</span> <span className="text-emerald-700">{data?.current_user.name || "User"}</span></>} description="Your assigned tasks, leads, follow-ups, meetings and reminders." icon={ClipboardList} actions={<button type="button" onClick={load} title="Refresh dashboard" aria-label="Refresh dashboard" className="rounded-lg border bg-white p-2 text-blue-700 hover:bg-blue-50"><RefreshCw size={18} /></button>} />
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{CARDS.map(([key, label, Icon, tone, href]) => <Link href={href} key={key} className="glass-card flex min-h-[104px] min-w-0 items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-md"><span className={`shrink-0 rounded-xl p-3 ${TONES[tone]}`}><Icon size={21} /></span><div className="min-w-0"><p className="text-xs text-gray-500">{label}</p><p className="text-[26px] font-semibold leading-tight">{data?.metrics[key] || 0}</p></div></Link>)}</div>
    <DashboardCharts data={data} mode="sales" />
    <div className="grid gap-5 xl:grid-cols-2">
      <WorkList title="Recently Assigned Tasks" rows={data?.recent_tasks} empty="No assigned tasks." render={(task) => <Link key={task.id} className={itemClass} href={`/dashboard/tasks/${task.id}`}><p className="font-semibold">{task.title}</p><p className="text-xs text-gray-500">{task.status}</p></Link>} />
      <WorkList title="Upcoming Follow-ups" rows={data?.followups} empty="No pending follow-ups." render={(row) => <Link key={row.id} className={itemClass} href={leadLink(row, "followups")}><p className="font-semibold">{row.lead.name}</p><p className="text-xs text-gray-500">{row.title} / {formatDateTimeDDMonYYYY(row.due_at)}</p></Link>} />
      <WorkList title="Scheduled Meetings" rows={data?.meetings} empty="No upcoming meetings." render={(row) => <Link key={row.id} className={itemClass} href={leadLink(row, "calendar")}><p className="font-semibold">{row.lead.name}</p><p className="text-xs text-gray-500">{formatDateTimeDDMonYYYY(row.starts_at)}</p></Link>} />
      <WorkList title="Self Reminders" rows={data?.reminders} empty="No active reminders." render={(row) => <Link key={row.id} className={itemClass} href="/admin/reminders"><p className="font-semibold">{row.title}</p><p className="text-xs text-gray-500">{formatDateTimeDDMonYYYY(row.snoozed_until || row.reminder_at)}</p></Link>} />
    </div>
    <Link href="/sales/eod-report" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-300"><History size={16} />EOD Reports ({data?.metrics.historical_eod_reports || 0})</Link>
  </div>;
}
