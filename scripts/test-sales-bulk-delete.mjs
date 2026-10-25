// node --experimental-vm-modules --test scripts/test-sales-bulk-delete.mjs
// PGLITE_MODULE enables disposable database tests. Never use a live CRM database.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { SourceTextModule, SyntheticModule } from "node:vm";
import { test } from "node:test";
const require = createRequire(import.meta.url), root = new URL("../", import.meta.url);
const admin = "00000000-0000-4000-8000-000000000001", sales = "00000000-0000-4000-8000-000000000002", otherAdmin = "00000000-0000-4000-8000-000000000003", ops = "00000000-0000-4000-8000-000000000004";
async function load(file, mocks) {
  const module = new SourceTextModule(await readFile(new URL(file, root), "utf8"));
  await module.link((specifier) => {
    const values = mocks[specifier]; assert.ok(values, specifier);
    return new SyntheticModule(Object.keys(values), function () { for (const [key,value] of Object.entries(values)) this.setExport(key,value); });
  });
  await module.evaluate(); return module.namespace;
}
const rules = await load("src/lib/sales/rules.js", { "chrono-node": require("chrono-node") });
test("bulk deletion API blocks non-admins and validates source, IDs, scope and confirmation", async () => {
  let calls = [], ctx = { role: "sales" };
  const route = await load("src/app/api/sales/bulk-delete/route.js", {
    "@/lib/sales/rules": rules,
    "@/lib/sales/server": {
      salesContext: async () => ctx, salesJson: (data,status = 200) => ({ data,status }), salesError: (e) => ({ data: { error: e.message },status: 400 }),
    },
  });
  const request = (method, body) => new Request("https://crm.test/api/sales/bulk-delete", { method,body: JSON.stringify(body) });
  for (const role of ["sales","operations"]) {
    ctx = { role }; assert.equal((await route.POST(request("POST",{}))).status,403); assert.equal((await route.DELETE(request("DELETE",{}))).status,403);
  }
  ctx = { error: { status: 401 } }; assert.equal((await route.DELETE(request("DELETE",{}))).status,401);
  ctx = { role: "admin",supabase: { rpc: async (name,args) => { calls.push({ name,args }); return { data: { count: 1,deleted: args.p_preview ? undefined : 1 } }; } } };
  for (const body of [{}, { source_id: admin,all: "true" }, { source_id: admin,all: false,ids: [] }, { source_id: admin,all: true,ids: [sales] }, { source_id: admin,all: false,ids: [sales,sales] }, { source_id: admin,all: false,ids: ["bad"] }]) assert.equal((await route.POST(request("POST",body))).status,400);
  assert.equal(calls.length,0);
  const body = { source_id: admin,all: false,ids: [sales] };
  assert.equal((await route.POST(request("POST",body))).status,200);
  assert.equal(calls[0].name,"sales_delete_imported_leads"); assert.equal(calls[0].args.p_preview,true);
  assert.equal((await route.DELETE(request("DELETE",body))).status,400);
  assert.equal((await route.DELETE(request("DELETE",{ ...body,fingerprint: "a".repeat(32),confirmation: " DELETE " }))).status,200);
  assert.equal(calls[1].args.p_preview,false); assert.equal(calls[1].args.p_confirmation,"DELETE");
});

