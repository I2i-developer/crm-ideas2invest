// Disposable database only. Never run migrations/tests against the live CRM.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { SourceTextModule, SyntheticModule } from "node:vm";
import { test } from "node:test";
const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url);
const admin = "00000000-0000-4000-8000-000000000001", sales = "00000000-0000-4000-8000-000000000002", other = "00000000-0000-4000-8000-000000000003", ops = "00000000-0000-4000-8000-000000000004", inactive = "00000000-0000-4000-8000-000000000005";
async function load(file, mocks) {
  const module = new SourceTextModule(await readFile(new URL(file, root), "utf8"));
  await module.link((specifier) => {
    const values = mocks[specifier];
    assert.ok(values, `Missing mock: ${specifier}`);
    return new SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); });
  });
  await module.evaluate();
  return module.namespace;
}
const rules = await load("src/lib/sales/rules.js", { "chrono-node": require("chrono-node") });
test("multi-assignees reject malformed, duplicate and oversized selections", () => {
  for (const value of [null, "test", ["invalid"], [sales, sales.toUpperCase()], Array(101).fill(sales)]) assert.throws(() => rules.validateAssignees(value));
  assert.deepEqual(rules.validateAssignees([sales, other]), [sales, other]);
  assert.deepEqual(rules.validateAssignees([]), []);
});
test("Admin and Sales can preview and import with authenticated multi-assignee RPC", async () => {
  for (const role of ["admin", "sales"]) {
    let saved;
    const route = await load("src/app/api/sales/import/route.js", {
      xlsx: require("xlsx"), "@/lib/sales/rules": rules,
      "@/lib/audit/logger": { writeAuditLog: async () => {} },
      "@/lib/sales/server": {
        salesContext: async () => ({ role, user: { id: sales }, profile: {},
          db: { from: () => ({ select() { return this; }, in: async () => ({ data: [] }) }) },
          supabase: { rpc: async (name, args) => { saved = { name, args }; return { data: { accepted: 1, import_id: sales, errors: [] } }; } },
        }),
        salesJson: (data, status = 200) => ({ data, status }), salesError: (e) => ({ status: 400, data: { error: e.message } }),
      },
    });
    const form = new FormData();
    form.set("file", new File(["Name,Phone\nProspect,9876543210"], "leads.csv"));
    const preview = await route.POST(new Request("https://crm.test/api/sales/import", { method: "POST", body: form }));
    assert.equal(preview.status, 200); assert.equal(preview.data.valid, 1);
    const response = await route.PUT(new Request("https://crm.test/api/sales/import", { method: "PUT", body: JSON.stringify({ source_name: "Shared source", assigned_user_ids: [sales, other], rows: preview.data.rows }) }));
    assert.equal(response.status, 200);
    assert.equal(saved.name, "sales_import_shared_to_source"); assert.deepEqual(saved.args.p_assigned_users, [sales, other]);
    assert.equal(saved.args.p_rows[0].name, "Prospect");
  }
});

const PGlite = process.env.PGLITE_MODULE ? require(process.env.PGLITE_MODULE).PGlite : null;
test("preview checks every phone against CRM, including additional numbers", async () => {
  let checked;
  const route = await load("src/app/api/sales/import/route.js", {
    xlsx: require("xlsx"), "@/lib/sales/rules": rules,
    "@/lib/audit/logger": { writeAuditLog: async () => {} },
    "@/lib/sales/server": {
      salesContext: async () => ({ db: { from: (table) => {
        assert.equal(table, "sales_lead_phones");
        return { select() { return this; }, in: async (_, values) => { checked = values; return { data: [{ phone_key: "+919871909182" }] }; } };
      } } }),
      salesJson: (data, status = 200) => ({ data, status }), salesError: (e) => ({ status: 400, data: { error: e.message } }),
    },
  });
  const form = new FormData(); form.set("file", new File(["Name,Phone\nMd. Zakir,9958418133; 9871909182\nUnique,9910484412"], "leads.csv"));
  const response = await route.POST(new Request("https://crm.test/api/sales/import", { method: "POST", body: form }));
  assert.equal(response.status, 200); assert.equal(response.data.valid, 1); assert.equal(response.data.rejected, 1);
  assert.deepEqual(checked, ["+919958418133", "+919871909182", "+919910484412"]);
  assert.match(response.data.rows[0].error, /already exists in CRM/);
});

