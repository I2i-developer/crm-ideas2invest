import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin, isOperations } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";
import { getTaskDataClient } from "@/lib/tasks/assignees";

function validExternalUrl(value) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export async function GET(request, { params }) {
  const supabase = await createClient(request);
  const db = getTaskDataClient(supabase);
  const { user, role } = await getAuthContext(supabase);
  const { id } = await params;

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role) && !isOperations(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: organization, error: organizationError } = await db
    .from("forms_information_links")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (organizationError) return NextResponse.json({ error: organizationError.message }, { status: 500 });
  if (!organization || (!organization.active && !isAdmin(role))) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  let query = db
    .from("forms_information_items")
    .select("*")
    .eq("organization_id", id)
    .order("display_order", { ascending: true })
    .order("form_name", { ascending: true });
  if (!isAdmin(role)) query = query.eq("active", true);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ organization, items: data || [], role });
}

export async function POST(request, { params }) {
  const supabase = await createClient(request);
  const db = getTaskDataClient(supabase);
  const { user, profile, role } = await getAuthContext(supabase);
  const { id } = await params;

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const payload = {
    organization_id: id,
    form_name: String(body.form_name || "").trim(),
    category: String(body.category || "General").trim() || "General",
    form_url: String(body.form_url || "").trim(),
    description: String(body.description || "").trim() || null,
    active: body.active !== false,
    display_order: Number(body.display_order) || 0,
    created_by: user.id,
    updated_by: user.id,
  };

  if (!payload.form_name || !validExternalUrl(payload.form_url)) {
    return NextResponse.json({ error: "Form name and a valid external URL are required" }, { status: 400 });
  }

  const { data, error } = await db.from("forms_information_items").insert(payload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "forms_item_created",
    entityType: "forms_information_item",
    entityId: data.id,
    newValue: data,
    request,
  });

  return NextResponse.json({ item: data }, { status: 201 });
}
