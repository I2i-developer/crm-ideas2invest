"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  FileSpreadsheet,
  HeartPulse,
  IndianRupee,
  ListTodo,
  MessageSquare,
  Minus,
  Pencil,
  Plus,
  Save,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
  UserPlus,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { authFetch } from "@/lib/authFetch";
import { supabase } from "@/lib/supabaseClient";
import FormInput from "../clients/components/FormInput";
import FormSelect from "../clients/components/FormSelect";
import ConfirmDialog from "@/components/ConfirmDialog";
import PageHeader from "@/components/PageHeader";
import CrmTooltip from "@/components/CrmTooltip";
import { formatDateDDMonYYYY, formatDateTimeDDMonYYYY } from "@/lib/dateFormat";

const PAYMENT_STATUSES = ["Paid", "Pending", "Grace Period", "Lapsed", "Overdue"];
const POLICY_STATUSES = ["Active", "Pending", "Lapsed", "Closed"];
const PREMIUM_FREQUENCIES = ["Annual", "Monthly", "Quarterly", "Half Yearly", "Single"];
const PREMIUM_RANGES = [
  { value: "0-10000", label: "Up to ₹10,000" },
  { value: "10001-25000", label: "₹10,001 - ₹25,000" },
  { value: "25001-50000", label: "₹25,001 - ₹50,000" },
  { value: "50001-100000", label: "₹50,001 - ₹1,00,000" },
  { value: "100001-", label: "Above ₹1,00,000" },
];

const emptyPolicy = {
  client_id: "",
  policy_type: "",
  insurance_company: "",
  policy_number: "",
  premium_amount: "",
  premium_frequency: "",
  issuance_date: "",
  renewal_date: "",
  due_date: "",
  payment_status: "Pending",
  grace_period_end_date: "",
  next_follow_up_date: "",
  assigned_to: "",
  contact_mobile: "",
  contact_email: "",
  sum_assured: "",
  nominee: "",
  through_company: false,
  status: "Active",
  remarks: "",
};

const emptyFilters = {
  client_id: "",
  search: "",
  insurance_company: "",
  policy_type: "",
  payment_status: "",
  through_company: "",
  date_from: "",
  date_to: "",
  assigned_to: "",
  premium_range: "",
};

async function uploadInsuranceImport(file, onProgress) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/insurance/import");
    xhr.withCredentials = true;
    if (session?.access_token) {
      xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
    }

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const uploadPercent = Math.round((event.loaded / event.total) * 85);
      onProgress(Math.max(5, Math.min(uploadPercent, 85)));
    };

    xhr.onload = () => {
      let data = {};
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch {
        data = { error: "Insurance import returned an invalid response" };
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve(data);
      } else {
        reject(new Error(data.error || "Insurance import failed"));
      }
    };

    xhr.onerror = () => reject(new Error("Insurance import request failed"));
    xhr.onabort = () => reject(new Error("Insurance import was cancelled"));
    onProgress(5);
    xhr.send(formData);
  });
}

