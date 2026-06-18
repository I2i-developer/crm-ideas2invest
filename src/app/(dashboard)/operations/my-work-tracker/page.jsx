"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Edit3, Plus, Search, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import PageHeader from "@/components/PageHeader";
import CrmTooltip from "@/components/CrmTooltip";
import { authFetch } from "@/lib/authFetch";
import FormInput from "@/app/(dashboard)/admin/clients/components/FormInput";
import FormSelect from "@/app/(dashboard)/admin/clients/components/FormSelect";
import { formatDateDDMonYYYY } from "@/lib/dateFormat";

const STATUSES = ["Pending", "In progress", "Done", "On hold", "Cancelled"];
const DONE_BY_COLORS = [
  "border-blue-100 bg-blue-50 text-blue-700",
  "border-emerald-100 bg-emerald-50 text-emerald-700",
  "border-violet-100 bg-violet-50 text-violet-700",
  "border-amber-100 bg-amber-50 text-amber-700",
  "border-rose-100 bg-rose-50 text-rose-700",
  "border-cyan-100 bg-cyan-50 text-cyan-700",
];

const emptyForm = {
  client_name: "",
  task_date: new Date().toISOString().slice(0, 10),
  task_description: "",
  remark: "",
  done_by_ids: [],
  status: "Pending",
  priority: "Medium",
};

function statusClass(status) {
  const styles = {
    Pending: "bg-amber-50 text-amber-700 border-amber-100",
    "In progress": "bg-blue-50 text-blue-700 border-blue-100",
    Done: "bg-emerald-50 text-emerald-700 border-emerald-100",
    "On hold": "bg-slate-50 text-slate-700 border-slate-200",
    Cancelled: "bg-red-50 text-red-700 border-red-100",
  };
  return styles[status] || styles.Pending;
}

function formatDate(value) {
  return formatDateDDMonYYYY(value, "-");
}

function normalizeDoneByNames(value) {
  return (value || [])
    .map((item) => {
      if (typeof item === "string") return item.trim();
      return String(item?.name || item?.label || "").trim();
    })
    .filter(Boolean);
}

function doneByFromNames(names) {
  return normalizeDoneByNames(names).map((name) => ({ id: null, name }));
}

