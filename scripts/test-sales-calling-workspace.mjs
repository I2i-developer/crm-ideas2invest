// Disposable SQL tests only; never point these tests at the live CRM.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { SourceTextModule, SyntheticModule } from "node:vm";
import { test } from "node:test";
const require = createRequire(import.meta.url), root = new URL("../",import.meta.url);
const admin = "00000000-0000-4000-8000-000000000001", sales = "00000000-0000-4000-8000-000000000002", other = "00000000-0000-4000-8000-000000000003", ops = "00000000-0000-4000-8000-000000000004";
async function load(file,mocks) {
  const module = new SourceTextModule(await readFile(new URL(file,root),"utf8"));
  await module.link((specifier) => { const values = mocks[specifier]; assert.ok(values,specifier); return new SyntheticModule(Object.keys(values),function () { for (const [k,v] of Object.entries(values)) this.setExport(k,v); }); });
  await module.evaluate(); return module.namespace;
}
const rules = await load("src/lib/sales/rules.js",{ "chrono-node": require("chrono-node") });
test("calling APIs validate IDs, bind bookmarks to authenticated RPCs and hide only empty Manual",async () => {
  let call, sources = [{ id: admin,name: "Manual",lead_count: 0 },{ id: sales,name: "Website",lead_count: 20 }];
  const server = {
    salesContext: async () => ({ role: "sales",supabase: { rpc: async (name,args) => { call = {name,args}; return { data: name === "sales_list_sources" ? sources : {} }; } } }),
    salesJson: (data,status = 200) => ({data,status}),salesError: (e) => ({status: 400,data: {error: e.message}}),
  };
  const mocks = { "@/lib/sales/server": server,"@/lib/sales/rules": rules };
  const progress = await load("src/app/api/sales/progress/route.js",mocks);
  const post = (body) => progress.POST(new Request("https://crm.test/api/sales/progress",{method: "POST",body: JSON.stringify(body)}));
  assert.equal((await post({ source_id: admin,lead_id: "invalid" })).status,400);
  assert.equal((await post({ source_id: admin,lead_id: other,user_id: other })).status,200);
  assert.deepEqual(call,{name: "sales_set_bookmark",args: {p_source: admin,p_lead: other}});
  await post({ source_id: admin,lead_id: null }); assert.equal(call.args.p_lead,null);
  const sourceRoute = await load("src/app/api/sales/sources/route.js",mocks);
  assert.deepEqual((await sourceRoute.GET(new Request("https://crm.test/api/sales/sources"))).data.sources.map((s) => s.name),["Website"]);
  sources[0].lead_count = 2;
  assert.equal((await sourceRoute.GET(new Request("https://crm.test/api/sales/sources"))).data.sources.length,2);
  const insightRoute = await load("src/app/api/sales/insights/route.js",mocks);
  assert.equal((await insightRoute.GET(new Request("https://crm.test/api/sales/insights?source=bad"))).status,400);
  await insightRoute.GET(new Request(`https://crm.test/api/sales/insights?source=${admin}`));
  assert.equal(call.name,"sales_calling_insights"); assert.equal(call.args.p_source,admin);
});

const PGlite = process.env.PGLITE_MODULE ? require(process.env.PGLITE_MODULE).PGlite : null;
test("queue uses 50-row pages and company APIs deny Sales credential access",async () => {
  let range, table, role = "sales", queried = false;
  const query = new Proxy({}, { get(_,key) {
    if (key === "then") return (resolve) => resolve({ data: [],count: 60 });
    return (...args) => { if (key === "range") range = args; return query; };
  } });
  const db = { from(name) { table = name; queried = true; return query; } };
  const queue = await load("src/app/api/sales/route.js",{
    "@/lib/sales/server": { salesContext: async () => ({db,role,user: {id: sales},profile: {name: "Sales"}}),salesJson: (data) => data,salesError: (e) => { throw e; } },
    "@/lib/sales/rules": rules,"@/lib/audit/logger": {writeAuditLog: async () => {}},
  });
  const result = await queue.GET(new Request(`https://crm.test/api/sales?source=${admin}&page=2`));
  assert.deepEqual(range,[50,99]); assert.equal(result.page_size,50);
  const permissions = await load("src/lib/auth/permissions.js",{});
  const mocks = {
    "next/server": {NextResponse: {json: (data,{status}) => ({data,status})}},
    "@/lib/supabaseServer": {createClient: async () => db},
    "@/lib/auth/permissions": {...permissions,getAuthContext: async () => ({user: {id: sales},role})},
    "@/lib/audit/logger": {writeAuditLog: async () => {}},
    "@/lib/tasks/assignees": {getTaskDataClient: () => db},
    "@/lib/security/credentials": {encryptSecret: () => "encrypted"},
  };
  const credentials = await load("src/app/api/company/credentials/route.js",mocks);
  queried = false;
  assert.equal((await credentials.GET(new Request("https://crm.test/api/company/credentials"))).status,403);
  assert.equal(queried,false);
  const company = await load("src/app/api/company/details/route.js",mocks);
  assert.equal((await company.GET(new Request("https://crm.test/api/company/details"))).status,200);
  assert.equal(table,"company_details");
  assert.equal((await company.PUT(new Request("https://crm.test/api/company/details",{method: "PUT"}))).status,403);
  role = "unknown"; assert.equal((await company.GET(new Request("https://crm.test/api/company/details"))).status,403);
});