function formatCurrency(value) {
  if (!value) return "-";
  return Number(value).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

function formatDate(value) {
  return formatDateDDMonYYYY(value, "-");
}

function formatLongDate(value) {
  return formatDateDDMonYYYY(value, "-");
}

function statusClass(status) {
  const styles = {
    Paid: "border-green-100 bg-green-50 text-green-700",
    Pending: "border-amber-100 bg-amber-50 text-amber-700",
    "Grace Period": "border-blue-100 bg-blue-50 text-blue-700",
    Lapsed: "border-slate-200 bg-slate-50 text-slate-700",
    Overdue: "border-red-100 bg-red-50 text-red-700",
  };
  return styles[status] || styles.Pending;
}

function ownerName(profile) {
  return profile?.name || profile?.full_name || profile?.email || "Unassigned";
}

function daysUntil(value) {
  if (!value) return null;
  const today = new Date(new Date().toISOString().slice(0, 10));
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

function currentMonthBounds() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const toKey = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return { from: toKey(first), to: toKey(last) };
}

export default function InsurancePage() {
  const [role, setRole] = useState(null);
  const [clients, setClients] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [summary, setSummary] = useState({});
  const [form, setForm] = useState(emptyPolicy);
  const [filters, setFilters] = useState(emptyFilters);
  const [editingId, setEditingId] = useState(null);
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const [activePanel, setActivePanel] = useState(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [logs, setLogs] = useState([]);
  const [logForm, setLogForm] = useState({ remark: "", follow_up_outcome: "", next_follow_up_date: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [policyToDelete, setPolicyToDelete] = useState(null);
  const [deletingPolicy, setDeletingPolicy] = useState(false);
  const [creatingClientId, setCreatingClientId] = useState(null);
  const [creatingTaskId, setCreatingTaskId] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importSummary, setImportSummary] = useState(null);

  const isAdmin = role === "admin";
  const rowsPerPage = 10;

  const clientOptions = clients.map((client) => ({ value: client.id, label: client.full_name }));
  const profileOptions = profiles.map((profile) => ({ value: profile.id, label: `${ownerName(profile)} (${profile.role})` }));
  const companyOptions = useMemo(
    () => [...new Set(policies.map((policy) => policy.insurance_company).filter(Boolean))]
      .sort()
      .map((company) => ({ value: company, label: company })),
    [policies]
  );
  const totalPages = Math.max(1, Math.ceil(policies.length / rowsPerPage));
  const paginatedPolicies = useMemo(
    () => policies.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage),
    [currentPage, policies]
  );

  async function loadReferenceData() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return;

    const [{ data: profile }, { data: clientRows }, { data: profileRows }] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", userData.user.id).maybeSingle(),
      supabase.from("clients").select("id, full_name, mobile, email").order("full_name", { ascending: true }),
      supabase
        .from("profiles")
        .select("id, name, full_name, email, role, is_active, status")
        .in("role", ["admin", "operations"])
        .order("name", { ascending: true, nullsFirst: false }),
    ]);

    setRole(String(profile?.role || "").toLowerCase());
    setClients(clientRows || []);
    setProfiles((profileRows || []).filter((item) => item.is_active !== false && String(item.status || "Active").toLowerCase() !== "inactive"));
  }

  async function loadPolicies(nextFilters = filters, { silent = false } = {}) {
    if (!silent) setLoading(true);
    const params = new URLSearchParams();
    Object.entries(nextFilters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });

    const response = await authFetch(`/api/insurance${params.toString() ? `?${params}` : ""}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      setPolicies(data.policies || []);
      setSummary(data.summary || {});
      setCurrentPage(1);
    } else {
      toast.error(data.error || "Failed to load insurance policies");
    }
    if (!silent) setLoading(false);
  }

  useEffect(() => {
    async function init() {
      const initialClientId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("client_id") : "";
      const nextFilters = { ...emptyFilters, client_id: initialClientId || "" };
      setFilters(nextFilters);
      setForm((current) => ({ ...current, client_id: initialClientId || "" }));
      await loadReferenceData();
      await loadPolicies(nextFilters);
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateForm(key, value) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "renewal_date" && !current.due_date) next.due_date = value;
      if (key === "due_date" && !current.renewal_date) next.renewal_date = value;
      return next;
    });
  }

  function updateFilter(key, value) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    loadPolicies(next, { silent: true });
  }

  function filterCurrentMonthRenewals() {
    const month = currentMonthBounds();
    const next = { ...filters, date_from: month.from, date_to: month.to };
    setFilters(next);
    loadPolicies(next, { silent: true });
  }

  function openNewPolicyPanel() {
    setEditingId(null);
    setForm((current) => ({ ...emptyPolicy, client_id: current.client_id || filters.client_id || "" }));
    setActivePanel("policy");
  }

  async function loadLogs(policyId) {
    if (!policyId) return;
    const response = await authFetch(`/api/insurance/${policyId}/logs`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setLogs(data.logs || []);
  }

  async function savePolicy(event) {
    event.preventDefault();
    if (!editingId && !form.client_id) {
      toast.error("Select a client");
      return;
    }

    setSaving(true);
    const response = await authFetch(editingId ? `/api/insurance/${editingId}` : "/api/insurance", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await response.json().catch(() => ({}));
    setSaving(false);

    if (!response.ok) {
      toast.error(data.error || "Insurance save failed");
      return;
    }

    toast.success("Insurance policy saved");
    setForm(emptyPolicy);
    setEditingId(null);
    setSelectedPolicy(data.policy || null);
    setActivePanel(null);
    await loadPolicies(filters, { silent: true });
    if (data.policy?.id) await loadLogs(data.policy.id);
  }

  function editPolicy(policy) {
    setEditingId(policy.id);
    setSelectedPolicy(policy);
    setActivePanel("policy");
    setForm({
      client_id: policy.client_id || "",
      policy_type: policy.policy_type || "",
      insurance_company: policy.insurance_company || "",
      policy_number: policy.policy_number || "",
      premium_amount: policy.premium_amount || "",
      premium_frequency: policy.premium_frequency || "",
      issuance_date: policy.issuance_date || "",
      renewal_date: policy.renewal_date || policy.due_date || "",
      due_date: policy.due_date || policy.renewal_date || "",
      payment_status: policy.payment_status || "Pending",
      grace_period_end_date: policy.grace_period_end_date || "",
      next_follow_up_date: policy.next_follow_up_date || "",
      assigned_to: policy.assigned_to || "",
      contact_mobile: policy.contact_mobile || policy.client?.mobile || "",
      contact_email: policy.contact_email || policy.client?.email || "",
      sum_assured: policy.sum_assured || "",
      nominee: policy.nominee || "",
      through_company: Boolean(policy.through_company),
      status: policy.status || "Active",
      remarks: policy.remarks || "",
    });
    loadLogs(policy.id);
  }

  async function confirmDeletePolicy() {
    if (!policyToDelete) return;
    setDeletingPolicy(true);
    const response = await authFetch(`/api/insurance/${policyToDelete.id}`, { method: "DELETE" });
    setDeletingPolicy(false);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(data.error || "Delete failed");
      return;
    }
    toast.success("Policy deleted");
    setPolicyToDelete(null);
    if (selectedPolicy?.id === policyToDelete.id) {
      setSelectedPolicy(null);
      setLogs([]);
      setActivePanel(null);
    }
    loadPolicies(filters, { silent: true });
  }

  async function createClientFromPolicy(policy) {
    if (!policy?.id) return;
    setCreatingClientId(policy.id);
    const response = await authFetch(`/api/insurance/${policy.id}/create-client`, { method: "POST" });
    setCreatingClientId(null);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(data.error || "Client creation failed");
      return;
    }
    toast.success("CRM client created and linked");
    await loadReferenceData();
    await loadPolicies(filters, { silent: true });
  }

  async function createTaskForPolicy(policy) {
    if (!policy?.id) return;
    setCreatingTaskId(policy.id);
    const response = await authFetch(`/api/insurance/${policy.id}/create-task`, { method: "POST" });
    setCreatingTaskId(null);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(data.error || "Task creation failed");
      return;
    }
    toast.success(data.alert?.task_id ? "Insurance task created" : "Insurance task already exists");
    await loadPolicies(filters, { silent: true });
  }

  async function updatePolicyStatus(policy, paymentStatus) {
    if (!policy?.id || !paymentStatus) return;
    const response = await authFetch(`/api/insurance/${policy.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...policy,
        client_id: policy.client_id || null,
        payment_status: paymentStatus,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(data.error || "Status update failed");
      return;
    }
    toast.success("Status updated");
    await loadPolicies(filters, { silent: true });
  }

  async function saveLog(event) {
    event.preventDefault();
    if (!selectedPolicy?.id) {
      toast.error("Select a policy first");
      return;
    }
    const response = await authFetch(`/api/insurance/${selectedPolicy.id}/logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(logForm),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(data.error || "Remark save failed");
      return;
    }
    toast.success("Interaction logged");
    setLogForm({ remark: "", follow_up_outcome: "", next_follow_up_date: "" });
    await loadLogs(selectedPolicy.id);
    await loadPolicies(filters, { silent: true });
  }

  async function importPolicies(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const file = formElement.elements.file?.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportProgress(0);
    setImportSummary(null);

    try {
      const data = await uploadInsuranceImport(file, setImportProgress);
      setImportSummary(data);
      formElement.reset();
      toast.success("Insurance import completed");
      setFilters(emptyFilters);
      await loadPolicies(emptyFilters, { silent: true });
    } catch (error) {
      toast.error(error.message || "Insurance import failed");
    } finally {
      setImporting(false);
    }
  }

  if (loading) return <div className="p-6 text-gray-500">Loading insurance...</div>;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        eyebrow="Insurance workspace"
        title="Insurance Renewals"
        description="A focused queue for premium due dates, payment status, and follow-up remarks."
        icon={HeartPulse}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openNewPolicyPanel}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-800"
            >
              <Plus size={16} />
              Add Policy
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setActivePanel((current) => current === "import" ? null : "import")}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
              >
                <Upload size={16} />
                Import
              </button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric title="Due Next 30 Days" value={summary.due_next_30_days || 0} icon={CalendarClock} tone="blue" onClick={filterCurrentMonthRenewals} />
        <Metric title="Pending Renewals" value={summary.pending_renewals || 0} icon={AlertTriangle} tone="red" />
        <Metric title="Pending Follow-ups" value={summary.pending_followups || 0} icon={MessageSquare} tone="amber" />
        <Metric title="Amount Due" value={formatCurrency(summary.renewal_amount_due || 0)} icon={IndianRupee} tone="green" />
      </div>

      <div className="grid gap-3 rounded-3xl border border-gray-100 bg-white/80 p-4 shadow-sm backdrop-blur md:grid-cols-[minmax(220px,1.5fr)_minmax(180px,0.8fr)_minmax(180px,0.8fr)_auto]">
        <FormInput label="Search" name="search" value={filters.search} onValueChange={(value) => updateFilter("search", value)} icon={<Search size={16} />} placeholder="Client, phone, policy number" />
        <FormSelect label="Payment Status" name="filter_payment_status" value={filters.payment_status} onValueChange={(value) => updateFilter("payment_status", value)} options={PAYMENT_STATUSES} includeAll />
        <FormSelect label="Company" name="filter_company" value={filters.insurance_company} onValueChange={(value) => updateFilter("insurance_company", value)} options={companyOptions} includeAll />
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => setShowAdvancedFilters((current) => !current)}
            className="inline-flex h-[48px] items-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <span className="relative h-4 w-4">
              <SlidersHorizontal
                size={16}
                className={`absolute inset-0 transition-all duration-300 ${
                  showAdvancedFilters
                    ? "rotate-90 opacity-0"
                    : "rotate-0 opacity-100"
                }`}
              />
              <Minus
                size={16}
                className={`absolute inset-0 transition-all duration-300 ${
                  showAdvancedFilters
                    ? "rotate-0 opacity-100"
                    : "-rotate-90 opacity-0"
                }`}
              />
            </span>

            {showAdvancedFilters ? "Less" : "More"}
          </button>
        </div>
        {showAdvancedFilters && (
          <div className="grid gap-3 border-t border-gray-100 pt-3 md:col-span-4 md:grid-cols-4">
            <FormSelect label="Premium Amount" name="filter_premium_range" value={filters.premium_range} onValueChange={(value) => updateFilter("premium_range", value)} options={PREMIUM_RANGES} includeAll />
            <FormInput label="Due From" name="date_from" type="date" value={filters.date_from} onValueChange={(value) => updateFilter("date_from", value)} />
            <FormInput label="Due To" name="date_to" type="date" value={filters.date_to} onValueChange={(value) => updateFilter("date_to", value)} />
            {isAdmin && <FormSelect label="Assigned Owner" name="filter_assigned_to" value={filters.assigned_to} onValueChange={(value) => updateFilter("assigned_to", value)} options={profileOptions} includeAll />}
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setFilters(emptyFilters);
                  loadPolicies(emptyFilters, { silent: true });
                }}
                className="h-[48px] rounded-xl border border-gray-200 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Reset filters
              </button>
            </div>
          </div>
        )}
      </div>

      {activePanel === "policy" && (
        <PolicyPanel
          editingId={editingId}
          form={form}
          clients={clientOptions}
          profiles={profileOptions}
          saving={saving}
          onClose={() => {
            setActivePanel(null);
            setEditingId(null);
            setForm(emptyPolicy);
          }}
          onSubmit={savePolicy}
          onChange={updateForm}
        />
      )}

      {activePanel === "import" && isAdmin && (
        <ImportPanel importing={importing} importProgress={importProgress} importSummary={importSummary} onSubmit={importPolicies} onClose={() => setActivePanel(null)} />
      )}

      {activePanel === "log" && selectedPolicy && (
        <LogPanel
          policy={selectedPolicy}
          logs={logs}
          logForm={logForm}
          setLogForm={setLogForm}
          onSubmit={saveLog}
          onClose={() => setActivePanel(null)}
        />
      )}

      <div className="glass-card overflow-hidden p-0">
        <div className="flex flex-col gap-2 border-b border-gray-100 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Renewal Queue</h2>
            <p className="text-sm text-gray-500">Upcoming due dates appear first.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-gray-500">
            <span>Due this week: {summary.due_this_week || 0}</span>
            <span>Grace: {summary.grace_period_policies || 0}</span>
            <span>Lapsed: {summary.lapsed_policies || 0}</span>
            <span>Paid this month: {summary.paid_renewals_this_month || 0}</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1180px] w-full table-auto text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500">
                <th className="min-w-[220px] px-4 py-3">Client & Policy Number</th>
                <th className="min-w-[160px] px-4 py-3">Company</th>
                <th className="min-w-[150px] px-4 py-3">Due Date</th>
                <th className="min-w-[130px] px-4 py-3">Premium</th>
                <th className="min-w-[165px] px-4 py-3">Status</th>
                <th className="min-w-[210px] px-4 py-3">Create CRM Client/task</th>
                <th className="min-w-[145px] px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {policies.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-gray-500">No insurance policies found.</td></tr>
              ) : paginatedPolicies.map((policy) => {
                const dueDate = policy.due_date || policy.renewal_date;
                const remainingDays = daysUntil(dueDate);
                const status = policy.computed_payment_status || policy.payment_status || "Pending";
                const clientName = policy.client?.full_name || policy.imported_client_name || "Imported client";
                return (
                  <tr key={policy.id} className="bg-white hover:bg-blue-50/50">
                    <td className="px-4 py-4 align-top">
                      {policy.client_id ? (
                        <Link href={`/admin/clients/${policy.client_id}/client-details`} className="font-semibold text-gray-900 hover:text-blue-700">
                          {clientName}
                        </Link>
                      ) : (
                        <div className="font-semibold text-gray-900">{clientName}</div>
                      )}
                      <p className="mt-1 text-xs text-gray-500">Policy no: {policy.policy_number || "-"}</p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <p className="font-semibold text-gray-800">{policy.insurance_company || "-"}</p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <p className="font-semibold text-gray-800">{formatLongDate(dueDate)}</p>
                      {remainingDays !== null && (
                        <p className={`mt-1 text-xs ${remainingDays < 0 ? "text-red-600" : remainingDays <= 7 ? "text-amber-600" : "text-gray-500"}`}>
                          {remainingDays < 0 ? "Overdue" : `${remainingDays} days left`}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4 align-top">
                      <p className="font-semibold text-gray-900">{formatCurrency(policy.premium_amount)}</p>
                      <p className="text-xs text-gray-500">{policy.premium_frequency || "-"}</p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <select
                        value={status}
                        onChange={(event) => updatePolicyStatus(policy, event.target.value)}
                        className={`min-w-[140px] rounded-full border px-3 py-2 text-xs font-semibold outline-none ${statusClass(status)}`}
                      >
                        {PAYMENT_STATUSES.map((item) => (
                          <option key={item} value={item}>{item}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="flex flex-col items-start gap-1.5">
                        <button
                          type="button"
                          disabled={Boolean(policy.client_id) || creatingClientId === policy.id}
                          onClick={() => createClientFromPolicy(policy)}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-100 hover:shadow-sm disabled:translate-y-0 disabled:opacity-45 disabled:hover:bg-emerald-50 disabled:hover:shadow-none"
                        >
                          <UserPlus size={15} />
                          {policy.client_id ? "Client Linked" : creatingClientId === policy.id ? "Creating..." : "Create Client"}
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            disabled={creatingTaskId === policy.id}
                            onClick={() => createTaskForPolicy(policy)}
                            className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-100 hover:shadow-sm disabled:translate-y-0 disabled:opacity-45 disabled:hover:bg-blue-50 disabled:hover:shadow-none"
                          >
                            <ListTodo size={15} />
                            {creatingTaskId === policy.id ? "Creating..." : "Create Task"}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="flex flex-wrap gap-1.5">
                        <CrmTooltip content="Edit policy">
                          <button type="button" onClick={() => editPolicy(policy)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border text-blue-700 transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50 hover:shadow-sm" aria-label="Edit policy">
                            <Pencil size={16} />
                          </button>
                        </CrmTooltip>
                        <CrmTooltip content="Policy remarks">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPolicy(policy);
                              setActivePanel("log");
                              loadLogs(policy.id);
                            }}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border text-gray-700 transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm"
                            aria-label="Policy remarks"
                          >
                            <MessageSquare size={16} />
                          </button>
                        </CrmTooltip>
                        {isAdmin && (
                          <CrmTooltip content="Delete policy">
                            <button type="button" onClick={() => setPolicyToDelete(policy)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border text-red-600 transition hover:-translate-y-0.5 hover:border-red-200 hover:bg-red-50 hover:shadow-sm" aria-label="Delete policy">
                              <Trash2 size={16} />
                            </button>
                          </CrmTooltip>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {policies.length > rowsPerPage && (
          <div className="flex flex-col gap-3 border-t border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-500">
              Showing {(currentPage - 1) * rowsPerPage + 1}-{Math.min(currentPage * rowsPerPage, policies.length)} of {policies.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                className="rounded-lg border px-3 py-2 text-sm font-semibold text-gray-700 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-gray-500">Page {currentPage} of {totalPages}</span>
              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                className="rounded-lg border px-3 py-2 text-sm font-semibold text-gray-700 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(policyToDelete)}
        title="Delete insurance policy?"
        message={`This will remove ${policyToDelete?.policy_type || "this policy"} for ${policyToDelete?.client?.full_name || policyToDelete?.imported_client_name || "the selected client"}.`}
        loading={deletingPolicy}
        onCancel={() => setPolicyToDelete(null)}
        onConfirm={confirmDeletePolicy}
      />
    </div>
  );
}

function Metric({ title, value, icon: Icon, tone = "blue", onClick }) {
  const tones = {
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    green: "bg-green-50 text-green-700",
    red: "bg-red-50 text-red-700",
  };

  const content = (
    <div className={`glass-card flex w-full items-center gap-4 p-5 text-left ${onClick ? "transition hover:-translate-y-0.5 hover:shadow-md" : ""}`}>
      <span className={`rounded-xl p-3 ${tones[tone] || tones.blue}`}>
        <Icon size={22} />
      </span>
      <div>
        <p className="text-sm text-gray-500">{title}</p>
        <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
      </div>
    </div>
  );

  return onClick ? (
    <button type="button" onClick={onClick} className="w-full">
      {content}
    </button>
  ) : content;
}

function PanelShell({ title, subtitle, icon: Icon, onClose, children }) {
  return (
    <section className="glass-card p-5">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
            <Icon size={20} />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-xl p-2 text-gray-500 hover:bg-gray-50" aria-label="Close panel">
          <X size={18} />
        </button>
      </div>
      {children}
    </section>
  );
}

function PolicyPanel({ editingId, form, clients, profiles, saving, onClose, onSubmit, onChange }) {
  return (
    <PanelShell
      title={editingId ? "Edit Policy" : "Add Policy"}
      subtitle="Capture only the renewal details needed for follow-up. More fields are available below when required."
      icon={HeartPulse}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="grid gap-4 md:grid-cols-3">
          {!editingId && (
            <FormSelect label="Client" name="client_id" value={form.client_id} onValueChange={(value) => onChange("client_id", value)} options={clients} required />
          )}
          <FormInput label="Insurance Company" name="insurance_company" value={form.insurance_company} onValueChange={(value) => onChange("insurance_company", value)} />
          <FormInput label="Policy Number" name="policy_number" value={form.policy_number} onValueChange={(value) => onChange("policy_number", value)} />
          <FormInput label="Policy Type" name="policy_type" value={form.policy_type} onValueChange={(value) => onChange("policy_type", value)} />
          <FormInput label="Premium Amount" name="premium_amount" type="number" value={form.premium_amount} onValueChange={(value) => onChange("premium_amount", value)} />
          <FormInput label="Due / Renewal Date" name="due_date" type="date" value={form.due_date} onValueChange={(value) => onChange("due_date", value)} />
          <FormSelect label="Payment Status" name="payment_status" value={form.payment_status} onValueChange={(value) => onChange("payment_status", value)} options={PAYMENT_STATUSES} />
          <FormSelect label="Assigned Owner" name="assigned_to" value={form.assigned_to} onValueChange={(value) => onChange("assigned_to", value)} options={profiles} includeAll allLabel="Unassigned" />
          <FormInput label="Next Follow-up" name="next_follow_up_date" type="date" value={form.next_follow_up_date} onValueChange={(value) => onChange("next_follow_up_date", value)} />
        </div>

        <details className="rounded-2xl border border-gray-100 bg-white/70 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-gray-700">More policy details</summary>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <FormSelect label="Premium Frequency" name="premium_frequency" value={form.premium_frequency} onValueChange={(value) => onChange("premium_frequency", value)} options={PREMIUM_FREQUENCIES} />
            <FormInput label="Issuance Date" name="issuance_date" type="date" value={form.issuance_date} onValueChange={(value) => onChange("issuance_date", value)} />
            <FormInput label="Grace Period End" name="grace_period_end_date" type="date" value={form.grace_period_end_date} onValueChange={(value) => onChange("grace_period_end_date", value)} />
            <FormSelect label="Policy Status" name="status" value={form.status} onValueChange={(value) => onChange("status", value)} options={POLICY_STATUSES} />
            <FormInput label="Contact Mobile" name="contact_mobile" value={form.contact_mobile} onValueChange={(value) => onChange("contact_mobile", value)} />
            <FormInput label="Contact Email" name="contact_email" type="email" value={form.contact_email} onValueChange={(value) => onChange("contact_email", value)} />
            <FormInput label="Sum Assured" name="sum_assured" type="number" value={form.sum_assured} onValueChange={(value) => onChange("sum_assured", value)} />
            <FormInput label="Nominee" name="nominee" value={form.nominee} onValueChange={(value) => onChange("nominee", value)} />
            <label className="flex items-end gap-2 pb-3 text-sm text-gray-700">
              <input type="checkbox" checked={form.through_company} onChange={(event) => onChange("through_company", event.target.checked)} />
              Insurance through company
            </label>
          </div>
        </details>

        <FormInput label="Remarks" name="remarks" value={form.remarks} onValueChange={(value) => onChange("remarks", value)} multiline rows={3} />
        <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-white shadow-sm hover:bg-blue-800 disabled:opacity-60">
          <Save size={16} /> {saving ? "Saving..." : "Save Policy"}
        </button>
      </form>
    </PanelShell>
  );
}

function ImportPanel({ importing, importProgress, importSummary, onSubmit, onClose }) {
  return (
    <PanelShell
      title="Bulk Import"
      subtitle="Upload CSV/XLSX with client, company, policy number, premium, due date, contact, and status."
      icon={FileSpreadsheet}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <input name="file" type="file" accept=".xlsx,.xls,.csv" className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm" />
        {(importing || importProgress > 0) && (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 p-3">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold text-emerald-800">
              <span>{importing ? "Importing policies" : "Import completed"}</span>
              <span>{importProgress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all duration-300"
                style={{ width: `${importProgress}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-emerald-700">
              Large files may pause near the end while rows are matched and saved.
            </p>
          </div>
        )}
        <button disabled={importing} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-white hover:bg-emerald-800 disabled:opacity-60">
          <Upload size={16} /> {importing ? "Importing..." : "Import Policies"}
        </button>
        {importSummary && (
          <div className="grid gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800 sm:grid-cols-5">
            <span>Total: {importSummary.total_rows}</span>
            <span>Success: {importSummary.successful_rows}</span>
            <span>Duplicates: {importSummary.duplicate_rows}</span>
            <span>Unmatched: {importSummary.unmatched_rows}</span>
            <span>Failed: {importSummary.failed_rows}</span>
          </div>
        )}
      </form>
    </PanelShell>
  );
}

