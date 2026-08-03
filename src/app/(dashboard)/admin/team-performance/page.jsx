"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FilterX,
  RefreshCcw,
  TimerReset,
  UsersRound,
  X,
} from "lucide-react";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import toast from "react-hot-toast";
import { authFetch } from "@/lib/authFetch";
import PageHeader from "@/components/PageHeader";
import FormSelect from "../clients/components/FormSelect";
import { formatDateDDMonYYYY, formatDateTimeDDMonYYYY } from "@/lib/dateFormat";

ChartJS.register(ArcElement, BarElement, CategoryScale, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip);

const initialFilters = {
  user_id: "",
  status: "",
  priority: "",
  client_id: "",
  assigned_by: "",
  date_from: "",
  date_to: "",
  due_from: "",
  due_to: "",
  completed_from: "",
  completed_to: "",
};

const colors = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2", "#64748b"];
const DONE_BY_COLORS = [
  "border-blue-100 bg-blue-50 text-blue-700 dark:border-blue-400/30 dark:bg-blue-500/15 dark:text-blue-200",
  "border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-200",
  "border-violet-100 bg-violet-50 text-violet-700 dark:border-violet-400/30 dark:bg-violet-500/15 dark:text-violet-200",
  "border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-200",
  "border-rose-100 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/15 dark:text-rose-200",
  "border-cyan-100 bg-cyan-50 text-cyan-700 dark:border-cyan-400/30 dark:bg-cyan-500/15 dark:text-cyan-200",
];

function selfStatusClass(status) {
  const styles = {
    Pending: "bg-amber-50 text-amber-700 border-amber-100 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-200",
    "In progress": "bg-blue-50 text-blue-700 border-blue-100 dark:border-blue-400/30 dark:bg-blue-500/15 dark:text-blue-200",
    Done: "bg-emerald-50 text-emerald-700 border-emerald-100 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-200",
    "On hold": "bg-slate-50 text-slate-700 border-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200",
    Cancelled: "bg-red-50 text-red-700 border-red-100 dark:border-red-400/30 dark:bg-red-500/15 dark:text-red-200",
  };
  return styles[status] || styles.Pending;
}

function normalizeDoneByNames(value) {
  return (value || [])
    .map((item) => {
      if (typeof item === "string") return item.trim();
      return String(item?.name || item?.label || "").trim();
    })
    .filter(Boolean);
}