test("import preview and save accept 10,000 leads and reject 10,001; Excel supports 9,500 rows", async () => {
  let saved;
  const route = await load("src/app/api/sales/import/route.js", {
    xlsx: require("xlsx"), "@/lib/sales/rules": rules,
    "@/lib/audit/logger": { writeAuditLog: async () => {} },
    "@/lib/sales/server": {
      salesContext: async () => ({ role: "sales", user: { id: sales }, profile: {},
        db: { from: () => ({ select() { return this; }, in: async () => ({ data: [] }) }) },
        supabase: { rpc: async (name, args) => { saved = args; return { data: { accepted: args.p_rows.length, import_id: sales, errors: [] } }; } },
      }),
      salesJson: (data, status = 200) => ({ data, status }), salesError: (e) => ({ status: 400, data: { error: e.message } }),
    },
  });
  const rows = Array.from({ length: 10001 }, (_, i) => ({ name: `Prospect ${i}`, phone: String(9880000000 + i), status: "New" }));
  const preview = async (file) => {
    const form = new FormData(); form.set("file", file);
    return route.POST(new Request("https://crm.test/api/sales/import", { method: "POST", body: form }));
  };
  const csv = (count) => new File(["Name,Phone\n" + rows.slice(0, count).map((r) => `${r.name},${r.phone}`).join("\n")], "leads.csv");
  const accepted = await preview(csv(10000));
  assert.equal(accepted.status, 200); assert.equal(accepted.data.valid, 10000);
  assert.equal((await preview(csv(10001))).status, 400);
  const XLSX = require("xlsx");
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([...Array.from({ length: 24 }, () => ["Calling sheet"]), ["Name", "Phone"], ...rows.slice(0, 9500).map((r) => [r.name, r.phone])]), "Contacts");
  const excel = await preview(new File([XLSX.write(book, { type: "buffer", bookType: "xlsx" })], "leads.xlsx"));
  assert.equal(excel.status, 200); assert.equal(excel.data.valid, 9500);
  const save = (count) => route.PUT(new Request("https://crm.test/api/sales/import", { method: "PUT", body: JSON.stringify({ source_name: "Large sheet", assigned_user_ids: [sales, other], rows: rows.slice(0, count) }) }));
  assert.equal((await save(10000)).data.accepted, 10000); assert.equal(saved.p_rows.length, 10000);
  saved = null;
  assert.equal((await save(10001)).status, 400); assert.equal(saved, null);
});

