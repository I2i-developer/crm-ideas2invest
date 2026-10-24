// node --experimental-vm-modules --test scripts/test-sales-sources.mjs
// Set PGLITE_MODULE for disposable SQL migration and permission tests.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { SourceTextModule, SyntheticModule } from "node:vm";
import { test } from "node:test";
const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url);
async function load(file, mocks) {
  const module = new SourceTextModule(await readFile(new URL(file, root), "utf8"));
  await module.link((specifier) => {
    const values = mocks[specifier];
    assert.ok(values, `Missing mock ${specifier}`);
    return new SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); });
  });
  await module.evaluate();
  return module.namespace;
}
const rules = await load("src/lib/sales/rules.js", { "chrono-node": require("chrono-node") });
const admin = "00000000-0000-4000-8000-000000000001", sales = "00000000-0000-4000-8000-000000000002", other = "00000000-0000-4000-8000-000000000003";
const sourceA = "aaaaaaaa-1111-4111-8111-111111111111", sourceB = "bbbbbbbb-1111-4111-8111-111111111111";

test("imports require one source and normalize new source names", () => {
  for (const input of [{}, { source_name: "  " }, { source_id: "invalid" }, { source_id: sourceA, source_name: "Both" }, { source_name: "x".repeat(121) }]) assert.throws(() => rules.validateImportSource(input));
  assert.deepEqual(rules.validateImportSource({ source_name: "  Business   contacts " }), { source_id: null, source_name: "Business contacts" });
  assert.equal(rules.validateImportSource({ source_id: sourceA }).source_id, sourceA);
});

function queryDatabase(tables) {
  return { from(table) {
    const checks = [];
    const query = {
      select() { return this; }, order() { return this; }, range() { return this; }, limit() { return this; }, gte() { return this; }, lt() { return this; }, or() { return this; },
      eq(key, value) { checks.push((row) => key.split('.').reduce((v, k) => v?.[k], row) === value); return this; },
      is(key, value) { return this.eq(key, value); },
      in(key, values) { checks.push((row) => values.includes(row[key])); return this; },
      then(resolve, reject) { const data = (tables[table] || []).filter((row) => checks.every((check) => check(row))); return Promise.resolve({ data, count: data.length }).then(resolve, reject); },
    };
    return query;
  } };
}
function mocks(ctx) {
  return {
    "@/lib/sales/rules": rules,
    "@/lib/audit/logger": { writeAuditLog: async () => {} },
    "@/lib/sales/server": {
      salesContext: async () => ctx,
      salesJson: (data, status = 200) => ({ data, status }),
      salesError: (error) => ({ data: { error: error.message }, status: 400 }),
    },
  };
}
test("queue requires a source and intersects it with Sales ownership", async () => {
  const db = queryDatabase({ sales_lead_queue: [
    { id: "a", source_id: sourceA, assigned_to: sales, archived_at: null },
    { id: "b", source_id: sourceB, assigned_to: sales, archived_at: null },
    { id: "c", source_id: sourceA, assigned_to: other, archived_at: null },
  ] });
  for (const role of ["admin", "sales"]) {
    const route = await load("src/app/api/sales/route.js", mocks({ db, role, user: { id: sales }, profile: {} }));
    assert.equal((await route.GET(new Request("https://crm.test/api/sales"))).data.leads.length, 0);
    const response = await route.GET(new Request(`https://crm.test/api/sales?source=${sourceA}`));
    assert.deepEqual(response.data.leads.map((row) => row.id), role === "admin" ? ["a", "c"] : ["a"]);
    assert.equal((await route.GET(new Request("https://crm.test/api/sales?source=invalid"))).status, 400);
  }
});

