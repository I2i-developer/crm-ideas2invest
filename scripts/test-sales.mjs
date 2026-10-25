// node --experimental-vm-modules --test scripts/test-sales.mjs
// Optional SQL tests: set PGLITE_MODULE to an installed @electric-sql/pglite path.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { SourceTextModule, SyntheticModule } from "node:vm";
import { test } from "node:test";
const require = createRequire(import.meta.url);
const chrono = require("chrono-node");
const module = new SourceTextModule(await readFile(new URL("../src/lib/sales/rules.js", import.meta.url), "utf8"));
await module.link(() => new SyntheticModule(Object.keys(chrono), function () {
  for (const [key, value] of Object.entries(chrono)) this.setExport(key, value);
}));
await module.evaluate();
const r = module.namespace;
const ref = new Date("2026-10-24T04:30:00Z"); // 10:00 IST
const requestId = "aaaaaaaa-1111-4111-8111-111111111111";

test("normalizes Indian phone formats for deduplication without losing international codes", () => {
  for (const phone of ["9876543210", "+91 98765 43210", "09876543210", "919876543210"]) assert.equal(r.phoneKey(phone), "+919876543210");
  assert.equal(r.phoneKey("+44 20 7946 0958"), "+442079460958");
  for (const invalid of ["", "1234", "9876543210 / 9876543211", "call 9876543210"]) assert.equal(r.phoneKey(invalid), "");
});

test("validates mandatory contacts and imported statuses", () => {
  assert.throws(() => r.validateLead({ name: "", phone: "9876543210" }));
  assert.throws(() => r.validateLead({ name: "Test", phone: "9876543210", email: "wrong" }));
  assert.equal(r.normalizeStatus("RNR 4"), "RNR-4");
  assert.equal(r.normalizeStatus("meeting scheduled"), "Meeting Schedule");
  assert.equal(r.normalizeStatus("custom invalid"), "");
});

test("multiple phone numbers stay on one lead, normalize individually and detect secondary duplicates", () => {
  const lead = r.validateLead({ name: "Md. Zakir", phone: "9958418133; 9871909182; 9910484412" });
  assert.deepEqual(lead.phone_keys, ["+919958418133", "+919871909182", "+919910484412"]);
  assert.equal(lead.phone_key, "+919958418133");
  assert.equal(lead.phone, "9958418133; 9871909182; 9910484412");
  for (const separator of [";", ",", "/", "|", "\n"]) assert.equal(r.phoneNumbers(`9958418133${separator}9871909182`).length, 2);
  assert.equal(r.phoneNumbers("9958418133; +91 99584 18133").length, 1);
  assert.throws(() => r.validateLead({ name: "Bad", phone: "9958418133; invalid" }), /valid phone numbers/);
  const rows = r.prepareImport([["Name", "Phone"], ["First", "9958418133; 9871909182"], ["Overlap", "9910484412; +91 98719 09182"], ["Unique", "9910484412"]]);
  assert.deepEqual(rows.map((row) => row.valid), [true, false, true]);
  assert.match(rows[1].error, /Duplicate phone/);
});

test("calling sheet imports recognize heading aliases, duplicate phones, and original done-by", () => {
  const rows = r.prepareImport([["Calling sheet"], ["Name/Entity", "Phone", "Email Address", "Status", "Remark", "Done by"],
    ["Company A", "9876543210", "", "RNR-1", "Call tomorrow", "Original caller"],
    ["Duplicate", "+91 98765 43210", "", "", "", ""],
    ["Bad contact", "", "", "", "", ""]]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].valid, true);
  assert.equal(rows[0].done_by, "Original caller");
  assert.equal(rows[1].valid, false);
  assert.match(rows[1].error, /Duplicate/);
  assert.equal(rows[2].valid, false);
});

test("Busy, Switched Off, relative times, and wall-clock times use IST", () => {
  assert.equal(r.suggestedFollowup("Call Busy", "", ref), "2026-10-27T04:30:00.000Z");
  assert.equal(r.suggestedFollowup("Switched off", "", ref), "2026-10-31T04:30:00.000Z");
  assert.equal(r.suggestedFollowup("Follow up", "Call me after 2 hours", ref), "2026-10-24T06:30:00.000Z");
  assert.equal(r.suggestedFollowup("Call back later", "Call me at 3 pm", ref), "2026-10-24T09:30:00.000Z");
  assert.equal(r.suggestedFollowup("Follow up", "Not sure yet", ref), null);
  assert.equal(r.fromIstInput("2026-10-24T15:00"), "2026-10-24T09:30:00.000Z");
  assert.equal(r.toIstInput("2026-10-24T09:30:00Z"), "2026-10-24T15:00");
});

