"use client";

import { useState } from "react";
import { Mic, MicOff } from "lucide-react";
import styles from "./TaskForm.module.css";
import FormInput from "@/app/(dashboard)/admin/clients/components/FormInput";
import FormSelect from "@/app/(dashboard)/admin/clients/components/FormSelect";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import CrmTooltip from "@/components/CrmTooltip";

const CATEGORY_OPTIONS = [
  { value: "KYC", label: "KYC" },
  { value: "Follow-up", label: "Follow-up" },
  { value: "Verification", label: "Verification" },
  { value: "Internal", label: "Internal" },
  { value: "Compliance", label: "Compliance" },
  { value: "Documentation", label: "Documentation" },
  { value: "Other", label: "Other" },
];

const PRIORITY_OPTIONS = [
  { value: "Low", label: "Low" },
  { value: "Medium", label: "Medium" },
  { value: "High", label: "High" },
  { value: "Urgent", label: "Urgent" },
];

const STATUS_OPTIONS = [
  { value: "Pending", label: "Pending" },
  { value: "In Progress", label: "In Progress" },
  { value: "Follow-up", label: "Follow-up" },
  { value: "Waiting for Approval", label: "Waiting for Approval" },
  { value: "Completed", label: "Completed" },
  { value: "On Hold", label: "On Hold" },
  { value: "Cancelled", label: "Cancelled" },
];

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function parseDueDate(text) {
  const normalized = text.toLowerCase();
  const today = new Date();

  if (/\bday after tomorrow\b/.test(normalized)) {
    const dueDate = new Date(today);
    dueDate.setDate(today.getDate() + 2);
    return formatDate(dueDate);
  }

  if (/\btomorrow\b/.test(normalized)) {
    const dueDate = new Date(today);
    dueDate.setDate(today.getDate() + 1);
    return formatDate(dueDate);
  }

  if (/\btoday\b/.test(normalized)) return formatDate(today);

  const slashDate = normalized.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (slashDate) {
    const [, day, month, year] = slashDate;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const isoDate = normalized.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return "";
}

function pickOption(text, options) {
  const normalized = text.toLowerCase();
  return options.find((option) => normalized.includes(option.label.toLowerCase()))?.value || "";
}

function extractSegment(text, labels, stopLabels = []) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const lower = normalized.toLowerCase();
  const labelPattern = labels.map((label) => label.toLowerCase()).join("|");
  const match = lower.match(new RegExp(`\\b(${labelPattern})\\b[:\\s-]*`));
  if (!match) return "";

  const start = match.index + match[0].length;
  const rest = normalized.slice(start);
  const stopIndexes = stopLabels
    .map((label) => rest.toLowerCase().indexOf(` ${label.toLowerCase()}`))
    .filter((index) => index > -1);
  const end = stopIndexes.length ? Math.min(...stopIndexes) : rest.length;

  return rest.slice(0, end).replace(/[.,;:]$/, "").trim();
}

