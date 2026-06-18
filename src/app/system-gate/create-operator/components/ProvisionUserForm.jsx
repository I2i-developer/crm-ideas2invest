"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { ShieldCheck, UserPlus } from "lucide-react";
import FormInput from "@/app/(dashboard)/admin/clients/components/FormInput";
import FormSelect from "@/app/(dashboard)/admin/clients/components/FormSelect";
import { authFetch } from "@/lib/authFetch";

const initialForm = {
  full_name: "",
  email: "",
  password: "",
  confirm_password: "",
  role: "operations",
  mobile: "",
  is_active: true,
};

const roleOptions = [
  { value: "operations", label: "Operations" },
  { value: "admin", label: "Admin" },
];

export default function ProvisionUserForm() {
  const [secret, setSecret] = useState("");
  const [secretVerified, setSecretVerified] = useState(false);
  const [checkingSecret, setCheckingSecret] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [createdUser, setCreatedUser] = useState(null);

  const passwordsMatch = useMemo(
    () => form.password && form.confirm_password && form.password === form.confirm_password,
    [form.confirm_password, form.password]
  );

  async function verifySecret(event) {
    event.preventDefault();
    setCheckingSecret(true);

    const response = await authFetch("/api/system-gate/user-provisioning", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provisioning_secret: secret }),
    });
    const data = await response.json();
    setCheckingSecret(false);

    if (!response.ok) {
      toast.error(data.error || "Secret verification failed");
      return;
    }

    setSecretVerified(true);
    toast.success("Provisioning access unlocked");
  }

  async function createUser(event) {
    event.preventDefault();
    setCreatedUser(null);

    if (!form.email || !form.full_name || !form.password) {
      toast.error("Full name, email, and password are required");
      return;
    }

    if (!passwordsMatch) {
      toast.error("Passwords do not match");
      return;
    }

    setCreating(true);
    const response = await authFetch("/api/system-gate/user-provisioning", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        provisioning_secret: secret,
      }),
    });
    const data = await response.json();
    setCreating(false);

    if (!response.ok) {
      toast.error(data.error || "User creation failed");
      return;
    }

    setCreatedUser(data.user);
    setForm({
      ...initialForm,
      role: form.role,
    });
    toast.success("CRM user created");
  }

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Internal access</p>
          <h1 className="mt-2 text-3xl font-semibold text-gray-900">CRM User Provisioning</h1>
          <p className="mt-1 text-sm text-gray-500">
            Hidden admin-only user creation for admin and operations accounts.
          </p>
        </div>

        {!secretVerified ? (
          <form onSubmit={verifySecret} className="glass-card max-w-xl space-y-5 p-6">
            <div className="flex items-center gap-3">
              <ShieldCheck className="text-blue-700" />
              <h2 className="text-xl font-semibold text-gray-800">Verify Provisioning Secret</h2>
            </div>
            <p className="text-sm text-gray-500">
              Enter the server-configured provisioning secret before creating users.
            </p>
            <FormInput
              label="Provisioning Secret"
              name="provisioning_secret"
              type="password"
              value={secret}
              onValueChange={setSecret}
              required
            />
            <button
              type="submit"
              disabled={checkingSecret || !secret}
              className="rounded-lg bg-blue-700 px-5 py-2.5 text-white disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {checkingSecret ? "Checking..." : "Unlock Form"}
            </button>
          </form>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <form onSubmit={createUser} className="glass-card space-y-5 p-6">
              <div className="flex items-center gap-3">
                <UserPlus className="text-green-700" />
                <h2 className="text-xl font-semibold text-gray-800">Create CRM User</h2>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <FormInput
                  label="Full Name"
                  name="full_name"
                  value={form.full_name}
                  onValueChange={(value) => setForm({ ...form, full_name: value })}
                  required
                />
                <FormInput
                  label="Email"
                  name="email"
                  type="email"
                  value={form.email}
                  onValueChange={(value) => setForm({ ...form, email: value })}
                  required
                />
                <FormInput
                  label="Mobile"
                  name="mobile"
                  value={form.mobile}
                  onValueChange={(value) => setForm({ ...form, mobile: value })}
                />
                <FormSelect
                  label="Role"
                  name="role"
                  value={form.role}
                  onValueChange={(value) => setForm({ ...form, role: value })}
                  options={roleOptions}
                  required
                />
                <FormInput
                  label="Password"
                  name="password"
                  type="password"
                  value={form.password}
                  onValueChange={(value) => setForm({ ...form, password: value })}
                  required
                />
                <FormInput
                  label="Confirm Password"
                  name="confirm_password"
                  type="password"
                  value={form.confirm_password}
                  onValueChange={(value) => setForm({ ...form, confirm_password: value })}
                  required
                />
              </div>

              {form.password && form.confirm_password && !passwordsMatch && (
                <p className="text-sm text-red-600">Passwords do not match.</p>
              )}

              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(event) => setForm({ ...form, is_active: event.target.checked })}
                />
                Active user
              </label>

              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-lg bg-blue-700 px-5 py-2.5 text-white disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  {creating ? "Creating..." : "Create User"}
                </button>
                <button
                  type="button"
                  onClick={() => setSecretVerified(false)}
                  className="rounded-lg border border-gray-200 px-5 py-2.5 text-gray-700"
                >
                  Lock Form
                </button>
              </div>
            </form>

            <aside className="glass-card h-fit p-6">
              <h2 className="text-lg font-semibold text-gray-800">Created User</h2>
              {createdUser ? (
                <div className="mt-4 space-y-2 text-sm">
                  <p><span className="text-gray-500">Name:</span> {createdUser.full_name}</p>
                  <p><span className="text-gray-500">Email:</span> {createdUser.email}</p>
                  <p><span className="text-gray-500">Role:</span> {createdUser.role}</p>
                  <p><span className="text-gray-500">Status:</span> {createdUser.is_active ? "Active" : "Inactive"}</p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-gray-500">New user summary appears here after creation.</p>
              )}
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
