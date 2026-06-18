"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Bell, CalendarClock, CalendarDays, CheckCircle2, FileText, ShieldQuestion, Umbrella, Users, UsersRound, UserRoundPlus, XCircle } from "lucide-react";
import { authFetch } from "@/lib/authFetch";
import { supabase } from "@/lib/supabaseClient";
import DashboardCharts from "@/components/dashboard/DashboardCharts";
import PageHeader from "@/components/PageHeader";

function birthdayHref(birthday) {
  return birthday.client_id ? `/admin/clients/${birthday.client_id}/client-details` : "/admin/birthdays";
}

function StatCard({ title, value, href, icon: Icon, tone = "blue" }) {
  const tones = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-green-50 text-green-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    violet: "bg-violet-50 text-violet-700",
  };

  const content = (
    <div className="glass-card flex min-h-[104px] items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:bg-white/75 hover:shadow-md">
      <span className={`p-3 rounded-xl ${tones[tone] || tones.blue}`}>
        <Icon size={23} />
      </span>
      <div>
        <p className="text-sm text-gray-600">{title}</p>
        <p className="text-[26px] font-semibold leading-tight text-gray-900">{value}</p>
      </div>
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

function ListCard({ title, items, empty, renderItem }) {
  return (
    <div className="glass-card p-5 space-y-3">
      <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
      {items?.length ? (
        <div className="space-y-2">
          {items.map(renderItem)}
        </div>
      ) : (
        <p className="text-sm text-gray-500">{empty}</p>
      )}
    </div>
  );
}

export default function AdminDashboard() {
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
      .channel("admin-dashboard-task-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, refreshDashboard)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_assignments" }, refreshDashboard)
      .on("postgres_changes", { event: "*", schema: "public", table: "sip_events" }, refreshDashboard)
      .on("postgres_changes", { event: "*", schema: "public", table: "insurance_policies" }, refreshDashboard)
      .subscribe();

    return () => {
      window.removeEventListener("focus", refreshDashboard);
      window.removeEventListener("pageshow", refreshDashboard);
      supabase.removeChannel(dashboardChannel);
    };
  }, [loadDashboard]);

  if (loading) return <div className="p-6 text-gray-500">Loading dashboard...</div>;

  const metrics = data?.metrics || {};

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        eyebrow="Admin workspace"
        title="Admin Dashboard"
        description="Operational overview across clients, documents, tasks, and birthdays."
        icon={Users}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard title="Total Clients" value={metrics.total_clients || 0} href="/admin/clients" icon={UsersRound} tone="green" />
        <StatCard title="New This Month" value={metrics.new_clients_this_month || 0} href="/admin/clients" icon={UserRoundPlus} tone="blue" />
        <StatCard title="Docs To Verify" value={metrics.pending_document_verification || 0} href="/admin/clients" icon={FileText} tone="amber" />
        <StatCard title="Pending Tasks" value={metrics.pending_tasks || 0} href="/dashboard/tasks?status=Pending" icon={Bell} tone="violet" />
        <StatCard title="Overdue Tasks" value={metrics.overdue_tasks || 0} href="/dashboard/tasks" icon={AlertTriangle} tone="red" />
        <StatCard title="Due Today" value={metrics.due_today_tasks || 0} href="/dashboard/tasks" icon={CalendarDays} tone="amber" />
        <StatCard title="Risk Pending" value={metrics.risk_profiling_pending || 0} href="/admin/risk-profiling" icon={ShieldQuestion} tone="violet" />
        <StatCard title="Insurance Due 30 Days" value={metrics.insurance_due_next_30 || 0} href="/admin/insurance" icon={CalendarClock} tone="blue" />
        {/* <StatCard title="Pending Renewals" value={metrics.insurance_pending_renewals || 0} href="/admin/insurance" icon={Umbrella} tone="amber" /> */}
        <StatCard title="SIP Terminated" value={metrics.sip_terminated_total || 0} href="/admin/sip-tracker?event_type=terminated" icon={XCircle} tone="red" />
        <StatCard title="SIP Rejected" value={metrics.sip_rejected_total || 0} href="/admin/sip-tracker?event_type=rejected" icon={AlertTriangle} tone="violet" />
      </div>

      <DashboardCharts data={data} mode="admin" />

      <div className="grid xl:grid-cols-2 gap-5">
        <ListCard
          title="Today’s Birthdays"
          items={data?.birthdays?.today || []}
          empty="No birthdays today."
          renderItem={(birthday) => (
            <Link key={birthday.id} href={birthdayHref(birthday)} className="block rounded-lg border bg-white p-3 hover:bg-blue-50">
              <p className="font-semibold text-blue-700">{birthday.person_name}</p>
              <p className="text-xs text-gray-500">{birthday.client_name}</p>
            </Link>
          )}
        />
      </div>

      <div className="grid xl:grid-cols-2 gap-5">
        <ListCard
          title="Operations Performance"
          items={data?.operations_summary || []}
          empty="No operations users found."
          renderItem={(member) => (
            <div key={member.id} className="rounded-lg border bg-white p-3">
              <div className="flex justify-between">
                <p className="font-medium text-gray-800">{member.name}</p>
                <p className="text-sm text-gray-500">{member.completed}/{member.assigned} done</p>
              </div>
              <p className="text-xs text-gray-500 mt-1">Pending {member.pending} / Overdue {member.overdue}</p>
            </div>
          )}
        />

        <ListCard
          title="Recently Updated Clients"
          items={data?.recent_clients || []}
          empty="No recent clients."
          renderItem={(client) => (
            <Link key={client.id} href={`/admin/clients/${client.id}`} className="flex justify-between rounded-lg border bg-white p-3 hover:bg-blue-50">
              <span className="font-medium text-gray-800">{client.full_name}</span>
              <span className="text-xs text-gray-500">{client.tax_status}</span>
            </Link>
          )}
        />
      </div>

      <div className="flex flex-wrap gap-5">
        <Link href="/admin/team-performance" className="inline-flex items-center gap-2 text-blue-700 font-medium">
          <UsersRound size={16} />
          Open team performance
        </Link>
        <Link href="/admin/birthdays" className="inline-flex items-center gap-2 text-blue-700 font-medium">
          <CheckCircle2 size={16} />
          Open birthday calendar
        </Link>
      </div>
    </div>
  );
}