test("shared reminders fan out once per active user and retry partial failures", async () => {
  const reminder = { id: "reminder", lead_id: "shared", user_id: sales, title: "Follow up", kind: "followup", due_at: "2026-01-01T00:00:00Z", notified_at: null, status: "Pending", lead: { assigned_user_ids: [sales, other, inactive], archived_at: null } };
  const notifications = [], attempts = [], scopes = [];
  let failOther = true;
  const db = { from(table) {
    const filters = [];
    let patch;
    const execute = () => {
      const rows = table === "sales_followups" ? [reminder] : table === "profiles" ? [
        { id: sales, role: "sales", is_active: true }, { id: other, role: "sales", is_active: true }, { id: inactive, role: "sales", is_active: false },
      ] : notifications;
      const data = rows.filter((row) => filters.every((test) => test(row)));
      if (patch) data.forEach((row) => Object.assign(row, patch));
      return { data };
    };
    return {
      select() { return this; }, order() { return this; }, limit() { return this; }, lte() { return this; },
      eq(key, value) { filters.push((r) => r[key] === value); return this; },
      is(key, value) { filters.push((r) => key.split('.').reduce((v,k) => v?.[k],r) === value); return this; },
      contains(key, values) { scopes.push(values); filters.push((r) => values.every((v) => key.split('.').reduce((value,k) => value?.[k],r).includes(v))); return this; },
      in(key, values) { filters.push((r) => values.includes(r[key])); return this; },
      update(value) { patch = value; return this; },
      maybeSingle: async () => ({ data: execute().data[0] || null }),
      then(resolve, reject) { return Promise.resolve(execute()).then(resolve, reject); },
    };
  } };
  const module = await load("src/lib/sales/notifications.js", { "@/lib/notifications/service": { createNotification: async (_, data) => {
    attempts.push(data.userId);
    if (data.userId === other && failOther) return null;
    if (notifications.some((row) => row.dedupe_key === data.dedupeKey)) return null;
    const row = { id: String(notifications.length), user_id: data.userId, dedupe_key: data.dedupeKey }; notifications.push(row); return row;
  } } });
  await module.dispatchSalesReminders(db, other);
  assert.deepEqual(scopes, [[other]]); assert.deepEqual(attempts, [sales, other]);
  assert.equal(reminder.notified_at, null);
  failOther = false;
  await module.dispatchSalesReminders(db, other);
  assert.ok(reminder.notified_at); assert.equal(notifications.length, 2);
  assert.equal(new Set(notifications.map((r) => r.dedupe_key)).size, 2);
  const count = attempts.length;
  await module.dispatchSalesReminders(db, other);
  assert.equal(attempts.length, count);
});

