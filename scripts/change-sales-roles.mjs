// Dry run: node scripts/change-sales-roles.mjs
// Apply only the two explicitly requested role changes: append --apply.
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const { createClient } = require("@supabase/supabase-js");
const emails = ["jalaj@ideas2invest.in", "rajat@ideas2invest.in"];
const associations = [
  ["operation_eod_reports", "created_by"], ["operation_eod_replies", "created_by"],
  ["task_assignments", "user_id"], ["tasks", "created_by"], ["task_comments", "user_id"],
  ["task_activity_logs", "performed_by"], ["operation_self_tasks", "created_by"],
  ["client_meeting_reminders", "user_id"], ["client_meetings", "created_by"],
  ["sales_leads", "assigned_to"],
];
async function snapshot(db, id) {
  const result = {};
  for (const [table, column] of associations) {
    const records = [];
    for (let start = 0; ; start += 500) {
      const { data, error } = await db.from(table).select("*").eq(column, id).order("id").range(start, start + 499);
      if (error) throw new Error(`${table}: ${error.message}`);
      records.push(...data);
      if (data.length < 500) break;
    }
    result[table] = { count: records.length, hash: createHash("sha256").update(JSON.stringify(records)).digest("hex") };
  }
  return result;
}
async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase server credentials are required");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: users, error } = await db.from("profiles").select("id,email,name,role").in("email", emails);
  if (error) throw error;
  if (users.length !== 2 || emails.some((email) => users.filter((u) => u.email === email).length !== 1)) throw new Error("Expected exactly the two requested existing profiles; no changes made");
  const before = new Map(), authUsers = new Map();
  for (const user of users) {
    if (!["operations", "sales"].includes(user.role)) throw new Error(`Unexpected current role for ${user.email}; no changes made`);
    const { data, error } = await db.auth.admin.getUserById(user.id);
    if (error || data.user?.email?.toLowerCase() !== user.email) throw new Error(`Auth identity mismatch for ${user.email}; no changes made`);
    authUsers.set(user.id, data.user);
    before.set(user.id, await snapshot(db, user.id));
    console.log(JSON.stringify({ email: user.email, role: user.role, linked_records: Object.fromEntries(Object.entries(before.get(user.id)).map(([table, value]) => [table, value.count])) }));
  }
  if (!process.argv.includes("--apply")) { console.log("Dry run only. No data changed."); return; }
  const changedAuth = [];
  try {
    for (const user of users) {
      const { error } = await db.auth.admin.updateUserById(user.id, { user_metadata: { ...authUsers.get(user.id).user_metadata, role: "sales" } });
      if (error) throw error;
      changedAuth.push(user.id);
    }
    const { data, error } = await db.from("profiles").update({ role: "sales" }).in("id", users.map((u) => u.id)).in("role", ["operations", "sales"]).select("id,role");
    if (error || data.length !== 2) throw error || new Error("Profile role update did not match both requested users");
  } catch (error) {
    for (const user of users) {
      const restored = await db.from("profiles").update({ role: user.role }).eq("id", user.id).eq("role", "sales");
      if (restored.error) console.error(`Profile role restore failed for requested account: ${restored.error.message}`);
    }
    for (const id of changedAuth) {
      const restored = await db.auth.admin.updateUserById(id, { user_metadata: authUsers.get(id).user_metadata });
      if (restored.error) console.error(`Auth metadata restore failed for requested account: ${restored.error.message}`);
    }
    throw error;
  }
  for (const user of users) {
    const after = await snapshot(db, user.id);
    if (JSON.stringify(before.get(user.id)) !== JSON.stringify(after)) throw new Error(`Role changed for ${user.email}, but linked records changed during verification. Review concurrent activity before proceeding.`);
    const profile = await db.from("profiles").select("id,role").eq("id", user.id).single();
    const auth = await db.auth.admin.getUserById(user.id);
    if (profile.data?.id !== user.id || profile.data?.role !== "sales" || auth.data?.user?.user_metadata?.role !== "sales") throw new Error(`Role verification failed for ${user.email}`);
    const audit = await db.from("audit_logs").insert({ actor_id: null, actor_role: null, action: "sales_role_changed", entity_type: "profile", entity_id: user.id, old_value: { role: user.role }, new_value: { role: "sales" }, metadata: { requested_email: user.email, origin: "explicit_workspace_request", existing_identity_preserved: true, linked_records_unchanged: true } });
    if (audit.error) console.error(`Role changed; audit logging failed: ${audit.error.message}`);
    console.log(JSON.stringify({ email: user.email, role: "sales", same_user_id: true, linked_records_unchanged: true }));
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