function DoneByChips({ names }) {
  const normalizedNames = normalizeDoneByNames(names);

  if (normalizedNames.length === 0) {
    return <span className="text-slate-400 dark:text-slate-500">-</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {normalizedNames.map((name, index) => (
        <span
          key={`${name}-${index}`}
          className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${DONE_BY_COLORS[index % DONE_BY_COLORS.length]}`}
        >
          <span className="truncate">{name}</span>
        </span>
      ))}
    </div>
  );
}

function options(rows, valueKey = "id", labelKey = "name") {
  return (rows || []).map((row) => ({
    value: row[valueKey],
    label: row[labelKey] || row.full_name || row.email || row[valueKey],
  }));
}

function MetricCard({ label, value, suffix = "", icon: Icon, tone = "blue", href }) {
  const tones = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    violet: "bg-violet-50 text-violet-700",
  };
  const card = (
    <div className="glass-card flex min-h-[96px] items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-md">
      <span className={`rounded-xl p-2.5 ${tones[tone] || tones.blue}`}><Icon size={21} /></span>
      <div>
        <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-slate-950">{value}{suffix}</p>
      </div>
    </div>
  );
  return href ? <Link href={href}>{card}</Link> : card;
}

function ChartCard({ title, subtitle, children }) {
  return (
    <section className="glass-card min-w-0 p-5">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      <p className="mb-4 mt-1 text-xs text-slate-500">{subtitle}</p>
      {children}
    </section>
  );
}

function EmptyChart() {
  return <div className="flex h-[250px] items-center justify-center rounded-lg border border-dashed text-sm text-slate-500">No matching task data.</div>;
}

function DoughnutMetric({ values }) {
  const entries = Object.entries(values || {}).filter(([, value]) => value > 0);
  if (!entries.length) return <EmptyChart />;
  return (
    <div className="h-[250px]">
      <Doughnut
        data={{ labels: entries.map(([key]) => key), datasets: [{ data: entries.map(([, value]) => value), backgroundColor: colors, borderWidth: 3, borderColor: "#fff" }] }}
        options={{ maintainAspectRatio: false, cutout: "62%", plugins: { legend: { position: "bottom" } } }}
      />
    </div>
  );
}

function BarMetric({ labels, datasets, horizontal = false, stacked = false }) {
  if (!labels?.length || !datasets?.some((set) => set.data.some((value) => value > 0))) return <EmptyChart />;
  return (
    <div className="h-[270px]">
      <Bar
        data={{ labels, datasets }}
        options={{
          indexAxis: horizontal ? "y" : "x",
          maintainAspectRatio: false,
          responsive: true,
          plugins: { legend: { position: "bottom" } },
          scales: {
            x: { beginAtZero: true, stacked, grid: { color: "rgba(148,163,184,.16)" }, ticks: { precision: 0 } },
            y: { beginAtZero: true, stacked, grid: { color: "rgba(148,163,184,.16)" }, ticks: { precision: 0 } },
          },
        }}
      />
    </div>
  );
}

function TrendChart({ values }) {
  const entries = Object.entries(values || {}).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) return <EmptyChart />;
  return (
    <div className="h-[270px]">
      <Line
        data={{ labels: entries.map(([label]) => label), datasets: [{ label: "Completed", data: entries.map(([, value]) => value), borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,.14)", fill: true, tension: 0.35 }] }}
        options={{ maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }}
      />
    </div>
  );
}

function SelfWorkActivityView({ tasks = [], summary, compact = false }) {
  const counts = summary || {
    open: tasks.filter((task) => !["Done", "Cancelled"].includes(task.status)).length,
    done: tasks.filter((task) => task.status === "Done").length,
    total: tasks.length,
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950">
      <div className="border-b border-slate-200 p-4 sm:p-5 dark:border-slate-700">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-slate-50">Self-Tracked Work Activity</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
              View-only operations-created work records. These are excluded from assigned-task performance rates.
            </p>
          </div>
          <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:border-blue-400/30 dark:bg-blue-500/15 dark:text-blue-200">
            Read only
          </span>
        </div>

        {!compact && (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              ["Open self work", counts.open || 0, "text-amber-700 bg-amber-50 dark:bg-amber-500/15 dark:text-amber-200"],
              ["Done in view", counts.done || 0, "text-emerald-700 bg-emerald-50 dark:bg-emerald-500/15 dark:text-emerald-200"],
              ["Total entries", counts.total || 0, "text-blue-700 bg-blue-50 dark:bg-blue-500/15 dark:text-blue-200"],
            ].map(([label, value, tone]) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <p className={`inline-flex rounded-lg px-2 py-1 text-xs font-semibold ${tone}`}>{label}</p>
                <p className="mt-2 text-3xl font-semibold text-slate-950 dark:text-slate-50">{value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full divide-y divide-slate-100 text-sm dark:divide-slate-700">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-300">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Work</th>
              <th className="px-4 py-3">Remarks</th>
              <th className="px-4 py-3">Done by</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-700 dark:bg-slate-950">
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500 dark:text-slate-300">No self work entries found.</td>
              </tr>
            ) : tasks.map((task) => (
              <tr key={task.id} className="align-top transition hover:bg-blue-50/30 dark:hover:bg-blue-500/10">
                <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{formatDateDDMonYYYY(task.task_date, "-")}</td>
                <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">{task.owner?.name || "Operations"}</td>
                <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">{task.client_name || "-"}</td>
                <td className="max-w-md px-4 py-3">
                  <p className="font-medium text-slate-900 dark:text-slate-50">{task.task_description || "-"}</p>
                </td>
                <td className="max-w-sm px-4 py-3 text-sm leading-5 text-slate-600 dark:text-slate-300">
                  {task.remark || <span className="text-slate-400 dark:text-slate-500">-</span>}
                </td>
                <td className="px-4 py-3">
                  <DoneByChips names={task.done_by} />
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${selfStatusClass(task.status)}`}>
                    {task.status || "Pending"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function UserDrawer({ member, onClose }) {
  if (!member) return null;
  return (
    <div className="fixed inset-0 z-[120] flex justify-end bg-slate-950/35" onClick={onClose}>
      <aside className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl dark:bg-slate-950" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-blue-600">Operations performance</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-50">{member.name}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-300">{member.designation}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border p-2 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800" aria-label="Close details"><X size={18} /></button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Assigned", member.assigned],
            ["Completed", member.completed],
            ["Overdue", member.overdue],
            ["Workload", member.current_workload],
          ].map(([label, value]) => <div key={label} className="rounded-lg border bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900"><p className="text-xs text-slate-500 dark:text-slate-300">{label}</p><p className="text-xl font-semibold text-slate-950 dark:text-slate-50">{value}</p></div>)}
        </div>

        <section className="mt-6">
          <h3 className="font-semibold text-slate-900 dark:text-slate-50">Assigned tasks</h3>
          <div className="mt-3 space-y-2">
            {member.tasks?.length ? member.tasks.map((task) => (
              <div key={task.id} className="rounded-lg border p-3 hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-400/60 dark:hover:bg-blue-500/15">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/dashboard/tasks/${task.id}`} className="font-medium text-slate-900 hover:text-blue-700 dark:text-slate-50 dark:hover:text-blue-200">{task.title}</Link>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-200">{task.status}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">{task.client?.full_name || "Internal task"}{task.due_date ? ` · Due ${formatDateDDMonYYYY(task.due_date, "-")}` : ""}</p>
                <div className="mt-2 flex gap-3 text-xs font-semibold">
                  <Link href={`/dashboard/tasks/${task.id}`} className="text-blue-700 hover:underline">Open task</Link>
                  <Link href={`/dashboard/tasks/${task.id}/edit`} className="text-violet-700 hover:underline">Edit / reassign</Link>
                </div>
              </div>
            )) : <p className="rounded-lg border border-dashed p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-300">No matching tasks.</p>}
          </div>
        </section>

        <section className="mt-6">
          <h3 className="font-semibold text-slate-900 dark:text-slate-50">Recent task activity</h3>
          <div className="mt-3 space-y-2">
            {member.recent_activity?.length ? member.recent_activity.map((activity) => (
              <div key={activity.id} className="rounded-lg border p-3 dark:border-slate-700 dark:bg-slate-900">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{String(activity.action_type).replaceAll("_", " ")}</p>
                <p className="text-xs text-slate-500 dark:text-slate-300">{formatDateTimeDDMonYYYY(activity.created_at, "-")}</p>
              </div>
            )) : <p className="text-sm text-slate-500">No recent activity.</p>}
          </div>
        </section>

        <div className="mt-6">
          <SelfWorkActivityView tasks={member.self_activity?.records || []} compact />
        </div>
      </aside>
    </div>
  );
}

export default function TeamPerformancePage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState(initialFilters);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);

  const load = useCallback(async (nextFilters = filters) => {
    setLoading(true);
    const params = new URLSearchParams(Object.entries(nextFilters).filter(([, value]) => value));
    const response = await authFetch(`/api/team-performance?${params}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 403) {
      toast.error("Team Performance is admin only");
      router.replace("/operations/dashboard");
      return;
    }
    if (!response.ok) toast.error(payload.error || "Could not load team performance");
    else setData(payload);
    setLoading(false);
  }, [filters, router]);

  useEffect(() => { load(initialFilters); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = data?.summary || {};
  const users = data?.users || [];
  const userNames = users.map((user) => user.name);
  const taskListHref = (status) => `/dashboard/tasks${status ? `?status=${encodeURIComponent(status)}` : ""}`;

  const setFilter = (name, value) => setFilters((current) => ({ ...current, [name]: value }));
  const applyFilters = () => load(filters);
  const resetFilters = () => { setFilters(initialFilters); load(initialFilters); };

  const exportCsv = () => {
    const headers = ["User", "Assigned", "Completed", "In Progress", "Pending", "Follow-up", "Waiting", "Overdue", "On Time", "Late", "Reopened", "Completion Rate", "On-time Rate", "Average Completion Days", "Current Workload"];
    const rows = users.map((user) => [user.name, user.assigned, user.completed, user.in_progress, user.pending, user.follow_up, user.waiting, user.overdue, user.completed_on_time, user.completed_late, user.reopened, `${user.completion_rate}%`, `${user.on_time_rate}%`, user.average_completion_days, user.current_workload]);
    const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `team-performance-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const filterSelects = useMemo(() => [
    ["user_id", "Operations User", options(data?.options?.users)],
    ["status", "Task Status", (data?.options?.statuses || []).map((value) => ({ value, label: value }))],
    ["priority", "Priority", (data?.options?.priorities || []).map((value) => ({ value, label: value }))],
    ["client_id", "Client", options(data?.options?.clients, "id", "full_name")],
    ["assigned_by", "Assigned By", options(data?.options?.assigners)],
  ], [data]);

  if (loading && !data) return <div className="p-6 text-slate-500">Loading team performance...</div>;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader eyebrow="Admin analytics" title="Operations Team Performance" description="Assigned-task workload, completion quality, ageing, and delivery trends." icon={UsersRound} actions={<button type="button" onClick={exportCsv} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"><Download size={16} /> Export CSV</button>} />

      <section className="glass-card p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {filterSelects.map(([name, label, selectOptions]) => <FormSelect key={name} label={label} name={name} options={selectOptions} value={filters[name]} onValueChange={(value) => setFilter(name, value)} includeAll allLabel={`All ${label}`} />)}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[["date_from", "Assigned From"], ["date_to", "Assigned To"], ["due_from", "Due From"], ["due_to", "Due To"], ["completed_from", "Completed From"], ["completed_to", "Completed To"]].map(([name, label]) => (
            <label key={name} className="text-xs font-semibold text-slate-600 dark:text-slate-300">{label}<input type="date" value={filters[name]} onChange={(event) => setFilter(name, event.target.value)} className="mt-1 block h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50" /></label>
          ))}
          <div className="flex items-end gap-2">
            <button type="button" onClick={applyFilters} className="inline-flex h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"><BarChart3 size={16} /> Apply</button>
            <button type="button" onClick={resetFilters} className="inline-flex h-11 items-center gap-2 rounded-lg border px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"><FilterX size={16} /> Reset</button>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Total Assigned" value={summary.assigned || 0} icon={UsersRound} href={taskListHref()} />
        <MetricCard label="Completed" value={summary.completed || 0} icon={CheckCircle2} tone="green" href={taskListHref("Completed")} />
        <MetricCard label="In Progress" value={summary.in_progress || 0} icon={RefreshCcw} tone="blue" href={taskListHref("In Progress")} />
        <MetricCard label="Pending" value={summary.pending || 0} icon={Clock3} tone="amber" href={taskListHref("Pending")} />
        <MetricCard label="Follow-up / Waiting" value={(summary.follow_up || 0) + (summary.waiting || 0)} icon={TimerReset} tone="violet" />
        <MetricCard label="Overdue" value={summary.overdue || 0} icon={AlertTriangle} tone="red" />
        <MetricCard label="Reopened" value={summary.reopened || 0} icon={RefreshCcw} tone="violet" />
        <MetricCard label="Completion Rate" value={summary.completion_rate || 0} suffix="%" icon={CheckCircle2} tone="green" />
        <MetricCard label="On-time Rate" value={summary.on_time_rate || 0} suffix="%" icon={Clock3} tone="blue" />
        <MetricCard label="Avg Completion" value={summary.average_completion_days || 0} suffix="d" icon={TimerReset} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard title="Task Status Distribution" subtitle="Current status mix across filtered assigned tasks."><DoughnutMetric values={data?.charts?.status_distribution} /></ChartCard>
        <ChartCard title="Assigned vs Completed by User" subtitle="Work received compared with delivery."><BarMetric labels={userNames} datasets={[{ label: "Assigned", data: users.map((user) => user.assigned), backgroundColor: "#93c5fd", borderRadius: 7 }, { label: "Completed", data: users.map((user) => user.completed), backgroundColor: "#16a34a", borderRadius: 7 }]} /></ChartCard>
        <ChartCard title="Overdue Tasks by User" subtitle="Incomplete tasks past their due date."><BarMetric horizontal labels={userNames} datasets={[{ label: "Overdue", data: users.map((user) => user.overdue), backgroundColor: "#dc2626", borderRadius: 7 }]} /></ChartCard>
        <ChartCard title="Task Completion Trend" subtitle="Completed assigned tasks over time."><TrendChart values={data?.charts?.completion_trend} /></ChartCard>
        <ChartCard title="On-time vs Late Completion" subtitle="Tasks with both completion and due dates."><DoughnutMetric values={data?.charts?.on_time_late} /></ChartCard>
        <ChartCard title="Current Workload Distribution" subtitle="Open assigned tasks by operations user."><BarMetric labels={userNames} datasets={[{ label: "Current workload", data: users.map((user) => user.current_workload), backgroundColor: "#7c3aed", borderRadius: 7 }]} /></ChartCard>
        <ChartCard title="Open-task Ageing" subtitle="Age of incomplete assigned tasks."><BarMetric labels={Object.keys(data?.charts?.ageing || {})} datasets={[{ label: "Tasks", data: Object.values(data?.charts?.ageing || {}), backgroundColor: colors, borderRadius: 7 }]} /></ChartCard>
      </div>

      <section className="glass-card overflow-hidden">
        <div className="flex items-center justify-between border-b p-5 dark:border-slate-700">
          <div><h2 className="font-semibold text-slate-900 dark:text-slate-50">User Performance Comparison</h2><p className="text-xs text-slate-500 dark:text-slate-300">Assigned-task metrics only. Self-tracked work is excluded.</p></div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1550px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-950 dark:text-slate-300"><tr>{["User", "Assigned", "Completed", "In Progress", "Pending", "Follow-up / Waiting", "Overdue", "On Time", "Late", "Reopened", "Completion Rate", "On-time Rate", "Avg Completion", "Workload", ""].map((label) => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {users.map((member) => (
                <tr key={member.id} className="bg-white hover:bg-blue-50/60 dark:bg-slate-900 dark:hover:bg-blue-500/15">
                  <td className="px-3 py-3"><p className="font-semibold text-slate-900 dark:text-slate-50">{member.name}</p><p className="text-xs text-slate-500 dark:text-slate-300">{member.designation}</p></td>
                  {[member.assigned, member.completed, member.in_progress, member.pending, `${member.follow_up} / ${member.waiting}`, member.overdue, member.completed_on_time, member.completed_late, member.reopened, `${member.completion_rate}%`, `${member.on_time_rate}%`, `${member.average_completion_days}d`, member.current_workload].map((value, index) => <td key={index} className="px-3 py-3 text-base font-bold text-slate-800 dark:text-white">{value}</td>)}
                  <td className="px-3 py-3"><button type="button" onClick={() => setSelectedUser(member)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-400/40 dark:bg-blue-500/15 dark:text-blue-200 dark:hover:bg-blue-500/25"><Eye size={14} /> Details</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!users.length && <p className="p-8 text-center text-sm text-slate-500">No operations users match the selected filters.</p>}
        </div>
      </section>

      <SelfWorkActivityView tasks={data?.self_tasks || []} summary={data?.self_summary} />

      <UserDrawer member={selectedUser} onClose={() => setSelectedUser(null)} />
    </div>
  );
}
