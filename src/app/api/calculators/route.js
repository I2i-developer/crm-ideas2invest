import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";

export async function GET(request) {
  const supabase = await createClient(request);
  const { user, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let query = supabase
    .from("calculators")
    .select("*")
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (!isAdmin(role)) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ calculators: data || [], role }, { status: 200 });
}

export async function POST(request) {
  const supabase = await createClient(request);
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role)) {
    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "permission_denied_calculator_create",
      entityType: "calculator",
      request,
    });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  if (!body.name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const payload = {
    name: body.name,
    category: body.category || "Financial Planning",
    description: body.description || null,
    url: body.url || "#",
    embed_url: body.embed_url || null,
    is_active: body.is_active !== false,
    display_order: Number(body.display_order) || 0,
    created_by: user.id,
    updated_by: user.id,
  };

  const { data, error } = await supabase.from("calculators").insert(payload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "calculator_created",
    entityType: "calculator",
    entityId: data.id,
    newValue: data,
    request,
  });

  return NextResponse.json({ calculator: data }, { status: 201 });
}
