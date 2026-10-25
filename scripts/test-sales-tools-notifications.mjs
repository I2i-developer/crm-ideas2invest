import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { SourceTextModule, SyntheticModule } from "node:vm";
import { test } from "node:test";
const require = createRequire(import.meta.url), root = new URL("../", import.meta.url);
async function load(file, mocks = {}) {
  const module = new SourceTextModule(await readFile(new URL(file, root), "utf8"));
  await module.link((name) => {
    assert.ok(mocks[name], name);
    const values = mocks[name];
    return new SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); });
  });
  await module.evaluate(); return module.namespace;
}
const audience = await load("src/lib/notifications/audience.js");
const permissions = await load("src/lib/auth/permissions.js");
const json = (data, {status = 200} = {}) => ({data, status});
function database(seed) {
  const tables = structuredClone(seed), calls = [];
  return { tables, calls, from(table) {
    calls.push(["from", table]); let filters = [], mode, payload;
    const query = {
      select() { return this; }, order() { return this; }, limit() { calls.push(["limit"]); return this; },
      or(value) { calls.push(["or", value]); return this; }, gte() { return this; },
      eq(key, value) { filters.push((row) => row[key] === value); return this; },
      in(key, values) { filters.push((row) => values.includes(row[key])); return this; },
      insert(value) { mode = "insert"; payload = value; return this; },
      update(value) { mode = "update"; payload = value; return this; },
      delete() { mode = "delete"; return this; },
      single() { return this.result(true); }, maybeSingle() { return this.result(true); },
      then(resolve, reject) { return this.result().then(resolve, reject); },
      async result(single) {
        const all = tables[table] ||= []; let rows = all.filter((r) => filters.every((f) => f(r)));
        if (mode === "insert") { rows = [{id: "new", ...payload}]; all.push(...rows); }
        if (mode === "update") rows.forEach((r) => Object.assign(r, payload));
        if (mode === "delete") tables[table] = all.filter((r) => !rows.includes(r));
        return {data: single ? rows[0] || null : rows, error: null};
      },
    }; return query;
  }};
}
test("Sales audience retains tasks/chat/self/sales alerts, excludes operational and unknown alerts", () => {
  for (const notification_type of audience.SALES_NOTIFICATION_TYPES) assert.equal(audience.canReceiveNotification("sales", {notification_type}), true);
  for (const notification_type of ["client_birthday_today", "upcoming_birthday", "sip_report_imported", "sip_follow_up_assigned", "kyc_status_unchecked", "document_rejected", "risk_pending", "insurance_renewal_followup", "unknown", null]) {
    assert.equal(audience.canReceiveNotification("sales", {notification_type}), false);
    assert.equal(audience.canReceiveNotification("operations", {notification_type}), true);
  }
  assert.equal(audience.canReceiveNotification("sales", {task_id: "legacy-task"}), true);
});
test("Sales notification GET skips birthday/KYC generation and filters history and badges before pagination", async () => {
  const rows = ["task_assigned", "chat_message", "self_reminder_due", "sales_followup_due", "client_birthday_today", "sip_report_imported", "kyc_status_unchecked"].map((type) => ({id: type, user_id: "sales", notification_type: type, is_read: false}));
  const db = database({task_notifications: rows}); let generated = 0;
  const api = await load("src/app/api/notifications/route.js", {
    "next/server": {NextResponse: {json}}, "@/lib/supabaseServer": {createClient: async () => db},
    "@/lib/auth/permissions": {getAuthContext: async () => ({user: {id: "sales"}, role: "sales"})},
    "@/lib/notifications/service": {createNotification: async () => { generated++; }},
    "@/lib/tasks/alerts": {generateTaskDateNotifications: async () => {}},
    "@/lib/tasks/assignees": {getTaskDataClient: (db) => db},
    "@/lib/reminders/selfReminders": {generateDueSelfReminderNotifications: async () => {}},
    "@/lib/sales/notifications": {dispatchSalesReminders: async () => {}},
    "@/lib/notifications/audience": audience,
  });
  const result = await api.GET(new Request("https://crm.test/api/notifications"));
  assert.equal(result.status, 200); assert.equal(result.data.unread_count, 4);
  assert.equal(result.data.notifications.length, 4); assert.equal(generated, 0);
  assert.ok(!db.calls.some((c) => c[1] === "client_kyc_statuses"));
  assert.ok(db.calls.findIndex((c) => c[0] === "or" && c[1] === audience.SALES_NOTIFICATION_FILTER) < db.calls.findIndex((c) => c[0] === "limit"));
});
test("notification creation and direct push suppress operational alerts for Sales without changing Operations", async () => {
  const db = database({profiles: [{id: "sales", role: "sales"}, {id: "ops", role: "operations"}]}); let pushes = 0;
  const shared = {"@/lib/tasks/assignees": {getTaskDataClient: (db) => db}, "@/lib/notifications/audience": audience};
  const service = await load("src/lib/notifications/service.js", {...shared, "@/lib/webPush/server": {sendWebPushForNotification: async () => { pushes++; }} });
  assert.equal(await service.createNotification(db, {userId: "sales", title: "Birthday", type: "client_birthday_today"}), null);
  assert.equal(db.tables.task_notifications, undefined); assert.equal(pushes, 0);
  await service.createNotification(db, {userId: "sales", title: "Task", type: "task_assigned"});
  await service.createNotification(db, {userId: "ops", title: "Birthday", type: "client_birthday_today"});
  assert.equal(pushes, 2); assert.equal(db.tables.task_notifications.length, 2);
  const push = await load("src/lib/webPush/server.js", {...shared, "web-push": {default: {setVapidDetails() {}, sendNotification() {throw new Error("Must not send");}}} });
  const result = await push.sendWebPushForNotification(db, {user_id: "sales", notification_type: "kyc_status_unchecked"});
  assert.equal(result.attempted, 0);
});
test("Sales quick notes APIs list only own notes, bind creation to actor and reject other-owner edits/deletes", async () => {
  const db = database({operation_notes: [{id: "own", created_by: "sales", title: "Own", content: "Own note", archived: false}, {id: "other", created_by: "other", title: "Other", archived: false}], profiles: []});
  const mocks = {"next/server": {NextResponse: {json}}, "@/lib/supabaseServer": {createClient: async () => db}, "@/lib/auth/permissions": {...permissions, getAuthContext: async () => ({user: {id: "sales"}, role: "sales", profile: {name: "Sales"}})}, "@/lib/audit/logger": {writeAuditLog: async () => {}}};
  const list = await load("src/app/api/operations/notes/route.js", mocks);
  assert.deepEqual((await list.GET(new Request("https://crm.test/notes"))).data.notes.map((n) => n.id), ["own"]);
  const created = await list.POST(new Request("https://crm.test/notes", {method: "POST", body: JSON.stringify({title: "New", content: "Content", created_by: "other"})}));
  assert.equal(created.status, 201); assert.equal(created.data.note.created_by, "sales");
  const detail = await load("src/app/api/operations/notes/[id]/route.js", mocks);
  const patch = (id) => detail.PATCH(new Request("https://crm.test/notes", {method: "PATCH", body: JSON.stringify({title: "Changed", creator_name: "Sales"})}), {params: Promise.resolve({id})});
  assert.equal((await patch("own")).status, 200); assert.equal((await patch("other")).status, 403);
  assert.equal((await detail.DELETE(new Request("https://crm.test/notes", {method: "DELETE"}), {params: Promise.resolve({id: "other"})})).status, 403);
});