function DoneByChips({ names, onRemove }) {
  const normalizedNames = normalizeDoneByNames(names);

  if (normalizedNames.length === 0) {
    return <span className="text-slate-400">-</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {normalizedNames.map((name, index) => (
        <span
          key={`${name}-${index}`}
          className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${DONE_BY_COLORS[index % DONE_BY_COLORS.length]}`}
        >
          <span className="truncate">{name}</span>
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(name)}
              className="rounded-full p-0.5 transition hover:bg-white/70"
              aria-label={`Remove ${name}`}
            >
              <X size={12} />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}

function DoneByNameList({ names, inputValue, onInputChange, onAdd, onRemove }) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-slate-700">Done by</label>
      <div className="flex gap-2">
        <input
          value={inputValue}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onAdd();
            }
          }}
          placeholder="Type a person name"
          className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
        />
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          <Plus size={15} /> Add
        </button>
      </div>
      <DoneByChips names={names} onRemove={onRemove} />
      <p className="text-xs text-slate-500">Add anyone involved in the work. CRM user account is not required.</p>
    </div>
  );
}

export default function MyWorkTrackerPage() {
  const [tasks, setTasks] = useState([]);
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [doneByName, setDoneByName] = useState("");
  const [editingTask, setEditingTask] = useState(null);
  const [formExpanded, setFormExpanded] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filters, setFilters] = useState({
    search: "",
    client_name: "",
    status: "",
    done_by: "",
    date_from: "",
    date_to: "",
  });

  const operationsUser = role === "operations";

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      const response = await authFetch(`/api/operations/self-tasks?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load work tracker");
      setTasks(data.tasks || []);
      setRole(data.role || "");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  function resetForm() {
    setEditingTask(null);
    setForm(emptyForm);
    setDoneByName("");
    setFormExpanded(false);
  }

  function addDoneByName() {
    const name = doneByName.trim();
    if (!name) return;
    setForm((current) => {
      const existingNames = normalizeDoneByNames(current.done_by_ids);
      const exists = existingNames.some((existing) => existing.toLowerCase() === name.toLowerCase());
      return {
        ...current,
        done_by_ids: exists ? existingNames : [...existingNames, name],
      };
    });
    setDoneByName("");
  }

  function removeDoneByName(name) {
    setForm((current) => ({
      ...current,
      done_by_ids: normalizeDoneByNames(current.done_by_ids).filter((item) => item.toLowerCase() !== name.toLowerCase()),
    }));
  }

  function editTask(task) {
    setEditingTask(task);
    setFormExpanded(true);
    setForm({
      client_name: task.client_name || "",
      task_date: task.task_date || emptyForm.task_date,
      task_description: task.task_description || "",
      remark: task.remark || "",
      done_by_ids: normalizeDoneByNames(task.done_by),
      status: task.status || "Pending",
      priority: task.priority || "Medium",
    });
  }

  async function saveTask(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        client_name: form.client_name,
        task_date: form.task_date,
        task_description: form.task_description,
        remark: form.remark,
        done_by: doneByFromNames(form.done_by_ids),
        status: form.status,
        priority: form.priority,
      };
      const response = await authFetch(editingTask ? `/api/operations/self-tasks/${editingTask.id}` : "/api/operations/self-tasks", {
        method: editingTask ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save work entry");
      toast.success(editingTask ? "Work entry updated" : "Work entry added");
      resetForm();
      await loadTasks();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(task, status) {
    const response = await authFetch(`/api/operations/self-tasks/${task.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...task, status }),
    });
    const data = await response.json();
    if (!response.ok) {
      toast.error(data.error || "Unable to update status");
      return;
    }
    toast.success(status === "Done" ? "Marked done" : "Status updated");
    await loadTasks();
  }

  async function archiveTask() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const response = await authFetch(`/api/operations/self-tasks/${deleteTarget.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to archive work entry");
      toast.success("Work entry archived");
      setDeleteTarget(null);
      await loadTasks();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  const counts = useMemo(() => ({
    pending: tasks.filter((task) => task.status !== "Done" && task.status !== "Cancelled").length,
    done: tasks.filter((task) => task.status === "Done").length,
    total: tasks.length,
  }), [tasks]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operations self tracker"
        title="My Work Tracker"
        description="Track your own daily work separately from admin-assigned CRM tasks."
        tone="blue"
      />

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ["Open self work", counts.pending, "text-amber-700 bg-amber-50"],
          ["Done in view", counts.done, "text-emerald-700 bg-emerald-50"],
          ["Total entries", counts.total, "text-blue-700 bg-blue-50"],
        ].map(([label, value, tone]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className={`inline-flex rounded-lg px-2 py-1 text-xs font-semibold ${tone}`}>{label}</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
          </div>
        ))}
      </section>

      {operationsUser && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => {
              if (formExpanded && editingTask) resetForm();
              else setFormExpanded((current) => !current);
            }}
            className="flex w-full items-center justify-between gap-4 p-4 text-left transition hover:bg-slate-50 sm:p-5"
            aria-expanded={formExpanded}
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                {editingTask ? <Edit3 size={18} /> : <Plus size={18} />}
              </span>
              <span className="min-w-0">
                <span className="block text-base font-semibold text-slate-950">
                  {editingTask ? "Edit work entry" : "Add work entry"}
                </span>
                <span className="block truncate text-xs text-slate-500">
                  {formExpanded ? "Complete the details below." : "Expand to record your daily work."}
                </span>
              </span>
            </span>
            <ChevronDown size={19} className={`shrink-0 text-slate-500 transition-transform ${formExpanded ? "rotate-180" : ""}`} />
          </button>

          {formExpanded && (
            <form onSubmit={saveTask} className="border-t border-slate-200 p-4 sm:p-5">
              <div className="grid gap-4 lg:grid-cols-2">
                <FormInput label="Client name" name="client_name" value={form.client_name} onValueChange={(value) => setForm((current) => ({ ...current, client_name: value }))} />
                <FormInput label="Date" name="task_date" type="date" required value={form.task_date} onValueChange={(value) => setForm((current) => ({ ...current, task_date: value }))} />
                <FormInput label="Task/work description" name="task_description" required multiline rows={2} value={form.task_description} onValueChange={(value) => setForm((current) => ({ ...current, task_description: value }))} />
                <FormInput label="Remark" name="remark" multiline rows={2} value={form.remark} onValueChange={(value) => setForm((current) => ({ ...current, remark: value }))} />
                <FormSelect label="Status" name="status" options={STATUSES} value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value }))} />
                <DoneByNameList
                  names={form.done_by_ids}
                  inputValue={doneByName}
                  onInputChange={setDoneByName}
                  onAdd={addDoneByName}
                  onRemove={removeDoneByName}
                />
              </div>
              <div className="mt-5 flex justify-end gap-3">
                <button type="button" onClick={resetForm} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:text-red-500">
                  <X size={15} /> Cancel
                </button>
                <button type="submit" disabled={saving} className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">
                  {saving ? "Saving..." : editingTask ? "Update entry" : "Add entry"}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4 sm:p-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))]">
            <div className="relative">
              <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={filters.search}
                onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="Search work, client, remark"
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <FormSelect name="status_filter" value={filters.status} onValueChange={(value) => setFilters((current) => ({ ...current, status: value }))} includeAll allLabel="All status" options={STATUSES} />
            <FormInput name="date_from" type="date" value={filters.date_from} onValueChange={(value) => setFilters((current) => ({ ...current, date_from: value }))} />
            <FormInput name="date_to" type="date" value={filters.date_to} onValueChange={(value) => setFilters((current) => ({ ...current, date_to: value }))} />
            <FormInput name="done_by" placeholder="Done by" value={filters.done_by} onValueChange={(value) => setFilters((current) => ({ ...current, done_by: value }))} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Work</th>
                <th className="px-4 py-3">Done by</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Loading work tracker...</td></tr>
              ) : tasks.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No self work entries found.</td></tr>
              ) : tasks.map((task) => (
                <tr key={task.id} className="align-top transition hover:bg-blue-50/30">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(task.task_date)}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{task.client_name || "-"}</td>
                  <td className="max-w-md px-4 py-3">
                    <p className="font-medium text-slate-900">{task.task_description}</p>
                    {task.remark && <p className="mt-1 text-xs leading-5 text-slate-500">{task.remark}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <DoneByChips names={task.done_by} />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(task.status)}`}>
                      {task.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {task.status !== "Done" && (
                        <CrmTooltip content="Mark done">
                          <button type="button" onClick={() => updateStatus(task, "Done")} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700">
                            <CheckCircle2 size={16} />
                          </button>
                        </CrmTooltip>
                      )}
                      <CrmTooltip content="Edit entry">
                        <button type="button" onClick={() => editTask(task)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-blue-50 hover:text-blue-700">
                          <Edit3 size={16} />
                        </button>
                      </CrmTooltip>
                      <CrmTooltip content="Archive entry">
                        <button type="button" onClick={() => setDeleteTarget(task)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-red-50 hover:text-red-700">
                          <Trash2 size={16} />
                        </button>
                      </CrmTooltip>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Archive work entry?"
        message="This removes the entry from your active self tracker without affecting admin-assigned tasks."
        confirmLabel="Archive"
        loading={saving}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={archiveTask}
      />
    </div>
  );
}