test("shared imports preserve records, enforce RLS, share calls/calendar/reminders and isolate EOD", { skip: !PGlite }, async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid primary key);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
      CREATE TABLE profiles(id uuid primary key,name text,full_name text,email text,role text,is_active boolean,status text);
      GRANT SELECT ON profiles TO authenticated;
      CREATE TABLE client_meetings(id uuid primary key DEFAULT gen_random_uuid(),client_id uuid,title text,meeting_type text,meeting_datetime timestamptz,raw_notes text,status text,created_by uuid,updated_by uuid);
      ALTER TABLE client_meetings ENABLE ROW LEVEL SECURITY; GRANT SELECT ON client_meetings TO authenticated;
      CREATE TABLE operation_eod_reports(id uuid primary key DEFAULT gen_random_uuid(),created_by uuid,completed_work text);
      ALTER TABLE operation_eod_reports ENABLE ROW LEVEL SECURITY;
      INSERT INTO auth.users VALUES ('${admin}'),('${sales}'),('${other}'),('${ops}'),('${inactive}');
      INSERT INTO profiles VALUES ('${admin}','Admin',NULL,NULL,'admin',true,'Active'),('${sales}','Sales A',NULL,NULL,'sales',true,'Active'),
        ('${other}','Sales B',NULL,NULL,'sales',true,'Active'),('${ops}','Ops',NULL,NULL,'operations',true,'Active'),('${inactive}','Inactive',NULL,NULL,'sales',false,'Inactive');`);
    for (const name of ["202610240002_sales_workspace.sql", "202610240003_sales_sources.sql", "202610240004_sales_tools_addresses.sql"]) await db.exec(await readFile(new URL(`supabase/migrations/${name}`, root), "utf8"));
    const actor = async (id) => db.exec(`RESET ROLE; SET request.jwt.claim.sub='${id}'; SET ROLE authenticated;`);
    const rpc = async (name, args = []) => (await db.query(`SELECT ${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) AS result`, args)).rows[0]?.result;
    await actor(admin);
    const legacy = await rpc("sales_create_lead", [JSON.stringify({ name: "Legacy", phone: "9876543210", assigned_to: sales })]);
    await db.exec("RESET ROLE");
    const before = (await db.query("SELECT to_jsonb(l) AS row FROM sales_leads l ORDER BY id")).rows;
    const migration = await readFile(new URL("supabase/migrations/202610240006_sales_shared_imports.sql", root), "utf8");
    await db.exec(migration); await db.exec(migration);
    const limitMigration = await readFile(new URL("supabase/migrations/202610240007_sales_import_10000.sql", root), "utf8");
    await db.exec(limitMigration); await db.exec(limitMigration);
    const phoneMigration = await readFile(new URL("supabase/migrations/202610240008_sales_multiple_phones.sql", root), "utf8");
    await db.exec(phoneMigration); await db.exec(phoneMigration);
    const callingMigration = await readFile(new URL("supabase/migrations/202610250001_sales_calling_columns.sql", root), "utf8");
    await db.exec(callingMigration); await db.exec(callingMigration);
    assert.deepEqual((await db.query("SELECT to_jsonb(l) - 'assigned_user_ids' AS row FROM sales_leads l ORDER BY id")).rows, before);
    await actor(sales);
    assert.equal(await rpc("sales_can_access", [legacy.id]), true);
    assert.equal((await db.query("SELECT first_worked_by FROM sales_lead_queue WHERE id=$1",[legacy.id])).rows[0].first_worked_by,null);
    const batch = async (rows, users = [sales, other], source = null, name = "Shared source") => rpc("sales_import_shared_to_source", [JSON.stringify(rows), "leads.csv", users, source, name]);
    const result = await batch([{ name: "Shared", phone: "9876543211", status: "New", address: "Mumbai" }]);
    assert.equal(result.accepted, 1); assert.deepEqual(result.assigned_user_ids, [sales, other]);
    const shared = (await db.query("SELECT * FROM sales_leads WHERE phone_key='+919876543211'")).rows[0];
    assert.equal(shared.assigned_to, sales);
    assert.equal((await db.query("SELECT first_worked_by FROM sales_lead_queue WHERE id=$1",[shared.id])).rows[0].first_worked_by,null);
    await actor(other);
    assert.equal(await rpc("sales_can_access", [shared.id]), true);
    assert.equal(await rpc("sales_can_access", [legacy.id]), false);
    assert.equal((await db.query("SELECT * FROM sales_lead_queue")).rows.length, 1);
    assert.ok((await db.query("SELECT * FROM sales_list_sources()")).rows.some((s) => s.id === result.source_id && Number(s.lead_count) === 1));
    const call = { version: 1, request_id: "aaaaaaaa-1111-4111-8111-111111111111", kind: "call", status: "Call Busy", remark: "Busy; follow up later" };
    await rpc("sales_record_activity", [shared.id, JSON.stringify(call)]);
    assert.equal((await db.query("SELECT first_worked_by FROM sales_lead_queue WHERE id=$1",[shared.id])).rows[0].first_worked_by.actor_id,other);
    await assert.rejects(rpc("sales_record_activity", [shared.id, JSON.stringify({ ...call, request_id: "bbbbbbbb-1111-4111-8111-111111111111" })]), /changed since/);
    assert.equal((await db.query("SELECT * FROM sales_followups WHERE lead_id=$1", [shared.id])).rows.length, 1);
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    assert.equal(Number((await db.query("SELECT * FROM sales_source_eod($1,$2,$3)", [day, other, result.source_id])).rows[0].dialed), 1);
    const appended = await batch([{ name: "Duplicate", phone: "+91 98765 43211" }, { name: "More data", phone: "9876543212" }], [other], result.source_id, null);
    assert.equal(appended.accepted, 1); assert.equal(appended.rejected, 1);
    assert.deepEqual((await db.query("SELECT assigned_user_ids FROM sales_leads WHERE id=$1", [shared.id])).rows[0].assigned_user_ids, [sales, other]);
    await rpc("sales_record_activity", [shared.id, JSON.stringify({ ...call, version: 2, request_id: "cccccccc-1111-4111-8111-111111111111", kind: "meeting", status: "Meeting Schedule", meeting_at: "2099-01-01T10:00:00Z", meeting_end: "2099-01-01T11:00:00Z" })]);
    assert.equal((await db.query("SELECT * FROM sales_meetings WHERE lead_id=$1", [shared.id])).rows.length, 1);
    await actor(sales);
    assert.equal((await db.query("SELECT * FROM sales_meetings WHERE lead_id=$1", [shared.id])).rows.length, 1);
    const changedAddress = await rpc("sales_update_address",[shared.id,3,"New address"]);
    assert.equal(changedAddress.version,4);
    assert.equal((await db.query("SELECT first_worked_by,latest_activity FROM sales_lead_queue WHERE id=$1",[shared.id])).rows[0].first_worked_by.actor_id,other);
    const followup = (await db.query("SELECT * FROM sales_followups WHERE lead_id=$1 AND status='Pending'", [shared.id])).rows[0];
    await rpc("sales_update_followup", [followup.id, "snooze", "2099-01-01T09:00:00Z"]);
    for (const users of [[ops], [inactive], [sales, sales], [null]]) await assert.rejects(batch([{ name: "Bad", phone: "9876543299" }], users, result.source_id, null), /active|distinct/);
    const self = await batch([{ name: "Self", phone: "9876543213" }], [], result.source_id, null);
    assert.deepEqual(self.assigned_user_ids, [sales]);
    const delegated = await batch([{ name: "Delegated", phone: "9876543214" }], [other], null, "Delegated only");
    assert.ok((await db.query("SELECT * FROM sales_list_sources()")).rows.some((s) => s.id === delegated.source_id && Number(s.lead_count) === 0));
    await assert.rejects(rpc("sales_update_shared_lead", [shared.id, JSON.stringify({ version: 4 }), [sales]]), /Forbidden/);
    await actor(admin);
    await assert.rejects(rpc("sales_update_shared_lead", [shared.id, JSON.stringify({ version: 4 }), [other]]), /Cancel the scheduled/);
    await rpc("sales_record_activity", [shared.id, JSON.stringify({ ...call, version: 4, request_id: "dddddddd-1111-4111-8111-111111111111", kind: "meeting", status: "Meeting Cancelled" })]);
    const reassigned = await rpc("sales_update_shared_lead", [shared.id, JSON.stringify({ version: 5 }), [other]]);
    assert.deepEqual(reassigned.assigned_user_ids, [other]); assert.equal(reassigned.assigned_to, other);
    await actor(sales); assert.equal(await rpc("sales_can_access", [shared.id]), false);
    await actor(ops);
    await assert.rejects(batch([{ name: "Denied", phone: "9876543298" }]), /Forbidden/);
    assert.equal((await db.query("SELECT * FROM sales_lead_queue")).rows.length, 0);
    await actor(inactive); assert.equal(await rpc("sales_can_access", [shared.id]), false);
    await actor(admin);
    const largeRows = Array.from({ length: 10001 }, (_, i) => ({ name: `Boundary ${i}`, phone: String(9880000000 + i) }));
    const largeBatch = await batch(largeRows.slice(0, 10000), [sales, other], null, "10,000 lead boundary");
    assert.equal(largeBatch.accepted, 10000); assert.equal(largeBatch.rejected, 0);
    assert.equal(Number((await db.query("SELECT count(*) n FROM sales_leads WHERE import_id=$1", [largeBatch.import_id])).rows[0].n), 10000);
    await assert.rejects(batch(largeRows, [sales, other], largeBatch.source_id, null), /10000/);
    const multi = await batch([{ name: "Md. Zakir", phone: "9958418133; 9871909182; 9910484412" }], [sales, other], null, "Multiple phones");
    assert.equal(multi.accepted, 1);
    const multiLead = (await db.query("SELECT * FROM sales_leads WHERE import_id=$1", [multi.import_id])).rows[0];
    assert.equal(multiLead.phone_key, "+919958418133");
    const numbers = (await db.query("SELECT phone_key FROM sales_lead_phones WHERE lead_id=$1 ORDER BY position", [multiLead.id])).rows.map((r) => r.phone_key);
    assert.deepEqual(numbers, ["+919958418133", "+919871909182", "+919910484412"]);
    const duplicateSecondary = await batch([{ name: "Overlap", phone: "9999999911; +91 99104 84412" }], [sales], multi.source_id, null);
    assert.equal(duplicateSecondary.accepted, 0); assert.equal(duplicateSecondary.rejected, 1);
    assert.equal((await db.query("SELECT * FROM sales_lead_phones WHERE phone_key='+919999999911'")).rows.length, 0);
    assert.equal((await db.query("SELECT * FROM sales_lead_queue WHERE phone_search LIKE '%+919871909182%'")).rows[0].id, multiLead.id);
    await assert.rejects(rpc("sales_update_shared_lead", [multiLead.id, JSON.stringify({ version: 1, phone: "9958418133; 9876543210" }), [sales, other]]), /unique|duplicate/);
    assert.deepEqual((await db.query("SELECT phone_key FROM sales_lead_phones WHERE lead_id=$1 ORDER BY position", [multiLead.id])).rows.map((r) => r.phone_key), numbers);
    const changedPhone = await rpc("sales_update_shared_lead", [multiLead.id, JSON.stringify({ version: 1, phone: "9958418133; 9999999911" }), [sales, other]]);
    assert.equal(changedPhone.phone_key, "+919958418133");
    assert.equal((await db.query("SELECT * FROM sales_lead_phones WHERE phone_key='+919871909182'")).rows.length, 0);
    await actor(sales);
    assert.equal((await db.query("SELECT * FROM sales_lead_phones WHERE lead_id=$1", [multiLead.id])).rows.length, 2);
    const manualMulti = await rpc("sales_create_lead", [JSON.stringify({ name: "Manual multi", phone: "9777777771 / 9777777772", source_id: multi.source_id })]);
    assert.equal((await db.query("SELECT * FROM sales_lead_phones WHERE lead_id=$1", [manualMulti.id])).rows.length, 2);
    assert.equal((await db.query("SELECT first_worked_by FROM sales_lead_queue WHERE id=$1",[manualMulti.id])).rows[0].first_worked_by,null);
    await rpc("sales_update_address",[manualMulti.id,1,"First actual work"]);
    await actor(admin);
    await rpc("sales_update_address",[manualMulti.id,2,"Later work by another user"]);
    const attribution = (await db.query("SELECT first_worked_by,latest_activity FROM sales_lead_queue WHERE id=$1",[manualMulti.id])).rows[0];
    assert.equal(attribution.first_worked_by.actor_id,sales); assert.equal(attribution.latest_activity.actor_id,admin);
    const manualRemark = await rpc("sales_create_lead",[JSON.stringify({ name: "Manual with remark",phone: "9777777773",source_id: multi.source_id,remark: "Client asked for a callback" })]);
    assert.equal((await db.query("SELECT first_worked_by FROM sales_lead_queue WHERE id=$1",[manualRemark.id])).rows[0].first_worked_by.actor_id,admin);
    await rpc("sales_update_lead",[legacy.id,JSON.stringify({ version: 1,assigned_to: other })]);
    assert.equal((await db.query("SELECT first_worked_by FROM sales_lead_queue WHERE id=$1",[legacy.id])).rows[0].first_worked_by,null);
    await actor(ops);
    assert.equal((await db.query("SELECT * FROM sales_lead_phones")).rows.length, 0);
  } finally { await db.close(); }
});
