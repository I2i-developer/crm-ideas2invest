import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import { test } from "node:test";
const require = createRequire(import.meta.url), root = new URL("../",import.meta.url);
async function load(file,mocks = {},context) {
  const module = new SourceTextModule(await readFile(new URL(file,root),"utf8"),context ? {context} : {});
  await module.link((specifier) => { const values = mocks[specifier]; assert.ok(values,specifier); return new SyntheticModule(Object.keys(values),function () { for (const [k,v] of Object.entries(values)) this.setExport(k,v); }); });
  await module.evaluate(); return module.namespace;
}
test("Sales task assignee picker and validator exclude Admin, self and inactive users",async () => {
  const permissions = await load("src/lib/auth/permissions.js");
  const profiles = [{id:"admin",role:"admin"},{id:"sales",role:"sales"},{id:"other",role:"sales"},{id:"ops",role:"operations"},{id:"inactive",role:"operations",is_active:false}];
  const db={from(){let ids;return{select(){return this},in(_,values){ids=values;return this},order:async()=>({data:profiles}),then(resolve){return resolve({data:profiles.filter(p=>ids.includes(p.id))})}}}};
  const assignees = await load("src/lib/tasks/assignees.js",{"@supabase/supabase-js":{createClient:()=>null},"@/lib/auth/permissions":permissions});
  const scope={actorRole:"sales",actorId:"sales"};
  assert.deepEqual((await assignees.listAssignableTaskUsers(db,scope)).map(p=>p.id).sort(),["ops","other"]);
  for(const id of ["admin","sales","inactive"])await assert.rejects(assignees.getValidTaskAssigneeIds(db,[id],scope),/inactive|invalid/);
  assert.deepEqual(await assignees.getValidTaskAssigneeIds(db,["other","ops"],scope),["other","ops"]);
});
test("sound requires unlocked audio, deduplicates events and respects hidden pages",async () => {
  let tones=0;const storage=new Map();
  class AudioContext {
    state="suspended";currentTime=0;destination={};async resume(){this.state="running";}
    createOscillator(){return{frequency:{},connect(){},disconnect(){},start(){tones++},stop(){}}}
    createGain(){return{gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}}}
  }
  const context=createContext({window:{AudioContext},document:{hidden:false},navigator:{locks:{request:async(_,fn)=>fn()}},localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}});
  const sound=await load("src/lib/notifications/sound.js",{},context);
  assert.equal(await sound.playNotificationSound("user","early"),false);
  assert.equal(await sound.unlockNotificationAudio(),true);
  assert.equal(await sound.playNotificationSound("user","one"),true);assert.equal(tones,2);
  assert.equal(await sound.playNotificationSound("user","one"),false);assert.equal(tones,2);
  context.document.hidden=true;assert.equal(await sound.playNotificationSound("user","two"),false);
  context.document.hidden=false;assert.equal(await sound.playNotificationSound("user","two"),true);assert.equal(tones,4);
  const anotherTab=await load("src/lib/notifications/sound.js",{},context);await anotherTab.unlockNotificationAudio();
  assert.equal(await anotherTab.playNotificationSound("user","one"),false);assert.equal(tones,4);
});

test("Sales POST uses authenticated atomic creation, scopes validation and blocks client/SIP links",async()=>{
  let calls=0,notified,scope;
  const permissions=await load("src/lib/auth/permissions.js");
  const db={auth:{getUser:async()=>({data:{user:{id:"sales"}}})},from(table){
    if(table==="profiles")return{select(){return this},eq(){return this},single:async()=>({data:{role:"sales"}})};
    assert.equal(table,"task_activity_logs");return{insert:async()=>({error:null})};
  },rpc:async(name,args)=>{calls++;assert.equal(name,"sales_create_team_task");assert.deepEqual(args.p.assigned_to,["ops"]);return{data:{id:"created",created_by:"sales"}}}};
  const api=await load("src/app/api/tasks/route.js",{
    "next/server":{NextResponse:{json:(data,{status})=>({data,status})}},"node:crypto":await import("node:crypto"),
    "@/lib/auth/permissions":permissions,"@/lib/supabaseServer":{createClient:async()=>db},
    "@/lib/tasks/assignees":{getTaskDataClient:()=>db,getValidTaskAssigneeIds:async(_,ids,options)=>{scope=options;return ids}},
    "@/lib/tasks/hydrate":{hydrateTaskList:async(_,tasks)=>tasks},"@/lib/audit/logger":{writeAuditLog:async()=>{}},
    "@/lib/notifications/service":{notifyUsers:async(_,ids)=>{notified=ids}},
  });
  const post=body=>api.POST(new Request("https://crm.test/api/tasks",{method:"POST",body:JSON.stringify(body)}));
  assert.equal((await post({title:"Task",assigned_to:["ops"],client_id:"secret"})).status,403);
  assert.equal((await post({title:"Task",assigned_to:["ops"],source_sip_event_id:"secret"})).status,403);
  assert.equal(calls,0);
  assert.equal((await post({title:"Task",assigned_to:["ops"]})).status,201);
  assert.equal(calls,1);assert.deepEqual(scope,{actorRole:"sales",actorId:"sales"});assert.deepEqual(notified,["ops"]);
});

