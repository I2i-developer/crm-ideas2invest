import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";
import { formatDateDDMonYYYY, formatDateTimeDDMonYYYY } from "@/lib/dateFormat";

const CRM_TIME_ZONE = "Asia/Kolkata";
const IST_OFFSET = "+05:30";
const ROLE_ORDER = { admin: 0, operations: 1 };

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

function displayName(profile) {
  return profile?.name || profile?.full_name || profile?.email || "CRM User";
}

function toDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CRM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function parseDateKey(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatDateKey(date) {
  return date.toISOString().slice(0, 10);
}

export function getUsageReportRange({ period = "daily", date, dateFrom, dateTo } = {}) {
  const reportPeriod = period === "weekly" ? "weekly" : "daily";
  const selectedDateKey = parseDateKey(date) ? date : toDateKey();
  const selectedDate = parseDateKey(selectedDateKey);
  const customStartDate = parseDateKey(dateFrom);
  const customEndDate = parseDateKey(dateTo);

  let startDate = selectedDate;
  let endDate = addDays(selectedDate, 1);

  if (reportPeriod === "weekly" && customStartDate && customEndDate) {
    if (customStartDate <= customEndDate) {
      startDate = customStartDate;
      endDate = addDays(customEndDate, 1);
    } else {
      startDate = customEndDate;
      endDate = addDays(customStartDate, 1);
    }
  } else if (reportPeriod === "weekly") {
    const day = selectedDate.getUTCDay();
    const mondayOffset = (day + 6) % 7;
    startDate = addDays(selectedDate, -mondayOffset);
    endDate = addDays(startDate, 7);
  }

  const startKey = formatDateKey(startDate);
  const endKey = formatDateKey(endDate);
  const inclusiveEndKey = formatDateKey(addDays(endDate, -1));

  return {
    period: reportPeriod,
    selectedDate: selectedDateKey,
    startKey,
    endKey,
    inclusiveEndKey,
    startIso: `${startKey}T00:00:00${IST_OFFSET}`,
    endIso: `${endKey}T00:00:00${IST_OFFSET}`,
    label:
      reportPeriod === "weekly"
        ? `${formatDateDDMonYYYY(startKey)} to ${formatDateDDMonYYYY(inclusiveEndKey)}`
        : formatDateDDMonYYYY(startKey),
  };
}

function isInRange(value, range) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return time >= new Date(range.startIso).getTime() && time < new Date(range.endIso).getTime();
}

function increment(map, key, field, amount = 1, countTotal = true) {
  if (!key || !map.has(key)) return;
  const row = map.get(key);
  row[field] = (row[field] || 0) + amount;
  if (countTotal) row.total_actions = (row.total_actions || 0) + amount;
}

function touchLastActivity(map, key, timestamp) {
  if (!key || !timestamp || !map.has(key)) return;
  const row = map.get(key);
  if (!row.last_activity || new Date(timestamp) > new Date(row.last_activity)) {
    row.last_activity = timestamp;
  }
}

function moduleFromAudit(log) {
  const source = `${log.entity_type || ""} ${log.action || ""}`.toLowerCase();
  if (source.includes("document") || source.includes("parse")) return "documents";
  if (source.includes("task")) return "tasks";
  if (source.includes("sip")) return "sip";
  if (source.includes("kyc")) return "kyc";
  if (source.includes("meeting")) return "meetings";
  if (source.includes("reminder")) return "reminders";
  if (source.includes("chat")) return "chat";
  if (source.includes("client")) return "clients";
  if (source.includes("insurance")) return "insurance";
  if (source.includes("risk")) return "risk";
  if (source.includes("calculator")) return "calculators";
  if (source.includes("company") || source.includes("credential")) return "company";
  if (source.includes("form")) return "forms";
  return "other";
}