test("follow-ups and calendar are source-scoped as well as owner-scoped", async () => {
  const lead = (source_id, assigned_to) => ({ source_id, assigned_to, archived_at: null });
  const rows = [
    { id: "a", status: "Pending", lead: lead(sourceA, sales) },
    { id: "b", status: "Pending", lead: lead(sourceB, sales) },
    { id: "c", status: "Pending", lead: lead(sourceA, other) },
  ];
  const db = queryDatabase({ sales_followups: rows, sales_meetings: rows });
  for (const [file, key] of [["followups", "followups"], ["calendar", "meetings"]]) {
    const route = await load(`src/app/api/sales/${file}/route.js`, mocks({ db, role: "sales", user: { id: sales } }));
    const params = "from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z";
    assert.equal((await route.GET(new Request(`https://crm.test/api/sales/${file}?${params}`))).data[key].length, 0);
    assert.deepEqual((await route.GET(new Request(`https://crm.test/api/sales/${file}?${params}&source=${sourceA}`))).data[key].map((row) => row.id), ["a"]);
  }
});

test("EOD passes the selected source to the authenticated RPC", async () => {
  let call;
  const route = await load("src/app/api/sales/eod/route.js", mocks({ supabase: { rpc: async (name, args) => { call = { name, args }; return { data: [] }; } } }));
  await route.GET(new Request(`https://crm.test/api/sales/eod?source=${sourceA}`));
  assert.equal(call.name, "sales_source_eod");
  assert.equal(call.args.p_source_id, sourceA);
  call = null;
  assert.deepEqual((await route.GET(new Request("https://crm.test/api/sales/eod"))).data.rows, []);
  assert.equal(call, null);
});

test("address is optional on import, validated, and kept out of other field changes", () => {
  const rows = rules.prepareImport([["Name", "Phone", "Address"], ["Prospect", "9876543210", "Office 12, Mumbai"]]);
  assert.equal(rows[0].address, "Office 12, Mumbai");
  assert.throws(() => rules.validateLead({ name: "Prospect", phone: "9876543210", address: "x".repeat(1001) }), /1000/);
});

test("sales dashboard scopes all data to the logged-in user, even for admins", async () => {
  const time = new Date().toISOString();
  const lead = (assigned_to) => ({ assigned_to, archived_at: null, name: assigned_to === sales ? "My lead" : "Private lead", source_id: sourceA });
  const tables = {
    task_assignments: [{ id: "a", task_id: "mine", user_id: sales }, { id: "b", task_id: "private", user_id: other }],
    tasks: [{ id: "mine", title: "My task", status: "Pending", created_at: time }, { id: "private", title: "Private task", status: "Pending", created_at: time }],
    sales_leads: [{ id: "a", ...lead(sales), status: "New" }, { id: "b", ...lead(other), status: "New" }],
    sales_followups: [sales, other].map((id) => ({ id, user_id: id, status: "Pending", due_at: time, lead: lead(id) })),
    sales_meetings: [sales, other].map((id) => ({ id, assigned_to: id, status: "Scheduled", starts_at: time, lead: lead(id) })),
    client_meeting_reminders: [sales, other].map((id) => ({ id, user_id: id, status: "Pending", reminder_at: time })),
    operation_eod_reports: [{ id: "mine", created_by: sales, operation_hidden_at: null }, { id: "private", created_by: other, operation_hidden_at: null }],
  };
  for (const role of ["admin", "sales"]) {
    const ctx = { db: queryDatabase(tables), role, user: { id: sales }, profile: { name: "Sales" }, supabase: { rpc: async (_, p) => { assert.equal(p.p_user, sales); return { data: [{ dialed: 3 }] }; } } };
    const route = await load("src/app/api/sales/dashboard/route.js", mocks(ctx));
    const response = await route.GET(new Request("https://crm.test/api/sales/dashboard?user_id=" + other));
    assert.equal(response.status, 200);
    assert.equal(response.data.metrics.my_leads, 1);
    assert.equal(response.data.metrics.assigned_tasks, 1);
    assert.equal(response.data.metrics.pending_followups, 1);
    assert.equal(response.data.metrics.self_reminders, 1);
    assert.equal(response.data.metrics.historical_eod_reports, 1);
    assert.ok(!JSON.stringify(response.data).includes("Private"));
  }
});