test("RNR advances and caps at six, follow-ups require confirmed times, and note-only keeps status", () => {
  const call = { request_id: requestId, kind: "call", remark: "No answer", status: "RNR" };
  assert.equal(r.validateActivity(call, { status: "New", rnr_count: 0 }, ref).status, "RNR-1");
  assert.equal(r.validateActivity(call, { status: "RNR-6", rnr_count: 6 }, ref).status, "RNR-6");
  assert.throws(() => r.validateActivity({ ...call, status: "Follow up" }, { status: "New" }, ref), /Confirm/);
  assert.throws(() => r.validateActivity(call, { status: "Do Not Call" }, ref), /closed/);
  assert.equal(r.validateActivity({ ...call, kind: "note", status: "Converted" }, { status: "RNR-2" }, ref).status, "RNR-2");
});

test("meeting schedules and completion require valid time ranges and minutes", () => {
  const body = { request_id: requestId, kind: "meeting", remark: "Booked", status: "Meeting Schedule" };
  assert.throws(() => r.validateActivity(body, { status: "New" }, ref), /future meeting/);
  assert.throws(() => r.validateActivity({ ...body, meeting_at: "2026-10-25T10:00:00Z", meeting_end: "2026-10-25T09:00:00Z" }, { status: "New" }, ref), /end/);
  assert.throws(() => r.validateActivity({ ...body, status: "Meeting Completed" }, { status: "New" }, ref), /minutes/);
});

let PGlite;
test("sales page routing preserves admin/operations access and blocks sales from back-office pages", async () => {
  const source = await readFile(new URL("../middleware.js", import.meta.url), "utf8");
  async function route(role, pathname, active = true) {
    const module = new SourceTextModule(source);
    const mocks = {
      "@supabase/ssr": { createServerClient: () => ({
        auth: { getUser: async () => ({ data: { user: role ? { id: "test-user" } : null } }) },
        from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { role, is_active: active, status: active ? "Active" : "Inactive" } }) }),
      }) },
      "next/server": { NextResponse: { next: () => ({ kind: "next", cookies: { set() {} } }), redirect: (url) => ({ kind: "redirect", path: url.pathname }) } },
    };
    await module.link((specifier) => new SyntheticModule(Object.keys(mocks[specifier]), function () {
      for (const [k, v] of Object.entries(mocks[specifier])) this.setExport(k, v);
    }));
    await module.evaluate();
    return module.namespace.middleware({ nextUrl: { pathname }, url: "https://crm.test" + pathname, cookies: { get() {} } });
  }
  for (const path of ["/sales", "/sales/dashboard", "/sales/eod-history", "/admin/meeting-notes", "/admin/settings", "/admin/reminders", "/admin/calculators", "/admin/document-requirements", "/admin/document-requirements/nri", "/notifications", "/dashboard/tasks", "/dashboard/tasks/assigned-task"]) assert.equal((await route("sales", path)).kind, "next");
  assert.equal((await route("sales", "/admin/company")).kind, "next");
  for (const path of ["/admin/clients", "/admin/company/credentials", "/dashboard/tasks/create", "/dashboard/tasks/assigned-task/edit", "/operations/dashboard", "/system-gate"]) assert.equal((await route("sales", path)).path, "/sales/dashboard");
  assert.equal((await route("operations", "/sales")).path, "/operations/dashboard");
  assert.equal((await route("operations", "/dashboard/tasks")).kind, "next");
  assert.equal((await route("admin", "/sales")).kind, "next");
  assert.equal((await route(null, "/sales")).path, "/login");
  assert.equal((await route("sales", "/sales", false)).path, "/login");
});

