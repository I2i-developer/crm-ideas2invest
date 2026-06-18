import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";

export async function PUT(request, { params }) {
  const supabase = await createClient(request);
  const { id } = await params;
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: existing } = await supabase.from("calculators").select("*").eq("id", id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Calculator not found" }, { status: 404 });

  const body = await request.json();
  const payload = {
    name: body.name || existing.name,
    category: body.category || "Financial Planning",
    description: body.description || null,
    url: body.url || "#",
    embed_url: body.embed_url || null,
    is_active: body.is_active !== false,
    display_order: Number(body.display_order) || 0,
    updated_by: user.id,
  };

  const { data, error } = await supabase
    .from("calculators")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "calculator_updated",
    entityType: "calculator",
    entityId: id,
    oldValue: existing,
    newValue: data,
    request,
  });

  return NextResponse.json({ calculator: data }, { status: 200 });
}

export async function DELETE(request, { params }) {
  const supabase = await createClient(request);
  const { id } = await params;
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: existing } = await supabase.from("calculators").select("*").eq("id", id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Calculator not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("calculators")
    .update({ is_active: false, updated_by: user.id })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "calculator_deactivated",
    entityType: "calculator",
    entityId: id,
    oldValue: existing,
    newValue: data,
    request,
  });

  return NextResponse.json({ calculator: data }, { status: 200 });
}