function activityLabel(activity) {
  return String(activity || "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function runQuery(query, fallback = []) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || fallback;
}

export async function buildUsageReportData(supabase, range) {
  const [
    profiles,
    auditLogs,
    taskActivities,
    tasks,
    taskComments,
    taskAssignments,
    selfTasks,
  ] = await Promise.all([
    runQuery(
      supabase
        .from("profiles")
        .select("id, name, full_name, email, designation, role, is_active, status, created_at")
        .in("role", ["admin", "operations"])
    ),
    runQuery(
      supabase
        .from("audit_logs")
        .select("id, actor_id, actor_email, actor_role, action, entity_type, entity_id, metadata, created_at")
        .gte("created_at", range.startIso)
        .lt("created_at", range.endIso)
        .order("created_at", { ascending: false })
    ),
    runQuery(
      supabase
        .from("task_activity_logs")
        .select("id, task_id, action_type, performed_by, metadata, created_at")
        .gte("created_at", range.startIso)
        .lt("created_at", range.endIso)
        .order("created_at", { ascending: false })
    ),
    runQuery(
      supabase
        .from("tasks")
        .select("id, task_number, title, status, priority, created_by, created_at, updated_at, due_date")
        .or(`created_at.gte.${range.startIso},updated_at.gte.${range.startIso}`)
        .order("created_at", { ascending: false })
    ),
    runQuery(
      supabase
        .from("task_comments")
        .select("id, task_id, user_id, comment, created_at")
        .gte("created_at", range.startIso)
        .lt("created_at", range.endIso)
        .order("created_at", { ascending: false })
    ),
    runQuery(
      supabase
        .from("task_assignments")
        .select("id, task_id, user_id, assigned_by, assigned_at")
        .gte("assigned_at", range.startIso)
        .lt("assigned_at", range.endIso)
    ),
    runQuery(
      supabase
        .from("operation_self_tasks")
        .select("id, created_by, updated_by, status, priority, task_date, client_name, task_description, remark, is_archived, created_at, updated_at, completed_at")
        .or(`created_at.gte.${range.startIso},updated_at.gte.${range.startIso},completed_at.gte.${range.startIso}`)
        .order("created_at", { ascending: false })
    ),
  ]);

  const users = (profiles || [])
    .map((profile) => ({
      ...profile,
      role: normalized(profile.role),
      name: displayName(profile),
      active: profile.is_active !== false && normalized(profile.status || "active") !== "inactive",
    }))
    .sort((a, b) => {
      const roleDiff = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9);
      return roleDiff || a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    });

  const userMap = new Map(users.map((user) => [user.id, {
    user,
    total_actions: 0,
    audit_events: 0,
    task_activity: 0,
    tasks_created: 0,
    tasks_completed: 0,
    task_remarks: 0,
    task_assignments: 0,
    self_tasks: 0,
    clients: 0,
    documents: 0,
    kyc: 0,
    sip: 0,
    meetings: 0,
    reminders: 0,
    chat: 0,
    insurance: 0,
    risk: 0,
    forms: 0,
    company: 0,
    calculators: 0,
    permission_denied: 0,
    other: 0,
    last_activity: null,
    recent_activity: [],
  }]));

  const auditEmailMap = new Map(users.filter((user) => user.email).map((user) => [normalized(user.email), user.id]));
  const taskMap = new Map((tasks || []).map((task) => [task.id, task]));
  const detailedActivity = [];

  for (const log of auditLogs || []) {
    const actorId = log.actor_id || auditEmailMap.get(normalized(log.actor_email));
    if (!actorId || !userMap.has(actorId)) continue;
    const moduleKey = moduleFromAudit(log);
    increment(userMap, actorId, "audit_events");
    increment(userMap, actorId, moduleKey, 1, false);
    if (String(log.action || "").includes("permission_denied")) increment(userMap, actorId, "permission_denied", 1, false);
    touchLastActivity(userMap, actorId, log.created_at);
    detailedActivity.push({
      user_id: actorId,
      time: log.created_at,
      module: moduleKey,
      action: activityLabel(log.action),
      detail: `${activityLabel(log.entity_type)}${log.entity_id ? ` / ${String(log.entity_id).slice(0, 8)}` : ""}`,
    });
  }

  for (const activity of taskActivities || []) {
    const actorId = activity.performed_by;
    if (!actorId || !userMap.has(actorId)) continue;
    increment(userMap, actorId, "task_activity");
    increment(userMap, actorId, "tasks", 1, false);
    if (normalized(activity.action_type) === "comment_added") increment(userMap, actorId, "task_remarks", 1, false);
    if (normalized(activity.action_type) === "status_changed_to_completed") increment(userMap, actorId, "tasks_completed", 1, false);
    touchLastActivity(userMap, actorId, activity.created_at);
    const task = taskMap.get(activity.task_id);
    detailedActivity.push({
      user_id: actorId,
      time: activity.created_at,
      module: "tasks",
      action: activityLabel(activity.action_type),
      detail: task?.title || activity.metadata?.title || activity.task_id,
    });
  }

  for (const task of tasks || []) {
    if (isInRange(task.created_at, range) && task.created_by && userMap.has(task.created_by)) {
      increment(userMap, task.created_by, "tasks_created", 1, false);
      touchLastActivity(userMap, task.created_by, task.created_at);
      detailedActivity.push({
        user_id: task.created_by,
        time: task.created_at,
        module: "tasks",
        action: "Task Created",
        detail: task.title || task.task_number || task.id,
      });
    }
  }

  for (const comment of taskComments || []) {
    if (!comment.user_id || !userMap.has(comment.user_id)) continue;
    increment(userMap, comment.user_id, "task_remarks", 1, false);
    touchLastActivity(userMap, comment.user_id, comment.created_at);
  }

  for (const assignment of taskAssignments || []) {
    if (assignment.assigned_by && userMap.has(assignment.assigned_by)) {
      increment(userMap, assignment.assigned_by, "task_assignments", 1, false);
      touchLastActivity(userMap, assignment.assigned_by, assignment.assigned_at);
    }
  }

  for (const selfTask of selfTasks || []) {
    const createdInRange = isInRange(selfTask.created_at, range);
    const updatedInRange = isInRange(selfTask.updated_at, range);
    const completedInRange = isInRange(selfTask.completed_at, range);
    const actorId = createdInRange ? selfTask.created_by : selfTask.updated_by || selfTask.created_by;
    if (!actorId || !userMap.has(actorId)) continue;
    if (createdInRange || updatedInRange || completedInRange) {
      increment(userMap, actorId, "self_tasks");
      touchLastActivity(userMap, actorId, selfTask.updated_at || selfTask.created_at);
      detailedActivity.push({
        user_id: actorId,
        time: selfTask.updated_at || selfTask.created_at,
        module: "self tasks",
        action: createdInRange ? "Self Task Created" : "Self Task Updated",
        detail: selfTask.task_description || selfTask.client_name || selfTask.id,
      });
    }
  }

  for (const row of userMap.values()) {
    row.recent_activity = detailedActivity
      .filter((item) => item.user_id === row.user.id)
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, 6);
  }

  const userRows = [...userMap.values()];
  const activeUsers = userRows.filter((row) => row.total_actions > 0).length;

  return {
    range,
    generatedAt: new Date().toISOString(),
    users: userRows,
    activity: detailedActivity.sort((a, b) => new Date(b.time) - new Date(a.time)),
    summary: {
      total_users: userRows.length,
      active_users: activeUsers,
      inactive_users: userRows.length - activeUsers,
      total_actions: userRows.reduce((sum, row) => sum + row.total_actions, 0),
      audit_events: auditLogs.length,
      task_activity: taskActivities.length,
      tasks_created: userRows.reduce((sum, row) => sum + row.tasks_created, 0),
      tasks_completed: userRows.reduce((sum, row) => sum + row.tasks_completed, 0),
      task_remarks: userRows.reduce((sum, row) => sum + row.task_remarks, 0),
      documents: userRows.reduce((sum, row) => sum + row.documents, 0),
      kyc: userRows.reduce((sum, row) => sum + row.kyc, 0),
      sip: userRows.reduce((sum, row) => sum + row.sip, 0),
      meetings: userRows.reduce((sum, row) => sum + row.meetings, 0),
      reminders: userRows.reduce((sum, row) => sum + row.reminders, 0),
      chat: userRows.reduce((sum, row) => sum + row.chat, 0),
    },
  };
}

