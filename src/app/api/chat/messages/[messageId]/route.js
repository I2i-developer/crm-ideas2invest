import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin, isOperations } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";
import { getTaskDataClient } from "@/lib/tasks/assignees";

export const dynamic = "force-dynamic";

async function getMessage(db, messageId) {
  const { data, error } = await db
    .from("chat_messages")
    .select("*")
    .eq("id", messageId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function isThreadMember(db, threadId, userId) {
  const { data, error } = await db
    .from("chat_thread_members")
    .select("id")
    .eq("thread_id", threadId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

async function enrichMessage(db, message) {
  const [{ data: profile }, { data: readReceipts = [] }] = await Promise.all([
    db
      .from("profiles")
      .select("id, name, full_name, email, avatar_url, role")
      .eq("id", message.sender_id)
      .maybeSingle(),
    db.from("chat_message_reads").select("*").eq("message_id", message.id),
  ]);

  return {
    ...message,
    sender_profile: profile || null,
    read_receipts: readReceipts || [],
  };
}

async function requireChatUser(supabase, request) {
  const db = getTaskDataClient(supabase);
  const context = await getAuthContext(supabase);
  const { user, role } = context;

  if (!user) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!isAdmin(role) && !isOperations(role)) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { db, ...context };
}

export async function PATCH(request, { params }) {
  const supabase = await createClient(request);
  const auth = await requireChatUser(supabase, request);
  if (auth.response) return auth.response;

  const { db, user, profile } = auth;
  const { messageId } = await params;
  const body = await request.json().catch(() => ({}));
  const nextBody = String(body.body || "").trim();

  if (!nextBody) return NextResponse.json({ error: "Message cannot be empty" }, { status: 400 });

  try {
    const existing = await getMessage(db, messageId);
    if (!existing) return NextResponse.json({ error: "Message not found" }, { status: 404 });

    const member = await isThreadMember(db, existing.thread_id, user.id);
    if (!member || existing.sender_id !== user.id || existing.deleted_at) {
      await writeAuditLog(supabase, {
        actor: user,
        profile,
        action: "permission_denied_chat_message_update",
        entityType: "chat_message",
        entityId: messageId,
        request,
      });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: message, error } = await db
      .from("chat_messages")
      .update({ body: nextBody, edited_at: new Date().toISOString() })
      .eq("id", messageId)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ message: await enrichMessage(db, message) }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Message update failed" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const supabase = await createClient(request);
  const auth = await requireChatUser(supabase, request);
  if (auth.response) return auth.response;

  const { db, user, profile, role } = auth;
  const { messageId } = await params;

  try {
    const existing = await getMessage(db, messageId);
    if (!existing) return NextResponse.json({ error: "Message not found" }, { status: 404 });

    const member = await isThreadMember(db, existing.thread_id, user.id);
    const canDelete = member && (existing.sender_id === user.id || isAdmin(role));
    if (!canDelete) {
      await writeAuditLog(supabase, {
        actor: user,
        profile,
        action: "permission_denied_chat_message_delete",
        entityType: "chat_message",
        entityId: messageId,
        request,
      });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const deletedAt = new Date().toISOString();
    const { data: message, error } = await db
      .from("chat_messages")
      .update({ deleted_at: deletedAt, deleted_by: user.id })
      .eq("id", messageId)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "chat_message_deleted",
      entityType: "chat_message",
      entityId: messageId,
      metadata: { thread_id: existing.thread_id },
      request,
    });

    return NextResponse.json({ message: await enrichMessage(db, message) }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Message delete failed" }, { status: 500 });
  }
}