const PGlite = process.env.PGLITE_MODULE ? require(process.env.PGLITE_MODULE).PGlite : null;
test("source migration preserves legacy data; append, deduplication, RLS and EOD stay isolated", { skip: !PGlite }, async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid primary key);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
      CREATE TABLE profiles(id uuid primary key,name text,full_name text,email text,role text,is_active boolean,status text);
      GRANT SELECT ON profiles TO authenticated;
      CREATE TABLE client_meetings(id uuid primary key DEFAULT gen_random_uuid(),client_id uuid,title text,meeting_type text,meeting_datetime timestamptz,raw_notes text,status text,created_by uuid,updated_by uuid);
      CREATE TABLE operation_eod_reports(id uuid primary key DEFAULT gen_random_uuid(),created_by uuid,completed_work text);
      ALTER TABLE operation_eod_reports ENABLE ROW LEVEL SECURITY;
      GRANT SELECT ON operation_eod_reports TO authenticated;
      INSERT INTO auth.users VALUES ('${admin}'),('${sales}'),('${other}');
      INSERT INTO profiles VALUES ('${admin}','Admin',NULL,'a@example.test','admin',true,'Active'),('${sales}','Sales A',NULL,'s@example.test','sales',true,'Active'),('${other}','Sales B',NULL,'b@example.test','sales',true,'Active');`);
    await db.exec(await readFile(new URL("supabase/migrations/202610240002_sales_workspace.sql", root), "utf8"));
    const actor = async (id) => db.exec(`RESET ROLE; SET request.jwt.claim.sub='${id}'; SET ROLE authenticated;`);
    const rpc = async (name, args = []) => (await db.query(`SELECT ${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) AS result`, args)).rows[0]?.result;
    await actor(admin);
    const manual = await rpc("sales_create_lead", [JSON.stringify({ name: "Legacy manual", phone: "9876543210" })]);
    await rpc("sales_import_leads", [JSON.stringify([{ name: "Legacy imported", phone: "9876543211", status: "RNR-2" }]), "Legacy contacts.csv", sales]);
    await db.exec("RESET ROLE");
    const before = (await db.query("SELECT to_jsonb(l) AS row FROM sales_leads l ORDER BY id")).rows;
    const migration = await readFile(new URL("supabase/migrations/202610240003_sales_sources.sql", root), "utf8");
    await db.exec(migration); await db.exec(migration);
    assert.deepEqual((await db.query("SELECT to_jsonb(l) - 'source_id' AS row FROM sales_leads l ORDER BY id")).rows, before);
    assert.equal((await db.query("SELECT count(*)::int n FROM sales_lead_queue WHERE source_id IS NULL")).rows[0].n, 0);
    assert.equal((await db.query("SELECT count(*)::int n FROM sales_activities")).rows[0].n, 2);
    const addressMigration = await readFile(new URL("supabase/migrations/202610240004_sales_tools_addresses.sql", root), "utf8");
    await db.exec(addressMigration); await db.exec(addressMigration);
    await actor(admin);
    const batch = async (rows, id = null, name = null, owner = sales) => rpc("sales_import_to_source", [JSON.stringify(rows), "Next file.csv", owner, id, name]);
    const a = await batch([{ name: "A1", phone: "9876543212", address: "Imported address" }], null, "Website leads");
    assert.equal(a.accepted, 1);
    const append = await batch([{ name: "A2", phone: "9876543213" }, { name: "Duplicate", phone: "9876543212" }], a.source_id);
    assert.equal(append.accepted, 1); assert.equal(append.rejected, 1); assert.equal(append.source_id, a.source_id);
    const b = await batch([{ name: "B1", phone: "9876543214" }, { name: "Cross-source duplicate", phone: "9876543212" }], null, "Event contacts", other);
    assert.equal(b.accepted, 1); assert.equal(b.rejected, 1);
    await assert.rejects(batch([{ name: "No", phone: "9876543215" }], null, "  WEBSITE   LEADS "), /already exists/);
    assert.equal((await db.query("SELECT source_id FROM sales_leads WHERE name='A1'")).rows[0].source_id, a.source_id);
    assert.equal((await db.query("SELECT count(*)::int n FROM sales_imports WHERE source_id=$1", [a.source_id])).rows[0].n, 2);
    await actor(sales);
    const visible = (await db.query("SELECT * FROM sales_list_sources()")).rows;
    assert.equal(visible.find((s) => s.id === a.source_id).lead_count, 2);
    assert.ok(!visible.some((s) => s.id === b.source_id));
    assert.equal((await db.query("SELECT * FROM sales_sources WHERE id=$1", [b.source_id])).rows.length, 0);
    await assert.rejects(rpc("sales_create_lead", [JSON.stringify({ name: "No", phone: "9876543215", source_id: b.source_id })]), /unavailable/);
    await assert.rejects(batch([{ name: "No", phone: "9876543215" }], a.source_id), /Forbidden/);
    let lead = (await db.query("SELECT * FROM sales_leads WHERE name='A1'")).rows[0];
    assert.equal(lead.address, "Imported address");
    const updated = await rpc("sales_update_address", [lead.id,lead.version,"  Updated office address  "]);
    assert.equal(updated.address, "Updated office address");
    assert.equal(updated.assigned_to, sales); assert.equal(updated.source_id, a.source_id); assert.equal(updated.status, lead.status);
    await assert.rejects(rpc("sales_update_address", [lead.id,lead.version,"Stale overwrite"]), /changed since/);
    await assert.rejects(rpc("sales_update_address", [lead.id,updated.version,"x".repeat(1001)]), /1000/);
    lead = updated;
    await rpc("sales_record_activity", [lead.id, JSON.stringify({ request_id: crypto.randomUUID(), version: lead.version, kind: "call", remark: "Test call", status: "Call Busy" })]);
    await actor(other);
    await assert.rejects(rpc("sales_update_address", [lead.id,lead.version,"Unassigned edit"]), /Forbidden/);
    const bLead = (await db.query("SELECT * FROM sales_leads WHERE name='B1'")).rows[0];
    await rpc("sales_record_activity", [bLead.id, JSON.stringify({ request_id: crypto.randomUUID(), version: bLead.version, kind: "call", remark: "Other call", status: "RNR-1" })]);
    await actor(admin);
    const eod = (await db.query("SELECT * FROM sales_source_eod($1,NULL,$2)", [rules.istDate(), a.source_id])).rows;
    assert.equal(eod.reduce((sum, row) => sum + Number(row.dialed), 0), 1);
    await actor(sales);
    await assert.rejects(db.query("SELECT * FROM sales_source_eod($1,NULL,$2)", [rules.istDate(), b.source_id]), /unavailable/);
    await db.exec(`RESET ROLE; UPDATE profiles SET role='operations' WHERE id='${other}'; INSERT INTO operation_eod_reports(created_by,completed_work) VALUES ('${other}','Existing EOD data');`);
    const saved = (await db.query("SELECT * FROM operation_eod_reports")).rows;
    await db.exec(`UPDATE profiles SET role='sales' WHERE id='${other}'`);
    assert.deepEqual((await db.query("SELECT * FROM operation_eod_reports")).rows, saved);
    await actor(other);
    assert.equal((await db.query("SELECT * FROM operation_eod_reports")).rows.length, 1);
    await actor(sales);
    assert.equal((await db.query("SELECT * FROM operation_eod_reports")).rows.length, 0);
    assert.ok(manual.id);
  } finally { await db.close(); }
});