const PGlite = process.env.PGLITE_MODULE ? require(process.env.PGLITE_MODULE).PGlite : null;
test("admin can delete any importer's leads in one source, with atomic cleanup and retained unrelated records", { skip: !PGlite }, async () => {
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
      CREATE TABLE task_notifications(id uuid primary key DEFAULT gen_random_uuid(),entity_type text,entity_id uuid);
      CREATE TABLE audit_logs(id uuid primary key DEFAULT gen_random_uuid(),actor_id uuid,actor_email text,actor_role text,action text,entity_type text,entity_id uuid,old_value jsonb,new_value jsonb,metadata jsonb);
      CREATE TABLE tasks(id uuid primary key DEFAULT gen_random_uuid(),title text);
      INSERT INTO tasks(title) VALUES('Keep task'); INSERT INTO operation_eod_reports(created_by,completed_work) VALUES('${sales}','Keep report');
      INSERT INTO auth.users VALUES('${admin}'),('${sales}'),('${otherAdmin}'),('${ops}');
      INSERT INTO profiles VALUES('${admin}','Admin A',NULL,'a@test.in','admin',true,'Active'),('${sales}','Sales',NULL,'s@test.in','sales',true,'Active'),('${otherAdmin}','Admin B',NULL,'b@test.in','admin',true,'Active'),('${ops}','Ops',NULL,'o@test.in','operations',true,'Active');`);
    for (const name of ["002_sales_workspace","003_sales_sources","004_sales_tools_addresses","006_sales_shared_imports","007_sales_import_10000","008_sales_multiple_phones","009_sales_bulk_delete"]) await db.exec(await readFile(new URL(`supabase/migrations/202610240${name}.sql`,root),"utf8"));
    await db.exec(await readFile(new URL("supabase/migrations/202610240009_sales_bulk_delete.sql",root),"utf8"));
    const actor = async (id) => db.exec(`RESET ROLE; SET request.jwt.claim.sub='${id}'; SET ROLE authenticated;`);
    const rpc = async (name,args) => (await db.query(`SELECT ${name}(${args.map((_,i) => "$"+(i+1)).join(",")}) AS result`,args)).rows[0]?.result;
    const ownerQuery = async (sql,args = []) => { await db.exec("RESET ROLE"); return (await db.query(sql,args)).rows; };
    const batch = async (phone,source = null,name = "Delete source") => rpc("sales_import_shared_to_source",[JSON.stringify([{ name: phone,phone }]),"leads.csv",[sales],source,name]);
    await actor(admin); const a = await batch("9880000001"); const source = a.source_id;
    const otherSource = await batch("9880000099",null,"Keep source");
    const manual = await rpc("sales_create_lead",[JSON.stringify({ name: "Keep manual",phone: "9880000009",source_id: source })]);
    await actor(otherAdmin); const b = await batch("9880000002",source,null);
    await actor(sales); const c = await batch("9880000003",source,null);
    const byPhone = async (phone) => (await db.query("SELECT * FROM sales_leads WHERE phone=$1",[phone])).rows[0];
    const leadA = await byPhone("9880000001"), leadB = await byPhone("9880000002"), leadC = await byPhone("9880000003");
    const remove = (ids,all,preview = true,fingerprint = null,confirmation = null) => rpc("sales_delete_imported_leads",[source,ids,all,preview,fingerprint,confirmation]);
    for (const preview of [true,false]) await assert.rejects(remove([],true,preview),/Only admins/);
    await assert.rejects(db.query("DELETE FROM sales_leads WHERE id=$1",[leadA.id]),/permission denied/);
    await actor(ops); await assert.rejects(remove([],true),/Only admins/);
    await ownerQuery("UPDATE profiles SET is_active=false WHERE id=$1",[admin]);
    await actor(admin); await assert.rejects(remove([],true),/Only admins/);
    await ownerQuery("UPDATE profiles SET is_active=true WHERE id=$1",[admin]);
    await actor(admin);
    const activity = (lead,status,extra = {}) => rpc("sales_record_activity",[lead.id,JSON.stringify({ version: 1,request_id: crypto.randomUUID(),kind: "call",status,remark: "Test history",...extra })]);
    await activity(leadA,"Call Busy");
    await activity(leadB,"Meeting Schedule",{ meeting_at: "2099-01-01T10:00:00Z",meeting_end: "2099-01-01T11:00:00Z" });
    await activity(leadC,"Meeting Completed",{ meeting_notes: "Retain these saved minutes" });
    await rpc("sales_update_lead",[leadC.id,JSON.stringify({ version: 2,archived: true })]);
    const allPreview = await remove([],true); assert.equal(allPreview.count,3);
    const selected = await remove([leadA.id,leadB.id],false); assert.equal(selected.count,2);
    await assert.rejects(remove([manual.id],false),/manually added/);
    const foreignLead = (await ownerQuery("SELECT id FROM sales_leads WHERE source_id=$1",[otherSource.source_id]))[0].id;
    await actor(admin); await assert.rejects(remove([foreignLead],false),/another source/);
    await assert.rejects(remove([leadA.id,leadA.id],false),/distinct/);
    await assert.rejects(remove([],true,false,selected.fingerprint,"Delete source"),/conflict/);
    await assert.rejects(remove([leadA.id,leadB.id],false,false,selected.fingerprint,"wrong"),/Confirmation/);
    await ownerQuery("INSERT INTO task_notifications(entity_type,entity_id) VALUES('sales_lead',$1),('task',$1)",[leadA.id]);
    await db.exec("ALTER TABLE audit_logs ADD CONSTRAINT reject_delete_audit CHECK(action <> 'sales_imported_leads_deleted') NOT VALID");
    await actor(admin); await assert.rejects(remove([leadA.id,leadB.id],false,false,selected.fingerprint,"DELETE"),/reject_delete_audit/);
    assert.equal((await ownerQuery("SELECT * FROM sales_leads WHERE id=$1",[leadA.id])).length,1);
    assert.equal((await db.query("SELECT * FROM task_notifications WHERE entity_type='sales_lead'")).rows.length,1);
    await db.exec("ALTER TABLE audit_logs DROP CONSTRAINT reject_delete_audit");
    await actor(admin); const deleted = await remove([leadA.id,leadB.id],false,false,selected.fingerprint,"DELETE"); assert.equal(deleted.deleted,2);
    for (const table of ["sales_leads","sales_activities","sales_meetings","sales_followups","sales_lead_phones"]) {
      const key = table === "sales_leads" ? "id" : "lead_id";
      assert.equal((await ownerQuery(`SELECT * FROM ${table} WHERE ${key}=ANY($1::uuid[])`,[[leadA.id,leadB.id]])).length,0);
    }
    assert.equal((await db.query("SELECT * FROM task_notifications WHERE entity_type='sales_lead'")).rows.length,0);
    assert.equal((await db.query("SELECT * FROM task_notifications WHERE entity_type='task'")).rows.length,1);
    await actor(admin); await assert.rejects(remove([],true,false,allPreview.fingerprint,"Delete source"),/conflict/);
    const beforeNewImport = await remove([],true);
    await batch("9880000004",source,null);
    await assert.rejects(remove([],true,false,beforeNewImport.fingerprint,"Delete source"),/conflict/);
    const many = await rpc("sales_import_shared_to_source",[JSON.stringify(Array.from({ length: 1001 },(_,i) => ({ name: `Bulk ${i}`,phone: String(9891000000+i) }))),"bulk.csv",[sales],source,null]);
    assert.equal(many.accepted,1001);
    const finalPreview = await remove([],true); assert.equal(finalPreview.count,1003);
    assert.equal((await remove([],true,false,finalPreview.fingerprint,"Delete source")).deleted,1003);
    assert.equal((await ownerQuery("SELECT * FROM sales_leads WHERE source_id=$1",[source])).length,1);
    assert.equal((await db.query("SELECT id FROM sales_leads WHERE source_id=$1",[source])).rows[0].id,manual.id);
    for (const table of ["tasks","operation_eod_reports","client_meetings"]) assert.equal((await db.query(`SELECT * FROM ${table}`)).rows.length,1);
    assert.equal((await db.query("SELECT * FROM sales_leads WHERE source_id=$1",[otherSource.source_id])).rows.length,1);
    assert.equal((await db.query("SELECT * FROM audit_logs WHERE action='sales_imported_leads_deleted'")).rows.length,2);
    assert.equal((await db.query("SELECT * FROM sales_sources WHERE id=$1",[source])).rows.length,1);
  } finally { await db.close(); }
});
