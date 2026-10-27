"use client";

import { createContext, useContext, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Bookmark, BookmarkCheck, CalendarDays, CalendarClock, Check, ChevronLeft, ChevronRight, ClipboardList, Clock3, Copy, FileText, FolderOpen, History, Loader2, MapPin, MessageCircle, MessageSquarePlus, Pencil, Phone, PhoneCall, Plus, RefreshCw, Save, Search, ShieldCheck, Trash2, Upload, UserRound, X } from "lucide-react";
import toast from "react-hot-toast";
import { authFetch } from "@/lib/authFetch";
import PageHeader from "@/components/PageHeader";
import CrmTooltip from "@/components/CrmTooltip";
import SalesInsights from "./SalesInsights";
import FormInput from "@/app/(dashboard)/admin/clients/components/FormInput";
import FormSelect from "@/app/(dashboard)/admin/clients/components/FormSelect";
import { SELECTABLE_SALES_STATUSES, SALES_PAGE_SIZE, CALL_STATUSES, FOLLOWUP_STATUSES, callStatusMatches, whatsappUrl, istDate, toIstInput, fromIstInput, suggestedFollowup, phoneNumbers } from "@/lib/sales/rules";
import styles from "./sales.module.css";

const VIEWS = [{ id: "leads", label: "Calling Queue", icon: PhoneCall }, { id: "followups", label: "Follow-ups", icon: CalendarClock }, { id: "calendar", label: "Meetings", icon: CalendarDays }, { id: "eod", label: "Daily EOD", icon: ClipboardList }];
const METRICS = [["dialed", "Calls dialed"], ["connected", "Connected"], ["interested", "Interested / Follow-up"], ["non_interested", "Not interested"], ["meeting_scheduled", "Meetings scheduled"]];
const fmt = (value, dateOnly = false) => value ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", ...(dateOnly ? {} : { hour: "2-digit", minute: "2-digit" }) }).format(new Date(value)) : "-";

const SalesViewer = createContext("Authorized CRM user");

async function api(path, options = {}) {
  const response = await authFetch(`/api/sales${path}`, {
    cache: "no-store", ...options,
    ...(options.body && !(options.body instanceof FormData) ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(options.body) } : {})
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to complete the request");
  return data;
}

function TipButton({ tooltip, side = "top", children, ...props }) {
  return <CrmTooltip content={tooltip} side={side}><button {...props}>{children}</button></CrmTooltip>;
}

function LeadPhones({ value }) {
  const [copied, setCopied] = useState("");
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy(number) {
    try {
      await navigator.clipboard.writeText(number.phone);
      setCopied(number.key); clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(""), 2000);
    } catch { toast.error("Unable to copy. Please check browser clipboard permissions."); }
  }
  return <div className={styles.phoneList}>{phoneNumbers(value).map((number) => <div className={styles.phoneNumber} key={number.key}>
    <span>{number.phone}</span><TipButton type="button" className={`${styles.iconButton} ${styles.phoneCopy} ${styles.copyAction}`} onClick={() => copy(number)} tooltip={copied === number.key ? "Copied" : "Copy phone number"} aria-label={`Copy phone number ${number.phone}`}>{copied === number.key ? <Check size={14} /> : <Copy size={14} />}</TipButton>
  </div>)}</div>;
}

function Status({ value }) {
  const tone = ["Converted", "Meeting Completed"].includes(value) ? styles.positive : ["Not Interested", "Do Not Call", "Wrong Number"].includes(value) ? styles.negative : value?.startsWith("RNR") || ["Call Busy", "Switched off"].includes(value) ? styles.warning : styles.information;
  return <span className={`${styles.status} ${tone}`}>{value}</span>;
}