function safeText(value, max = 80) {
  const text = String(value || "-").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function drawTitle(doc, report) {
  const previousY = doc.y;
  const logoPath = path.join(process.cwd(), "public", "images", "logo", "logo.png");
  doc
    .fillColor("#0f172a")
    .font("Helvetica-Bold")
    .fontSize(22)
    .text(`${report.range.period === "weekly" ? "Weekly" : "Daily"} CRM Usage Report`, 36, 32);
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#475569")
    .text(`Report period: ${report.range.label}`, 36, 60)
    .text(`Generated: ${formatDateTimeDDMonYYYY(report.generatedAt)}`, 36, 75);
  doc
    .roundedRect(doc.page.width - 174, 28, 138, 54, 10)
    .fillAndStroke("#ffffff", "#dbeafe");

  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, doc.page.width - 158, 40, { fit: [106, 28], align: "center", valign: "center" });
  } else {
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#2563eb").text("ideas2invest", doc.page.width - 160, 47, { width: 110, align: "center" });
  }
  doc.y = previousY;
}

function ensureSpace(doc, height = 60) {
  if (doc.y + height > doc.page.height - 36) {
    doc.addPage();
    doc.y = 36;
  }
}

function drawMetric(doc, x, y, width, label, value) {
  const previousY = doc.y;
  doc.roundedRect(x, y, width, 48, 8).fillAndStroke("#f8fafc", "#dbeafe");
  doc.fillColor("#64748b").font("Helvetica").fontSize(8).text(label, x + 10, y + 10, { width: width - 20 });
  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(15).text(String(value), x + 10, y + 25, { width: width - 20 });
  doc.y = previousY;
}