const PGlite = process.env.PGLITE_MODULE ? require(process.env.PGLITE_MODULE).PGlite : null;
test("Sales task RPC atomically assigns only other Sales/Operations; forged Admin recipients roll back",{skip:!PGlite},async()=>{
  const db=new PGlite(), sales="00000000-0000-4000-8000-000000000001",other="00000000-0000-4000-8000-000000000002",ops="00000000-0000-4000-8000-000000000003",admin="00000000-0000-4000-8000-000000000004";
  try{
    await db.exec(`CREATE ROLE authenticated;CREATE ROLE anon;CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      CREATE TABLE profiles(id uuid PRIMARY KEY,role text,is_active boolean,status text);
      CREATE FUNCTION sales_actor_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT role FROM profiles WHERE id=auth.uid() AND role IN ('sales','admin') AND is_active IS DISTINCT FROM false AND lower(coalesce(status,'active'))<>'inactive' $$;
      INSERT INTO profiles VALUES('${sales}','sales',true,'Active'),('${other}','sales',true,'Active'),('${ops}','operations',true,'Active'),('${admin}','admin',true,'Active');
      CREATE TABLE tasks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),task_number text,title text,description text,category text,priority text,status text,due_date date,tags text[],created_by uuid);
      CREATE TABLE task_assignments(id uuid DEFAULT gen_random_uuid(),task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,user_id uuid,assigned_by uuid);
      CREATE TABLE task_comments(task_id uuid,user_id uuid);
      CREATE TABLE task_checklist(task_id uuid);CREATE TABLE task_activity_logs(task_id uuid);CREATE TABLE task_attachments(task_id uuid);
      ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;ALTER TABLE task_assignments ENABLE ROW LEVEL SECURITY;
      GRANT SELECT ON tasks,task_assignments TO authenticated;GRANT SELECT ON profiles TO authenticated;
      INSERT INTO tasks(title,created_by) VALUES('Existing task','${admin}');`);
    const migration=await readFile(new URL("supabase/migrations/202610260001_sales_team_tasks.sql",root),"utf8");
    await db.exec(migration);await db.exec(migration);
    assert.equal((await db.query("SELECT count(*) n FROM tasks")).rows[0].n,1);
    await db.exec(`SET request.jwt.claim.sub='${sales}';SET ROLE authenticated;`);
    const create=async(ids,extra={})=>(await db.query("SELECT sales_create_team_task($1) task",[JSON.stringify({title:"Team task",assigned_to:ids,...extra})])).rows[0].task;
    for(const id of [admin,sales])await assert.rejects(create([id]),/other active/);
    await assert.rejects(create([ops],{client_id:admin}),/back-office/);
    const task=await create([ops,other]);assert.equal(task.created_by,sales);
    assert.equal((await db.query("SELECT * FROM tasks")).rows.length,1);
    assert.equal((await db.query("SELECT * FROM task_assignments WHERE task_id=$1",[task.id])).rows.length,2);
    await db.exec("RESET ROLE");
    assert.equal((await db.query("SELECT count(*) n FROM tasks")).rows[0].n,2);
    await assert.rejects(db.query("INSERT INTO task_assignments(task_id,user_id,assigned_by) VALUES($1,$2,$3)",[task.id,admin,sales]),/Sales may assign/);
    await db.exec(`SET request.jwt.claim.sub='${ops}';SET ROLE authenticated;`);await assert.rejects(create([other]),/Forbidden/);
    await db.exec(`RESET ROLE;UPDATE profiles SET is_active=false WHERE id='${other}';SET request.jwt.claim.sub='${sales}';SET ROLE authenticated;`);
    await assert.rejects(create([ops,other]),/other active/);
  }finally{await db.close();}
});
