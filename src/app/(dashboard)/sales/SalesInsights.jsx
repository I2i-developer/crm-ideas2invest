"use client";

import { useEffect, useState } from "react";
import { ArcElement, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";
import { BarChart3, ChevronDown, ChevronUp } from "lucide-react";
import styles from "./sales.module.css";

ChartJS.register(ArcElement, BarElement, CategoryScale, Legend, LinearScale, Tooltip);
const colors = { "Retry calls": "#eab308", "Follow-up": "#0d9488", "Meetings": "#2563eb", "Meetings scheduled": "#2563eb", "Meetings completed": "#16a34a", "Not interested": "#e11d48", "Converted / Other closed": "#64748b", "Closed": "#e11d48" };

export default function SalesInsights({ data, loading, error, onRetry, collapsible = true }) {
  const [open, setOpen] = useState(true), [dark, setDark] = useState(false);
  useEffect(() => {
    const sync = () => setDark(document.documentElement.classList.contains("dark"));
    sync(); const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  const ink = dark ? "#cbd5e1" : "#475569", grid = dark ? "#344256" : "#e2e8f0";
  const pipeline = (data?.pipeline || []).filter((row) => row.label !== "Not called"), daily = data?.daily || [];
  const common = { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { color: ink, boxWidth: 10, font: { size: 12 } } } } };
  const hasCalls = daily.some((row) => row.dialed > 0);
  return <section className={styles.insights} aria-label="Calling overview">
    {collapsible && <button type="button" className={styles.insightsToggle} aria-expanded={open} aria-controls="sales-insights" onClick={() => setOpen((v) => !v)}><BarChart3 size={18} />Calling overview{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>}
    {open && <div id="sales-insights">
      {error ? <div role="alert" className={styles.error}>{error}<button className={styles.secondary} onClick={onRetry}>Retry</button></div> : loading ? <div className={styles.chartLoading} aria-label="Loading calling charts" /> : <div className={styles.insightsGrid}>
        <figure><figcaption><strong>Lead status</strong><span>Contacted active leads in this source</span></figcaption><div className={styles.chartCanvas}>
{pipeline.length ? <Doughnut aria-label="Lead status breakdown" role="img" data={{ labels: pipeline.map((r) => r.label), datasets: [{ data: pipeline.map((r) => r.value), backgroundColor: pipeline.map((r) => colors[r.label] || "#64748b"), borderWidth: 2, borderColor: dark ? "#182230" : "#ffffff" }] }} options={{ ...common, cutout: "68%", plugins: { legend: { position: "right", labels: { color: ink, boxWidth: 10, padding: 14, font: { size: 12 } } } } }} /> : <p className={styles.chartEmpty}>No contacted leads in this source.</p>}
        </div><p className="sr-only">{pipeline.map((row) => `${row.label}: ${row.value}`).join(". ")}</p></figure>
        <figure><figcaption><strong>Calling activity</strong><span>Last 7 days / India time</span></figcaption><div className={styles.chartCanvas}>
          {hasCalls ? <Bar aria-label="Calls connected and unanswered over the last seven days" role="img" data={{ labels: daily.map((r) => new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(`${r.date}T12:00:00+05:30`))), datasets: [{ label: "Connected", data: daily.map((r) => r.connected), backgroundColor: "#0d9488", borderRadius: 3 }, { label: "Not connected", data: daily.map((r) => Math.max(0, r.dialed - r.connected)), backgroundColor: "#eab308", borderRadius: 3 }] }} options={{ ...common, plugins: { ...common.plugins, legend: { ...common.plugins.legend, position: "bottom" } }, scales: { x: { stacked: true, grid: { display: false }, ticks: { color: ink, font: { size: 11 } } }, y: { stacked: true, beginAtZero: true, grid: { color: grid }, ticks: { precision: 0, color: ink } } } }} /> : <p className={styles.chartEmpty}>No calls recorded in the last 7 days.</p>}
        </div><p className="sr-only">{daily.map((row) => `${row.date}: ${row.dialed} calls, ${row.connected} connected`).join(". ")}</p></figure>
      </div>}
    </div>}
  </section>;
}