const PGlite = process.env.PGLITE_MODULE ? require(process.env.PGLITE_MODULE).PGlite : null;
test("Sales quick notes RLS is own-only, migrations preserve records and remain idempotent", {skip: !PGlite}, async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.sub')::uuid $$;
      CREATE TABLE profiles(id uuid primary key,role text,name text,full_name text,email text);
      CREATE FUNCTION is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT role='admin' FROM profiles WHERE id=auth.uid() $$;
      CREATE FUNCTION is_operations() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT role='operations' FROM profiles WHERE id=auth.uid() $$;
      CREATE FUNCTION sales_actor_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT role FROM profiles WHERE id=auth.uid() AND role IN ('admin','sales') $$;
      CREATE FUNCTION update_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      INSERT INTO auth.users VALUES('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
      INSERT INTO profiles SELECT id,CASE WHEN id::text LIKE '%001' THEN 'sales' ELSE 'operations' END,'User',NULL,NULL FROM auth.users;`);
    for (const name of ["202606080002_operations_quick_notes", "202606080003_operations_quick_notes_creator_and_delete"]) await db.exec(await readFile(new URL(`supabase/migrations/${name}.sql`, root), "utf8"));
    await db.exec(`GRANT ALL ON operation_notes TO authenticated; INSERT INTO operation_notes(title,content,created_by,updated_by) SELECT role,role,id,id FROM profiles;`);
    const migration = await readFile(new URL("supabase/migrations/202610250004_sales_quick_notes.sql", root), "utf8");
    const before = (await db.query("SELECT * FROM operation_notes ORDER BY id")).rows;
    await db.exec(migration); await db.exec(migration);
    assert.deepEqual((await db.query("SELECT * FROM operation_notes ORDER BY id")).rows, before);
    const sales = "00000000-0000-4000-8000-000000000001", ops = "00000000-0000-4000-8000-000000000002";
    await db.exec(`SET request.jwt.claim.sub='${sales}'; SET ROLE authenticated;`);
    assert.equal((await db.query("SELECT * FROM operation_notes")).rows.length, 1);
    assert.equal((await db.query("UPDATE operation_notes SET title='Forbidden' WHERE created_by=$1 RETURNING id", [ops])).rows.length, 0);
    await assert.rejects(db.query("INSERT INTO operation_notes(title,created_by,updated_by) VALUES('Spoof',$1,$1)", [ops]), /row-level security/);
    const inserted = (await db.query("INSERT INTO operation_notes(title,created_by,updated_by) VALUES('New',$1,$1) RETURNING id", [sales])).rows[0];
    assert.equal((await db.query("DELETE FROM operation_notes WHERE id=$1 RETURNING id", [inserted.id])).rows.length, 1);
  } finally { await db.close(); }
});
