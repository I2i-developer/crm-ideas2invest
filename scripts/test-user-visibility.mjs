// node --experimental-vm-modules --test scripts/test-user-visibility.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SourceTextModule, SyntheticModule } from "node:vm";
import { test } from "node:test";

async function load(file, mocks = {}, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  const module = new SourceTextModule(await readFile(new URL(`../${file}`, import.meta.url), "utf8"));
  cache.set(file, module);
  await module.link(async (specifier) => {
    if (!Object.hasOwn(mocks, specifier) && specifier.startsWith("@/")) {
      return load(`src/${specifier.slice(2)}.js`, mocks, cache);
    }
    const values = Object.hasOwn(mocks, specifier) ? mocks[specifier] : await import(specifier);
    return new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    });
  });
  await module.evaluate();
  return module;
}

function database(seed, currentId = "admin") {
  const tables = structuredClone(seed);
  const writes = [];
  return {
    tables, writes,
    auth: { getUser: async () => ({ data: { user: currentId ? { id: currentId } : null } }) },
    from(table) {
      let predicates = [], mode = "read", payload;
      const query = {
        select() { return this; }, order() { return this; }, limit() { return this; },
        gte() { return this; }, lte() { return this; }, lt() { return this; }, or() { return this; },
        eq(key, value) { predicates.push((row) => row[key] === value); return this; },
        is(key, value) { return this.eq(key, value); },
        in(key, values) { predicates.push((row) => values.includes(row[key])); return this; },
        insert(value) { mode = "insert"; payload = value; return this; },
        update(value) { mode = "update"; payload = value; return this; },
        delete() { mode = "delete"; return this; },
        single() { return this.result(true); }, maybeSingle() { return this.result(true); },
        then(resolve, reject) { return this.result().then(resolve, reject); },
        async result(single = false) {
          const all = tables[table] ||= [];
          let rows = all.filter((row) => predicates.every((predicate) => predicate(row)));
          if (mode === "insert") {
            rows = (Array.isArray(payload) ? payload : [payload]).map((row, index) => ({ id: `${table}-${all.length + index}`, ...row }));
            all.push(...rows);
          }
          if (mode === "update") rows.forEach((row) => Object.assign(row, payload));
          if (mode === "delete") tables[table] = all.filter((row) => !rows.includes(row));
          if (mode !== "read") writes.push({ table, mode, payload });
          return { data: single ? rows[0] || null : rows, error: null };
        },
      };
      return query;
    },
  };
}

