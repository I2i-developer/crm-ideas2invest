import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getTaskDataClient } from "@/lib/tasks/assignees";

export function salesJson(data, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function salesContext(request) {
  const supabase = await createClient(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: salesJson({ error: "Unauthorized" }, 401) };
  const { data: profile } = await supabase.from("profiles").select("id, name, full_name, email, role, is_active, status").eq("id", user.id).maybeSingle();
  if (!profile || !["admin", "sales"].includes(profile.role) || profile.is_active === false || String(profile.status).toLowerCase() === "inactive") return { error: salesJson({ error: "Forbidden" }, 403) };
  return { supabase, db: getTaskDataClient(supabase), user, profile, role: profile.role };
}

export function salesError(error) {
  const message = String(error?.message || error || "Sales request failed");
  if (message.includes("schema cache") || message.includes("does not exist")) return salesJson({ error: "Sales setup is pending. Apply the sales migrations through 202610250003_sales_calling_refinements.sql in Supabase." }, 503);
  if (error?.code === "23505") return salesJson({ error: "A lead with this phone already exists" }, 409);
  if (message.includes("changed since") || message.includes("conflict") || message.includes("already scheduled")) return salesJson({ error: message }, 409);
  return salesJson({ error: message }, error?.code === "42501" ? 403 : 400);
}

export async function getSalesLead(context, id) {
  let q = context.db.from("sales_leads").select("*").eq("id", id);
  if (context.role !== "admin") q = q.contains("assigned_user_ids", [context.user.id]);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return data;
}
