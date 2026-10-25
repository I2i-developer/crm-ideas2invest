"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/authFetch";
import FormSelect from "@/app/(dashboard)/admin/clients/components/FormSelect";
import SalesInsights from "./SalesInsights";
import styles from "./sales.module.css";

async function read(path) {
  const response = await authFetch(path, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Unable to load calling overview");
  return payload;
}

export default function DashboardCallingOverview({ refreshToken }) {
  const [sources, setSources] = useState([]), [source, setSource] = useState("");
  const [data, setData] = useState(null), [error, setError] = useState("");
  const [loading, setLoading] = useState(true), [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    read("/api/sales/sources").then((payload) => {
      if (!alive) return;
      const available = payload.sources || [];
      setSources(available);
      setSource((current) => available.some((s) => s.id === current) ? current : available[0]?.id || "");
      if (!available.length) { setLoading(false); setData(null); }
      setError("");
    }).catch((e) => { if (alive) { setError(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, [refreshToken, revision]);
  useEffect(() => {
    if (!source) return;
    let alive = true;
    setLoading(true); setData(null); setError("");
    read("/api/sales/insights?" + new URLSearchParams({ source })).then((payload) => {
      if (alive) setData(payload);
    }).catch((e) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [source, refreshToken, revision]);
  return <section className={`${styles.workspace} ${styles.dashboardOverview} glass-card min-w-0`} aria-label="Calling overview charts">
    <div className={styles.overviewToolbar}>
      <div><h2>Calling Overview</h2><p>Lead progress and calling activity by source.</p></div>
      <div className={styles.sourceSelect}><FormSelect label="Lead source" value={source} onChange={(e) => setSource(e.target.value)} options={sources.map((s) => ({ value: s.id, label: s.name }))} placeholder="Select a source" isSearchable /></div>
    </div>
    <SalesInsights data={data} loading={loading} error={error} onRetry={() => setRevision((v) => v + 1)} collapsible={false} />
  </section>;
}
