import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { canAccessClient, getAuthContext, isAdmin } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";

async function getPolicy(supabase, id) {
  const { data, error } = await supabase
    .from("insurance_policies")
    .select("id, client_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function canAccessPolicy(supabase, user, role, policy) {
  if (!policy || !user) return false;
  if (isAdmin(role)) return true;
  return canAccessClient(supabase, user.id, role, policy.client_id);
}

async function hydrateLogProfiles(supabase, logs) {
  const userIds = [...new Set((logs || []).map((log) => log.added_by).filter(Boolean))];
  if (!userIds.length) return logs || [];

  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, full_name, email")
    .in("id", userIds);

  if (error) {
    console.error("Insurance log profile lookup failed:", error.message);
    return logs || [];
  }

  const profileMap = new Map((data || []).map((profile) => [profile.id, profile]));
  return (logs || []).map((log) => ({
    ...log,
    added_by_profile: profileMap.get(log.added_by) || null,
  }));
}

export async function GET(request, { params }) {
  const supabase = await createClient(request);
  const { id } = await params;
  const { user, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const policy = await getPolicy(supabase, id);
    if (!(await canAccessPolicy(supabase, user, role, policy))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("insurance_interaction_logs")
      .select("*")
      .eq("policy_id", id)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return NextResponse.json({ logs: await hydrateLogProfiles(supabase, data || []) }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Insurance logs failed" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const supabase = await createClient(request);
  const { id } = await params;
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const policy = await getPolicy(supabase, id);
    if (!(await canAccessPolicy(supabase, user, role, policy))) {
      await writeAuditLog(supabase, {
        actor: user,
        profile,
        action: "permission_denied_insurance_log_create",
        entityType: "insurance_policy",
        entityId: id,
        request,
      });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const remark = String(body.remark || "").trim();
    if (!remark) return NextResponse.json({ error: "Remark is required" }, { status: 400 });

    const { data, error } = await supabase
      .from("insurance_interaction_logs")
      .insert({
        policy_id: id,
        client_id: policy.client_id,
        added_by: user.id,
        remark,
        follow_up_outcome: body.follow_up_outcome || null,
        next_follow_up_date: body.next_follow_up_date || null,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    const [hydratedLog] = await hydrateLogProfiles(supabase, [data]);

    await supabase
      .from("insurance_policies")
      .update({
        last_contacted_date: new Date().toISOString().slice(0, 10),
        next_follow_up_date: body.next_follow_up_date || null,
        remarks: remark,
        updated_by: user.id,
      })
      .eq("id", id);

    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "insurance_interaction_logged",
      entityType: "insurance_policy",
      entityId: id,
      newValue: hydratedLog,
      request,
    });

    return NextResponse.json({ log: hydratedLog }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Insurance log save failed" }, { status: 500 });
  }
}