const profiles = [
  { id: "admin", name: "Admin", role: "admin", is_active: true },
  { id: "ops", name: "Operations", role: "operations", is_active: true },
  { id: "sales", name: "Sales", role: "sales", is_active: true },
  { id: "inactive", name: "Inactive Sales", role: "sales", is_active: false },
  { id: "disabled", name: "Disabled Sales", role: "sales", status: "Inactive" },
  { id: "other", name: "Unknown Role", role: "unknown" },
];
const next = { NextResponse: { json: (data, init = {}) => ({ data, status: init.status || 200 }) } };
function apiMocks(db) {
  return {
    "next/server": next,
    "@/lib/supabaseServer": { createClient: async () => db },
    "@/lib/tasks/assignees": { getTaskDataClient: () => db, getValidTaskAssigneeIds: async (_, ids) => ids },
    "@/lib/tasks/hydrate": { hydrateTaskList: async (_, rows) => rows, hydrateTaskDetail: async (_, row) => row },
    "@/lib/audit/logger": { writeAuditLog: async () => {} },
    "@/lib/notifications/service": { createNotification: async () => {}, notifyUsers: async () => {} },
  };
}
const request = (body = {}, query = "") => new Request(`https://crm.test/api${query}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const context = (id) => ({ params: Promise.resolve({ id }) });

test("admin chat directory includes active Sales, excludes self, inactive and unknown roles", async () => {
  const db = database({ profiles });
  const route = (await load("src/app/api/chat/users/route.js", apiMocks(db))).namespace;
  const response = await route.GET(request());
  assert.equal(response.status, 200);
  assert.deepEqual(response.data.users.map((user) => user.id).sort(), ["ops", "sales"]);
  for (const id of [null, "other"]) {
    const denied = (await load("src/app/api/chat/users/route.js", apiMocks(database({ profiles }, id)))).namespace;
    assert.equal((await denied.GET(request())).status, id ? 403 : 401);
  }
});

test("Sales can create a chat with Admin; non-members cannot read thread messages", async () => {
  const db = database({ profiles }, "sales");
  const threads = (await load("src/app/api/chat/threads/route.js", apiMocks(db))).namespace;
  assert.equal((await threads.POST(request({ user_id: "admin" }))).status, 201);
  assert.equal(db.tables.chat_thread_members.find((row) => row.user_id === "sales").role_snapshot, "sales");
  assert.equal((await threads.POST(request({ user_id: "inactive" }))).status, 400);
  const messages = (await load("src/app/api/chat/threads/[threadId]/messages/route.js", apiMocks(db))).namespace;
  assert.equal((await messages.GET(request(), { params: Promise.resolve({ threadId: "unrelated-thread" }) })).status, 403);
  const threadId = db.tables.chat_threads[0].id;
  assert.equal((await messages.GET(request(), { params: Promise.resolve({ threadId }) })).status, 200);
});

test("task assignee list and validation accept active Sales and reject inactive accounts", async () => {
  const db = database({ profiles });
  const service = { ...db, auth: { admin: { getUserById: async (id) => ({ data: { user: { id } } }) } } };
  const assignees = (await load("src/lib/tasks/assignees.js", { "@supabase/supabase-js": { createClient: () => service } })).namespace;
  assert.deepEqual((await assignees.listAssignableTaskUsers(db)).map((user) => user.id).sort(), ["admin", "ops", "sales"]);
  assert.deepEqual(await assignees.getValidTaskAssigneeIds(db, ["sales", "sales"]), ["sales"]);
  await assert.rejects(assignees.getValidTaskAssigneeIds(db, ["inactive"]), /inactive/);
});

function taskDatabase() {
  return database({ profiles,
    tasks: [{ id: "assigned", title: "Original title", status: "Pending", created_by: "admin" }, { id: "private", title: "Other task", created_by: "admin" }],
    task_assignments: [{ id: "assignment", task_id: "assigned", user_id: "sales" }],
  }, "sales");
}

test("Sales sees only assigned tasks and cannot create, delete or reassign them", async () => {
  const db = taskDatabase();
  const list = (await load("src/app/api/tasks/route.js", apiMocks(db))).namespace;
  assert.deepEqual((await list.GET(request())).data.tasks.map((task) => task.id), ["assigned"]);
  assert.equal((await list.POST(request({ title: "Disallowed" }))).status, 403);
  const detail = (await load("src/app/api/tasks/[id]/route.js", apiMocks(db))).namespace;
  assert.equal((await detail.GET(request(), context("assigned"))).status, 200);
  assert.equal((await detail.GET(request(), context("private"))).status, 404);
  assert.equal((await detail.PUT(request({ status: "In Progress", title: "Not allowed", assigned_to: ["ops"] }), context("assigned"))).status, 200);
  assert.equal(db.tables.tasks[0].status, "In Progress");
  assert.equal(db.tables.tasks[0].title, "Original title");
  assert.equal(db.tables.task_assignments[0].user_id, "sales");
  assert.equal((await detail.PUT(request({ status: "Completed" }), context("private"))).status, 403);
  assert.equal((await detail.DELETE(request(), context("assigned"))).status, 403);
});

test("Sales task comments, checklist and attachments remain assignment-restricted", async () => {
  for (const [suffix, body] of [["comment", { comment: "Work update" }], ["checklist", { item_text: "Follow up" }], ["attachment", { file_url: "https://crm.test/file.pdf" }]]) {
    const db = taskDatabase();
    const route = (await load(`src/app/api/tasks/[id]/${suffix}/route.js`, apiMocks(db))).namespace;
    assert.equal((await route.POST(request(body), context("assigned"))).status, 201, suffix);
    assert.equal((await route.POST(request(body), context("private"))).status, 403, suffix);
  }
});

test("team performance shows Sales and filters to the selected team member", async () => {
  const performance = (await load("src/lib/tasks/performance.js")).namespace;
  const input = { tasks: [{ id: "task", status: "Pending", created_at: new Date().toISOString() }],
    assignments: [{ task_id: "task", user_id: "sales" }], activities: [], users: profiles.slice(0, 3), selfTasks: [] };
  const report = performance.buildPerformanceReport(input);
  assert.deepEqual(report.users.map((user) => user.id).sort(), ["admin", "ops", "sales"]);
  assert.equal(report.users.find((user) => user.id === "sales").assigned, 1);
  assert.equal(report.users.find((user) => user.id === "sales").designation, "Sales");
  assert.deepEqual(performance.buildPerformanceReport({ ...input, filters: { user_id: "sales" } }).users.map((user) => user.id), ["sales"]);
});

test("Sales active-time heartbeat is accepted and stored against the logged-in user", async () => {
  const db = database({ profiles }, "sales");
  const route = (await load("src/app/api/usage-sessions/heartbeat/route.js", apiMocks(db))).namespace;
  assert.equal((await route.POST(request({ session_key: "test", active_seconds_delta: 15, user_id: "admin" }))).status, 200);
  assert.equal(db.tables.crm_usage_sessions[0].user_id, "sales");
  assert.equal(db.tables.crm_user_usage_daily[0].active_seconds, 15);
});

test("Sales self-reminders are own-user scoped and cannot be assigned through a forged payload", async () => {
  const db = database({ profiles, client_meeting_reminders: [
    { id: "own", user_id: "sales", created_by: "sales", status: "Pending", reminder_at: "2026-10-25T10:00:00Z" },
    { id: "private", user_id: "ops", created_by: "ops", status: "Pending", reminder_at: "2026-10-25T10:00:00Z" },
  ] }, "sales");
  const dependencies = { ...apiMocks(db), "@/lib/reminders/selfReminders": {
    SELF_REMINDER_SELECT: "*", SELF_REMINDER_PRIORITIES: ["Medium"], SELF_REMINDER_STATUSES: ["Pending"],
    effectiveReminderAt: (row) => row.reminder_at, generateDueSelfReminderNotifications: async () => {},
  } };
  const route = (await load("src/app/api/self-reminders/route.js", dependencies)).namespace;
  assert.deepEqual((await route.GET(request({}, "?scope=all"))).data.reminders.map((row) => row.id), ["own"]);
  const response = await route.POST(request({ title: "My follow-up", reminder_at: "2026-10-25T10:00:00Z", user_id: "ops" }));
  assert.equal(response.status, 201);
  assert.equal(response.data.reminder.user_id, "sales");
  const detail = (await load("src/app/api/self-reminders/[id]/route.js", dependencies)).namespace;
  assert.equal((await detail.PATCH(request({ title: "Not allowed" }), context("private"))).status, 403);
});

test("Sales can read their historical EOD reports after conversion, not another user's reports", async () => {
  const db = database({ profiles, operation_eod_reports: [
    { id: "own", created_by: "sales", operation_hidden_at: null, report_date: "2026-10-24", completed_work: "Existing work", status: "Submitted" },
    { id: "private", created_by: "ops", operation_hidden_at: null, report_date: "2026-10-24", completed_work: "Other work", status: "Submitted" },
  ] }, "sales");
  const route = (await load("src/app/api/operations/eod-reports/route.js", apiMocks(db))).namespace;
  const response = await route.GET(request({}, "?user_id=ops"));
  assert.equal(response.status, 200);
  assert.deepEqual(response.data.reports.map((row) => row.id), ["own"]);
  const created = await route.POST(request({ report_date: "2026-10-23", completed_work: "Sales work completed", created_by: "ops", status: "Reviewed" }));
  assert.equal(created.status, 201);
  assert.equal(created.data.report.created_by, "sales");
  assert.equal(created.data.report.status, "Submitted");
  const detail = (await load("src/app/api/operations/eod-reports/[id]/route.js", apiMocks(db))).namespace;
  assert.equal((await detail.PATCH(request({ completed_work: "Updated sales work", status: "Submitted" }), context("own"))).status, 200);
  assert.equal((await detail.PATCH(request({ completed_work: "Forbidden" }), context("private"))).status, 403);
  assert.equal((await detail.DELETE(request(), context("private"))).status, 403);
  assert.equal((await detail.DELETE(request(), context("own"))).data.hidden, true);
  assert.ok(db.tables.operation_eod_reports.find((row) => row.id === "own").operation_hidden_at);
  assert.ok(!db.writes.some((write) => write.mode === "delete"));
});

test("Usage PDF data includes Sales activity and active time, without exporting lead data", async () => {
  const db = database({ profiles, crm_user_usage_daily: [{ user_id: "sales", usage_date: "2026-10-24", active_seconds: 900 }],
    audit_logs: [{ id: "a", actor_id: "sales", entity_type: "sales_lead", action: "sales_call_recorded", created_at: "2026-10-24T05:00:00Z" }] });
  const usage = (await load("src/lib/reports/usageReport.js")).namespace;
  const report = await usage.buildUsageReportData(db, usage.getUsageReportRange({ date: "2026-10-24" }));
  const sales = report.users.find((row) => row.user.id === "sales");
  assert.equal(sales.active_seconds, 900);
  assert.equal(sales.sales, 1);
  assert.equal(report.daily_usage[0].role, "sales");
  assert.equal(db.tables.sales_leads, undefined);
});
