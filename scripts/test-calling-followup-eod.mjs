import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { SourceTextModule, SyntheticModule } from "node:vm";
import { test } from "node:test";
const root=new URL("../",import.meta.url),require=createRequire(import.meta.url);
async function load(file,mocks={}) {
  const module=new SourceTextModule(await readFile(new URL(file,root),"utf8"));
  await module.link((name)=>{assert.ok(mocks[name],name);return new SyntheticModule(Object.keys(mocks[name]),function(){for(const[k,v]of Object.entries(mocks[name]))this.setExport(k,v)});});
  await module.evaluate();return module.namespace;
}
const rules=await load("src/lib/sales/rules.js",{"chrono-node":require("chrono-node")});
const prefill=await load("src/lib/sales/eodPrefill.js");
const user="00000000-0000-4000-8000-000000000001",other="00000000-0000-4000-8000-000000000002",source="aaaaaaaa-1111-4111-8111-111111111111";
function database(tables) {
  const seen=[];
  return{seen,from(table){let checks=[];const q={
    select(value){seen.push([table,"select",value]);return this},order(){return this},range(){return this},
    eq(key,value){checks.push(row=>key.split('.').reduce((v,k)=>v?.[k],row)===value);return this},
    is(key,value){return this.eq(key,value)},in(key,values){checks.push(row=>values.includes(row[key]));return this},
    contains(key,values){checks.push(row=>values.every(value=>key.split('.').reduce((v,k)=>v?.[k],row)?.includes(value)));return this},
    maybeSingle(){return this.result(true)},then(resolve){return this.result().then(resolve)},
    async result(single){const data=(tables[table]||[]).filter(row=>checks.every(fn=>fn(row)));return{data:single?data[0]||null:data,count:data.length,error:null}}
  };return q;}};
}
test("calling EOD prefill uses call counts, preserves unrelated work and merges idempotently",()=>{
  const draft=prefill.buildCallingEodPrefill({dialed:20,connected:12,interested:4,non_interested:2,meeting_scheduled:1},"Website","2026-10-27");
  assert.match(draft.completed_work,/Calls dialed: 20/);assert.match(draft.completed_work,/Calls connected: 12/);
  assert.equal(draft.tasks_completed,undefined);
  const current={completed_work:"1. Prepared proposal",pending_work:"Pending case",tasks_completed:7,work_summary:"Manual work",client_followups:"Manual note"};
  const snapshot=structuredClone(current),merged=prefill.mergeCallingEodPrefill(current,draft);
  assert.deepEqual(current,snapshot);assert.equal(merged.pending_work,"Pending case");assert.equal(merged.tasks_completed,7);
  assert.match(merged.work_summary,/Manual work/);assert.match(merged.client_followups,/Manual note/);
  assert.deepEqual(prefill.mergeCallingEodPrefill(merged,draft),merged);
});
test("EOD handoff reads authenticated user's data, returns existing report and performs no writes",async()=>{
  let role="sales",rpcArgs;
  const db=database({sales_sources:[{id:source,name:"Website"}],operation_eod_reports:[{id:"own",created_by:user,report_date:"2026-10-24",operation_hidden_at:null,completed_work:"Existing work"},{id:"private",created_by:other,report_date:"2026-10-24",operation_hidden_at:null}]});
  const ctx={db,user:{id:user},get role(){return role},supabase:{rpc:async(name,args)=>{assert.equal(name,"sales_source_eod");rpcArgs=args;return{data:[{user_id:user,dialed:8,connected:4}]}}}};
  const route=await load("src/app/api/sales/eod-prefill/route.js",{
    "@/lib/sales/server":{salesContext:async()=>ctx,salesJson:(data,status=200)=>({data,status}),salesError:error=>({status:400,data:{error:error.message}})},
    "@/lib/sales/rules":rules,"@/lib/sales/eodPrefill":prefill,
  });
  const result=await route.GET(new Request(`https://crm.test/api/sales/eod-prefill?source=${source}&date=2026-10-24&user_id=${other}`));
  assert.equal(result.status,200);assert.equal(rpcArgs.p_user,user);assert.equal(result.data.existing_report.id,"own");
  assert.match(result.data.prefill.completed_work,/Calls dialed: 8/);
  role="operations";assert.equal((await route.GET(new Request("https://crm.test/api/sales/eod-prefill"))).status,403);
});
test("follow-up actor filtering intersects Sales lead access and uses status activity actor, not coordinator",async()=>{
  const lead={id:"shared",source_id:source,assigned_user_ids:[user,other],archived_at:null};
  const db=database({sales_followups:[
    {id:"mine",status:"Pending",user_id:other,lead,activity:{actor_id:user}},
    {id:"theirs",status:"Pending",user_id:user,lead,activity:{actor_id:other}},
    {id:"private",status:"Pending",user_id:other,lead:{...lead,assigned_user_ids:[other]},activity:{actor_id:other}},
  ],profiles:[{id:user,name:"My User"},{id:other,name:"Other User"}]});
  const route=await load("src/app/api/sales/followups/route.js",{
    "@/lib/sales/server":{salesContext:async()=>({db,user:{id:user},role:"sales"}),salesJson:(data,status=200)=>({data,status}),salesError:error=>({status:400,data:{error:error.message}})},
    "@/lib/sales/rules":rules,
  });
  const result=await route.GET(new Request(`https://crm.test/api/sales/followups?source=${source}&actor=${other}`));
  assert.deepEqual(result.data.followups.map(row=>row.id),["theirs"]);
  assert.equal(result.data.followups[0].set_by.name,"Other User");
  assert.ok(db.seen.some(row=>row[1]==="select"&&row[2].includes("activity:sales_activities!inner(actor_id)")));
  assert.equal((await route.GET(new Request(`https://crm.test/api/sales/followups?source=${source}&actor=bad`))).status,400);
});
