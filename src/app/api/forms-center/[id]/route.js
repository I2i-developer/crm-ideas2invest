import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin, isOperations } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";
import { getTaskDataClient } from "@/lib/tasks/assignees";

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

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
  const { id } = await params;

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role) && !isOperations(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: existing } = await db.from("forms_information_links").select("*").eq("id", id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Forms link not found" }, { status: 404 });

  const body = await request.json();
  const payload = {
    display_name: String(body.display_name ?? existing.display_name).trim(),
    slug: normalizeSlug(body.slug ?? existing.slug),
    organization_type: ["RTA", "AMC", "Other"].includes(body.organization_type)
      ? body.organization_type
      : existing.organization_type,
    forms_url: String(body.forms_url ?? existing.forms_url).trim(),
    factsheet_url: String(body.factsheet_url ?? existing.factsheet_url ?? "").trim() || null,
    description: String(body.description ?? existing.description ?? "").trim() || null,
    active: body.active === undefined ? existing.active : Boolean(body.active),
    display_order: body.display_order === undefined ? existing.display_order : Number(body.display_order) || 0,
    logo_url: String(body.logo_url ?? existing.logo_url ?? "").trim() || null,
    updated_by: user.id,
  };

  if (!payload.display_name || !payload.slug || !validExternalUrl(payload.forms_url)) {
    return NextResponse.json({ error: "Name, slug, and a valid external URL are required" }, { status: 400 });
  }
  if (payload.factsheet_url && !validExternalUrl(payload.factsheet_url)) {
    return NextResponse.json({ error: "Factsheet URL must be a valid HTTP or HTTPS URL" }, { status: 400 });
  }

  const { data, error } = await db
    .from("forms_information_links")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: existing.active !== data.active ? "forms_link_activation_changed" : "forms_link_updated",
    entityType: "forms_information_link",
    entityId: id,
    oldValue: existing,
    newValue: data,
    request,
  });

  return NextResponse.json({ link: data });
}

export async function DELETE(request, { params }) {
  const supabase = await createClient(request);
  const db = getTaskDataClient(supabase);
  const { user, profile, role } = await getAuthContext(supabase);
  const { id } = await params;

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: existing } = await db.from("forms_information_links").select("*").eq("id", id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Forms link not found" }, { status: 404 });

  const { data, error } = await db
    .from("forms_information_links")
    .update({ active: false, updated_by: user.id })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "forms_link_archived",
    entityType: "forms_information_link",
    entityId: id,
    oldValue: existing,
    newValue: data,
    request,
  });

  return NextResponse.json({ link: data });
}
