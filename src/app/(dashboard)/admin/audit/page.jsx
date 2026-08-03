"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabaseClient";
import { ShieldCheck, Trash2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import ConfirmDialog from "@/components/ConfirmDialog";
import { authFetch } from "@/lib/authFetch";
import CrmTooltip from "@/components/CrmTooltip";
import { formatDateTimeDDMonYYYY } from "@/lib/dateFormat";

function formatTimestamp(value) {
  return formatDateTimeDDMonYYYY(value, "-");
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleting, setDeleting] = useState(false);

  async function fetchLogs() {
    setLoading(true);
    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      toast.error("Failed to load audit logs");
      setLoading(false);
      return;
    }

    setLogs(data || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchLogs();
  }, []);

  const selectedIdSet = new Set(selectedIds);
  const allVisibleSelected = logs.length > 0 && logs.every((log) => selectedIdSet.has(log.id));

  function toggleSelected(id) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]
    );
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      const visibleIds = logs.map((log) => log.id);
      const currentSet = new Set(current);
      const shouldClear = visibleIds.every((id) => currentSet.has(id));
      if (shouldClear) return current.filter((id) => !visibleIds.includes(id));
      return [...new Set([...current, ...visibleIds])];
    });
  }

  async function deleteAuditLogs() {
    const ids = deleteTarget?.ids || (deleteTarget?.id ? [deleteTarget.id] : []);
    if (!ids.length) return;

    setDeleting(true);
    const response = await authFetch("/api/audit-logs", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    const data = await response.json().catch(() => ({}));
    setDeleting(false);

    if (!response.ok) {
      toast.error(data.error || "Failed to delete audit log");
      return;
    }

    setDeleteTarget(null);
    setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
    toast.success(ids.length === 1 ? "Audit log deleted" : "Audit logs deleted");
    fetchLogs();
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        eyebrow="Security activity"
        title="Audit Logs"
        description="Recent security and CRM activity."
        icon={ShieldCheck}
      />

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <div>
            <h2 className="text-base font-bold text-slate-950 dark:text-slate-50">Audit Activity</h2>
            <p className="text-sm text-slate-500 dark:text-slate-300">{logs.length} recent event{logs.length === 1 ? "" : "s"}</p>
          </div>
        </div>

        <div>
        {selectedIds.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 dark:border-red-400/35 dark:bg-red-500/15">
            <p className="text-sm font-semibold text-red-700 dark:text-red-100">
              {selectedIds.length} audit log{selectedIds.length === 1 ? "" : "s"} selected
            </p>
            <button
              type="button"
              onClick={() => setDeleteTarget({ ids: selectedIds })}
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
            >
              <Trash2 size={15} />
              Delete selected
            </button>
          </div>
        )}

        {loading ? (
          <p className="min-h-40 py-8 text-center text-sm text-slate-500 dark:text-slate-300">Loading audit logs...</p>
        ) : logs.length === 0 ? (
          <p className="min-h-40 py-8 text-center text-sm text-slate-500 dark:text-slate-300">No audit logs found.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] table-fixed divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <colgroup>
              <col className="w-10" />
              <col className="w-42" />
              <col className="w-44" />
              <col className="w-24" />
              <col className="w-56" />
              <col className="w-52" />
              <col className="w-16" />
            </colgroup>
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-300">
              <tr>
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 dark:border-slate-600 dark:bg-slate-950"
                    aria-label="Select all visible audit logs"
                  />
                </th>
                <th className="px-3 py-3">Time</th>
                <th className="px-3 py-3">Actor</th>
                <th className="px-3 py-3">Role</th>
                <th className="px-3 py-3">Action</th>
                <th className="px-3 py-3">Entity</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/70 dark:bg-slate-900 dark:hover:bg-slate-800">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIdSet.has(log.id)}
                      onChange={() => toggleSelected(log.id)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 dark:border-slate-600 dark:bg-slate-950"
                      aria-label={`Select audit log ${log.action}`}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600 dark:text-slate-300">{formatTimestamp(log.created_at)}</td>
                  <td className="truncate px-3 py-3 text-slate-800 dark:text-slate-50">{log.actor_email || log.actor_id || "-"}</td>
                  <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{log.actor_role || "-"}</td>
                  <td className="truncate px-3 py-3 font-semibold text-slate-900 dark:text-slate-50">{log.action}</td>
                  <td className="truncate px-3 py-3 text-slate-600 dark:text-slate-300">
                    {log.entity_type}
                    {log.entity_id ? ` / ${log.entity_id}` : ""}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <CrmTooltip content="Delete audit log" side="left">
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(log)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-100 bg-red-50 text-red-600 transition hover:bg-red-100 dark:border-red-400/40 dark:bg-red-500/20 dark:text-red-100 dark:hover:bg-red-500/30"
                        aria-label="Delete audit log"
                      >
                        <Trash2 size={15} />
                      </button>
                    </CrmTooltip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget?.ids?.length > 1 ? "Delete selected audit logs?" : "Delete audit log?"}
        message={
          deleteTarget?.ids?.length > 1
            ? `This removes ${deleteTarget.ids.length} selected audit history rows. A deletion audit entry will be recorded.`
            : "This removes the selected audit history row. A deletion audit entry will be recorded."
        }
        confirmLabel={deleteTarget?.ids?.length > 1 ? "Delete logs" : "Delete log"}
        loading={deleting}
        onConfirm={deleteAuditLogs}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