test("personal bookmarks, legacy last-call resume, page location and full-source charts enforce access",{skip: !PGlite},async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid primary key);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
      CREATE TABLE profiles(id uuid primary key,name text,full_name text,email text,role text,is_active boolean,status text);
      GRANT SELECT ON profiles TO authenticated;
      CREATE TABLE company_details(id uuid primary key,company_name text);
      ALTER TABLE company_details ENABLE ROW LEVEL SECURITY;
      GRANT SELECT,UPDATE,INSERT,DELETE ON company_details TO authenticated;
      INSERT INTO company_details VALUES('${admin}','Ideas2invest');
      CREATE TABLE client_meetings(id uuid primary key DEFAULT gen_random_uuid(),client_id uuid,title text,meeting_type text,meeting_datetime timestamptz,raw_notes text,status text,created_by uuid,updated_by uuid);
      CREATE TABLE operation_eod_reports(id uuid primary key DEFAULT gen_random_uuid(),created_by uuid); ALTER TABLE operation_eod_reports ENABLE ROW LEVEL SECURITY;
      INSERT INTO auth.users VALUES('${admin}'),('${sales}'),('${other}'),('${ops}');
      INSERT INTO profiles VALUES('${admin}','Admin',NULL,NULL,'admin',true,'Active'),('${sales}','Sales A',NULL,NULL,'sales',true,'Active'),('${other}','Sales B',NULL,NULL,'sales',true,'Active'),('${ops}','Ops',NULL,NULL,'operations',true,'Active');`);
    for (const name of ["002_sales_workspace","003_sales_sources","004_sales_tools_addresses","006_sales_shared_imports","007_sales_import_10000","008_sales_multiple_phones"]) await db.exec(await readFile(new URL(`supabase/migrations/202610240${name}.sql`,root),"utf8"));
    const actor = async (id) => db.exec(`RESET ROLE; SET request.jwt.claim.sub='${id}'; SET ROLE authenticated;`);
    const rpc = async (name,args) => (await db.query(`SELECT ${name}(${args.map((_,i) => "$"+(i+1)).join(",")}) AS result`,args)).rows[0]?.result;
    await actor(admin);
    const batch = await rpc("sales_import_shared_to_source",[JSON.stringify(Array.from({length: 60},(_,i) => ({name: `Shared ${i}`,phone: String(9892000000+i)}))),"Shared.csv",[sales,other],null,"Shared list"]);
    const privateBatch = await rpc("sales_import_shared_to_source",[JSON.stringify([{name: "Private",phone: "9893000000"}]),"Private.csv",[other],null,"Private list"]);
    const leads = (await db.query("SELECT * FROM sales_leads WHERE source_id=$1 ORDER BY phone",[batch.source_id])).rows;
    const call = (lead,version,status,kind = "call",extra = {}) => rpc("sales_record_activity",[lead.id,JSON.stringify({version,request_id: crypto.randomUUID(),kind,status,remark: "Recorded action",...extra})]);
    // Existing activity predates the new migration and must still be resumable.
    await actor(sales); await call(leads[0],1,"Call Busy");
    await db.exec("RESET ROLE");
    const migration = await readFile(new URL("supabase/migrations/202610250002_sales_calling_workspace.sql",root),"utf8");
    const before = (await db.query("SELECT to_jsonb(l) row FROM sales_leads l ORDER BY id")).rows;
    await db.exec(migration); await db.exec(migration);
    const refinement = await readFile(new URL("supabase/migrations/202610250003_sales_calling_refinements.sql",root),"utf8");
    await db.exec(refinement); await db.exec(refinement);
    assert.deepEqual((await db.query("SELECT to_jsonb(l) row FROM sales_leads l ORDER BY id")).rows,before);
    await db.query("UPDATE sales_leads SET updated_at=now()-interval '1 day' WHERE id=$1",[leads[29].id]);
    const state = () => rpc("sales_calling_state",[batch.source_id]);
    const bookmark = (id) => rpc("sales_set_bookmark",[batch.source_id,id]);
    await actor(sales);
    assert.equal((await state()).last_call.id,leads[0].id); assert.equal((await state()).bookmark,null);
    const boundary = (await db.query("SELECT id FROM sales_leads WHERE source_id=$1 ORDER BY updated_at DESC,id OFFSET 49 LIMIT 2",[batch.source_id])).rows;
    assert.equal((await bookmark(boundary[0].id)).bookmark.page,1);
    assert.equal((await bookmark(boundary[1].id)).bookmark.page,2);
    const marked = await bookmark(leads[29].id); assert.equal(marked.bookmark.id,leads[29].id); assert.equal(marked.bookmark.page,2);
    assert.equal((await db.query("SELECT * FROM company_details")).rows.length,1);
    assert.equal((await db.query("UPDATE company_details SET company_name='Tampered' RETURNING id")).rows.length,0);
    await actor(other); assert.equal((await state()).bookmark,null); assert.equal((await state()).last_call,null);
    await bookmark(leads[1].id); await actor(sales); assert.equal((await state()).bookmark.id,leads[29].id);
    const privateLead = (await db.query("SELECT id FROM sales_leads WHERE source_id=$1",[privateBatch.source_id])).rows[0];
    await assert.rejects(rpc("sales_set_bookmark",[privateBatch.source_id,privateLead?.id || admin]),/Source not found/);
    await assert.rejects(bookmark(admin),/unavailable/);
    await assert.rejects(db.query("INSERT INTO sales_lead_bookmarks(user_id,source_id,lead_id) VALUES($1,$2,$3)",[other,batch.source_id,leads[0].id]),/permission denied/);
    await call(leads[1],1,"New","note"); assert.equal((await state()).last_call.id,leads[0].id);
    await assert.rejects(call(leads[1],2,"Follow up"),/Confirm the follow-up/);
    assert.equal((await state()).last_call.id,leads[0].id);
    await call(leads[1],2,"Follow up","call",{due_at: "2099-01-01T10:00:00Z"}); assert.equal((await state()).last_call.id,leads[1].id);
    let insight = await rpc("sales_calling_insights",[batch.source_id,null]);
    assert.equal(insight.daily.length,7); assert.equal(insight.daily.reduce((n,r) => n+r.dialed,0),2); assert.equal(insight.daily.reduce((n,r) => n+r.connected,0),1);
    assert.equal(insight.pipeline.reduce((n,r) => n+r.value,0),60);
    await assert.rejects(rpc("sales_calling_insights",[batch.source_id,other]),/Forbidden/);
    await assert.rejects(rpc("sales_calling_insights",[privateBatch.source_id,null]),/Source not found/);
    await actor(admin); assert.equal((await state()).bookmark,null); assert.equal((await state()).last_call,null);
    await call(leads[2],1,"Call Busy");
    insight = await rpc("sales_calling_insights",[batch.source_id,null]); assert.equal(insight.daily.reduce((n,r) => n+r.dialed,0),3);
    await rpc("sales_update_lead",[leads[29].id,JSON.stringify({version: 1,archived: true})]);
    await actor(sales); assert.equal((await state()).bookmark,null);
    await actor(admin); await rpc("sales_update_shared_lead",[leads[29].id,JSON.stringify({version: 2,archived: false}),[other]]);
    await actor(sales); assert.equal((await state()).bookmark,null); assert.equal((await db.query("SELECT * FROM sales_lead_bookmarks")).rows.length,0);
    await bookmark(null); assert.equal((await state()).bookmark,null);
    await actor(other); assert.equal((await state()).bookmark.id,leads[1].id); assert.equal((await state()).last_call,null);
    await actor(ops); await assert.rejects(state(),/Forbidden/); await assert.rejects(bookmark(leads[0].id),/Forbidden/); await assert.rejects(rpc("sales_calling_insights",[batch.source_id,null]),/Forbidden/);
  } finally { await db.close(); }
});