test("sales APIs reject unauthenticated, inactive, and operations users", async () => {
  const source = await readFile(new URL("../src/lib/sales/server.js", import.meta.url), "utf8");
  async function context(role, active = true) {
    const module = new SourceTextModule(source);
    const mocks = {
      "next/server": { NextResponse: { json: (data, options) => ({ data, ...options }) } },
      "@/lib/supabaseServer": { createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: role ? { id: "test" } : null } }) },
        from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { role, is_active: active, status: "Active" } }) }),
      }) },
      "@/lib/tasks/assignees": { getTaskDataClient: () => ({}) },
    };
    await module.link((specifier) => new SyntheticModule(Object.keys(mocks[specifier]), function () {
      for (const [k, v] of Object.entries(mocks[specifier])) this.setExport(k, v);
    }));
    await module.evaluate();
    return module.namespace.salesContext({});
  }
  assert.equal((await context(null)).error.status, 401);
  assert.equal((await context("operations")).error.status, 403);
  assert.equal((await context("sales", false)).error.status, 403);
  assert.equal((await context("sales")).role, "sales");
  assert.equal((await context("admin")).role, "admin");
});

if (process.env.PGLITE_MODULE) ({ PGlite } = require(process.env.PGLITE_MODULE));
test("SQL migration, ownership, transactions, reminders, meeting notes, imports, and EOD", { skip: !PGlite }, async () => {
  const db = new PGlite();
  try {
    const admin = "00000000-0000-4000-8000-000000000001", sales = "00000000-0000-4000-8000-000000000002", other = "00000000-0000-4000-8000-000000000003", ops = "00000000-0000-4000-8000-000000000004";
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid primary key);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
      CREATE TABLE profiles(id uuid primary key, name text, full_name text, email text, role text, is_active boolean, status text);
      GRANT SELECT ON profiles TO authenticated;
      CREATE TABLE client_meetings(id uuid primary key DEFAULT gen_random_uuid(),client_id uuid,title text,meeting_type text,meeting_datetime timestamptz,raw_notes text,status text,created_by uuid,updated_by uuid);
      ALTER TABLE client_meetings ENABLE ROW LEVEL SECURITY;
      GRANT SELECT,UPDATE ON client_meetings TO authenticated;
      INSERT INTO auth.users VALUES ('${admin}'),('${sales}'),('${other}'),('${ops}');
      INSERT INTO profiles VALUES
        ('${admin}','Admin',NULL,'admin@example.test','admin',true,'Active'),
        ('${sales}','Sales A',NULL,'a@example.test','sales',true,'Active'),
        ('${other}','Sales B',NULL,'b@example.test','sales',true,'Active'),
        ('${ops}','Operations',NULL,'ops@example.test','operations',true,'Active');
      INSERT INTO client_meetings(title,status) VALUES ('Existing meeting','Draft');
    `);
    const sql = await readFile(new URL("../supabase/migrations/202610240002_sales_workspace.sql", import.meta.url), "utf8");
    await db.exec(sql);
    await db.exec(sql);
    const actor = async (id) => { await db.exec(`RESET ROLE; SET request.jwt.claim.sub = '${id}'; SET ROLE authenticated;`); };
    const rpc = async (fn, args) => (await db.query(`SELECT ${fn}(${args.map((_, i) => "$" + (i + 1)).join(",")}) AS result`, args)).rows[0].result;
    await actor(admin);
    const lead = await rpc("sales_create_lead", [JSON.stringify({ name: "Prospect", phone: "9876543210", assigned_to: sales })]);
    await assert.rejects(rpc("sales_create_lead", [JSON.stringify({ name: "Duplicate", phone: "+919876543210" })]), /unique/);
    await actor(other);
    assert.equal((await db.query("SELECT * FROM sales_leads")).rows.length, 0);
    await assert.rejects(rpc("sales_update_lead", [lead.id, JSON.stringify({ version: 1, assigned_to: other })]), /Forbidden/);
    await actor(ops);
    await assert.rejects(rpc("sales_create_lead", [JSON.stringify({ name: "No", phone: "9999999999" })]), /Forbidden/);
    await actor(sales);
    let version = 1;
    const activity = async (body) => {
      const result = await rpc("sales_record_activity", [lead.id, JSON.stringify({ request_id: crypto.randomUUID(), version, kind: "call", remark: "Test activity", ...body })]);
      version = result.lead.version; return result;
    };
    const busy = await activity({ status: "Call Busy" });
    const due = (await db.query("SELECT due_at FROM sales_followups WHERE lead_id=$1 AND status='Pending'", [lead.id])).rows[0].due_at;
    assert.ok(Math.abs(new Date(due) - Date.now() - 3 * 86400000) < 15000);
    const beforeNote = await rpc("sales_daily_eod", [r.istDate(), null]);
    await activity({ kind: "note", status: "Converted", remark: "A note, not a call" });
    assert.deepEqual(await rpc("sales_daily_eod", [r.istDate(), null]), beforeNote);
    assert.equal((await db.query("SELECT status FROM sales_leads WHERE id=$1", [lead.id])).rows[0].status, "Call Busy");
    await assert.rejects(activity({ status: "Follow up" }), /follow-up time/);
    await assert.rejects(activity({ status: "RNR-3" }), /sequence/);
    for (let n = 1; n <= 6; n++) await activity({ status: "RNR-" + n });
    const token = crypto.randomUUID();
    const first = await activity({ status: "RNR-6", request_id: token });
    const retry = await activity({ status: "RNR-6", request_id: token, version: first.lead.version - 1 });
    assert.equal(first.activity.id, retry.activity.id);
    const start = new Date(Date.now() + 86400000).toISOString(), end = new Date(Date.now() + 90000000).toISOString();
    await activity({ kind: "meeting", status: "Meeting Schedule", meeting_at: start, meeting_end: end });
    await actor(admin);
    const second = await rpc("sales_create_lead", [JSON.stringify({ name: "Second", phone: "9876543211", assigned_to: sales })]);
    await assert.rejects(rpc("sales_record_activity", [second.id, JSON.stringify({ version: 1, kind: "meeting", status: "Meeting Schedule", remark: "Conflict", request_id: crypto.randomUUID(), meeting_at: start, meeting_end: end })]), /already scheduled/);
    assert.equal((await db.query("SELECT count(*)::int n FROM sales_activities WHERE lead_id=$1", [second.id])).rows[0].n, 1);
    await actor(sales);
    const completed = await activity({ kind: "meeting", status: "Meeting Completed", meeting_notes: "Discussed investments and protection." });
    assert.ok(completed.activity.metadata.meeting_note_id);
    assert.equal((await db.query("SELECT count(*)::int n FROM client_meetings")).rows[0].n, 1);
    await activity({ status: "Follow up after meeting", due_at: new Date(Date.now() + 3600000).toISOString() });
    await activity({ status: "Not Interested" });
    assert.equal((await db.query("SELECT count(*)::int n FROM sales_followups WHERE lead_id=$1 AND status='Pending'", [lead.id])).rows[0].n, 0);
    await activity({ status: "Meeting Schedule", meeting_at: start, meeting_end: end });
    const totals = (await db.query("SELECT * FROM sales_daily_eod($1,NULL)", [r.istDate()])).rows[0];
    assert.equal(Number(totals.dialed), 11);
    assert.equal(Number(totals.connected), 3);
    assert.equal(Number(totals.interested), 2);
    assert.equal(Number(totals.non_interested), 1);
    assert.equal(Number(totals.meeting_scheduled), 1);
    await assert.rejects(rpc("sales_daily_eod", [r.istDate(), other]), /Forbidden/);
    await actor(admin);
    const beforeImport = await rpc("sales_daily_eod", [r.istDate(), null]);
    const rows = Array.from({ length: 601 }, (_, i) => ({ row: i + 2, name: "Imported " + i, phone: String(8000000000 + i), status: "New", done_by: "Sheet caller" }));
    rows.push({ name: "Duplicate", phone: "9876543210", status: "New" });
    const imported = await rpc("sales_import_leads", [JSON.stringify(rows), "Calling sheet.xlsx", sales]);
    assert.equal(imported.accepted, 601); assert.equal(imported.rejected, 1);
    assert.deepEqual(await rpc("sales_daily_eod", [r.istDate(), null]), beforeImport);
    await rpc("sales_update_lead", [lead.id, JSON.stringify({ version, archived: true })]);
    assert.equal((await db.query("SELECT count(*)::int n FROM sales_followups WHERE lead_id=$1 AND status='Pending'", [lead.id])).rows[0].n, 0);
    await db.exec("RESET ROLE");
    assert.equal((await db.query("SELECT count(*)::int n FROM client_meetings WHERE title='Existing meeting'")).rows[0].n, 1);
    assert.equal((await db.query("SELECT count(*)::int n FROM profiles WHERE role='operations'")).rows[0].n, 1);
    assert.equal(busy.activity.connected, false);
  } finally { await db.close(); }
});
