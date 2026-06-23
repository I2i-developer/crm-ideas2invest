"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { KeyRound, ShieldCheck, UserPlus } from "lucide-react";
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

const initialPasswordForm = {
  user_id: "",
  password: "",
  confirm_password: "",
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
  const [changingPassword, setChangingPassword] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [passwordForm, setPasswordForm] = useState(initialPasswordForm);
  const [createdUser, setCreatedUser] = useState(null);
  const [passwordChangedUser, setPasswordChangedUser] = useState(null);
  const [users, setUsers] = useState([]);

  const passwordsMatch = useMemo(
    () => form.password && form.confirm_password && form.password === form.confirm_password,
    [form.confirm_password, form.password]
  );
  const changePasswordsMatch = useMemo(
    () => passwordForm.password && passwordForm.confirm_password && passwordForm.password === passwordForm.confirm_password,
    [passwordForm.confirm_password, passwordForm.password]
  );

  const userOptions = useMemo(
    () =>
      users.map((user) => ({
        value: user.id,
        label: `${user.full_name || user.email} (${user.role}${user.is_active ? "" : ", inactive"})`,
      })),
    [users]
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

    setUsers(data.users || []);
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
    setUsers((current) => {
      const withoutDuplicate = current.filter((user) => user.id !== data.user.id);
      return [...withoutDuplicate, data.user].sort((a, b) =>
        String(a.full_name || a.email || "").localeCompare(String(b.full_name || b.email || ""))
      );
    });
    setForm({
      ...initialForm,
      role: form.role,
    });
    toast.success("CRM user created");
  }

  async function changePassword(event) {
    event.preventDefault();
    setPasswordChangedUser(null);

    if (!passwordForm.user_id) {
      toast.error("Select the CRM user");
      return;
    }

    if (!changePasswordsMatch) {
      toast.error("Passwords do not match");
      return;
    }

    setChangingPassword(true);
    const response = await authFetch("/api/system-gate/user-provisioning", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...passwordForm,
        provisioning_secret: secret,
      }),
    });
    const data = await response.json();
    setChangingPassword(false);

    if (!response.ok) {
      toast.error(data.error || "Password change failed");
      return;
    }

    setPasswordChangedUser(data.user);
    setPasswordForm({ ...initialPasswordForm, user_id: passwordForm.user_id });
    toast.success("Password updated");
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
            <div className="space-y-6">
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

              <form onSubmit={changePassword} className="glass-card space-y-5 p-6">
                <div className="flex items-center gap-3">
                  <KeyRound className="text-blue-700" />
                  <h2 className="text-xl font-semibold text-gray-800">Change User Password</h2>
                </div>
                <p className="text-sm text-gray-500">
                  Update the login password for any existing admin or operations user. The user is not logged in automatically.
                </p>

                <FormSelect
                  label="CRM User"
                  name="user_id"
                  value={passwordForm.user_id}
                  onValueChange={(value) => setPasswordForm({ ...passwordForm, user_id: value })}
                  options={userOptions}
                  placeholder="Select user"
                  required
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <FormInput
                    label="New Password"
                    name="new_password"
                    type="password"
                    value={passwordForm.password}
                    onValueChange={(value) => setPasswordForm({ ...passwordForm, password: value })}
                    required
                  />
                  <FormInput
                    label="Confirm New Password"
                    name="confirm_new_password"
                    type="password"
                    value={passwordForm.confirm_password}
                    onValueChange={(value) => setPasswordForm({ ...passwordForm, confirm_password: value })}
                    required
                  />
                </div>

                {passwordForm.password && passwordForm.confirm_password && !changePasswordsMatch && (
                  <p className="text-sm text-red-600">Passwords do not match.</p>
                )}

                <button
                  type="submit"
                  disabled={changingPassword || !passwordForm.user_id}
                  className="rounded-lg bg-slate-900 px-5 py-2.5 text-white disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  {changingPassword ? "Updating..." : "Change Password"}
                </button>
              </form>
            </div>

            <aside className="glass-card h-fit p-6">
              <h2 className="text-lg font-semibold text-gray-800">Provisioning Summary</h2>
              <div className="mt-4 space-y-5 text-sm">
                <div>
                  <p className="font-semibold text-gray-700">Created User</p>
                  {createdUser ? (
                    <div className="mt-2 space-y-2">
                      <p><span className="text-gray-500">Name:</span> {createdUser.full_name}</p>
                      <p><span className="text-gray-500">Email:</span> {createdUser.email}</p>
                      <p><span className="text-gray-500">Role:</span> {createdUser.role}</p>
                      <p><span className="text-gray-500">Status:</span> {createdUser.is_active ? "Active" : "Inactive"}</p>
                    </div>
                  ) : (
                    <p className="mt-2 text-gray-500">New user summary appears here after creation.</p>
                  )}
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <p className="font-semibold text-gray-700">Password Changed</p>
                  {passwordChangedUser ? (
                    <div className="mt-2 space-y-2">
                      <p><span className="text-gray-500">Name:</span> {passwordChangedUser.full_name}</p>
                      <p><span className="text-gray-500">Email:</span> {passwordChangedUser.email}</p>
                      <p><span className="text-gray-500">Role:</span> {passwordChangedUser.role}</p>
                    </div>
                  ) : (
                    <p className="mt-2 text-gray-500">Password change summary appears here after update.</p>
                  )}
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