function drawSummary(doc, report) {
  const baseY = 102;
  doc.y = baseY;
  const metrics = [
    ["Total Users", report.summary.total_users],
    ["Active Users", report.summary.active_users],
    ["Total Actions", report.summary.total_actions],
    ["Tasks Created", report.summary.tasks_created],
    ["Tasks Completed", report.summary.tasks_completed],
    ["Remarks", report.summary.task_remarks],
    ["Documents", report.summary.documents],
    ["KYC/SIP", report.summary.kyc + report.summary.sip],
  ];
  const gap = 10;
  const width = (doc.page.width - 72 - gap * 3) / 4;
  metrics.forEach(([label, value], index) => {
    const row = Math.floor(index / 4);
    const col = index % 4;
    drawMetric(doc, 36 + col * (width + gap), baseY + row * 58, width, label, value);
  });
  doc.y = baseY + 128;
}

function drawUserTable(doc, report) {
  ensureSpace(doc, 100);
  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(14).text("User Activity Breakdown", 36, doc.y);
  doc.moveDown(0.7);

  const columns = [
    ["User", 112],
    ["Role", 62],
    ["Total", 42],
    ["Audit", 42],
    ["Task", 42],
    ["Created", 48],
    ["Done", 38],
    ["Remarks", 50],
    ["Docs", 36],
    ["KYC", 34],
    ["SIP", 34],
    ["Last Activity", 104],
  ];
  const startX = 36;
  let y = doc.y;

  function row(values, header = false) {
    ensureSpace(doc, 24);
    y = doc.y;
    if (header) doc.rect(startX, y - 2, doc.page.width - 72, 20).fill("#e0f2fe");
    doc.fillColor(header ? "#075985" : "#0f172a").font(header ? "Helvetica-Bold" : "Helvetica").fontSize(header ? 8 : 7.5);
    let x = startX;
    columns.forEach(([label, width], index) => {
      doc.text(safeText(values[index] ?? label, index === 0 ? 30 : 18), x + 3, y + 3, { width: width - 6, height: 16 });
      x += width;
    });
    doc.y = y + 22;
    doc.moveTo(startX, doc.y - 2).lineTo(doc.page.width - 36, doc.y - 2).strokeColor("#e2e8f0").stroke();
  }

  row(columns.map(([label]) => label), true);
  for (const rowData of report.users) {
    row([
      rowData.user.name,
      rowData.user.role,
      rowData.total_actions,
      rowData.audit_events,
      rowData.task_activity,
      rowData.tasks_created,
      rowData.tasks_completed,
      rowData.task_remarks,
      rowData.documents,
      rowData.kyc,
      rowData.sip,
      rowData.last_activity ? formatDateTimeDDMonYYYY(rowData.last_activity) : "-",
    ]);
  }
}

