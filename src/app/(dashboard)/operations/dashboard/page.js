"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, CalendarDays, ClipboardList, FileText, ListChecks, PauseCircle, Umbrella } from "lucide-react";
import { authFetch } from "@/lib/authFetch";
import { supabase } from "@/lib/supabaseClient";
import DashboardCharts from "@/components/dashboard/DashboardCharts";
import PageHeader from "@/components/PageHeader";
import { formatDateDDMonYYYY } from "@/lib/dateFormat";

function birthdayHref(birthday) {
  return birthday.client_id ? `/admin/clients/${birthday.client_id}/client-details` : "/admin/birthdays";
}

function Card({ title, value, icon: Icon, tone = "blue", href }) {
  const colors = {
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    green: "bg-green-50 text-green-700",
    violet: "bg-violet-50 text-violet-700",
  };
  const body = (
    <div className="glass-card flex min-h-[104px] items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:bg-white/75 hover:shadow-md">
      <span className={`p-3 rounded-xl ${colors[tone] || colors.blue}`}>
        <Icon size={21} />
      </span>
      <div>
        <p className="text-xs text-gray-500">{title}</p>
        <p className="text-[26px] font-semibold leading-tight text-gray-900">{value}</p>
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function List({ title, items, empty, render }) {
  return (
    <div className="glass-card p-5 space-y-3">
      <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
      {items?.length ? <div className="space-y-2">{items.map(render)}</div> : <p className="text-sm text-gray-500">{empty}</p>}
    </div>
  );
}

function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

function displayUserName(data) {
  const name = data?.current_user?.name || "User";
  return String(name).includes("@") ? String(name).split("@")[0] : name;
}

export default function OperationsDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    const response = await authFetch("/api/dashboard", { cache: "no-store" });
    const payload = await response.json();
    if (response.ok) setData(payload);
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const refreshDashboard = () => loadDashboard({ silent: true });
    window.addEventListener("focus", refreshDashboard);
    window.addEventListener("pageshow", refreshDashboard);

    const dashboardChannel = supabase
      .channel("operations-dashboard-task-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, refreshDashboard)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_assignments" }, refreshDashboard)
      .on("postgres_changes", { event: "*", schema: "public", table: "sip_events" }, refreshDashboard)
      .on("postgres_changes", { event: "*", schema: "public", table: "insurance_policies" }, refreshDashboard)
      .on("postgres_changes", { event: "*", schema: "public", table: "operation_self_tasks" }, refreshDashboard)
      .subscribe();

    return () => {
      window.removeEventListener("focus", refreshDashboard);
      window.removeEventListener("pageshow", refreshDashboard);
      supabase.removeChannel(dashboardChannel);
    };
  }, [loadDashboard]);

  if (loading) return <div className="p-6 text-gray-500">Loading operations dashboard...</div>;

  const metrics = data?.metrics || {};

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        eyebrow="Operations workspace"
        title={`${greetingForNow()}, ${displayUserName(data)}`}
        description="Your assigned work, alerts, document actions, and client birthdays."
        icon={ClipboardList}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Card title="Assigned Tasks" value={metrics.pending_tasks || 0} icon={ClipboardList} href="/dashboard/tasks" />
        <Card title="Overdue" value={metrics.overdue_tasks || 0} icon={AlertTriangle} tone="red" href="/dashboard/tasks" />
        <Card title="Due Today" value={metrics.due_today_tasks || 0} icon={CalendarDays} tone="amber" href="/dashboard/tasks" />
        <Card title="My SIP Follow-ups" value={metrics.my_sip_followups_pending || 0} icon={PauseCircle} tone="amber" href="/admin/sip-tracker?follow_up_status=pending" />
        <Card title="SIP Terminated" value={metrics.sip_terminated_total || 0} icon={PauseCircle} tone="red" href="/admin/sip-tracker?event_type=terminated" />
        <Card title="SIP Rejected" value={metrics.sip_rejected_total || 0} icon={AlertTriangle} tone="violet" href="/admin/sip-tracker?event_type=rejected" />
        <Card title="Insurance Due 30 Days" value={metrics.insurance_due_next_30 || 0} icon={CalendarClock} href="/admin/insurance" />
        <Card title="Pending Renewals" value={metrics.insurance_pending_renewals || 0} icon={Umbrella} tone="amber" href="/admin/insurance" />
        <Card title="My Work Pending" value={metrics.self_tasks_pending || 0} icon={ListChecks} tone="violet" href="/operations/my-work-tracker?status=Pending" />
        <Card title="My Work This Week" value={metrics.self_tasks_this_week || 0} icon={CalendarDays} tone="blue" href="/operations/my-work-tracker" />
      </div>

      <DashboardCharts data={data} mode="operations" />

      <div className="grid xl:grid-cols-2 gap-5">
        <List
          title="Recently Assigned Tasks"
          items={data?.recent_tasks || []}
          empty="No assigned tasks."
          render={(task) => (
            <Link key={task.id} href={`/dashboard/tasks/${task.id}`} className="block rounded-lg border bg-white p-3 hover:bg-blue-50">
              <p className="font-medium text-gray-800">{task.title}</p>
              <p className="text-xs text-gray-500">{task.status}{task.due_date ? ` / Due ${formatDateDDMonYYYY(task.due_date, "-")}` : ""}</p>
            </Link>
          )}
        />

        <List
          title="Clients Requiring Document Action"
          items={data?.documents_requiring_action || []}
          empty="No document action required."
          render={(document) => (
            <Link key={document.id} href={`/admin/clients/${document.client_id}/client-details`} className="flex justify-between rounded-lg border bg-white p-3 hover:bg-blue-50">
              <span className="font-medium text-gray-800">{document.document_type}</span>
              <span className="text-sm text-gray-500">{document.status}</span>
            </Link>
          )}
        />
      </div>

      <div className="grid xl:grid-cols-2 gap-5">
        <List
          title="Today’s Birthdays"
          items={data?.birthdays?.today || []}
          empty="No birthdays today."
          render={(birthday) => (
            <Link key={birthday.id} href={birthdayHref(birthday)} className="block rounded-lg border bg-white p-3 hover:bg-blue-50">
              <p className="font-semibold text-blue-700">{birthday.person_name}</p>
              <p className="text-xs text-gray-500">{birthday.client_name}</p>
            </Link>
          )}
        />
      </div>

      <Link href="/admin/birthdays" className="inline-flex items-center gap-2 text-blue-700 font-medium">
        <FileText size={16} />
        Open birthday calendar
      </Link>
    </div>
  );
}
