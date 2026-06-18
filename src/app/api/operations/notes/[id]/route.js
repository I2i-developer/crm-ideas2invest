import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin, isOperations } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";

function canManage(user, role, note) {
  return isAdmin(role) || (isOperations(role) && note.created_by === user.id);
}

async function getNote(supabase, id) {
  return supabase.from("operation_notes").select("*").eq("id", id).maybeSingle();
}

export async function PATCH(request, { params }) {
  const supabase = await createClient(request);
  const { user, profile, role } = await getAuthContext(supabase);
  const { id } = await params;

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: existing, error: lookupError } = await getNote(supabase, id);
  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
  if (!existing || existing.archived) return NextResponse.json({ error: "Note not found" }, { status: 404 });
  if (!canManage(user, role, existing)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const payload = {
    title: body.title === undefined ? existing.title : String(body.title || "").trim(),
    content: body.content === undefined ? existing.content : String(body.content || "").trim(),
    creator_name: body.creator_name === undefined ? existing.creator_name : String(body.creator_name || "").trim(),
    category: body.category === undefined ? existing.category : String(body.category || "").trim() || null,
    color: body.color === undefined ? existing.color : String(body.color || "blue").trim(),
    pinned: body.pinned === undefined ? existing.pinned : Boolean(body.pinned),
    updated_by: user.id,
  };
  if (!payload.title) return NextResponse.json({ error: "Note title is required" }, { status: 400 });
  if (!payload.content) return NextResponse.json({ error: "Note content is required" }, { status: 400 });
  if (!payload.creator_name) return NextResponse.json({ error: "Created by name is required" }, { status: 400 });

  const { data, error } = await supabase.from("operation_notes").update(payload).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "operation_note_updated",
    entityType: "operation_note",
    entityId: id,
    oldValue: existing,
    newValue: data,
    request,
  });

  return NextResponse.json({ note: data });
}

export async function DELETE(request, { params }) {
  const supabase = await createClient(request);
  const { user, profile, role } = await getAuthContext(supabase);
  const { id } = await params;

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: existing, error: lookupError } = await getNote(supabase, id);
  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
  if (!existing || existing.archived) return NextResponse.json({ error: "Note not found" }, { status: 404 });
  if (!canManage(user, role, existing)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabase.from("operation_notes").delete().eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "operation_note_deleted",
    entityType: "operation_note",
    entityId: id,
    oldValue: existing,
    request,
  });

  return NextResponse.json({ note: data });
}