function drawModuleBreakdown(doc, report) {
  ensureSpace(doc, 120);
  doc.moveDown(1);
  const titleY = doc.y;
  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(14).text("Module Breakdown", 36, titleY);
  doc.fillColor("#64748b").font("Helvetica").fontSize(9).text("Module-wise action count from audit and activity logs.", 36, titleY + 18);
  doc.y = titleY + 40;
  const modules = ["clients", "documents", "kyc", "sip", "meetings", "reminders", "chat", "insurance", "risk", "forms", "company", "calculators", "other"];
  const totals = modules.map((moduleKey) => [moduleKey, report.users.reduce((sum, row) => sum + (row[moduleKey] || 0), 0)]).filter(([, count]) => count > 0);
  if (!totals.length) {
    doc.fillColor("#64748b").font("Helvetica").fontSize(10).text("No module-specific actions found for this period.", 36, doc.y);
    return;
  }
  const baseY = doc.y;
  const cardHeight = 42;
  const rowGap = 10;
  const columnGap = 10;
  const columnWidth = (doc.page.width - 72 - columnGap * 3) / 4;
  const tones = [
    ["#eff6ff", "#bfdbfe", "#2563eb"],
    ["#ecfdf5", "#a7f3d0", "#059669"],
    ["#fff7ed", "#fed7aa", "#ea580c"],
    ["#f5f3ff", "#ddd6fe", "#7c3aed"],
  ];
  totals.forEach(([moduleKey, count], index) => {
    ensureSpace(doc, cardHeight + 12);
    const tone = tones[index % tones.length];
    const x = 36 + (index % 4) * (columnWidth + columnGap);
    const y = baseY + Math.floor(index / 4) * (cardHeight + rowGap);
    doc.roundedRect(x, y, columnWidth, cardHeight, 8).fillAndStroke("#ffffff", tone[1]);
    doc.roundedRect(x + 8, y + 10, 6, 22, 3).fill(tone[2]);
    doc.fillColor("#64748b").font("Helvetica-Bold").fontSize(7.5).text(activityLabel(moduleKey).toUpperCase(), x + 22, y + 10, { width: columnWidth - 72 });
    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(16).text(String(count), x + columnWidth - 50, y + 11, { width: 34, align: "right" });
    doc.fillColor(tone[2]).font("Helvetica").fontSize(7).text("actions", x + 22, y + 26, { width: columnWidth - 36 });
  });
  doc.y = baseY + Math.ceil(totals.length / 4) * (cardHeight + rowGap) + 8;
}

function drawActivityLog(doc, report) {
  ensureSpace(doc, 100);
  const titleY = doc.y;
  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(14).text("Detailed Activity Log", 36, titleY);
  doc.y = titleY + 28;

  const profileById = new Map(report.users.map((row) => [row.user.id, row.user]));
  const activities = report.activity.slice(0, 250);
  if (!activities.length) {
    doc.fillColor("#64748b").font("Helvetica").fontSize(10).text("No activity found for this period.", 36, doc.y);
    return;
  }

  const headerY = doc.y;
  doc.rect(36, headerY, doc.page.width - 72, 19).fill("#f1f5f9");
  doc.fillColor("#475569").font("Helvetica-Bold").fontSize(7.5);
  doc.text("Time", 40, headerY + 5, { width: 90 });
  doc.text("User", 136, headerY + 5, { width: 120 });
  doc.text("Module", 260, headerY + 5, { width: 70 });
  doc.text("Action", 338, headerY + 5, { width: 125 });
  doc.text("Detail", 470, headerY + 5, { width: doc.page.width - 506 });
  doc.y = headerY + 24;

  for (const item of activities) {
    ensureSpace(doc, 30);
    const user = profileById.get(item.user_id);
    const y = doc.y;
    doc.fillColor("#64748b").font("Helvetica").fontSize(7.5).text(formatDateTimeDDMonYYYY(item.time), 36, y, { width: 95 });
    doc.fillColor("#0f172a").font("Helvetica-Bold").text(safeText(user?.name, 26), 136, y, { width: 120 });
    doc.fillColor("#2563eb").font("Helvetica-Bold").text(activityLabel(item.module), 260, y, { width: 70 });
    doc.fillColor("#0f172a").font("Helvetica").text(safeText(item.action, 34), 338, y, { width: 125 });
    doc.fillColor("#475569").text(safeText(item.detail, 70), 470, y, { width: doc.page.width - 506 });
    doc.y = y + 18;
    doc.moveTo(36, doc.y - 3).lineTo(doc.page.width - 36, doc.y - 3).strokeColor("#eef2f7").stroke();
  }
}

export function renderUsageReportPdf(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36, bufferPages: true });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    drawTitle(doc, report);
    drawSummary(doc, report);
    drawUserTable(doc, report);
    drawModuleBreakdown(doc, report);
    drawActivityLog(doc, report);

    const pages = doc.bufferedPageRange();
    for (let index = pages.start; index < pages.start + pages.count; index += 1) {
      doc.switchToPage(index);
      doc.fillColor("#94a3b8").font("Helvetica").fontSize(8).text(
        `Ideas2Invest CRM Usage Report | Page ${index + 1} of ${pages.count}`,
        36,
        doc.page.height - 24,
        { width: doc.page.width - 72, align: "center" }
      );
    }

    doc.end();
  });
}