export default function TaskForm({ initialData = null, users = [], clients = [], onSubmit, isEdit = false }) {
  const [form, setForm] = useState({
    title: initialData?.title || "",
    description: initialData?.description || "",
    category: initialData?.category || "Internal",
    priority: initialData?.priority || "Medium",
    status: initialData?.status || "Pending",
    due_date: initialData?.due_date || "",
    client_id: initialData?.client_id || "",
    assigned_to: initialData?.task_assignments?.map((a) => a.user_id) || [],
    tags: initialData?.tags?.join(", ") || "",
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [voiceDraft, setVoiceDraft] = useState("");

  const applyVoiceTranscript = (transcript) => {
    const stopLabels = [
      "description",
      "details",
      "priority",
      "category",
      "due",
      "deadline",
      "assign",
      "assigned",
      "client",
      "tags",
      "tag",
    ];

    const title =
      extractSegment(transcript, ["title", "task"], stopLabels) ||
      transcript.split(/[.]/)[0]?.slice(0, 120).trim();
    const description = extractSegment(transcript, ["description", "details", "remarks"], stopLabels);
    const tags = extractSegment(transcript, ["tags", "tag"], ["client", "assign", "due", "priority", "category"]);
    const priority = pickOption(transcript, PRIORITY_OPTIONS);
    const category = pickOption(transcript, CATEGORY_OPTIONS);
    const dueDate = parseDueDate(transcript);
    const lowerTranscript = transcript.toLowerCase();

    const matchedUsers = users
      .filter((user) => {
        const names = [user.name, user.full_name, user.email].filter(Boolean).map((value) => value.toLowerCase());
        return names.some((name) => lowerTranscript.includes(name));
      })
      .map((user) => user.id);
    const matchedClient = clients.find((client) => lowerTranscript.includes(String(client.full_name || "").toLowerCase()));

    setVoiceDraft(transcript);
    setForm((current) => ({
      ...current,
      title: title || current.title,
      description: description || current.description,
      priority: priority || current.priority,
      category: category || current.category,
      due_date: dueDate || current.due_date,
      assigned_to: matchedUsers.length ? Array.from(new Set([...current.assigned_to, ...matchedUsers])) : current.assigned_to,
      client_id: matchedClient?.id || current.client_id,
      tags: tags || current.tags,
    }));
  };

  const voiceInput = useVoiceInput({
    language: "en-IN",
    onResult: applyVoiceTranscript,
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
    if (errors[name]) setErrors({ ...errors, [name]: "" });
  };

  const validate = () => {
    const newErrors = {};
    if (!form.title.trim()) newErrors.title = "Title is required";
    if (!form.due_date) newErrors.due_date = "Due date is required";
    return newErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setLoading(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        priority: form.priority,
        status: form.status,
        due_date: form.due_date,
        client_id: form.client_id || null,
        tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        assigned_to: form.assigned_to,
      };

      await onSubmit(payload);
    } finally {
      setLoading(false);
    }
  };

  const userOptions = users.map((u) => ({
    value: u.id,
    label: `${u.name || u.full_name || u.email || "Unnamed User"}${u.role ? ` - ${u.role}` : ""}${u.designation ? ` (${u.designation})` : ""}`,
  }));

  const clientOptions = [{ value: "", label: "None" }, ...clients.map((c) => ({ value: c.id, label: c.full_name }))];

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {!isEdit && (
        <div className={styles.voicePanel}>
          <div>
            <h3 className={styles.voiceTitle}>Voice Task Creation</h3>
            <p className={styles.voiceHint}>
              Speak the task title, description, priority, due date, assignees, client, and tags. Review before saving.
            </p>
          </div>
          <CrmTooltip content={voiceInput.unsupported ? "Voice input is not supported in this browser" : "Dictate task details"}>
            <button
              type="button"
              onClick={voiceInput.toggle}
              disabled={voiceInput.unsupported}
              className={`${styles.voiceButton} ${voiceInput.listening ? styles.voiceButtonActive : ""}`}
            >
              {voiceInput.listening ? <MicOff size={18} /> : <Mic size={18} />}
              {voiceInput.listening ? "Listening..." : "Dictate Task"}
            </button>
          </CrmTooltip>
          {(voiceDraft || voiceInput.transcript) && (
            <p className={styles.voiceTranscript}>{voiceDraft || voiceInput.transcript}</p>
          )}
          {(voiceInput.error || voiceInput.unsupported) && (
            <p className={styles.voiceError}>
              {voiceInput.error || "Voice input is unavailable in this browser. Manual entry still works."}
            </p>
          )}
        </div>
      )}

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Task Details</h3>
        <div className={styles.grid2}>
          <div className={styles.fullWidth}>
            <FormInput label="Task Title" name="title" placeholder="Enter task title" value={form.title} onChange={handleChange} required />
            {errors.title && <span className={styles.error}>{errors.title}</span>}
          </div>

          <FormSelect label="Category" name="category" options={CATEGORY_OPTIONS} value={form.category} onChange={handleChange} />

          <FormSelect label="Priority" name="priority" options={PRIORITY_OPTIONS} value={form.priority} onChange={handleChange} required />

          {isEdit && <FormSelect label="Status" name="status" options={STATUS_OPTIONS} value={form.status} onChange={handleChange} />}

          <div className={styles.dateField}>
            <FormInput label="Due Date" name="due_date" type="date" value={form.due_date} onChange={handleChange} required />
            {errors.due_date && <span className={styles.error}>{errors.due_date}</span>}
          </div>

          <div className={styles.fullWidth}>
            <FormInput label="Description" name="description" placeholder="Enter task description..." value={form.description} onChange={handleChange} multiline rows={4} />
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Assignment</h3>
        <div className={styles.grid2}>
          <div className={styles.fullWidth}>
            <FormSelect
              label="Assign To"
              name="assigned_to"
              options={userOptions}
              value={form.assigned_to}
              onValueChange={(value) => setForm({ ...form, assigned_to: value })}
              placeholder="Select one or more admins or operations users"
              isMulti
            />
            <p className={styles.hint}>Select multiple admins or operations users for the same task.</p>
          </div>

          <div className={styles.fullWidth}>
            <FormSelect label="Link Client (Optional)" name="client_id" options={clientOptions} value={form.client_id} onChange={handleChange} />
          </div>

          <div className={styles.fullWidth}>
            <FormInput label="Tags" name="tags" placeholder="Enter tags separated by commas" value={form.tags} onChange={handleChange} />
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <button type="button" onClick={() => history.back()} className={styles.cancelBtn}>Cancel</button>
        <button type="submit" disabled={loading} className={styles.submitBtn}>
          {loading ? "Saving..." : isEdit ? "Update Task" : "Create Task"}
        </button>
      </div>
    </form>
  );
}
