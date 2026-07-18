import { randomUUID, createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { createNotification } from "@/lib/notifications/service";
import { createTaskServiceClient, getTaskDataClient } from "@/lib/tasks/assignees";

export const PAYMENT_STATUSES = ["Paid", "Pending", "Grace Period", "Lapsed", "Overdue"];

export function dateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

export function inferPaymentStatus(policy, today = dateKey()) {
  const current = policy.payment_status || "Pending";
  if (current === "Paid") return "Paid";
  if (current === "Lapsed") return "Lapsed";

  const dueDate = policy.due_date || policy.renewal_date;
  if (!dueDate) return current;
  if (policy.grace_period_end_date && today > policy.grace_period_end_date) return "Lapsed";
  if (policy.grace_period_end_date && today > dueDate && today <= policy.grace_period_end_date) return "Grace Period";
  if (today > dueDate) return "Overdue";
  return current;
}

export function calculateNextRenewalDate(policy) {
  const baseDate = policy.due_date || policy.renewal_date;
  if (!baseDate) return null;
  const frequency = String(policy.premium_frequency || "").toLowerCase();
  const date = new Date(baseDate);
  if (Number.isNaN(date.getTime())) return null;

  if (frequency.includes("month")) return dateKey(addMonths(date, 1));
  if (frequency.includes("quarter")) return dateKey(addMonths(date, 3));
  if (frequency.includes("half") || frequency.includes("semi")) return dateKey(addMonths(date, 6));
  return dateKey(addMonths(date, 12));
}

export function buildInsuranceSummary(policies = []) {
  const today = dateKey();
  const todayDate = new Date(today);
  const next30 = dateKey(addDays(todayDate, 30));
  const thisWeek = dateKey(addDays(todayDate, 7));
  const monthStart = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0).toISOString().slice(0, 10);

  const activeDuePolicies = policies.filter((policy) => {
    const paymentStatus = inferPaymentStatus(policy, today);
    return paymentStatus !== "Paid" && paymentStatus !== "Lapsed" && (policy.due_date || policy.renewal_date);
  });

  const dueDateOf = (policy) => policy.due_date || policy.renewal_date;
  const renewalAmountDue = activeDuePolicies
    .filter((policy) => dueDateOf(policy) <= next30 || inferPaymentStatus(policy, today) === "Overdue")
    .reduce((sum, policy) => sum + Number(policy.premium_amount || 0), 0);

  const byCompany = policies.reduce((acc, policy) => {
    const company = policy.insurance_company || "Not set";
    acc[company] = (acc[company] || 0) + 1;
    return acc;
  }, {});

  return {
    total_policies: policies.length,
    due_next_30_days: activeDuePolicies.filter((policy) => dueDateOf(policy) >= today && dueDateOf(policy) <= next30).length,
    due_this_week: activeDuePolicies.filter((policy) => dueDateOf(policy) >= today && dueDateOf(policy) <= thisWeek).length,
    pending_renewals: policies.filter((policy) =>
      ["Pending", "Grace Period", "Overdue"].includes(inferPaymentStatus(policy, today))
    ).length,
    overdue_policies: policies.filter((policy) => inferPaymentStatus(policy, today) === "Overdue").length,
    grace_period_policies: policies.filter((policy) => inferPaymentStatus(policy, today) === "Grace Period").length,
    lapsed_policies: policies.filter((policy) => inferPaymentStatus(policy, today) === "Lapsed").length,
    pending_followups: policies.filter((policy) =>
      inferPaymentStatus(policy, today) !== "Paid" &&
      (policy.next_follow_up_date || policy.due_date || policy.renewal_date)
    ).length,
    paid_renewals_this_month: policies.filter((policy) =>
      policy.payment_status === "Paid" &&
      policy.paid_at &&
      policy.paid_at.slice(0, 10) >= monthStart &&
      policy.paid_at.slice(0, 10) <= monthEnd
    ).length,
    renewal_amount_due: renewalAmountDue,
    by_company: byCompany,
  };
}

