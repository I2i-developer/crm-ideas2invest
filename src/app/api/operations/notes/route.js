import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin, isOperations } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";

function notePayload(body) {
  return {
    title: String(body.title || "").trim(),
    content: String(body.content || "").trim(),
    creator_name: String(body.creator_name || "").trim(),
    category: String(body.category || "").trim() || null,
    color: String(body.color || "blue").trim() || "blue",
    pinned: Boolean(body.pinned),
  };
}

export async function GET(request) {
  const supabase = await createClient(request);
  const { user, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role) && !isOperations(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const query = supabase
    .from("operation_notes")
    .select("*")
    .eq("archived", false)
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false });

  const { data: notes, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const creatorIds = [...new Set((notes || []).map((note) => note.created_by).filter(Boolean))];
  const { data: profiles = [] } = creatorIds.length
    ? await supabase.from("profiles").select("id, name, full_name, email").in("id", creatorIds)
    : { data: [] };
  const profileMap = new Map(
    profiles.map((profile) => [profile.id, profile.name || profile.full_name || profile.email || "CRM User"])
  );

  return NextResponse.json({
    notes: (notes || []).map((note) => ({
      ...note,
      created_by_name: note.creator_name || profileMap.get(note.created_by) || "Operations user",
    })),
    role,
    current_user_id: user.id,
  });
}

export async function POST(request) {
  const supabase = await createClient(request);
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role) && !isOperations(role)) {
    return NextResponse.json({ error: "Only CRM admin and operations users can create quick notes" }, { status: 403 });
  }

  const payload = notePayload(await request.json());
  if (!payload.title) return NextResponse.json({ error: "Note title is required" }, { status: 400 });
  if (!payload.content) return NextResponse.json({ error: "Note content is required" }, { status: 400 });
  if (!payload.creator_name) {
    payload.creator_name = profile?.name || user.user_metadata?.full_name || user.email || "Operations user";
  }

  const { data, error } = await supabase
    .from("operation_notes")
    .insert({ ...payload, created_by: user.id, updated_by: user.id })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "operation_note_created",
    entityType: "operation_note",
    entityId: data.id,
    newValue: data,
    request,
  });

  return NextResponse.json({ note: data }, { status: 201 });
}
