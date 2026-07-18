"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  Download,
  Loader2,
  Pencil,
  Plus,
  Save,
  Search,
  ShieldCheck,
  ShieldQuestion,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";
import PageHeader from "@/components/PageHeader";
import { authFetch } from "@/lib/authFetch";
import FormInput from "../clients/components/FormInput";
import FormSelect from "../clients/components/FormSelect";
import { formatDateTimeDDMonYYYY } from "@/lib/dateFormat";
import ConfirmDialog from "@/components/ConfirmDialog";

const KYC_STATUSES = ["Not Checked", "KYC Validated", "KYC Registered", "KYC On-Hold", "KYC Rejected"];
const STATUS_OPTIONS = KYC_STATUSES.map((status) => ({ value: status, label: status }));

const emptyForm = {
  client_name: "",
  pan_number: "",
  kyc_status: "Not Checked",
  status_source: "Manual",
  kra_agency: "",
  last_checked_at: "",
  next_review_date: "",
  remarks: "",
};

function normalizePan(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
}

function statusStyle(status) {
  const styles = {
    "KYC Validated": "border-emerald-200 bg-emerald-50 text-emerald-700",
    "KYC Registered": "border-blue-200 bg-blue-50 text-blue-700",
    "KYC On-Hold": "border-amber-200 bg-amber-50 text-amber-700",
    "KYC Rejected": "border-red-200 bg-red-50 text-red-700",
    "Not Checked": "border-slate-200 bg-slate-50 text-slate-600",
  };
  return styles[status] || styles["Not Checked"];
}

function todayIsoDateTime() {
  return new Date().toISOString();
}

function formatDateTime(value) {
  return formatDateTimeDDMonYYYY(value, "-");
}

