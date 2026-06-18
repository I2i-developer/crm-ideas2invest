"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  BellRing,
  Moon,
  Save,
  Settings,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import toast from "react-hot-toast";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/lib/supabaseClient";
import FormInput from "../clients/components/FormInput";
import { formatDateTimeDDMonYYYY } from "@/lib/dateFormat";

const DEFAULT_NOTIFICATIONS = {
  task_assignments: true,
  task_due_reminders: true,
  document_review: true,
  birthday_reminders: true,
  insurance_renewals: true,
  sip_followups: true,
  real_time_toasts: true,
};

const DEFAULT_PREFERENCES = {
  dark_mode: false,
};

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [profile, setProfile] = useState({
    full_name: "",
    designation: "",
    avatar_url: "",
    role: "operations",
  });

  const [notifications, setNotifications] = useState(DEFAULT_NOTIFICATIONS);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [manualUploads, setManualUploads] = useState([]);
  const [uploadsLoading, setUploadsLoading] = useState(false);

  function applyTheme(darkMode) {
    document.documentElement.classList.toggle("dark", Boolean(darkMode));
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }

  const loadManualUploads = useCallback(async () => {
    setUploadsLoading(true);

    const settled = await Promise.allSettled([
      supabase
        .from("sip_report_imports")
        .select("id, file_name, source_type, imported_by, imported_at, import_status, total_rows, new_records, duplicate_records, failed_rows")
        .order("imported_at", { ascending: false })
        .limit(8),
      supabase
        .from("insurance_imports")
        .select("id, file_name, source_type, imported_by, imported_at, import_status, total_rows, successful_rows, duplicate_rows, failed_rows, unmatched_rows")
        .order("imported_at", { ascending: false })
        .limit(8),
      supabase
        .from("documents")
        .select("id, client_id, document_type, file_name, uploaded_by, uploaded_at, status")
        .order("uploaded_at", { ascending: false })
        .limit(8),
      supabase
        .from("client_documents")
        .select("id, client_id, document_type, file_name, uploaded_by, uploaded_at, status")
        .order("uploaded_at", { ascending: false })
        .limit(8),
    ]);

    const rows = [];
    const uploaderIds = new Set();
    const addUploader = (id) => {
      if (id) uploaderIds.add(id);
    };

    const sipImports = settled[0].status === "fulfilled" && !settled[0].value.error ? settled[0].value.data || [] : [];
    sipImports.forEach((item) => {
      addUploader(item.imported_by);
      rows.push({
        key: `sip-${item.id}`,
        type: "SIP report import",
        fileName: item.file_name || "Manual SIP import",
        uploadedBy: item.imported_by,
        uploadedAt: item.imported_at,
        totalRows: item.total_rows,
        newRecords: item.new_records,
        duplicates: item.duplicate_records,
        failedRows: item.failed_rows,
        status: item.import_status,
        sourceType: item.source_type || "manual_upload",
        href: "/admin/sip-tracker",
      });
    });

    const insuranceImports = settled[1].status === "fulfilled" && !settled[1].value.error ? settled[1].value.data || [] : [];
    insuranceImports.forEach((item) => {
      addUploader(item.imported_by);
      rows.push({
        key: `insurance-${item.id}`,
        type: "Insurance policy import",
        fileName: item.file_name || "Manual insurance import",
        uploadedBy: item.imported_by,
        uploadedAt: item.imported_at,
        totalRows: item.total_rows,
        newRecords: item.successful_rows,
        duplicates: item.duplicate_rows,
        failedRows: item.failed_rows,
        status: item.import_status,
        sourceType: item.source_type || "manual_upload",
        href: "/admin/insurance",
      });
    });

    [settled[2], settled[3]].forEach((result, index) => {
      const documents = result.status === "fulfilled" && !result.value.error ? result.value.data || [] : [];
      documents.forEach((item) => {
        addUploader(item.uploaded_by);
        rows.push({
          key: `doc-${index}-${item.id}`,
          type: "Client document upload",
          fileName: item.file_name || item.document_type || "Uploaded document",
          uploadedBy: item.uploaded_by,
          uploadedAt: item.uploaded_at,
          totalRows: null,
          newRecords: null,
          duplicates: null,
          failedRows: null,
          status: item.status || "Uploaded",
          sourceType: "manual_upload",
          href: item.client_id ? `/admin/clients/${item.client_id}` : "/admin/clients",
        });
      });
    });

    const uploaderIdList = [...uploaderIds];
    const { data: uploaders = [] } = uploaderIdList.length
      ? await supabase.from("profiles").select("id, name, full_name, email").in("id", uploaderIdList)
      : { data: [] };
    const uploaderMap = new Map((uploaders || []).map((uploader) => [uploader.id, uploader]));

    setManualUploads(
      rows
        .map((row) => ({
          ...row,
          uploadedByName:
            uploaderMap.get(row.uploadedBy)?.name ||
            uploaderMap.get(row.uploadedBy)?.full_name ||
            uploaderMap.get(row.uploadedBy)?.email ||
            "System",
        }))
        .sort((a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime())
        .slice(0, 12)
    );
    setUploadsLoading(false);
  }, []);

  const fetchProfile = useCallback(async () => {
    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();

    if (!userData?.user) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userData.user.id)
      .single();

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    if (data) {
      setProfile({
        full_name: data.name || data.full_name || "",
        designation: data.designation || "",
        avatar_url: data.avatar_url || "",
        role: data.role || "operations",
      });

      if (data.role === "admin") {
        await loadManualUploads();
      }

      setNotifications({
        ...DEFAULT_NOTIFICATIONS,
        ...(data.notifications || {}),
      });

      const storedDarkMode =
        typeof window !== "undefined" ? localStorage.getItem("theme") === "dark" : false;
      const nextPreferences = {
        ...DEFAULT_PREFERENCES,
        ...(data.preferences || {}),
        dark_mode:
          data.preferences?.dark_mode === undefined
            ? storedDarkMode
            : Boolean(data.preferences?.dark_mode),
      };
      setPreferences(nextPreferences);
      applyTheme(nextPreferences.dark_mode);
    }

    setLoading(false);
  }, [loadManualUploads]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleChange = (event) => {
    setProfile({ ...profile, [event.target.name]: event.target.value });
  };

  const toggleNotification = (key) => {
    setNotifications((previous) => ({
      ...previous,
      [key]: !previous[key],
    }));
  };

  const togglePreference = (key) => {
    const newValue = !preferences[key];

    setPreferences((previous) => ({
      ...previous,
      [key]: newValue,
    }));

    if (key === "dark_mode") {
      applyTheme(newValue);
    }
  };

  const handleAvatarUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    const fileExt = file.name.split(".").pop();
    const filePath = `${userId}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      console.error(uploadError);
      toast.error("Upload failed");
      return;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
    setProfile((previous) => ({ ...previous, avatar_url: data.publicUrl }));
    toast.success("Avatar uploaded");
  };

  const handleSave = async () => {
    setSaving(true);

    const { data: userData } = await supabase.auth.getUser();

    if (!userData?.user) {
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("profiles").upsert({
      id: userData.user.id,
      name: profile.full_name,
      full_name: profile.full_name,
      designation: profile.designation,
      avatar_url: profile.avatar_url,
      role: profile.role,
      notifications,
      preferences,
    });

    setSaving(false);

    if (error) {
      console.error(error);
      toast.error("Failed to save");
      return;
    }

    toast.success("Settings updated");
  };

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading settings...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="User workspace"
        title="Settings"
        description="Manage your CRM profile, theme, notification preferences, and manual upload visibility."
        icon={Settings}
        actions={
          <div className="flex items-center gap-2 rounded-xl border border-white bg-white/80 px-4 py-2 shadow-sm">
            <span className="text-[15px] text-slate-500">Role</span>
            <span
              className={`rounded-full border px-3 py-1 text-[15px] font-semibold capitalize ${
                profile.role === "admin"
                  ? "border-blue-200 bg-blue-100 text-blue-700"
                  : "border-green-200 bg-green-100 text-green-700"
              }`}
            >
              {profile.role}
            </span>
          </div>
        }
      />

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <SettingPanel
          icon={Sparkles}
          title="Profile"
          description="This information appears in the header profile card and CRM activity records."
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="relative h-24 w-24 shrink-0">
              <Image
                src={profile.avatar_url || "/images/profiles/default.png"}
                alt="Profile avatar"
                fill
                unoptimized
                className="rounded-full border-4 border-white object-cover shadow-md"
              />
            </div>
            <label className="block w-full cursor-pointer rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4 transition hover:bg-gray-100 sm:max-w-sm">
              <input type="file" onChange={handleAvatarUpload} className="text-sm" />
              <p className="mt-2 text-xs text-gray-500">Upload JPG or PNG avatar. Recommended square image.</p>
            </label>
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <FormInput
              label="Full Name"
              name="full_name"
              value={profile.full_name}
              onChange={handleChange}
              placeholder="Enter full name"
            />
            <FormInput
              label="Designation"
              name="designation"
              value={profile.designation}
              onChange={handleChange}
              placeholder="e.g. Operations Manager"
            />
          </div>
        </SettingPanel>

        <SettingPanel
          icon={Moon}
          title="Appearance"
          description="Choose the CRM theme used across dashboards, tasks, clients, and operational modules."
        >
          <ToggleRow
            label="Premium dark mode"
            description="Use a darker application surface with high-contrast cards, tables, inputs, and headers."
            checked={preferences.dark_mode}
            onChange={() => togglePreference("dark_mode")}
          />
        </SettingPanel>
      </section>

      <SettingPanel
        icon={BellRing}
        title="Notification Rules"
        description="Choose which CRM workflow alerts should stay visible for your profile."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <ToggleRow
            label="Task assignments"
            description="Notify me when a task is assigned or reassigned to me."
            checked={notifications.task_assignments}
            onChange={() => toggleNotification("task_assignments")}
          />
          <ToggleRow
            label="Due and overdue tasks"
            description="Show reminders for tasks due today and tasks that have crossed the due date."
            checked={notifications.task_due_reminders}
            onChange={() => toggleNotification("task_due_reminders")}
          />
          <ToggleRow
            label="Document review alerts"
            description="Notify me when documents are rejected, pending verification, or need action."
            checked={notifications.document_review}
            onChange={() => toggleNotification("document_review")}
          />
          <ToggleRow
            label="Birthday reminders"
            description="Show client birthday reminders for the current day."
            checked={notifications.birthday_reminders}
            onChange={() => toggleNotification("birthday_reminders")}
          />
          <ToggleRow
            label="Insurance renewals"
            description="Notify me about renewal follow-ups and overdue insurance actions."
            checked={notifications.insurance_renewals}
            onChange={() => toggleNotification("insurance_renewals")}
          />
          <ToggleRow
            label="SIP follow-ups"
            description="Notify me about SIP pause, termination, rejection, and pending follow-up rows."
            checked={notifications.sip_followups}
            onChange={() => toggleNotification("sip_followups")}
          />
          <ToggleRow
            label="Realtime toast alerts"
            description="Show immediate CRM toast pop-ups while you are working in the app."
            checked={notifications.real_time_toasts}
            onChange={() => toggleNotification("real_time_toasts")}
          />
        </div>
      </SettingPanel>

      {profile.role === "admin" && (
        <SettingPanel
          icon={UploadCloud}
          title="Manual Uploaded Files"
          description="Recent manual uploads and imports across CRM modules."
        >
          <ManualUploadsTable uploads={manualUploads} loading={uploadsLoading} />
        </SettingPanel>
      )}

      <div className="sticky bottom-4 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-3xl bg-blue-700 px-5 py-2.5 text-base font-normal text-white shadow-lg shadow-blue-700/20 transition hover:scale-[1.02] hover:bg-blue-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save size={16} />
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </div>
  );
}

function SettingPanel({ icon: Icon, title, description, children }) {
  return (
    <section className="rounded-3xl border border-gray-100 bg-white/80 p-5 shadow-sm backdrop-blur">
      <div className="mb-5 flex items-start gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
          <Icon size={20} />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <p className="mt-1 text-sm leading-5 text-gray-500">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function ToggleRow({ label, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-gray-100 bg-white/70 p-4">
      <div className="min-w-0">
        <p className="font-semibold text-gray-800">{label}</p>
        {description && <p className="mt-1 text-sm leading-5 text-gray-500">{description}</p>}
      </div>

      <button
        type="button"
        onClick={onChange}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-all duration-200 ${
          checked ? "bg-blue-600" : "bg-gray-300"
        }`}
        aria-pressed={checked}
      >
        <span
          className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${
            checked ? "translate-x-5" : ""
          }`}
        />
      </button>
    </div>
  );
}

function formatUploadTime(value) {
  return formatDateTimeDDMonYYYY(value, "-");
}

function ManualUploadsTable({ uploads, loading }) {
  if (loading) {
    return <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5 text-sm text-gray-500">Loading manual upload history...</div>;
  }

  if (!uploads.length) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
        No manual uploads have been recorded yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[900px] w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500">
            <th className="py-3 pr-4">Upload type</th>
            <th className="py-3 pr-4">File</th>
            <th className="py-3 pr-4">Uploaded by</th>
            <th className="py-3 pr-4">Last uploaded</th>
            <th className="py-3 pr-4">Rows</th>
            <th className="py-3 pr-4">Status</th>
            <th className="py-3 pr-4">Source</th>
            <th className="py-3">Module</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {uploads.map((upload) => (
            <tr key={upload.key} className="align-top">
              <td className="py-3 pr-4 font-semibold text-gray-900">{upload.type}</td>
              <td className="max-w-[220px] truncate py-3 pr-4 text-gray-700">{upload.fileName}</td>
              <td className="py-3 pr-4 text-gray-600">{upload.uploadedByName}</td>
              <td className="py-3 pr-4 text-gray-600">{formatUploadTime(upload.uploadedAt)}</td>
              <td className="py-3 pr-4 text-gray-600">
                {upload.totalRows === null || upload.totalRows === undefined ? "-" : (
                  <span>
                    {upload.totalRows} total
                    <span className="block text-xs text-gray-400">
                      {upload.newRecords || 0} new / {upload.duplicates || 0} dup / {upload.failedRows || 0} failed
                    </span>
                  </span>
                )}
              </td>
              <td className="py-3 pr-4">
                <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-semibold capitalize text-blue-700">
                  {String(upload.status || "uploaded").replaceAll("_", " ")}
                </span>
              </td>
              <td className="py-3 pr-4 text-gray-600">{String(upload.sourceType || "manual").replaceAll("_", " ")}</td>
              <td className="py-3">
                <a href={upload.href} className="font-semibold text-blue-700 hover:underline">
                  Open
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
