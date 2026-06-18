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

      <div className="glass-card p-6 overflow-x-auto">
        {selectedIds.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3">
            <p className="text-sm font-semibold text-red-700">
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
          <p className="text-sm text-gray-500">Loading audit logs...</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-gray-500">No audit logs found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-3 pr-4">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600"
                    aria-label="Select all visible audit logs"
                  />
                </th>
                <th className="py-3 pr-4">Time</th>
                <th className="py-3 pr-4">Actor</th>
                <th className="py-3 pr-4">Role</th>
                <th className="py-3 pr-4">Action</th>
                <th className="py-3 pr-4">Entity</th>
                <th className="py-3 pr-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b last:border-0">
                  <td className="py-3 pr-4">
                    <input
                      type="checkbox"
                      checked={selectedIdSet.has(log.id)}
                      onChange={() => toggleSelected(log.id)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600"
                      aria-label={`Select audit log ${log.action}`}
                    />
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">{formatTimestamp(log.created_at)}</td>
                  <td className="py-3 pr-4">{log.actor_email || log.actor_id || "-"}</td>
                  <td className="py-3 pr-4">{log.actor_role || "-"}</td>
                  <td className="py-3 pr-4 font-medium text-gray-800">{log.action}</td>
                  <td className="py-3 pr-4">
                    {log.entity_type}
                    {log.entity_id ? ` / ${log.entity_id}` : ""}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    <CrmTooltip content="Delete audit log" side="left">
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(log)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-100 bg-red-50 text-red-600 transition hover:bg-red-100"
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
        )}
      </div>

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
