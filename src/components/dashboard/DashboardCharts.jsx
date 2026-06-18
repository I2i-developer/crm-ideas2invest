"use client";

import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const palette = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2", "#db2777"];
const workStatusPalette = {
  Pending: "#f59e0b",
  "In progress": "#2563eb",
  Done: "#16a34a",
  "On hold": "#64748b",
  Cancelled: "#dc2626",
};

function entriesFromMap(map = {}) {
  return Object.entries(map)
    .filter(([, value]) => Number(value) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]));
}

function EmptyChart({ text = "No data available yet." }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-500">
      {text}
    </div>
  );
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="glass-card p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function DoughnutChart({ values }) {
  const entries = entriesFromMap(values);
  if (!entries.length) return <EmptyChart />;

  return (
    <div className="h-[260px]">
      <Doughnut
        data={{
          labels: entries.map(([label]) => label),
          datasets: [
            {
              data: entries.map(([, value]) => value),
              backgroundColor: entries.map((_, index) => palette[index % palette.length]),
              borderColor: "#ffffff",
              borderWidth: 3,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          cutout: "62%",
          plugins: {
            legend: {
              position: "bottom",
              labels: {
                boxWidth: 10,
                color: "#4b5563",
                font: { size: 12 },
              },
            },
          },
        }}
      />
    </div>
  );
}

const insuranceStatusStyles = {
  Overdue: { color: "#dc2626", soft: "#fee2e2", priority: 1 },
  Lapsed: { color: "#be123c", soft: "#ffe4e6", priority: 2 },
  "Grace Period": { color: "#f59e0b", soft: "#fef3c7", priority: 3 },
  Pending: { color: "#2563eb", soft: "#dbeafe", priority: 4 },
  Paid: { color: "#16a34a", soft: "#dcfce7", priority: 5 },
};

function InsuranceRenewalHealth({ values }) {
  const entries = entriesFromMap(values);
  if (!entries.length) return <EmptyChart />;

  const orderedEntries = [...entries].sort((a, b) => {
    const aPriority = insuranceStatusStyles[a[0]]?.priority || 99;
    const bPriority = insuranceStatusStyles[b[0]]?.priority || 99;
    return aPriority - bPriority;
  });
  const total = entries.reduce((sum, [, value]) => sum + Number(value), 0);
  const actionStatuses = new Set(["overdue", "lapsed", "pending", "grace period"]);
  const actionsNeeded = entries
    .filter(([label]) => actionStatuses.has(label.toLowerCase()))
    .reduce((sum, [, value]) => sum + Number(value), 0);

  return (
    <div className="flex min-h-[240px] flex-col justify-center">
      <div className="flex items-end justify-between gap-4">
        <div className="flex w-full items-end justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total policies</p>
            <p className="mt-1 text-3xl font-semibold text-slate-950">{total}</p>
          </div>
          <div className="border-l border-slate-200 pl-6">
            <p className="text-right text-xs font-semibold uppercase tracking-wide text-amber-600">Actions needed</p>
            <p className="mt-1 text-right text-3xl font-semibold text-amber-700">{actionsNeeded}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 flex h-14 overflow-hidden rounded-xl border-4 border-white bg-slate-100 shadow-lg ring-1 ring-slate-200">
        {orderedEntries.map(([label, value]) => {
          const share = (Number(value) / total) * 100;
          const style = insuranceStatusStyles[label] || { color: "#64748b" };
          return (
            <div
              key={label}
              className="group relative flex min-w-5 items-center justify-center border-r-2 border-white/80 transition-all last:border-r-0 hover:brightness-95"
              style={{ width: `${share}%`, backgroundColor: style.color }}
            >
              {share >= 14 && (
                <span className="text-sm font-bold text-white drop-shadow-sm">{Math.round(share)}%</span>
              )}
              <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white shadow-xl group-hover:block">
                {label}: {value} policies ({Math.round(share)}%)
                <span className="absolute left-1/2 top-full -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-slate-950" />
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {orderedEntries.map(([label, value]) => {
          const share = Math.round((Number(value) / total) * 100);
          const style = insuranceStatusStyles[label] || { color: "#64748b", soft: "#f1f5f9" };
          return (
            <div
              key={label}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2.5"
            >
              <span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-700">
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: style.color }} />
                <span className="truncate">{label}</span>
              </span>
              <span className="whitespace-nowrap text-xs text-slate-500">
                <strong className="text-sm text-slate-950">{value}</strong> · {share}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BarChart({ values, horizontal = false }) {
  const entries = entriesFromMap(values);
  if (!entries.length) return <EmptyChart />;

  return (
    <div className="h-[260px]">
      <Bar
        data={{
          labels: entries.map(([label]) => label),
          datasets: [
            {
              label: "Count",
              data: entries.map(([, value]) => value),
              backgroundColor: entries.map((_, index) => palette[index % palette.length]),
              borderRadius: 8,
              borderSkipped: false,
            },
          ],
        }}
        options={{
          indexAxis: horizontal ? "y" : "x",
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
          },
          scales: {
            x: {
              beginAtZero: true,
              ticks: { precision: 0, color: "#6b7280" },
              grid: { color: "rgba(148, 163, 184, 0.18)" },
            },
            y: {
              beginAtZero: true,
              ticks: { precision: 0, color: "#6b7280" },
              grid: { display: horizontal, color: "rgba(148, 163, 184, 0.18)" },
            },
          },
        }}
      />
    </div>
  );
}

function WorkTrackerBarChart({ values }) {
  const entries = ["Pending", "In progress", "Done", "On hold", "Cancelled"]
    .map((label) => [label, Number(values?.[label] || 0)])
    .filter(([, value]) => value > 0);

  if (!entries.length) return <EmptyChart text="No self-work entries yet." />;

  return (
    <div className="h-[270px]">
      <Bar
        data={{
          labels: entries.map(([label]) => label),
          datasets: [
            {
              label: "Entries",
              data: entries.map(([, value]) => value),
              backgroundColor: entries.map(([label]) => workStatusPalette[label] || "#2563eb"),
              borderRadius: 12,
              borderSkipped: false,
              maxBarThickness: 54,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (context) => `${context.parsed.y} work entr${context.parsed.y === 1 ? "y" : "ies"}`,
              },
            },
          },
          scales: {
            x: {
              ticks: {
                color: "#475569",
                font: { size: 12, weight: "600" },
              },
              grid: { display: false },
            },
            y: {
              beginAtZero: true,
              ticks: { precision: 0, color: "#64748b" },
              grid: { color: "rgba(148, 163, 184, 0.18)" },
            },
          },
        }}
      />
    </div>
  );
}

function PipelineBars({ metrics = {} }) {
  const items = [
    { label: "Pending Tasks", value: metrics.pending_tasks || 0, color: "bg-violet-600" },
    { label: "Docs To Verify", value: metrics.pending_document_verification || 0, color: "bg-amber-500" },
    { label: "Risk Pending", value: metrics.risk_profiling_pending || 0, color: "bg-blue-600" },
    { label: "Insurance Follow-up", value: metrics.insurance_follow_up || 0, color: "bg-green-600" },
  ];
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-gray-600">{item.label}</span>
            <span className="font-semibold text-gray-900">{item.value}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full ${item.color}`}
              style={{ width: `${Math.max((item.value / max) * 100, item.value ? 10 : 0)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DashboardCharts({ data, mode = "admin" }) {
  const metrics = data?.metrics || {};
  const taskTitle = mode === "operations" ? "My Task Status" : "Task Status";
  const pipelineSubtitle =
    mode === "operations"
      ? "Your work requiring attention across tasks, documents, risk, and insurance."
      : "Key queues that need team follow-up.";

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <ChartCard title="SIP Tracker" subtitle="Pause, termination, rejection, and follow-up event mix.">
        <DoughnutChart values={data?.sip_by_event_type} />
      </ChartCard>

      <ChartCard title="Action Pipeline" subtitle={pipelineSubtitle}>
        <PipelineBars metrics={metrics} />
      </ChartCard>

      {mode === "operations" && (
        <ChartCard title="My Work Tracker" subtitle="Your self-work entries grouped by current status.">
          <WorkTrackerBarChart values={data?.self_tasks_by_status} />
        </ChartCard>
      )}

      <ChartCard title="Insurance Renewal Mix" subtitle="Simple status distribution across the renewal queue.">
        <InsuranceRenewalHealth values={data?.insurance_by_payment_status} />
      </ChartCard>

      <ChartCard title={taskTitle} subtitle="Breakdown of work by current status.">
        <DoughnutChart values={data?.tasks_by_status} />
      </ChartCard>

      <ChartCard title="Document Status" subtitle="Current document review and upload state.">
        <BarChart values={data?.documents_by_status} horizontal />
      </ChartCard>

      <ChartCard title="Client Onboarding Mix" subtitle="Clients grouped by tax status.">
        <BarChart values={data?.clients_by_tax_status} />
      </ChartCard>
    </div>
  );
}