export function normalizePolicyPayload(body, userId, existing = {}) {
  const nullableId = (value, fallback = null) => {
    const candidate = value === undefined ? fallback : value;
    return typeof candidate === "string" && candidate.trim() === "" ? null : candidate || null;
  };
  const paymentStatus = body.payment_status || existing.payment_status || "Pending";
  const dueDate = body.due_date || body.renewal_date || existing.due_date || existing.renewal_date || null;
  const paidAt = paymentStatus === "Paid"
    ? body.paid_at || existing.paid_at || new Date().toISOString()
    : null;
  const nextRenewalDate = paymentStatus === "Paid"
    ? body.next_renewal_date || calculateNextRenewalDate({ ...existing, ...body, due_date: dueDate })
    : body.next_renewal_date || existing.next_renewal_date || null;

  return {
    client_id: nullableId(body.client_id, existing.client_id),
    policy_type: body.policy_type ?? existing.policy_type ?? null,
    insurance_company: body.insurance_company ?? existing.insurance_company ?? null,
    policy_number: body.policy_number ?? existing.policy_number ?? null,
    premium_amount: body.premium_amount === "" || body.premium_amount === null
      ? null
      : body.premium_amount === undefined
        ? existing.premium_amount ?? null
        : Number(body.premium_amount),
    premium_frequency: body.premium_frequency ?? existing.premium_frequency ?? null,
    renewal_date: body.renewal_date || dueDate,
    due_date: dueDate,
    issuance_date: body.issuance_date || existing.issuance_date || null,
    payment_status: paymentStatus,
    grace_period_end_date: body.grace_period_end_date || existing.grace_period_end_date || null,
    next_follow_up_date: body.next_follow_up_date || existing.next_follow_up_date || null,
    assigned_to: nullableId(body.assigned_to, existing.assigned_to),
    paid_at: paidAt,
    next_renewal_date: nextRenewalDate,
    contact_mobile: body.contact_mobile ?? existing.contact_mobile ?? null,
    contact_email: body.contact_email ?? existing.contact_email ?? null,
    last_contacted_date: body.last_contacted_date || existing.last_contacted_date || null,
    sum_assured: body.sum_assured === "" || body.sum_assured === null
      ? null
      : body.sum_assured === undefined
        ? existing.sum_assured ?? null
        : Number(body.sum_assured),
    nominee: body.nominee ?? existing.nominee ?? null,
    through_company: body.through_company ?? existing.through_company ?? false,
    status: body.status || existing.status || "Active",
    remarks: body.remarks ?? existing.remarks ?? null,
    document_id: nullableId(body.document_id, existing.document_id),
    updated_by: userId,
  };
}