function Dialog({ title, onClose, wide = false, children }) {
  const viewer = useContext(SalesViewer);
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.querySelector("button, input, textarea, select")?.focus();
    const keydown = (e) => {
      if (e.defaultPrevented) return;
      if ([...document.querySelectorAll("[data-sales-dialog]")].at(-1) !== ref.current) return;
      if (e.key === "Escape") { e.stopPropagation(); closeRef.current(); }
      if (e.key === "Tab") {
        const nodes = [...ref.current.querySelectorAll("button:not(:disabled),input:not(:disabled):not([type=hidden]),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex='0']")].filter((el) => el.getClientRects().length);
        const first = nodes[0], last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, []);
  return createPortal(
    <div className={styles.backdrop} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section ref={ref} data-sales-dialog role="dialog" aria-modal="true" aria-label={title} className={`${styles.dialog} ${wide ? styles.wide : ""}`}>
        <header className={styles.dialogHeader}><div><h2>{title}</h2><p className={styles.dialogStamp}>Confidential · {viewer}</p></div><button className={styles.iconButton} type="button" onClick={onClose} aria-label="Close"><X size={19} /></button></header>
        <div className={styles.dialogBody}>{children}</div>
      </section>
    </div>, document.body);
}

function Pager({ page, total, onChange, pageSize = 25 }) {
  return <div className={styles.pager}>
    <span>{total ? `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, total)} of ${total}` : "0 records"}</span>
    <button className={styles.iconButton} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
    <button className={styles.iconButton} disabled={page * pageSize >= total} onClick={() => onChange(page + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
  </div>;
}

function LeadAddress({ lead, editable = true, onSaved }) {
  const [editing, setEditing] = useState(false), [value, setValue] = useState(lead.address || ""), [version, setVersion] = useState(lead.version), [saving, setSaving] = useState(false);
  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const data = await api(`/${lead.id}/address`, { method: "PATCH", body: { address: value, version } });
      setEditing(false); onSaved(data.lead); toast.success("Address saved");
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }
  if (!editing) return <CrmTooltip content={editable ? "Edit address" : "Address"} className={styles.addressTip}><button type="button" aria-label={editable ? "Edit address" : "Address"} className={styles.addressButton} disabled={!editable} onClick={() => { setValue(lead.address || ""); setVersion(lead.version); setEditing(true); }}><MapPin size={14} /><span className={styles.addressText}>{lead.address || "Add address"}</span>{editable && <Pencil size={12} />}</button></CrmTooltip>;
  return <div className={styles.addressEditor}><textarea aria-label={`Address for ${lead.name}`} value={value} maxLength={1000} rows={3} disabled={saving} onChange={(e) => setValue(e.target.value)} /><div className={styles.actions}><TipButton type="button" className={styles.iconButton} tooltip="Save address" aria-label="Save address" disabled={saving} onClick={save}>{saving ? <Loader2 size={15} className={styles.spinner} /> : <Save size={15} />}</TipButton><TipButton type="button" className={styles.iconButton} tooltip="Cancel address edit" aria-label="Cancel address edit" disabled={saving} onClick={() => setEditing(false)}><X size={15} /></TipButton></div></div>;
}

export default function SalesWorkspace() {
  const [view, setView] = useState("leads");
  const [callMetric, setCallMetric] = useState("dialed"), [callPage, setCallPage] = useState(1);
  const [calls, setCalls] = useState({ rows: [], total: 0 }), [callsLoading, setCallsLoading] = useState(false), [callsError, setCallsError] = useState("");
  const [queue, setQueue] = useState({ leads: [], users: [], total: 0, role: "", viewer: {} });
  const [filters, setFilters] = useState({ search: "", status: "", owner: "", due: "", archived: "", source: "" });
  const [sources, setSources] = useState([]);
  const [sourceError, setSourceError] = useState("");
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [highlightLeadId, setHighlightLeadId] = useState(null);
  const [pendingBookmark, setPendingBookmark] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [leadId, setLeadId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailPage, setDetailPage] = useState(1);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [activityKind, setActivityKind] = useState(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [eodDate, setEodDate] = useState(istDate());
  const [eod, setEod] = useState([]);
  const [followups, setFollowups] = useState({ followups: [], total: 0 });
  const [followupPage, setFollowupPage] = useState(1);
  const [resourceError, setResourceError] = useState("");
  const [resourceLoading, setResourceLoading] = useState(false);
  const [snooze, setSnooze] = useState(null);
  const [busy, setBusy] = useState(false);
  const [viewedAt, setViewedAt] = useState("");
  const [progress, setProgress] = useState(null), [progressError, setProgressError] = useState(""), [bookmarkBusy, setBookmarkBusy] = useState(false);
  const [insights, setInsights] = useState(null), [insightsLoading, setInsightsLoading] = useState(false), [insightsError, setInsightsError] = useState("");
  const activeSource = useRef(filters.source);
  const restoredSourceFor = useRef(null);
  activeSource.current = filters.source;
  const requestSeq = useRef(0);
  const detailSeq = useRef(0);
  const admin = queue.role === "admin";
  const ownerOptions = queue.users.map((u) => ({ value: u.id, label: u.name }));
  const selectedSource = sources.find((source) => source.id === filters.source);
  const sourceOptions = sources.map((source) => ({ value: source.id, label: `${source.name} (${source.active_count})` }));
  useEffect(() => {
    const uid = queue.viewer.id;
    if (!uid || sourcesLoading || sourceError || restoredSourceFor.current === uid) return;
    restoredSourceFor.current = uid;
    const params = new URLSearchParams(window.location.search);
    if (filters.source || params.get("source") || params.get("lead")) return;
    try {
      const saved = localStorage.getItem(`crm-sales-source:${uid}`);
      if (saved && sources.some((source) => source.id === saved)) changeSource(saved);
    } catch { /* Browsers may disable local storage; source selection still works. */ }
  }, [queue.viewer.id, sourcesLoading, sourceError, sources, filters.source]);
  useEffect(() => {
    if (!queue.viewer.id || !filters.source) return;
    try { localStorage.setItem(`crm-sales-source:${queue.viewer.id}`, filters.source); } catch { /* Optional device preference. */ }
  }, [queue.viewer.id, filters.source]);
  const selectable = queue.leads.filter((lead) => lead.import_id).map((lead) => lead.id);
  const pageSelected = selectable.length > 0 && selectable.every((id) => selectedIds.includes(id));
  function selectLeads(ids) {
    if (ids.length > 10000) return toast.error("Select up to 10,000 leads, or use Delete all imported");
    setSelectedIds(ids);
  }

  useEffect(() => {
    let alive = true;
    if (!filters.source) { setProgress(null); setInsights(null); setProgressError(""); setInsightsError(""); return; }
    setInsightsLoading(true); setProgressError(""); setInsightsError("");
    const params = new URLSearchParams({ source: filters.source });
    api(`/progress?${params}`).then((data) => { if (alive) setProgress(data); }).catch((e) => { if (alive) setProgressError(e.message); });
    api(`/insights?${params}`).then((data) => { if (alive) setInsights(data); }).catch((e) => { if (alive) setInsightsError(e.message); }).finally(() => { if (alive) setInsightsLoading(false); });
    return () => { alive = false; };
  }, [filters.source, revision]);

  async function bookmarkLead(lead) {
    if (bookmarkBusy) return;
    const source = lead.source_id || filters.source;
    const removing = progress?.bookmark?.id === lead.id;
    setBookmarkBusy(true);
    try {
      const data = await api("/progress", { method: "POST", body: { source_id: source, lead_id: removing ? null : lead.id } });
      if (activeSource.current === source) { setProgress(data); setProgressError(""); }
      toast.success(removing ? "Bookmark removed" : "Bookmark saved");
    } catch (e) { toast.error(e.message); } finally { setBookmarkBusy(false); }
  }

  async function resumeLead(kind) {
    const source = filters.source;
    try {
      const data = await api(`/progress?${new URLSearchParams({ source })}`);
      if (activeSource.current !== source) return;
      setProgress(data);
      const target = data[kind];
      if (!target) return toast.error("This lead is no longer available");
      setSelectedIds([]); setFilters({ search: "", status: "", owner: "", due: "", archived: "", source });
      setView("leads"); setPage(target.page || 1); setFollowupPage(1);
      const url = new URL(window.location.href); url.searchParams.set("view", "leads");
      if (kind === "bookmark") {
        closeLead(); setHighlightLeadId(target.id); setQueue((q) => ({ ...q, leads: [] }));
        setPendingBookmark({ id: target.id, page: target.page || 1, source });
        setRevision((v) => v + 1); url.searchParams.delete("lead");
      } else { openLead(target.id); url.searchParams.set("lead", target.id); }
      window.history.replaceState(null, "", url);
    } catch (e) { toast.error(e.message); }
  }

  useEffect(() => {
    setViewedAt(fmt(new Date()));
    const p = new URLSearchParams(window.location.search);
    if (VIEWS.some((v) => v.id === p.get("view"))) setView(p.get("view"));
    if (p.get("lead")) setLeadId(p.get("lead"));
    if (p.get("source")) setFilters((f) => ({ ...f, source: p.get("source") }));
  }, []);

  useEffect(() => {
    let alive = true;
    setSourcesLoading(true); setSourceError("");
    api("/sources").then((data) => { if (alive) setSources(data.sources || []); })
      .catch((e) => { if (alive) setSourceError(e.message); })
      .finally(() => { if (alive) setSourcesLoading(false); });
    return () => { alive = false; };
  }, [revision]);

  useEffect(() => {
    const refreshOnFocus = () => { setRevision((v) => v + 1); setViewedAt(fmt(new Date())); };
    const preventSave = (e) => { if ((e.ctrlKey || e.metaKey) && ["p", "s"].includes(e.key.toLowerCase())) e.preventDefault(); };
    window.addEventListener("focus", refreshOnFocus);
    window.addEventListener("keydown", preventSave);
    return () => { window.removeEventListener("focus", refreshOnFocus); window.removeEventListener("keydown", preventSave); };
  }, []);

  useEffect(() => {
    const seq = ++requestSeq.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      setError("");
      try {
        const p = new URLSearchParams({ ...filters, page: String(page) });
        const data = await api(`?${p}`);
        if (seq === requestSeq.current) setQueue(data);
      } catch (e) { if (seq === requestSeq.current) setError(e.message); }
      finally { if (seq === requestSeq.current) setLoading(false); }
    }, 250);
    return () => clearTimeout(timer);
  }, [filters, page, revision]);

  useEffect(() => {
    if (!pendingBookmark || loading || view !== "leads") return;
    if (filters.source !== pendingBookmark.source || page !== pendingBookmark.page) { setPendingBookmark(null); return; }
    if (!queue.leads.some((lead) => lead.id === pendingBookmark.id)) return;
    const row = document.querySelector(`[data-lead-id="${pendingBookmark.id}"]`);
    if (!row) return;
    row.focus({ preventScroll: true });
    row.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    setPendingBookmark(null);
  }, [pendingBookmark, loading, queue.leads, view, filters.source, page]);

  const loadDetail = useCallback(async () => {
    if (!leadId) return;
    const seq = ++detailSeq.current;
    setDetailLoading(true);
    try {
      const data = await api(`/${leadId}?page=${detailPage}`);
      if (seq === detailSeq.current) {
        setDetail(data);
        if (data.lead.source_id) setFilters((f) => f.source ? f : { ...f, source: data.lead.source_id });
      }
    } catch (e) { if (seq === detailSeq.current) { setDetail(null); toast.error(e.message); } }
    finally { if (seq === detailSeq.current) setDetailLoading(false); }
  }, [leadId, detailPage]);
  useEffect(() => { loadDetail(); }, [loadDetail, revision]);

  useEffect(() => {
    if (!queue.role) return;
    let alive = true;
    setResourceLoading(true); setResourceError("");
    const p = new URLSearchParams({ date: eodDate, source: filters.source, ...(admin && filters.owner && filters.owner !== "unassigned" ? { owner: filters.owner } : {}) });
    Promise.all([api(`/eod?${p}`), view === "followups" ? api(`/followups?${p}&page=${followupPage}`) : Promise.resolve(null)])
      .then(([daily, due]) => { if (alive) { setEod(daily.rows || []); if (due) setFollowups(due); } })
      .catch((e) => { if (alive) setResourceError(e.message); })
      .finally(() => { if (alive) setResourceLoading(false); });
    return () => { alive = false; };
  }, [queue.role, admin, view, revision, eodDate, filters.owner, filters.source, followupPage]);

function changeFilter(key, value) { setSelectedIds([]); setPage(1); setCallPage(1); setFollowupPage(1); setFilters((f) => ({ ...f, [key]: value })); }
  function changeSource(id) {
    setProgress(null); setInsights(null);
    requestSeq.current++;
    setQueue((q) => ({ ...q, leads: [], total: 0 })); setLoading(true);
    setEod([]); setFollowups({ followups: [], total: 0 });
    changeFilter("source", id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("source", id); else url.searchParams.delete("source");
    window.history.replaceState(null, "", url);
  }
  function openLead(id) { setDetail(null); setLeadId(id); setDetailPage(1); setActivityKind(null); }
  function closeLead() {
    detailSeq.current++;
    setLeadId(null); setDetail(null); setActivityKind(null);
    const url = new URL(window.location.href); url.searchParams.delete("lead"); window.history.replaceState(null, "", url);
  }
  async function refresh() { setRevision((v) => v + 1); }
  function addressSaved(lead) {
    setQueue((q) => ({ ...q, leads: q.leads.map((row) => row.id === lead.id ? { ...row, ...lead } : row) }));
    setDetail((d) => d?.lead.id === lead.id ? { ...d, lead: { ...d.lead, ...lead } } : d);
    refresh();
  }
  async function updateReminder(reminder, action, dueAt = null) {
    setBusy(true);
    try { await api("/followups", { method: "PATCH", body: { id: reminder.id, action, due_at: dueAt } }); toast.success(action === "complete" ? "Reminder completed" : "Reminder snoozed"); setSnooze(null); refresh(); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }
  const totals = Object.fromEntries(METRICS.map(([key]) => [key, eod.reduce((sum, r) => sum + Number(r[key] || 0), 0)]));
  useEffect(() => {
    if (view !== "calls" || !filters.source) return;
    let alive = true;
    setCallsLoading(true); setCallsError("");
    const params = new URLSearchParams({ source: filters.source, date: eodDate, metric: callMetric, page: String(callPage), ...(admin && filters.owner && filters.owner !== "unassigned" ? { owner: filters.owner } : {}) });
    api(`/calls?${params}`).then((data) => { if (alive) setCalls(data); })
      .catch((e) => { if (alive) setCallsError(e.message); })
      .finally(() => { if (alive) setCallsLoading(false); });
    return () => { alive = false; };
  }, [view, filters.source, filters.owner, admin, eodDate, callMetric, callPage, revision]);
  const activeFilters = Object.entries(filters).filter(([key, value]) => key !== "source" && value).length;
  useEffect(() => {
    if (view !== "calls") return;
    document.querySelector("[data-call-activity]")?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [view, callMetric]);
  function protectCopy(e) { if (!["INPUT", "TEXTAREA"].includes(e.target.tagName) && !e.target.isContentEditable) e.preventDefault(); }

  return (
    <SalesViewer.Provider value={`${queue.viewer.name || "Authorized CRM user"} · ${viewedAt}`}>
      <div data-sales-workspace className={styles.workspace} onCopy={protectCopy} onCut={protectCopy} onContextMenu={protectCopy}>
        <PageHeader eyebrow="Sales team" title="Leads & Calling Desk" description={admin ? "Team calling and follow-ups" : "Your leads and follow-ups"} icon={PhoneCall} actions={<div className={styles.actions}>
          <TipButton type="button" tooltip="Refresh calling desk" aria-label="Refresh sales workspace" className={styles.iconButton} onClick={refresh}><RefreshCw size={17} /></TipButton>
          {["admin", "sales"].includes(queue.role) && <button className={styles.secondary} onClick={() => setImportOpen(true)}><Upload size={16} /> Import sheet</button>}
          <button className={styles.primary} disabled={!selectedSource} onClick={() => setCreateOpen(true)}><Plus size={16} /> Add lead</button>
        </div>} />
        <section className={styles.sourceBar} aria-label="Lead source">
          <FolderOpen size={22} className={styles.sourceIcon} />
          <div className={styles.sourceSelect}><FormSelect label="Lead source" name="sales_source" isSearchable placeholder="Select a calling list" value={filters.source} options={[{ value: "", label: sourcesLoading ? "Loading sources..." : "Select a source" }, ...sourceOptions]} onValueChange={changeSource} /></div>
          {selectedSource && <div className={styles.sourceMeta}><strong>{selectedSource.active_count} active {Number(selectedSource.active_count) === 1 ? "lead" : "leads"}</strong><span>{selectedSource.lead_count} total{selectedSource.last_import_at ? ` / Last import ${fmt(selectedSource.last_import_at, true)}` : ""}</span></div>}
          {filters.source && <div className={styles.resumeBar}>
          {progress?.last_call && <CrmTooltip content={progress.last_call.name}><button className={styles.secondary} onClick={() => resumeLead("last_call")}><History size={16} />Resume last call</button></CrmTooltip>}
          {progress?.bookmark && <CrmTooltip content={progress.bookmark.name}><button className={`${styles.secondary} ${styles.bookmarkAction}`} onClick={() => resumeLead("bookmark")}><BookmarkCheck size={16} />Open bookmark</button></CrmTooltip>}
          {progressError && <span role="alert" className={styles.overdue}>{progressError}<button className={styles.clear} onClick={refresh}>Retry</button></span>}
          </div>}
        </section>
        {sourceError && <p role="alert" className={styles.error}>{sourceError}</p>}
        {/* <div className={styles.confidential}><ShieldCheck size={14} /><span>Confidential</span><span className={styles.watermark}>{queue.viewer.name || "Authorized CRM user"} · {viewedAt}</span></div> */}
        <div className={styles.metricHeading}><span>Call activity · {fmt(`${eodDate}T00:00:00+05:30`, true)}</span><small>Recorded attempts, not unique leads</small></div>
        <div className={styles.metrics}>{METRICS.map(([key, label]) => <button type="button" key={key} className={styles.metric} disabled={!filters.source || resourceLoading} aria-pressed={view === "calls" && callMetric === key} aria-label={`View ${label.toLowerCase()} calls`} onClick={() => { setCallMetric(key); setCallPage(1); setView("calls"); }}><span>{label}</span><strong>{resourceLoading ? "-" : totals[key]}</strong></button>)}</div>
        {filters.source && <SalesInsights data={insights} loading={insightsLoading} error={insightsError} onRetry={refresh} />}
        <nav className={styles.tabs} aria-label="Sales views">{VIEWS.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? styles.activeTab : ""} aria-current={view === id ? "page" : undefined} onClick={() => { setView(id); const url = new URL(window.location.href); url.searchParams.set("view", id); window.history.replaceState(null, "", url); }}><Icon size={16} />{label}</button>)}</nav>

        {admin && view !== "leads" && <div className={styles.ownerFilter}><FormSelect label="Team member" name="sales_owner" value={filters.owner === "unassigned" ? "" : filters.owner} options={ownerOptions} includeAll allLabel="All team members" onValueChange={(v) => changeFilter("owner", v)} /></div>}
        {!filters.source ? <div className={styles.empty}><FolderOpen size={28} /><h3>Select a source</h3></div> : <>
          {view === "leads" && <>
            <div className={styles.filters}>
              <div className={styles.search}><Search size={17} /><input aria-label="Search leads" placeholder="Search name, phone or email" value={filters.search} onChange={(e) => changeFilter("search", e.target.value)} /></div>
              <FormSelect name="sales_status" value={filters.status} options={SELECTABLE_SALES_STATUSES} includeAll allLabel="All statuses" onValueChange={(v) => changeFilter("status", v)} />
              {admin && <FormSelect name="assigned_to" value={filters.owner} options={[{ value: "unassigned", label: "Unassigned" }, ...ownerOptions]} includeAll allLabel="All owners" onValueChange={(v) => changeFilter("owner", v)} />}
              <label className={styles.check}><input type="checkbox" checked={filters.due === "overdue"} onChange={(e) => changeFilter("due", e.target.checked ? "overdue" : "")} />Overdue</label>
              {admin && <label className={styles.check}><input type="checkbox" checked={filters.archived === "true"} onChange={(e) => changeFilter("archived", e.target.checked ? "true" : "")} />Archived</label>}
              {activeFilters > 0 && <button className={styles.clear} onClick={() => { setSelectedIds([]); setFilters((f) => ({ search: "", status: "", owner: "", due: "", archived: "", source: f.source })); setPage(1); setFollowupPage(1); }}><X size={14} />Clear ({activeFilters})</button>}
            </div>
            {admin && selectedSource && <div className={styles.bulkBar}>
              <label className={styles.check}><input type="checkbox" aria-label="Select imported leads on this page" disabled={loading || !selectable.length} checked={pageSelected} ref={(node) => { if (node) node.indeterminate = !pageSelected && selectable.some((id) => selectedIds.includes(id)); }} onChange={() => selectLeads(pageSelected ? selectedIds.filter((id) => !selectable.includes(id)) : [...new Set([...selectedIds, ...selectable])])} />Select page</label>
              <span className={styles.muted}>{selectedIds.length} selected</span>
              {selectedIds.length > 0 && <><button className={styles.clear} onClick={() => setSelectedIds([])}>Clear selection</button><button className={styles.danger} onClick={() => setDeleteTarget({ source_id: filters.source, ids: [...selectedIds], all: false })}><Trash2 size={15} />Delete selected ({selectedIds.length})</button></>}
              <button className={`${styles.cancel} ${styles.deleteAll}`} onClick={() => setDeleteTarget({ source_id: filters.source, ids: [], all: true })}><Trash2 size={15} />Delete all imported</button>
            </div>}
            {error ? <div role="alert" className={styles.error}>{error}<button onClick={refresh} className={styles.secondary}>Retry</button></div> : loading ? <div className={styles.empty}><Loader2 className={styles.spinner} size={22} />Loading leads</div> : queue.leads.length ? <>
              <div className={styles.leadTable}>
                <div className={styles.tableHeader}><span>Name / Entity</span><span>Phone Number</span><span>Address</span><span className={styles.statusHeading}>Status / Follow-up</span><span>Latest Remark</span><span>Done by</span><span aria-label="Actions" /></div>
                {queue.leads.map((lead) => <article key={lead.id} data-lead-id={lead.id} tabIndex={-1} className={`${styles.leadRow} ${highlightLeadId === lead.id ? styles.highlightedLead : ""}`}>
                  <div className={styles.leadIdentity}>{admin && lead.import_id && <input type="checkbox" aria-label={`Select ${lead.name}`} checked={selectedIds.includes(lead.id)} onChange={(e) => selectLeads(e.target.checked ? [...selectedIds, lead.id] : selectedIds.filter((id) => id !== lead.id))} />}<div><button className={styles.name} onClick={() => openLead(lead.id)}>{lead.name}</button></div></div>
                  <div data-label="Phone Number"><LeadPhones value={lead.phone} /></div>
                  <div data-label="Address"><LeadAddress lead={lead} editable={admin || !lead.archived_at} onSaved={addressSaved} /></div>
                  <div data-label="Status / Follow-up" className={`${styles.stack} ${styles.statusCell}`}><Status value={lead.status} />{lead.next_due && <span className={new Date(lead.next_due) < new Date() ? styles.overdue : styles.muted}><Clock3 size={12} />{fmt(lead.next_due)}</span>}</div>
                  <div data-label="Latest Remark"><p className={styles.remark}>{lead.latest_activity?.remark || "-"}</p>{lead.latest_activity && <small className={styles.muted}>{fmt(lead.latest_activity.created_at)}</small>}</div>
                  <div data-label="Done by" className={styles.muted}><CrmTooltip content={lead.first_worked_by ? `First activity: ${fmt(lead.first_worked_by.created_at)}` : null} side="left"><span tabIndex={lead.first_worked_by ? 0 : undefined}>{lead.first_worked_by?.name || "-"}</span></CrmTooltip></div>
<div className={styles.rowActions}><TipButton className={`${styles.iconButton} ${styles.callAction}`} tooltip="Log a call" aria-label={`Log a call for ${lead.name}`} disabled={Boolean(lead.archived_at)} onClick={() => { openLead(lead.id); setActivityKind("call"); }}><PhoneCall size={17} /></TipButton><TipButton className={`${styles.iconButton} ${styles.openAction}`} onClick={() => openLead(lead.id)} tooltip="Open lead" side="left" aria-label={`Open ${lead.name}`}><ChevronRight size={17} /></TipButton>{(!progress?.bookmark || progress.bookmark.id === lead.id) && <TipButton className={`${styles.iconButton} ${styles.bookmarkAction}`} tooltip={progress?.bookmark?.id === lead.id ? "Remove bookmark" : "Bookmark this lead"} side="left" aria-label={`Bookmark ${lead.name}`} aria-pressed={progress?.bookmark?.id === lead.id} disabled={bookmarkBusy || Boolean(lead.archived_at)} onClick={() => bookmarkLead(lead)}>{progress?.bookmark?.id === lead.id ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}</TipButton>}</div>
                </article>)}
              </div><Pager page={page} total={queue.total} onChange={setPage} pageSize={SALES_PAGE_SIZE} />
            </> : <div className={styles.empty}><PhoneCall size={28} /><h3>No leads found</h3><p>{admin ? "Add a lead or import a calling sheet." : "Your assigned leads will appear here."}</p></div>}
          </>}

          {view === "calls" && <section data-call-activity className={styles.callActivityPanel} aria-label="Filtered call activity">
            <div className={styles.calendarToolbar}>
              <div><h2>{METRICS.find(([key]) => key === callMetric)?.[1]}</h2><p className={styles.muted}>{fmt(`${eodDate}T00:00:00+05:30`, true)} / {calls.total} call attempts</p></div>
<div className={styles.actions}><FormInput label="Activity date" name="call_activity_date" type="date" required value={eodDate} maxDate={istDate()} onValueChange={(date) => { if (!date) return; setEodDate(date); setCallPage(1); }} /><button className={styles.secondary} onClick={() => setView("leads")}><ChevronLeft size={16} />Calling Queue</button></div>
            </div>
            {callsError ? <p role="alert" className={styles.error}>{callsError}<button className={styles.secondary} onClick={refresh}>Retry</button></p> : callsLoading ? <div className={styles.empty}>Loading call activity...</div> : calls.rows.length ? calls.rows.map((call) => <article className={styles.callActivityRow} key={call.id}>
              <div>{call.lead_id ? <button className={styles.name} onClick={() => openLead(call.lead_id)}>{call.name}</button> : <strong>{call.name}</strong>}<p className={styles.muted}>{call.done_by} / {fmt(call.created_at)}</p></div>
              <Status value={call.status} /><p className={styles.callActivityRemark}>{call.remark || "-"}</p>
              {call.lead_id && <button className={`${styles.secondary} ${styles.openAction}`} onClick={() => openLead(call.lead_id)}>Open lead<ChevronRight size={16} /></button>}
            </article>) : <div className={styles.empty}>No matching calls for this date.</div>}
            {!callsLoading && !callsError && <Pager page={callPage} total={calls.total} pageSize={SALES_PAGE_SIZE} onChange={setCallPage} />}
          </section>}
          {view === "followups" && <section>
            {resourceError && <p className={styles.error} role="alert">{resourceError}</p>}
            {resourceLoading ? <div className={styles.empty}>Loading follow-ups...</div> : followups.followups.length ? followups.followups.map((f) => <article key={f.id} className={styles.followupRow}>
              <div><button className={styles.name} onClick={() => openLead(f.lead_id)}>{f.lead.name}</button><p className={styles.muted}>{f.title}</p></div>
              <span className={Date.parse(f.due_at) <= Date.now() ? styles.overdue : styles.muted}>{fmt(f.due_at)}</span>
              <div className={styles.actions}><button className={styles.secondary} disabled={busy} onClick={() => setSnooze(f)}><Clock3 size={15} />Snooze</button><TipButton tooltip="Complete reminder" aria-label="Complete reminder" className={styles.iconButton} disabled={busy} onClick={() => updateReminder(f, "complete")}><Check size={17} /></TipButton><button className={styles.primary} onClick={() => openLead(f.lead_id)}>Open lead<ChevronRight size={15} /></button></div>
            </article>) : <div className={styles.empty}>No pending follow-ups.</div>}
            <Pager page={followupPage} total={followups.total} onChange={setFollowupPage} />
          </section>}
          {view === "calendar" && <MeetingsCalendar key={filters.source} source={filters.source} owner={admin && filters.owner !== "unassigned" ? filters.owner : ""} revision={revision} onOpen={openLead} />}
          {view === "eod" && <section>
            <div className={styles.eodToolbar}><FormInput name="sales_eod_date" type="date" label="Report date" maxDate={istDate()} value={eodDate} onValueChange={setEodDate} /><p className={styles.muted}>Call attempts recorded between 00:00 and 23:59 IST. Imports, remarks and meeting-only updates are excluded.</p></div>
            {resourceError && <p className={styles.error}>{resourceError}</p>}
            <div className={styles.eodRows}>{eod.map((row) => <article key={row.user_id} className={styles.eodRow}><h3><UserRound size={16} />{row.user_name}</h3><dl>{METRICS.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{row[key]}</dd></div>)}</dl></article>)}</div>
            {!eod.length && !resourceLoading && !resourceError && <div className={styles.empty}>No sales activity for this date.</div>}
          </section>}

        </>}
        {createOpen && <LeadForm users={ownerOptions} sources={sources} sourceId={filters.source} admin={admin} onClose={() => setCreateOpen(false)} onSaved={(lead) => { setCreateOpen(false); changeSource(lead.source_id); refresh(); openLead(lead.id); }} />}
        {importOpen && <ImportDialog users={ownerOptions} viewerId={queue.viewer.id} admin={admin} sources={sources} sourceId={filters.source} onClose={() => setImportOpen(false)} onSaved={(data) => { changeSource(data.source_id); refresh(); }} />}
        {admin && deleteTarget && <DeleteLeadsDialog target={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={(data) => {
          if (deleteTarget.all || deleteTarget.ids.includes(leadId)) closeLead();
          setDeleteTarget(null); setSelectedIds([]); setPage(1); setQueue((q) => ({ ...q, leads: [], total: 0 })); setLoading(true); refresh();
          toast.success(`${data.deleted} imported leads deleted`);
        }} />}
        {leadId && <Dialog title={detail?.lead.name || "Lead details"} wide onClose={closeLead}>
          {detailLoading ? <div className={styles.empty}><Loader2 className={styles.spinner} />Loading lead...</div> : detail ? <>
            <div className={styles.leadOverview}><Status value={detail.lead.status} /><span className={styles.muted}>Source: {sources.find((s) => s.id === detail.lead.source_id)?.name || detail.lead.source}</span><span className={styles.muted}>Assigned to: {detail.lead.assigned_names?.join(", ") || detail.lead.assigned_name}</span><span className={styles.muted}>Meeting coordinator: {detail.lead.assigned_name}</span><span className={styles.muted}>RNR attempts: {detail.lead.rnr_count}/6</span></div>
            <div className={styles.contactBand}>{phoneNumbers(detail.lead.phone).map((number) => <span key={number.key} className={styles.phoneContact}><a href={`tel:${number.key}`}><Phone size={16} />{number.phone}</a><CrmTooltip content={`WhatsApp ${number.phone}`}><a className={styles.whatsappLink} href={whatsappUrl(number.key)} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${number.phone}`}><MessageCircle size={16} />WhatsApp</a></CrmTooltip></span>)}{detail.lead.email && <span>{detail.lead.email}</span>}</div>
            <div className={styles.detailSection}><h3>Address</h3><LeadAddress lead={detail.lead} editable={admin || !detail.lead.archived_at} onSaved={addressSaved} /></div>
            <div className={styles.actions}>
              {!detail.lead.archived_at && (!progress?.bookmark || progress.bookmark.id === detail.lead.id) && <button className={`${styles.secondary} ${styles.bookmarkAction}`} disabled={bookmarkBusy} onClick={() => bookmarkLead(detail.lead)}>{progress?.bookmark?.id === detail.lead.id ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}{progress?.bookmark?.id === detail.lead.id ? "Remove bookmark" : "Bookmark lead"}</button>}
              {queue.leads.findIndex((l) => l.id === detail.lead.id) >= 0 && queue.leads.findIndex((l) => l.id === detail.lead.id) < queue.leads.length - 1 && <button className={styles.secondary} onClick={() => openLead(queue.leads[queue.leads.findIndex((l) => l.id === detail.lead.id) + 1].id)}>Next lead<ChevronRight size={15} /></button>}
              {!detail.lead.archived_at && <>
                <button className={styles.primary} disabled={["Do Not Call", "Converted"].includes(detail.lead.status)} onClick={() => setActivityKind("call")}><PhoneCall size={16} />Log call</button>
                <button className={styles.secondary} onClick={() => setActivityKind("note")}><MessageSquarePlus size={16} />Add remark</button>
                <button className={styles.secondary} onClick={() => setActivityKind("schedule")}><CalendarDays size={16} />Schedule meeting</button>
                <button className={styles.secondary} onClick={() => setActivityKind("complete")}><FileText size={16} />Meeting completed</button>
              </>}
              {admin && <button className={styles.secondary} onClick={() => setContactOpen(true)}><UserRound size={16} />Manage lead</button>}
            </div>
            {detail.followups.length > 0 && <section className={styles.detailSection}><h3><CalendarClock size={16} />Upcoming reminders</h3>{detail.followups.map((f) => <div key={f.id} className={styles.inlineReminder}><span>{f.title}</span><strong className={Date.parse(f.due_at) <= Date.now() ? styles.overdue : ""}>{fmt(f.due_at)}</strong><TipButton className={styles.iconButton} tooltip="Complete reminder" aria-label="Complete reminder" disabled={busy} onClick={() => updateReminder(f, "complete")}><Check size={15} /></TipButton></div>)}</section>}
            {detail.meetings.length > 0 && <section className={styles.detailSection}><h3><CalendarDays size={16} />Meetings</h3>{detail.meetings.map((m) => <div key={m.id} className={styles.inlineReminder}><span>{fmt(m.starts_at)} · {m.status}{m.location && <small className={styles.muted}>{m.location}</small>}</span>{m.meeting_note_id && <Link className={styles.link} href={`/admin/meeting-notes?meeting_id=${m.meeting_note_id}`}>Meeting Notes<ChevronRight size={14} /></Link>}{m.status === "Scheduled" && <button className={styles.clear} onClick={() => setActivityKind("cancel")}>Cancel meeting</button>}</div>)}</section>}
            <section className={styles.detailSection}><h3><History size={16} />Activity & remarks</h3><ol className={styles.timeline}>{detail.activities.map((a) => <li key={a.id}>
              <div className={styles.timelineHeader}><strong>{a.done_by}</strong><span className={styles.kind}>{a.kind}</span><time dateTime={a.created_at}>{fmt(a.created_at)}</time></div>
              {a.previous_status !== a.status && <Status value={a.status} />}
              <p>{a.remark}</p>{a.metadata?.source_done_by && <small className={styles.muted}>Original sheet: {a.metadata.source_done_by}</small>}
              {a.metadata?.meeting_note_id && <Link className={styles.link} href={`/admin/meeting-notes?meeting_id=${a.metadata.meeting_note_id}`}>Open Meeting Notes<ChevronRight size={14} /></Link>}
            </li>)}</ol><Pager page={detailPage} total={detail.activity_total} onChange={setDetailPage} /></section>
          </> : <div className={styles.error}>Unable to open this lead.<button className={styles.secondary} onClick={loadDetail}>Retry</button></div>}
        </Dialog>}
        {detail && activityKind && <ActivityDialog lead={detail.lead} preset={activityKind} onClose={() => setActivityKind(null)} onSaved={() => { setActivityKind(null); setDetailPage(1); refresh(); }} />}
        {detail && contactOpen && <LeadForm lead={detail.lead} users={ownerOptions} admin onClose={() => setContactOpen(false)} onSaved={() => { setContactOpen(false); refresh(); }} />}
        {snooze && <SnoozeDialog reminder={snooze} busy={busy} onClose={() => setSnooze(null)} onSave={(date) => updateReminder(snooze, "snooze", date)} />}
      </div>
    </SalesViewer.Provider>
  );
}

function LeadForm({ lead, users, sources = [], sourceId = "", admin, onClose, onSaved }) {
  const [form, setForm] = useState({ name: lead?.name || "", phone: lead?.phone || "", email: lead?.email || "", address: lead?.address || "", source_id: sourceId, assigned_to: lead?.assigned_to || "", assigned_user_ids: lead?.assigned_user_ids || (lead?.assigned_to ? [lead.assigned_to] : []), remark: "", archived: Boolean(lead?.archived_at), reopen: false });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  async function save(e) {
    e.preventDefault(); if (saving) return; setSaving(true);
    try { const data = await api(lead ? `/${lead.id}` : "", { method: lead ? "PATCH" : "POST", body: { ...form, version: lead?.version } }); toast.success(lead ? "Lead updated" : "Lead added"); onSaved(data.lead); }
    catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }
  return <Dialog title={lead ? "Manage lead" : "Add lead"} onClose={() => { if (!saving) onClose(); }}><form onSubmit={save} className={styles.form}>
    {!lead && <FormSelect label="Source" name="lead_source" value={form.source_id} options={sources.map((s) => ({ value: s.id, label: s.name }))} onValueChange={(v) => set("source_id", v)} required />}
    <FormInput label="Name / Entity" name="sales_name" value={form.name} onValueChange={(v) => set("name", v)} required />
    <FormInput label="Phone" name="sales_phone" type="tel" value={form.phone} onValueChange={(v) => set("phone", v)} required />
    <FormInput label="Email address" name="sales_email" type="email" value={form.email} onValueChange={(v) => set("email", v)} />
    {!lead && <FormInput label="Address" name="sales_address" multiline rows={3} value={form.address} onValueChange={(v) => set("address", v)} />}
    {admin && (lead ? <FormSelect label="Assigned to" name="sales_assign" options={users} isMulti isSearchable value={form.assigned_user_ids} onValueChange={(v) => set("assigned_user_ids", v)} placeholder="Unassigned" /> : <FormSelect label="Assigned to" name="sales_assign" options={[{ value: "", label: "Unassigned" }, ...users]} value={form.assigned_to} onValueChange={(v) => set("assigned_to", v)} />)}
    {!lead && <FormInput label="Initial remark" name="sales_initial_remark" multiline rows={3} value={form.remark} onValueChange={(v) => set("remark", v)} />}
    {lead && <><label className={styles.check}><input type="checkbox" checked={form.archived} onChange={(e) => set("archived", e.target.checked)} />Archive lead</label>{["Do Not Call", "Converted", "Not Interested", "Wrong Number"].includes(lead.status) && <label className={styles.check}><input type="checkbox" checked={form.reopen} onChange={(e) => set("reopen", e.target.checked)} />Reopen lead for calling</label>}</>}
    <div className={styles.formActions}><button type="button" className={styles.cancel} disabled={saving} onClick={onClose}>Cancel</button><button className={styles.primary} disabled={saving}>{saving ? "Saving..." : lead ? "Save changes" : "Add lead"}</button></div>
  </form></Dialog>;
}

function ActivityDialog({ lead, preset, onClose, onSaved }) {
  const [form, setForm] = useState({ status: preset === "schedule" ? "Meeting Schedule" : preset === "complete" ? "Meeting Completed" : preset === "cancel" ? "Meeting Cancelled" : "RNR", remark: "", due: "", meeting: "", end: "", location: "", meeting_notes: "" });
  const [saving, setSaving] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const noteOnly = preset === "note";
  const automatic = ["Call Busy", "Switched off"].includes(form.status);
  const suggested = suggestedFollowup(form.status, form.remark);
  const needsFollowup = FOLLOWUP_STATUSES.includes(form.status);
  async function save(e) {
    e.preventDefault(); if (saving) return; setSaving(true);
    try {
      await api(`/${lead.id}/activities`, {
        method: "POST", body: {
          version: lead.version, request_id: requestId.current,
          kind: noteOnly ? "note" : preset === "call" ? "call" : "meeting", status: form.status, remark: form.remark,
          due_at: automatic ? suggested : fromIstInput(form.due), meeting_at: fromIstInput(form.meeting), meeting_end: fromIstInput(form.end), location: form.location, meeting_notes: form.meeting_notes
        }
      });
      toast.success(noteOnly ? "Remark added" : "Activity saved"); onSaved();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }
  return <Dialog title={noteOnly ? "Add remark" : preset === "call" ? "Log call" : form.status} onClose={() => { if (!saving) onClose(); }}><form onSubmit={save} className={styles.form}>
    <div className={styles.contactBand}><strong>{lead.name}</strong><span>{lead.phone}</span></div>
    {!noteOnly && preset === "call" && <FormSelect label="Call status" name="sales_call_status" value={form.status} options={CALL_STATUSES.map((s) => ({ value: s, label: s === "RNR" ? `RNR-${Math.min(6, lead.rnr_count + 1)}` : s }))} onValueChange={(v) => set("status", v)} isSearchable filterOption={callStatusMatches} required />}
    <FormInput label="Remark" name="sales_call_remark" value={form.remark} onValueChange={(v) => set("remark", v)} required={preset !== "call"} multiline rows={3} voice />
    {!noteOnly && (needsFollowup || automatic || form.status === "RNR") && <div>
      {automatic ? <p className={styles.scheduleHint}><CalendarClock size={16} />Automatic reminder: {fmt(suggested)}</p> : <>
        {needsFollowup && suggested && <button type="button" className={styles.suggested} onClick={() => set("due", toIstInput(suggested))}><CalendarClock size={15} />Use suggested time: {fmt(suggested)}</button>}
        <FormInput label="Follow-up time (IST)" name="sales_due" type="datetime-local" value={form.due} onValueChange={(v) => set("due", v)} required={needsFollowup} />
      </>}
    </div>}
    {!noteOnly && form.status === "Meeting Schedule" && <>
      <FormInput label="Meeting starts (IST)" name="sales_meeting_start" type="datetime-local" value={form.meeting} onValueChange={(v) => { set("meeting", v); const instant = fromIstInput(v); if (instant) set("end", toIstInput(new Date(Date.parse(instant) + 30 * 60000))); }} required />
      <FormInput label="Meeting ends (IST)" name="sales_meeting_end" type="datetime-local" value={form.end} onValueChange={(v) => set("end", v)} required />
      <FormInput label="Location / Meeting link" name="sales_meeting_location" value={form.location} onValueChange={(v) => set("location", v)} />
    </>}
    {!noteOnly && form.status === "Meeting Completed" && <FormInput label="Minutes of the meeting" name="sales_minutes" multiline rows={6} voice required value={form.meeting_notes} onValueChange={(v) => set("meeting_notes", v)} />}
    <div className={styles.formActions}><button type="button" className={styles.cancel} disabled={saving} onClick={onClose}>Cancel</button><button type="submit" className={styles.primary} disabled={saving}>{saving ? "Saving..." : noteOnly ? "Add remark" : "Save activity"}</button></div>
  </form></Dialog>;
}

function ImportDialog({ users, sources, sourceId, viewerId, admin, onClose, onSaved }) {
  const [preview, setPreview] = useState(null);
  const [owners, setOwners] = useState(admin ? [] : [viewerId].filter(Boolean));
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);
  const [sheet, setSheet] = useState("");
  const [result, setResult] = useState(null);
  const [visible, setVisible] = useState(50);
  const [sourceMode, setSourceMode] = useState(sourceId ? "existing" : "new");
  const [targetSource, setTargetSource] = useState(sourceId || "");
  const [sourceName, setSourceName] = useState("");
  const destination = sourceMode === "existing" ? sources.find((s) => s.id === targetSource)?.name : sourceName.trim();
  async function readFile(nextFile, selectedSheet = "") {
    if (!nextFile) return;
    setBusy(true); setResult(null);
    try { const form = new FormData(); form.append("file", nextFile); if (selectedSheet) form.append("sheet", selectedSheet); const data = await api("/import", { method: "POST", body: form }); setFile(nextFile); setPreview(data); setSheet(data.sheet); setVisible(50); }
    catch (e) { setPreview(null); toast.error(e.message); } finally { setBusy(false); }
  }
  async function save() {
    if (busy || !preview) return;
    setBusy(true);
    try {
      const data = await api("/import", { method: "PUT", body: { filename: preview.filename, source_id: sourceMode === "existing" ? targetSource : null, source_name: sourceMode === "new" ? sourceName : null, assigned_user_ids: owners, rows: preview.rows.filter((r) => r.valid) } });
      setResult(data); setPreview(null); toast.success(`${data.accepted} leads imported into ${data.source_name}`); onSaved(data);
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }
  return <Dialog title={result ? `Imported into ${result.source_name}` : "Import calling sheet"} wide onClose={() => { if (!busy) onClose(); }}>
    <div className={styles.form}>
      {!result && <>
        <div className={styles.sourceModes} role="group" aria-label="Import destination">{[["existing", "Existing source"], ["new", "New source"]].map(([value, label]) => <button type="button" key={value} aria-pressed={sourceMode === value} disabled={busy} onClick={() => setSourceMode(value)}>{label}</button>)}</div>
        {sourceMode === "existing" ? <FormSelect label="Source" name="import_source" value={targetSource} options={[{ value: "", label: "Select a source" }, ...sources.map((s) => ({ value: s.id, label: `${s.name} (${s.active_count} active)` }))]} onValueChange={setTargetSource} /> : <FormInput label="Source name" name="import_source_name" value={sourceName} onValueChange={setSourceName} maxLength={120} required />}
        <label className={styles.fileLabel}><Upload size={20} /><span>{file?.name || "Choose Excel / CSV file"}</span><small>Maximum 10,000 leads / 10 MB</small><input aria-label="Calling sheet" type="file" accept=".xlsx,.xls,.csv" disabled={busy} onChange={(e) => readFile(e.target.files[0])} /></label>
        <FormSelect label="Assign imported leads to" name="import_owner" isMulti isSearchable disabled={busy} required={!admin} value={owners} options={users} onValueChange={setOwners} placeholder={admin ? "Unassigned" : "Select team members"} />
      </>}
      {preview?.sheets.length > 1 && <FormSelect label="Worksheet" name="import_sheet" value={sheet} options={preview.sheets} onValueChange={(v) => readFile(file, v)} />}
      {busy && <p className={styles.muted}>Processing calling sheet...</p>}
      {preview && <><div className={styles.importSummary}><strong>{preview.rows.length} rows</strong><span>{preview.valid} ready</span><span>{preview.rejected} rejected</span></div>
        <div className={styles.importRows}>{preview.rows.slice(0, visible).map((r) => <div key={r.row}><span>Row {r.row}</span><strong>{r.name || "-"}</strong><span>{r.phone}</span><span className={r.valid ? styles.success : styles.overdue}>{r.valid ? r.status : r.error}</span></div>)}</div>
        {visible < preview.rows.length && <button className={styles.secondary} onClick={() => setVisible((n) => n + 50)}>Show 50 more</button>}
        <dl className={styles.importSummary}><div><dt>Source</dt><dd>{destination || "Not selected"}</dd></div><div><dt>Shared with</dt><dd>{owners.map((id) => users.find((u) => u.value === id)?.label || "Sales user").join(", ") || "Unassigned"}</dd></div><div><dt>Meeting coordinator</dt><dd>{users.find((u) => u.value === owners[0])?.label || "Unassigned"}</dd></div></dl>
        <div className={styles.formActions}><button className={styles.cancel} disabled={busy} onClick={onClose}>Cancel</button><button className={styles.primary} disabled={busy || !preview.valid || !destination || (!admin && !owners.length) || (sourceMode === "new" && sourceName.trim().length > 120)} onClick={save}><Check size={16} />Import {preview.valid} valid leads</button></div>
      </>}
      {result && <div role="status"><p className={styles.success}>{result.accepted} imported · {result.rejected} rejected at save</p>{result.errors.map((e, i) => <p key={i} className={styles.muted}>Row {e.row}: {e.error}</p>)}<button className={styles.secondary} onClick={onClose}>Done</button></div>}
    </div>
  </Dialog>;
}

function DeleteLeadsDialog({ target, onClose, onDeleted }) {
  const [preview, setPreview] = useState(null), [loading, setLoading] = useState(true), [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState(""), [error, setError] = useState("");
  const loadPreview = useCallback(async () => {
    setLoading(true); setError(""); setPreview(null); setConfirmation("");
    try { setPreview(await api("/bulk-delete", { method: "POST", body: target })); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [target]);
  useEffect(() => { loadPreview(); }, [loadPreview]);
  const required = target.all ? preview?.source_name : "DELETE";
  async function remove(e) {
    e.preventDefault();
    if (deleting || !preview?.count || confirmation.trim() !== required) return;
    setDeleting(true); setError("");
    try { onDeleted(await api("/bulk-delete", { method: "DELETE", body: { ...target, fingerprint: preview.fingerprint, confirmation } })); }
    catch (e) { setError(e.message); } finally { setDeleting(false); }
  }
  return <Dialog title={target.all ? "Delete all imported leads" : "Delete selected leads"} onClose={() => { if (!deleting) onClose(); }}>
    <form className={styles.form} onSubmit={remove}>
      {loading ? <p className={styles.muted}>Checking imported leads...</p> : preview && <>
        <p><strong>{preview.count.toLocaleString("en-IN")} imported leads</strong> in <strong>{preview.source_name}</strong></p>
        {target.all && <p className={styles.muted}>Includes archived imported leads and every importer. Current table filters do not limit this deletion. Manually added leads and the source itself are kept.</p>}
        {preview.count > 0 ? <><p className={styles.overdue}>Permanent deletion removes these leads, their call/remark history, scheduled meetings, follow-ups and lead notifications. Calculated call totals will change. Submitted EOD reports, tasks and saved Meeting Notes are kept.</p>
          <p className={styles.muted}>Type <strong>{required}</strong> to confirm. This cannot be undone.</p>
          <FormInput label="Deletion confirmation" name="sales_delete_confirmation" value={confirmation} onValueChange={setConfirmation} disabled={deleting} required />
        </> : <p className={styles.muted}>There are no imported leads to delete in this source.</p>}
      </>}
      {error && <div role="alert" className={styles.error}>{error}<button type="button" className={styles.secondary} disabled={loading || deleting} onClick={loadPreview}>Review again</button></div>}
      <div className={styles.formActions}><button type="button" className={styles.secondary} disabled={deleting} onClick={onClose}>Cancel</button><button type="submit" className={styles.danger} disabled={loading || deleting || Boolean(error) || !preview?.count || confirmation.trim() !== required}><Trash2 size={16} />{deleting ? "Deleting..." : "Permanently delete"}</button></div>
    </form>
  </Dialog>;
}

function SnoozeDialog({ reminder, busy, onClose, onSave }) {
  const [due, setDue] = useState(toIstInput(new Date(Date.now() + 3600000)));
  return <Dialog title="Snooze reminder" onClose={onClose}><form className={styles.form} onSubmit={(e) => { e.preventDefault(); const date = fromIstInput(due); if (!date || Date.parse(date) <= Date.now()) return toast.error("Choose a future time"); onSave(date); }}><p>{reminder.title}</p><FormInput label="Remind at (IST)" name="snooze_at" type="datetime-local" required value={due} onValueChange={setDue} /><div className={styles.formActions}><button type="button" className={styles.cancel} disabled={busy} onClick={onClose}>Cancel</button><button className={styles.primary} disabled={busy}>Snooze</button></div></form></Dialog>;
}

function MeetingsCalendar({ source, owner, revision, onOpen }) {
  const [month, setMonth] = useState(istDate().slice(0, 7));
  const [selected, setSelected] = useState(istDate());
  const [meetings, setMeetings] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [year, m] = month.split("-").map(Number);
  const count = new Date(year, m, 0).getDate();
  const offset = (new Date(year, m - 1, 1).getDay() + 6) % 7;
  function move(direction) { const d = new Date(Date.UTC(year, m - 1 + direction, 1)); setMonth(d.toISOString().slice(0, 7)); setSelected(d.toISOString().slice(0, 10)); }
  useEffect(() => {
    let alive = true; setError(""); setLoading(true);
    const next = new Date(Date.UTC(year, m, 1)).toISOString().slice(0, 10);
    const params = new URLSearchParams({ source, from: `${month}-01T00:00:00+05:30`, to: `${next}T00:00:00+05:30`, ...(owner ? { owner } : {}) });
    api(`/calendar?${params}`).then((data) => { if (alive) setMeetings(data.meetings || []); }).catch((e) => { if (alive) setError(e.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [year, m, month, owner, source, revision]);
  const selectedEvents = meetings.filter((event) => istDate(new Date(event.starts_at)) === selected);
  return <section>
    <div className={styles.calendarToolbar}><h2>{new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date(year, m - 1, 1))}</h2><div className={styles.actions}><button className={styles.secondary} onClick={() => { setMonth(istDate().slice(0, 7)); setSelected(istDate()); }}>Today</button><button className={styles.iconButton} aria-label="Previous month" onClick={() => move(-1)}><ChevronLeft size={17} /></button><button className={styles.iconButton} aria-label="Next month" onClick={() => move(1)}><ChevronRight size={17} /></button></div></div>
    {error && <p className={styles.error}>{error}</p>}{loading && <p className={styles.muted}>Loading meetings...</p>}
    <div className={styles.calendar}>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className={styles.weekday}>{d}</div>)}
      {Array.from({ length: offset }, (_, i) => <div className={styles.calendarBlank} key={`blank${i}`} />)}
      {Array.from({ length: count }, (_, i) => {
        const key = `${month}-${String(i + 1).padStart(2, "0")}`;
        const events = meetings.filter((event) => istDate(new Date(event.starts_at)) === key && event.status !== "Cancelled");
        return <button key={key} aria-label={`${key}, ${events.length} meetings`} aria-pressed={selected === key} className={`${styles.calendarDay} ${selected === key ? styles.selectedDay : ""}`} onClick={() => setSelected(key)}><strong>{i + 1}</strong>{events.slice(0, 2).map((event) => <span key={event.id} className={styles.calendarEvent}>{new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }).format(new Date(event.starts_at))} {event.lead.name}</span>)}{events.length > 0 && <span className={styles.calendarCount}>{events.length} meeting{events.length > 1 ? "s" : ""}</span>}</button>;
      })}
    </div>
    <h3 className={styles.agendaTitle}>{fmt(`${selected}T00:00:00+05:30`, true)}</h3>
    {selectedEvents.map((event) => <article className={styles.followupRow} key={event.id}><div><button className={styles.name} onClick={() => onOpen(event.lead_id)}>{event.lead.name}</button><p className={styles.muted}>{fmt(event.starts_at)} - {new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }).format(new Date(event.ends_at))}</p>{event.location && <p className={styles.muted}>{event.location}</p>}</div><span className={styles.kind}>{event.status}</span><button className={styles.secondary} onClick={() => onOpen(event.lead_id)}>Open lead<ChevronRight size={15} /></button></article>)}
    {!selectedEvents.length && <div className={styles.empty}>No meetings on this date.</div>}
  </section>;
}