function LogPanel({ policy, logs, logForm, setLogForm, onSubmit, onClose }) {
  return (
    <PanelShell
      title="Policy Remarks"
      subtitle={`${policy.client?.full_name || "Client"} / ${policy.policy_number || "Policy"}`}
      icon={MessageSquare}
      onClose={onClose}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-3">
          {logs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-5 text-sm text-gray-500">
              No interactions logged yet.
            </div>
          ) : logs.map((log) => (
            <div key={log.id} className="rounded-xl border bg-white p-4">
              <p className="text-sm text-gray-800">{log.remark}</p>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                <span>{formatDateTimeDDMonYYYY(log.created_at, "-")}</span>
                <span>{ownerName(log.added_by_profile)}</span>
                {log.follow_up_outcome && <span>Outcome: {log.follow_up_outcome}</span>}
                {log.next_follow_up_date && <span>Next: {formatDate(log.next_follow_up_date)}</span>}
              </div>
            </div>
          ))}
        </div>
        <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border bg-white/70 p-4">
          <FormInput label="Remark" name="remark" value={logForm.remark} onValueChange={(value) => setLogForm((current) => ({ ...current, remark: value }))} multiline rows={4} placeholder="Client promised to pay by Friday." />
          <FormInput label="Outcome" name="follow_up_outcome" value={logForm.follow_up_outcome} onValueChange={(value) => setLogForm((current) => ({ ...current, follow_up_outcome: value }))} placeholder="Reminder sent / payment received" />
          <FormInput label="Next Follow-up Date" name="log_next_follow_up_date" type="date" value={logForm.next_follow_up_date} onValueChange={(value) => setLogForm((current) => ({ ...current, next_follow_up_date: value }))} />
          <button className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
            Add Remark
          </button>
        </form>
      </div>
    </PanelShell>
  );
}
