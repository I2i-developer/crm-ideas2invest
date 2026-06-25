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

export async function PUT(request, { params }) {
  const supabase = await createClient(request);
  const db = getTaskDataClient(supabase);
  const { user, profile, role } = await getAuthContext(supabase);
  const { id, itemId } = await params;

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role) && !isOperations(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: existing } = await db
    .from("forms_information_items")
    .select("*")
    .eq("id", itemId)
    .eq("organization_id", id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Form link not found" }, { status: 404 });

  const body = await request.json();
  const payload = {
    form_name: String(body.form_name ?? existing.form_name).trim(),
    category: String(body.category ?? existing.category ?? "General").trim() || "General",
    form_url: String(body.form_url ?? existing.form_url).trim(),
    description: String(body.description ?? existing.description ?? "").trim() || null,
    active: body.active === undefined ? existing.active : Boolean(body.active),
    display_order: body.display_order === undefined ? existing.display_order : Number(body.display_order) || 0,
    updated_by: user.id,
  };
  if (!payload.form_name || !validExternalUrl(payload.form_url)) {
    return NextResponse.json({ error: "Form name and a valid external URL are required" }, { status: 400 });
  }

  const { data, error } = await db
    .from("forms_information_items")
    .update(payload)
    .eq("id", itemId)
    .eq("organization_id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "forms_item_updated",
    entityType: "forms_information_item",
    entityId: itemId,
    oldValue: existing,
    newValue: data,
    request,
  });
  return NextResponse.json({ item: data });
}

export async function DELETE(request, { params }) {
  const supabase = await createClient(request);
  const db = getTaskDataClient(supabase);
  const { user, profile, role } = await getAuthContext(supabase);
  const { id, itemId } = await params;

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: existing } = await db
    .from("forms_information_items")
    .select("*")
    .eq("id", itemId)
    .eq("organization_id", id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Form link not found" }, { status: 404 });

  const { data, error } = await db
    .from("forms_information_items")
    .update({ active: false, updated_by: user.id })
    .eq("id", itemId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "forms_item_archived",
    entityType: "forms_information_item",
    entityId: itemId,
    oldValue: existing,
    newValue: data,
    request,
  });
  return NextResponse.json({ item: data });
}
