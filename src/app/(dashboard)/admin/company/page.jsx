"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, Eye, EyeOff, KeyRound, Save, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { authFetch } from "@/lib/authFetch";
import { supabase } from "@/lib/supabaseClient";
import FormInput from "../clients/components/FormInput";
import ConfirmDialog from "@/components/ConfirmDialog";
import PageHeader from "@/components/PageHeader";

const emptyCompany = {
  company_name: "",
  arn: "",
  euin_details: "",
  registered_address: "",
  contact_email: "",
  contact_phone: "",
  website: "",
};

const emptyCredential = {
  platform: "",
  login_url: "",
  username: "",
  secret: "",
  notes: "",
  active: true,
};

async function readApiJson(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return {
    error: text?.startsWith("<!DOCTYPE")
      ? "The server returned an HTML page instead of JSON. Please check login/session and server logs."
      : text || "Unexpected server response",
  };
}

export default function CompanyPage() {
  const [company, setCompany] = useState(emptyCompany);
  const [credentials, setCredentials] = useState([]);
  const [credentialForm, setCredentialForm] = useState(emptyCredential);
  const [editingId, setEditingId] = useState(null);
  const [revealed, setRevealed] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingCompany, setEditingCompany] = useState(false);
  const [role, setRole] = useState(null);
  const [credentialToDelete, setCredentialToDelete] = useState(null);
  const [deletingCredential, setDeletingCredential] = useState(false);
  const isAdmin = role === "admin";
  const canEditCredentials = role === "admin" || role === "operations";

  const credentialTitle = useMemo(() => editingId ? "Update Credential" : "Add Credential", [editingId]);

  async function loadData() {
    setLoading(true);
    const [{ data: userData }, companyRes] = await Promise.all([
      supabase.auth.getUser(),
      authFetch("/api/company/details"),
    ]);

    let currentRole = null;
    if (userData?.user?.id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userData.user.id)
        .maybeSingle();
      currentRole = profile?.role || null;
      setRole(currentRole);
    }

    const companyData = await readApiJson(companyRes);
    if (companyRes.ok) {
      setCompany({ ...emptyCompany, ...(companyData.company || {}) });
    } else {
      toast.error(companyData.error || "Company details could not be loaded");
    }

    if (currentRole === "admin" || currentRole === "operations") {
      const credentialsRes = await authFetch("/api/company/credentials");
      const data = await readApiJson(credentialsRes);
      if (credentialsRes.ok) setCredentials(data.credentials || []);
      else toast.error(data.error || "Credentials could not be loaded");
    }

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function saveCompany(event) {
    event.preventDefault();
    setSaving(true);
    const response = await authFetch("/api/company/details", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(company),
    });
    setSaving(false);

    if (!response.ok) {
      const data = await readApiJson(response);
      toast.error(data.error || "Company update failed");
      return;
    }

    toast.success("Company details saved");
    setEditingCompany(false);
    loadData();
  }

  async function saveCredential(event) {
    event.preventDefault();
    if (!credentialForm.platform) {
      toast.error("Platform is required");
      return;
    }

    const response = await authFetch(
      editingId ? `/api/company/credentials/${editingId}` : "/api/company/credentials",
      {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentialForm),
      }
    );

    const data = await readApiJson(response);
    if (!response.ok) {
      toast.error(data.error || "Credential save failed");
      return;
    }

    toast.success("Credential saved");
    setCredentialForm(emptyCredential);
    setEditingId(null);
    setRevealed({});
    loadData();
  }

  function editCredential(credential) {
    setEditingId(credential.id);
    setCredentialForm({
      platform: credential.platform || "",
      login_url: credential.login_url || "",
      username: credential.username || "",
      secret: "",
      notes: credential.notes || "",
      active: credential.active !== false,
    });
  }

  async function revealCredential(id) {
    if (revealed[id]) {
      setRevealed((current) => ({ ...current, [id]: null }));
      return;
    }

    const response = await authFetch(`/api/company/credentials/${id}`);
    const data = await readApiJson(response);
    if (!response.ok) {
      toast.error(data.error || "Unable to reveal secret");
      return;
    }

    setRevealed((current) => ({ ...current, [id]: data.secret || "" }));
  }

  async function confirmDeleteCredential() {
    if (!credentialToDelete) return;
    setDeletingCredential(true);
    const response = await authFetch(`/api/company/credentials/${credentialToDelete.id}`, { method: "DELETE" });
    setDeletingCredential(false);
    if (!response.ok) {
      const data = await readApiJson(response);
      toast.error(data.error || "Delete failed");
      return;
    }
    toast.success("Credential deleted");
    setCredentialToDelete(null);
    loadData();
  }

  if (loading) return <div className="p-6 text-gray-500">Loading company settings...</div>;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        eyebrow="Company workspace"
        title="Company"
        description={isAdmin ? "Company details and portal credential vault." : "Company details for operations reference."}
        icon={Building2}
      />

      <div className="glass-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Building2 className="text-blue-700" />
            <h2 className="text-xl font-semibold text-gray-800">Company Details</h2>
          </div>
          {isAdmin && !editingCompany && (
            <button type="button" onClick={() => setEditingCompany(true)} className="rounded-lg border px-4 py-2 text-sm font-medium text-blue-700">
              Edit Details
            </button>
          )}
        </div>

        {editingCompany ? (
          <form onSubmit={saveCompany} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <FormInput label="Company Name" name="company_name" value={company.company_name} onValueChange={(value) => setCompany({ ...company, company_name: value })} required />
              <FormInput label="ARN" name="arn" value={company.arn} onValueChange={(value) => setCompany({ ...company, arn: value })} />
              <FormInput label="EUIN Details" name="euin_details" value={company.euin_details} onValueChange={(value) => setCompany({ ...company, euin_details: value })} />
              <FormInput label="Contact Email" name="contact_email" value={company.contact_email} onValueChange={(value) => setCompany({ ...company, contact_email: value })} />
              <FormInput label="Contact Phone" name="contact_phone" value={company.contact_phone} onValueChange={(value) => setCompany({ ...company, contact_phone: value })} />
              <FormInput label="Website" name="website" value={company.website} onValueChange={(value) => setCompany({ ...company, website: value })} />
              <FormInput label="Registered Address" name="registered_address" value={company.registered_address} onValueChange={(value) => setCompany({ ...company, registered_address: value })} multiline className="md:col-span-2" />
            </div>
            <div className="flex gap-2">
              <button disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-white disabled:opacity-60">
                <Save size={16} /> {saving ? "Saving..." : "Save Company"}
              </button>
              <button type="button" onClick={() => setEditingCompany(false)} className="rounded-lg border px-4 py-2 text-gray-700">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            <Info label="Company Name" value={company.company_name} />
            <Info label="ARN" value={company.arn} />
            <Info label="EUIN Details" value={company.euin_details} />
            <Info label="Contact Email" value={company.contact_email} />
            <Info label="Contact Phone" value={company.contact_phone} />
            <Info label="Website" value={company.website} />
            <Info label="Registered Address" value={company.registered_address} wide />
          </div>
        )}
      </div>

      {canEditCredentials && (
      <div className="grid xl:grid-cols-[380px_1fr] gap-6">
        {(isAdmin || editingId) && (
        <form onSubmit={saveCredential} className="glass-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <KeyRound className="text-violet-700" />
            <h2 className="text-xl font-semibold text-gray-800">{credentialTitle}</h2>
          </div>
          <FormInput label="Platform" name="platform" value={credentialForm.platform} onValueChange={(value) => setCredentialForm({ ...credentialForm, platform: value })} required />
          <FormInput label="Login URL" name="login_url" value={credentialForm.login_url} onValueChange={(value) => setCredentialForm({ ...credentialForm, login_url: value })} />
          <FormInput label="Username" name="username" value={credentialForm.username} onValueChange={(value) => setCredentialForm({ ...credentialForm, username: value })} />
          <FormInput label={editingId ? "New Secret (optional)" : "Password"} name="secret" type="password" value={credentialForm.secret} onValueChange={(value) => setCredentialForm({ ...credentialForm, secret: value })} />
          <FormInput label="Notes" name="notes" value={credentialForm.notes} onValueChange={(value) => setCredentialForm({ ...credentialForm, notes: value })} multiline />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={credentialForm.active} onChange={(event) => setCredentialForm({ ...credentialForm, active: event.target.checked })} />
            Active
          </label>
          <div className="flex gap-2">
            <button className="rounded-lg bg-blue-700 px-4 py-2 text-white">{editingId ? "Update" : "Add"}</button>
            {editingId && (
              <button type="button" onClick={() => { setEditingId(null); setCredentialForm(emptyCredential); }} className="rounded-lg border px-4 py-2 text-gray-700">
                Cancel
              </button>
            )}
          </div>
        </form>
        )}

        <div className={`glass-card p-6 ${isAdmin || editingId ? "" : "xl:col-span-2"}`}>
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Portal Credentials</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-gray-500">
                <tr>
                  <th className="py-3">Platform</th>
                  <th>Username</th>
                  <th>Password</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {credentials.map((credential) => (
                  <tr key={credential.id}>
                    <td className="py-3">
                      <p className="font-medium text-gray-800">{credential.platform}</p>
                      {credential.login_url && <a className="text-xs text-blue-700" href={credential.login_url} target="_blank" rel="noreferrer">Open portal</a>}
                    </td>
                    <td>{credential.username || "-"}</td>
                    <td className="font-mono">{revealed[credential.id] || (credential.has_secret ? "********" : "-")}</td>
                    <td>{credential.active ? "Active" : "Hidden"}</td>
                    <td className="text-right space-x-2">
                      <button type="button" onClick={() => revealCredential(credential.id)} className="rounded-lg border px-2 py-1 text-gray-700">
                        {revealed[credential.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                      <button type="button" onClick={() => editCredential(credential)} className="rounded-lg border px-3 py-1 text-blue-700">Edit</button>
                      {isAdmin && (
                        <button type="button" onClick={() => setCredentialToDelete(credential)} className="rounded-lg border px-2 py-1 text-red-600">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {credentials.length === 0 && (
                  <tr><td colSpan="5" className="py-6 text-center text-gray-500">No credentials added yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}
      <ConfirmDialog
        open={Boolean(credentialToDelete)}
        title="Delete credential?"
        message={`This will remove the saved credential for ${credentialToDelete?.platform || "this platform"}.`}
        loading={deletingCredential}
        onCancel={() => setCredentialToDelete(null)}
        onConfirm={confirmDeleteCredential}
      />
    </div>
  );
}

function Info({ label, value, wide = false }) {
  return (
    <div className={`rounded-xl border border-gray-100 bg-white/70 p-4 ${wide ? "md:col-span-2 xl:col-span-3" : ""}`}>
      <p className="text-xs font-medium uppercase text-gray-400">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-gray-800">{value || "-"}</p>
    </div>
  );
}