function summaryCards(summary) {
  return [
    { label: "Total Records", value: summary.total || 0, icon: ShieldQuestion, tone: "bg-slate-50 text-slate-700" },
    { label: "Validated", value: summary.validated || 0, icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-700" },
    { label: "Registered", value: summary.registered || 0, icon: ShieldCheck, tone: "bg-blue-50 text-blue-700" },
    { label: "On-Hold", value: summary.on_hold || 0, icon: AlertTriangle, tone: "bg-amber-50 text-amber-700" },
    { label: "Rejected", value: summary.rejected || 0, icon: X, tone: "bg-red-50 text-red-700" },
  ];
}

export default function KycStatusPage() {
  const fileInputRef = useRef(null);
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({});
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState(null);
  const [filters, setFilters] = useState({ search: "", status: "" });
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [recordToDelete, setRecordToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 25;

  const canManageKycRecords = role === "admin" || role === "operations";
  const canDeleteKycRecords = role === "admin";

  const totalPages = Math.max(1, Math.ceil(records.length / rowsPerPage));
  const paginatedRecords = useMemo(
    () => records.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage),
    [currentPage, records]
  );

  const loadRecords = useCallback(async (nextFilters) => {
    setLoading(true);
    const activeFilters = nextFilters || { search: "", status: "" };
    const params = new URLSearchParams();
    if (activeFilters.search) params.set("search", activeFilters.search);
    if (activeFilters.status) params.set("status", activeFilters.status);
    const response = await authFetch(`/api/kyc-statuses?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) {
      toast.error(data.error || "Failed to load KYC statuses");
      setLoading(false);
      return;
    }
    setRecords(data.records || []);
    setSummary(data.summary || {});
    setRole(data.role || null);
    setCurrentPage(1);
    setLoading(false);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextFilters = { search: "", status: params.get("status") || "" };
    setFilters(nextFilters);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadRecords(filters);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [filters, loadRecords]);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(record) {
    setEditingId(record.id);
    setForm({
      client_name: record.client_name || "",
      pan_number: record.pan_number || record.normalized_pan || "",
      kyc_status: record.kyc_status || "Not Checked",
      status_source: record.status_source || "Manual",
      kra_agency: record.kra_agency || "",
      last_checked_at: record.last_checked_at ? new Date(record.last_checked_at).toISOString().slice(0, 16) : "",
      next_review_date: record.next_review_date || "",
      remarks: record.remarks || "",
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveRecord(event) {
    event?.preventDefault();
    if (!canManageKycRecords) return toast.error("You do not have permission to save KYC status records");
    setSaving(true);
    const payload = {
      ...form,
      pan_number: normalizePan(form.pan_number),
      last_checked_at: form.last_checked_at ? new Date(form.last_checked_at).toISOString() : null,
    };
    const response = await authFetch(editingId ? `/api/kyc-statuses/${editingId}` : "/api/kyc-statuses", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) return toast.error(data.error || "Failed to save KYC status");
    toast.success(editingId ? "KYC status updated" : "KYC status added");
    resetForm();
    await loadRecords(filters);
  }

  async function quickStatusUpdate(record, status) {
    if (!canManageKycRecords) return;
    const response = await authFetch(`/api/kyc-statuses/${record.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...record,
        kyc_status: status,
        last_checked_at: todayIsoDateTime(),
        change_note: "Quick status update from tracker table",
      }),
    });
    const data = await response.json();
    if (!response.ok) return toast.error(data.error || "Failed to update status");
    toast.success("Status updated");
    setRecords((current) => current.map((item) => (item.id === record.id ? data.record : item)));
  }

  async function copyPan(pan) {
    try {
      await navigator.clipboard.writeText(pan);
      toast.success("PAN copied");
    } catch {
      toast.error("Could not copy PAN");
    }
  }

  async function importFile(file) {
    if (!file) return;
    if (!canManageKycRecords) return toast.error("You do not have permission to import KYC files");
    setImporting(true);
    setImportSummary(null);
    const formData = new FormData();
    formData.append("file", file);
    const response = await authFetch("/api/kyc-statuses/import", {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!response.ok) {
      toast.error(data.error || "KYC import failed");
      return;
    }
    setImportSummary(data);
    toast.success(`Imported ${data.successful_rows} PAN record${data.successful_rows === 1 ? "" : "s"}`);
    await loadRecords(filters);
  }

  async function deleteRecord() {
    if (!recordToDelete || !canDeleteKycRecords) return;
    setDeleting(true);
    const response = await authFetch(`/api/kyc-statuses/${recordToDelete.id}`, {
      method: "DELETE",
    });
    const data = await response.json().catch(() => ({}));
    setDeleting(false);
    if (!response.ok) return toast.error(data.error || "Failed to delete KYC record");
    toast.success("KYC record deleted");
    setRecordToDelete(null);
    await loadRecords(filters);
  }

  function exportRecords() {
    const rows = records.map((record) => ({
      "Client Name": record.client_name,
      "PAN Number": record.normalized_pan,
      "KYC Status": record.kyc_status,
      "KRA Agency": record.kra_agency || "",
      "Last Checked": record.last_checked_at ? formatDateTime(record.last_checked_at) : "",
      Remarks: record.remarks || "",
      "Linked CRM Client": record.client?.full_name || "",
      "Updated At": record.updated_at ? formatDateTime(record.updated_at) : "",
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "KYC Status");
    XLSX.writeFile(workbook, `kyc-status-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const cardData = summaryCards(summary);

  return (
    <main className="min-h-full bg-slate-50 text-slate-900">
      <PageHeader
        title="KYC Status Tracker"
        description="Upload PAN lists, reject duplicates, update KYC status, copy PANs, and export the working sheet."
        actions={canManageKycRecords && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xls,.xlsx"
              onChange={(event) => importFile(event.target.files?.[0])}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {importing ? <Loader2 className="animate-spin" size={17} /> : <Upload size={17} />}
              {importing ? "Importing..." : "Bulk Upload"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm((current) => !current)}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              <Plus size={17} /> Add Client
            </button>
          </>
        )}
      />

      <section className="mt-6 overflow-x-auto pb-1">
        <div className="grid min-w-[820px] grid-cols-5 gap-3">
          {cardData.map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                  <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
                </div>
                <span className={`rounded-xl p-2.5 ${tone}`}>
                  <Icon size={21} />
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid flex-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(180px,0.35fr)]">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-700">Search name / PAN / remarks</span>
              <span className="relative block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  value={filters.search}
                  onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                  className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="Search by client or PAN"
                />
              </span>
            </label>
            <FormSelect
              label="KYC Status"
              value={filters.status}
              onValueChange={(value) => setFilters((current) => ({ ...current, status: value }))}
              options={[{ value: "", label: "All Statuses" }, ...STATUS_OPTIONS]}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportRecords}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
            >
              <Download size={16} /> Export Sheet
            </button>
          </div>
        </div>
      </section>

      {importSummary && (
        <section className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">Import summary</p>
              <p className="mt-1 text-xs text-blue-800">Accepted headers: Client Name, PAN Number, KYC Status, Remarks, KRA Agency. PAN can be blank.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <span>Total: {importSummary.total_rows}</span>
              <span>Added: {importSummary.successful_rows}</span>
              <span>Duplicates: {importSummary.duplicates}</span>
              <span>Invalid: {importSummary.invalid_rows}</span>
            </div>
          </div>
          {importSummary.rejected?.length > 0 && (
            <div className="mt-3 max-h-40 overflow-auto rounded-md bg-white p-2">
              {importSummary.rejected.map((row, index) => (
                <p key={`${row.row}-${index}`} className="border-b border-slate-100 py-1 text-xs last:border-0">
                  Row {row.row}: {row.reason}{row.pan_number ? ` (${row.pan_number})` : ""}
                </p>
              ))}
            </div>
          )}
        </section>
      )}

      {canManageKycRecords && showForm && (
        <section className="mt-4">
            <form onSubmit={saveRecord} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-bold text-slate-950">{editingId ? "Edit KYC Record" : "Add KYC Record"}</h2>
                <button type="button" onClick={resetForm} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                  <X size={18} />
                </button>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <FormInput label="Client Name" value={form.client_name} onValueChange={(value) => setForm((current) => ({ ...current, client_name: value }))} required />
                <FormInput label="PAN Number" value={form.pan_number} onValueChange={(value) => setForm((current) => ({ ...current, pan_number: normalizePan(value) }))} />
                <FormSelect label="KYC Status" value={form.kyc_status} onValueChange={(value) => setForm((current) => ({ ...current, kyc_status: value }))} options={STATUS_OPTIONS} />
                <FormInput label="KRA Agency" value={form.kra_agency} onValueChange={(value) => setForm((current) => ({ ...current, kra_agency: value }))} />
                <FormInput label="Last Checked At" type="datetime-local" value={form.last_checked_at} onValueChange={(value) => setForm((current) => ({ ...current, last_checked_at: value }))} />
                <FormInput label="Remarks" value={form.remarks} onValueChange={(value) => setForm((current) => ({ ...current, remarks: value }))} />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-70"
              >
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                {saving ? "Saving..." : "Save KYC Record"}
              </button>
            </form>
        </section>
      )}

      <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-base font-bold text-slate-950">KYC Working Sheet</h2>
            <p className="text-sm text-slate-500">{records.length} record{records.length === 1 ? "" : "s"} in current view</p>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center text-slate-500">
            <Loader2 className="mr-2 animate-spin" size={20} /> Loading KYC statuses...
          </div>
        ) : records.length === 0 ? (
          <div className="min-h-64 p-8 text-center text-slate-500">
            <ShieldQuestion className="mx-auto mb-3 text-slate-300" size={36} />
            <p className="font-semibold text-slate-700">No KYC records yet</p>
            <p className="mt-1 text-sm">Upload a client PAN list or add a client manually to begin tracking.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">PAN</th>
                    <th className="px-4 py-3">KYC Status</th>
                    <th className="px-4 py-3">Last Checked</th>
                    <th className="px-4 py-3">Remarks</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedRecords.map((record) => (
                    <tr key={record.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{record.client_name}</div>
                        {record.client?.full_name && (
                          <div className="text-xs text-emerald-700">Linked: {record.client.full_name}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {record.normalized_pan ? (
                          <button
                            type="button"
                            onClick={() => copyPan(record.normalized_pan)}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-sm font-semibold text-slate-800 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                            title="Copy PAN"
                          >
                            {record.normalized_pan}
                            <Clipboard size={14} />
                          </button>
                        ) : (
                          <span className="inline-flex rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700">
                            PAN Pending
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {canManageKycRecords ? (
                          <select
                            value={record.kyc_status}
                            onChange={(event) => quickStatusUpdate(record, event.target.value)}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold outline-none ${statusStyle(record.kyc_status)}`}
                          >
                            {KYC_STATUSES.map((status) => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold ${statusStyle(record.kyc_status)}`}>
                            {record.kyc_status}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{record.last_checked_at ? formatDateTime(record.last_checked_at) : "-"}</td>
                      <td className="max-w-xs px-4 py-3 text-slate-600">
                        <span className="line-clamp-2">{record.remarks || "-"}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {canManageKycRecords && (
                            <button
                              type="button"
                              onClick={() => startEdit(record)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              <Pencil size={14} /> Edit
                            </button>
                          )}
                          {canDeleteKycRecords && (
                            <button
                              type="button"
                              onClick={() => setRecordToDelete(record)}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-100 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 transition hover:border-red-200 hover:bg-red-100"
                            >
                              <Trash2 size={14} /> Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">Page {currentPage} of {totalPages}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(recordToDelete)}
        title="Delete KYC record?"
        message={`This will permanently delete ${recordToDelete?.client_name || "this KYC record"} from the tracker.`}
        confirmLabel="Delete Record"
        loading={deleting}
        onConfirm={deleteRecord}
        onCancel={() => setRecordToDelete(null)}
      />
    </main>
  );
}