function normalizeHeader(value) {
  return String(value || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

const HEADER_MAP = {
  clientname: "client_name",
  name: "client_name",
  policyholder: "client_name",
  insurancecompany: "insurance_company",
  insurer: "insurance_company",
  company: "insurance_company",
  policynumber: "policy_number",
  policyno: "policy_number",
  policytype: "policy_type",
  premiumamount: "premium_amount",
  premium: "premium_amount",
  amount: "premium_amount",
  duedate: "due_date",
  renewaldate: "renewal_date",
  issuancedate: "issuance_date",
  issuedate: "issuance_date",
  contactphone: "contact_mobile",
  phone: "contact_mobile",
  mobile: "contact_mobile",
  email: "contact_email",
  contactemail: "contact_email",
  status: "payment_status",
  paymentstatus: "payment_status",
  premiumfrequency: "premium_frequency",
  frequency: "premium_frequency",
  throughcompany: "through_company",
  throughus: "through_company",
  remarks: "remarks",
};

function parseExcelDate(value) {
  if (!value) return null;
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const text = String(value).trim();
  const match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (match) {
    const [, a, b, c] = match;
    const year = c.length === 2 ? `20${c}` : c;
    const first = Number(a);
    const second = Number(b);
    const month = first > 12 ? second : first;
    const day = first > 12 ? first : second;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : dateKey(date);
}

function normalizeMobile(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function normalizeImportedPolicy(row) {
  const normalized = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    const mappedKey = HEADER_MAP[normalizeHeader(key)];
    if (!mappedKey) return;
    normalized[mappedKey] = typeof value === "string" ? value.trim() : value;
  });

  ["due_date", "renewal_date", "issuance_date"].forEach((field) => {
    normalized[field] = parseExcelDate(normalized[field]);
  });
  normalized.due_date = normalized.due_date || normalized.renewal_date || null;
  normalized.renewal_date = normalized.renewal_date || normalized.due_date || null;
  normalized.contact_mobile = normalizeMobile(normalized.contact_mobile);
  normalized.contact_email = String(normalized.contact_email || "").trim().toLowerCase();
  normalized.premium_amount = normalized.premium_amount ? Number(String(normalized.premium_amount).replace(/,/g, "")) : null;
  normalized.payment_status = PAYMENT_STATUSES.includes(normalized.payment_status) ? normalized.payment_status : "Pending";
  normalized.through_company = ["yes", "true", "through us", "company"].includes(String(normalized.through_company || "").toLowerCase());

  return normalized;
}

export async function parseInsuranceImport(file) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  const fileHash = createHash("sha256").update(buffer).digest("hex");
  return {
    fileHash,
    rows: rawRows.map((row) => ({ raw: row, normalized: normalizeImportedPolicy(row) })),
  };
}

export async function matchInsuranceClient(db, policy) {
  const mobile = normalizeMobile(policy.contact_mobile);
  const email = String(policy.contact_email || "").toLowerCase();
  const name = String(policy.client_name || "").trim();

  if (mobile) {
    const { data } = await db.from("clients").select("id, full_name, mobile, email").eq("mobile", mobile).maybeSingle();
    if (data) return { client: data, reason: "Mobile exact match" };
  }
  if (email) {
    const { data } = await db.from("clients").select("id, full_name, mobile, email").ilike("email", email).maybeSingle();
    if (data) return { client: data, reason: "Email exact match" };
  }
  if (name) {
    const { data } = await db.from("clients").select("id, full_name, mobile, email").ilike("full_name", name).limit(1);
    if (data?.[0]) return { client: data[0], reason: "Client name match" };
  }
  return { client: null, reason: "No CRM client match" };
}

export async function createInsuranceFollowupTask({
  supabase,
  policy,
  actor,
  assigneeId,
  alertType = "upcoming_30_day",
}) {
  const taskDb = getTaskDataClient(supabase);
  const dueDate = policy.due_date || policy.renewal_date;
  const cycleKey = dueDate || "no_due_date";
  const createdFor = assigneeId || policy.assigned_to || actor?.id || null;

  const { data: existingAlert } = await taskDb
    .from("insurance_renewal_alerts")
    .select("id, task_id, notification_id")
    .eq("policy_id", policy.id)
    .eq("alert_type", alertType)
    .eq("renewal_cycle_key", cycleKey)
    .eq("created_for", createdFor)
    .maybeSingle();

  if (existingAlert?.task_id) return existingAlert;

  const clientName = policy.client?.full_name || policy.imported_client_name || "insurance policy holder";
  const title = `Follow up: Insurance renewal for ${clientName}`;
  const description = [
    `Policy: ${policy.policy_type || "Insurance"} ${policy.policy_number ? `(${policy.policy_number})` : ""}`,
    `Company: ${policy.insurance_company || "-"}`,
    `Premium: ${policy.premium_amount || "-"}`,
    `Due date: ${dueDate || "-"}`,
    `Payment status: ${policy.payment_status || "Pending"}`,
    policy.remarks ? `Remarks: ${policy.remarks}` : "",
  ].filter(Boolean).join("\n");
  const taskNumber = `INS-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}-${randomUUID().slice(0, 8).toUpperCase()}`;

  const { data: task, error: taskError } = await taskDb
    .from("tasks")
    .insert({
      task_number: taskNumber,
      title,
      description,
      category: "Insurance",
      priority: alertType.includes("overdue") ? "High" : "Medium",
      due_date: policy.next_follow_up_date || dueDate || dateKey(),
      client_id: policy.client_id,
      tags: ["Insurance", alertType],
      created_by: actor?.id || null,
    })
    .select()
    .single();

  if (taskError) throw new Error(taskError.message);

  if (createdFor) {
    await taskDb.from("task_assignments").insert({
      task_id: task.id,
      user_id: createdFor,
      assigned_by: actor?.id || createdFor,
    });
  }

  const notification = createdFor
    ? await createNotification(taskDb, {
        userId: createdFor,
        taskId: task.id,
        title: "Insurance renewal follow-up",
        message: `${clientName} renewal is due on ${dueDate || "the tracked date"}.`,
        type: "insurance_renewal_followup",
        entityType: "insurance_policy",
        entityId: policy.id,
        linkUrl: policy.client_id ? `/admin/insurance?client_id=${policy.client_id}` : "/admin/insurance",
        metadata: { policy_id: policy.id, renewal_date: dueDate, alert_type: alertType },
        dedupeKey: `insurance:${policy.id}:${alertType}:${cycleKey}:${createdFor}`,
      })
    : null;

  const { data: alert } = await taskDb
    .from("insurance_renewal_alerts")
    .upsert({
      policy_id: policy.id,
      client_id: policy.client_id,
      alert_type: alertType,
      renewal_cycle_key: cycleKey,
      notification_id: notification?.id || null,
      task_id: task.id,
      created_for: createdFor,
      metadata: { policy_number: policy.policy_number },
    }, { onConflict: "policy_id,alert_type,renewal_cycle_key,created_for" })
    .select()
    .maybeSingle();

  return alert || { task_id: task.id, notification_id: notification?.id || null };
}

export function getImportReadClient(supabase) {
  return createTaskServiceClient() || supabase;
}
