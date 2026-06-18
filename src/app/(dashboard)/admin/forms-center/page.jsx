"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  FileStack,
  FolderOpen,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import PageHeader from "@/components/PageHeader";
import CrmTooltip from "@/components/CrmTooltip";
import ConfirmDialog from "@/components/ConfirmDialog";
import FormInput from "../clients/components/FormInput";
import FormSelect from "../clients/components/FormSelect";
import { authFetch } from "@/lib/authFetch";

const EMPTY_ORGANIZATION = {
  display_name: "",
  organization_type: "AMC",
  forms_url: "",
  description: "",
  display_order: 0,
  active: true,
};

const EMPTY_FORM = {
  form_name: "",
  category: "General",
  form_url: "",
  description: "",
  display_order: 0,
  active: true,
};

const LOCAL_LOGO_OVERRIDES = {
  kfintech: "/images/amc-logos/KFin Technologies Symbol SVG.svg",
};

function Logo({ organization }) {
  const candidates = useMemo(() => {
    let hostname = "";
    try {
      hostname = new URL(organization.forms_url).hostname.replace(/^www\./, "");
    } catch {
      hostname = "";
    }
    const slug = organization.slug;
    return [
      organization.logo_url,
      LOCAL_LOGO_OVERRIDES[slug],
      `/images/amc-logos/${slug}.svg`,
      `/images/amc-logos/${slug}.png`,
      `/images/amc-logos/${slug}.webp`,
      `/images/amc-logos/${slug}.jpg`,
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=256`,
    ].filter(Boolean);
  }, [organization.forms_url, organization.logo_url, organization.slug]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const initials = organization.display_name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  useEffect(() => setCandidateIndex(0), [organization.id, candidates]);

  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {candidateIndex >= candidates.length ? (
        <span className={`flex h-full w-full items-center justify-center text-xs font-bold ${organization.organization_type === "RTA" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
          {initials}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={candidates[candidateIndex]}
          alt={`${organization.display_name} logo`}
          className="h-9 w-9 object-contain"
          onError={() => setCandidateIndex((current) => current + 1)}
        />
      )}
    </span>
  );
}

function ExternalButton({ onClick, children, quiet = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={quiet
        ? "inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
        : "inline-flex h-9 items-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-semibold text-white transition hover:bg-blue-700"}
    >
      {children}
    </button>
  );
}

export default function FormsInformationCenterPage() {
  const [organizations, setOrganizations] = useState([]);
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [organizationEditor, setOrganizationEditor] = useState(false);
  const [organizationForm, setOrganizationForm] = useState(EMPTY_ORGANIZATION);
  const [editingOrganizationId, setEditingOrganizationId] = useState(null);
  const [selectedOrganization, setSelectedOrganization] = useState(null);
  const [forms, setForms] = useState([]);
  const [formsLoading, setFormsLoading] = useState(false);
  const [formsSearch, setFormsSearch] = useState("");
  const [formEditor, setFormEditor] = useState(false);
  const [formForm, setFormForm] = useState(EMPTY_FORM);
  const [editingFormId, setEditingFormId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const admin = role === "admin";

  const loadOrganizations = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const response = await authFetch("/api/forms-center", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load forms directory");
      setOrganizations(data.links || []);
      setRole(data.role || "");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrganizations();
  }, [loadOrganizations]);

  const visibleOrganizations = useMemo(() => {
    const term = search.trim().toLowerCase();
    return organizations.filter((organization) => {
      const typeMatches =
        filter === "All" ||
        (filter === "RTAs" && organization.organization_type === "RTA") ||
        (filter === "AMCs" && organization.organization_type === "AMC");
      return typeMatches && (!term || [organization.display_name, organization.description, organization.slug]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)));
    });
  }, [filter, organizations, search]);

  const visibleForms = useMemo(() => {
    const term = formsSearch.trim().toLowerCase();
    return forms.filter((form) => !term || [form.form_name, form.category, form.description]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term)));
  }, [forms, formsSearch]);

  async function loadForms(organization) {
    setSelectedOrganization(organization);
    setFormsSearch("");
    setFormsLoading(true);
    try {
      const response = await authFetch(`/api/forms-center/${organization.id}/items`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load forms");
      setForms(data.items || []);
    } catch (error) {
      toast.error(error.message);
      setSelectedOrganization(null);
    } finally {
      setFormsLoading(false);
    }
  }

  function openExternal(url, organizationId) {
    window.open(url, "_blank", "noopener,noreferrer");
    authFetch(`/api/forms-center/${organizationId}/open`, { method: "POST" }).catch(() => {});
  }

  function editOrganization(organization = null) {
    setEditingOrganizationId(organization?.id || null);
    setOrganizationForm(organization ? {
      display_name: organization.display_name,
      organization_type: organization.organization_type,
      forms_url: organization.forms_url,
      description: organization.description || "",
      display_order: organization.display_order || 0,
      active: organization.active !== false,
    } : EMPTY_ORGANIZATION);
    setOrganizationEditor(true);
  }

  async function saveOrganization(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await authFetch(editingOrganizationId ? `/api/forms-center/${editingOrganizationId}` : "/api/forms-center", {
        method: editingOrganizationId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(organizationForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save organization");
      toast.success(editingOrganizationId ? "Organization updated" : "Organization added");
      setOrganizationEditor(false);
      await loadOrganizations({ silent: true });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  function editForm(form = null) {
    setEditingFormId(form?.id || null);
    setFormForm(form ? {
      form_name: form.form_name,
      category: form.category || "General",
      form_url: form.form_url,
      description: form.description || "",
      display_order: form.display_order || 0,
      active: form.active !== false,
    } : EMPTY_FORM);
    setFormEditor(true);
  }

  async function saveForm(event) {
    event.preventDefault();
    if (!selectedOrganization) return;
    setSaving(true);
    try {
      const base = `/api/forms-center/${selectedOrganization.id}/items`;
      const response = await authFetch(editingFormId ? `${base}/${editingFormId}` : base, {
        method: editingFormId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save form link");
      toast.success(editingFormId ? "Form link updated" : "Form link added");
      setFormEditor(false);
      await loadForms(selectedOrganization);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function verifyLinks(id = null) {
    setVerifying(true);
    try {
      const response = await authFetch("/api/forms-center/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { id } : {}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to verify links");
      toast.success(`${data.results?.length || 0} official page${data.results?.length === 1 ? "" : "s"} checked`);
      await loadOrganizations({ silent: true });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setVerifying(false);
    }
  }

  async function archiveConfirmed() {
    if (!archiveTarget) return;
    setSaving(true);
    try {
      const isForm = archiveTarget.kind === "form";
      const url = isForm
        ? `/api/forms-center/${selectedOrganization.id}/items/${archiveTarget.item.id}`
        : `/api/forms-center/${archiveTarget.item.id}`;
      const response = await authFetch(url, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to archive link");
      toast.success("Link archived");
      setArchiveTarget(null);
      if (isForm) await loadForms(selectedOrganization);
      else await loadOrganizations({ silent: true });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operations workspace"
        title="Forms Information Center"
        description="Find an AMC or RTA, choose the required form, and open the official source instantly."
        tone="emerald"
        actions={admin && (
          <>
            <CrmTooltip content="Verify official directory links">
              <button type="button" onClick={() => verifyLinks()} disabled={verifying} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:opacity-60">
                <RefreshCw size={17} className={verifying ? "animate-spin" : ""} />
              </button>
            </CrmTooltip>
            <button type="button" onClick={() => editOrganization()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800">
              <Plus size={16} /> Add organization
            </button>
          </>
        )}
      />

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Official forms directory</h2>
              <p className="mt-1 text-sm text-slate-500">Select an organization to browse its available forms.</p>
            </div>
            <div className="relative min-w-0 sm:w-80">
              <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search AMC or RTA" className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            {["All", "RTAs", "AMCs"].map((item) => (
              <button key={item} type="button" onClick={() => setFilter(item)} className={`rounded-full px-4 py-2 text-xs font-semibold transition ${filter === item ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {loading ? (
            <p className="p-10 text-center text-sm text-slate-500">Loading official forms directory...</p>
          ) : visibleOrganizations.length === 0 ? (
            <p className="p-10 text-center text-sm font-medium text-slate-500">No organization matches your search.</p>
          ) : visibleOrganizations.map((organization) => (
            <article key={organization.id} className={`grid gap-4 p-4 transition hover:bg-blue-50/30 sm:p-5 lg:grid-cols-[minmax(260px,1fr)_auto_minmax(220px,0.8fr)_auto] lg:items-center ${!organization.active ? "opacity-55" : ""}`}>
              <button type="button" onClick={() => loadForms(organization)} className="flex min-w-0 items-center gap-3 text-left">
                <Logo organization={organization} />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-950">{organization.display_name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${organization.organization_type === "RTA" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>{organization.organization_type}</span>
                  </span>
                  <span className="mt-1 block text-xs font-medium text-blue-700">Browse available forms</span>
                </span>
              </button>

              <div className="flex items-center gap-2">
                <ExternalButton onClick={() => loadForms(organization)}>
                  <FolderOpen size={14} /> Forms
                </ExternalButton>
                <ExternalButton quiet onClick={() => openExternal(organization.forms_url, organization.id)}>
                  Official page <ExternalLink size={14} />
                </ExternalButton>
              </div>

              <p className="line-clamp-2 text-xs leading-5 text-slate-500">{organization.description || "Official forms and information-center page."}</p>

              {admin && (
                <div className="flex items-center justify-end gap-2">
                  <CrmTooltip content={`${organization.verification_status || "unknown"} · ${organization.last_http_status || "not checked"}`}>
                    <button type="button" onClick={() => verifyLinks(organization.id)} disabled={verifying} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"><RefreshCw size={15} /></button>
                  </CrmTooltip>
                  <CrmTooltip content="Edit organization">
                    <button type="button" onClick={() => editOrganization(organization)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"><Pencil size={15} /></button>
                  </CrmTooltip>
                  <CrmTooltip content="Archive organization">
                    <button type="button" onClick={() => setArchiveTarget({ kind: "organization", item: organization })} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
                  </CrmTooltip>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      {selectedOrganization && (
        <div className="fixed inset-0 z-[75] flex justify-end bg-slate-950/35 backdrop-blur-sm" onClick={() => setSelectedOrganization(null)}>
          <aside className="flex h-full w-full max-w-2xl flex-col bg-slate-50 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <header className="border-b border-slate-200 bg-white p-4 sm:p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Logo organization={selectedOrganization} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{selectedOrganization.organization_type} forms</p>
                    <h2 className="truncate text-xl font-semibold text-slate-950">{selectedOrganization.display_name}</h2>
                  </div>
                </div>
                <button type="button" onClick={() => setSelectedOrganization(null)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"><X size={17} /></button>
              </div>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={formsSearch} onChange={(event) => setFormsSearch(event.target.value)} placeholder="Search forms, KYC, SIP..." className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100" />
                </div>
                {admin && <button type="button" onClick={() => editForm()} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"><Plus size={16} /> Add form link</button>}
              </div>
            </header>
            <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
              {formsLoading ? (
                <p className="py-12 text-center text-sm text-slate-500">Loading forms...</p>
              ) : visibleForms.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
                  <FileStack size={24} className="mx-auto text-slate-300" />
                  <p className="mt-2 text-sm font-semibold text-slate-700">No form links found.</p>
                  <p className="mt-1 text-xs text-slate-500">Admins can add direct links for commonly used forms.</p>
                </div>
              ) : visibleForms.map((form) => (
                <article key={form.id} className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md ${!form.active ? "opacity-55" : ""}`}>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold uppercase text-blue-700">{form.category || "General"}</span>
                      <h3 className="mt-2 text-sm font-semibold text-slate-950">{form.form_name}</h3>
                      {form.description && <p className="mt-1 text-xs leading-5 text-slate-500">{form.description}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {admin && (
                        <>
                          <CrmTooltip content="Edit form link"><button type="button" onClick={() => editForm(form)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"><Pencil size={15} /></button></CrmTooltip>
                          <CrmTooltip content="Archive form link"><button type="button" onClick={() => setArchiveTarget({ kind: "form", item: form })} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button></CrmTooltip>
                        </>
                      )}
                      <ExternalButton onClick={() => openExternal(form.form_url, selectedOrganization.id)}>Open form <ExternalLink size={14} /></ExternalButton>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </aside>
        </div>
      )}

      {organizationEditor && (
        <EditorModal title={editingOrganizationId ? "Edit organization" : "Add organization"} onClose={() => setOrganizationEditor(false)} onSubmit={saveOrganization} saving={saving}>
          <FormInput label="Organization name" name="display_name" required value={organizationForm.display_name} onValueChange={(value) => setOrganizationForm((current) => ({ ...current, display_name: value }))} />
          <FormSelect label="Organization type" name="organization_type" required value={organizationForm.organization_type} options={["RTA", "AMC", "Other"]} onValueChange={(value) => setOrganizationForm((current) => ({ ...current, organization_type: value }))} />
          <FormInput label="Official forms directory URL" name="forms_url" required value={organizationForm.forms_url} onValueChange={(value) => setOrganizationForm((current) => ({ ...current, forms_url: value }))} className="sm:col-span-2" />
          <FormInput label="Description" name="description" multiline rows={3} value={organizationForm.description} onValueChange={(value) => setOrganizationForm((current) => ({ ...current, description: value }))} className="sm:col-span-2" />
          <FormInput label="Display order" name="display_order" type="number" value={organizationForm.display_order} onValueChange={(value) => setOrganizationForm((current) => ({ ...current, display_order: value }))} />
          <ActiveToggle checked={organizationForm.active} onChange={(active) => setOrganizationForm((current) => ({ ...current, active }))} />
        </EditorModal>
      )}

      {formEditor && (
        <EditorModal title={editingFormId ? "Edit form link" : "Add form link"} onClose={() => setFormEditor(false)} onSubmit={saveForm} saving={saving}>
          <FormInput label="Form name" name="form_name" required value={formForm.form_name} onValueChange={(value) => setFormForm((current) => ({ ...current, form_name: value }))} />
          <FormInput label="Category" name="category" placeholder="KYC, Transaction, SIP..." value={formForm.category} onValueChange={(value) => setFormForm((current) => ({ ...current, category: value }))} />
          <FormInput label="Official form URL" name="form_url" required value={formForm.form_url} onValueChange={(value) => setFormForm((current) => ({ ...current, form_url: value }))} className="sm:col-span-2" />
          <FormInput label="Description" name="description" multiline rows={3} value={formForm.description} onValueChange={(value) => setFormForm((current) => ({ ...current, description: value }))} className="sm:col-span-2" />
          <FormInput label="Display order" name="display_order" type="number" value={formForm.display_order} onValueChange={(value) => setFormForm((current) => ({ ...current, display_order: value }))} />
          <ActiveToggle checked={formForm.active} onChange={(active) => setFormForm((current) => ({ ...current, active }))} />
        </EditorModal>
      )}

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="Archive link?"
        message={`${archiveTarget?.item?.form_name || archiveTarget?.item?.display_name || "This link"} will no longer appear for operations users.`}
        confirmLabel="Archive"
        loading={saving}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={archiveConfirmed}
      />
    </div>
  );
}

function EditorModal({ title, onClose, onSubmit, saving, children }) {
  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
      <form onSubmit={onSubmit} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/60 bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"><X size={17} /></button>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">{children}</div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={saving} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">{saving ? "Saving..." : "Save"}</button>
        </div>
      </form>
    </div>
  );
}

function ActiveToggle({ checked, onChange }) {
  return (
    <label className="flex items-center gap-3 self-end rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-emerald-600" />
      Active and visible
    </label>
  );
}
