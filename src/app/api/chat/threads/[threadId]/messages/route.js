import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin, isOperations } from "@/lib/auth/permissions";
import { createNotification } from "@/lib/notifications/service";
import { getTaskDataClient } from "@/lib/tasks/assignees";

export const dynamic = "force-dynamic";

async function enrichMessages(db, messages = []) {
  const senderIds = [...new Set(messages.map((message) => message.sender_id).filter(Boolean))];
  const messageIds = messages.map((message) => message.id).filter(Boolean);
  const { data: profiles = [] } = senderIds.length
    ? await db.from("profiles").select("id, name, full_name, email, avatar_url, role").in("id", senderIds)
    : { data: [] };
  const { data: readRows = [] } = messageIds.length
    ? await db.from("chat_message_reads").select("*").in("message_id", messageIds)
    : { data: [] };
  const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
  const readsByMessage = new Map();
  (readRows || []).forEach((row) => {
    const rows = readsByMessage.get(row.message_id) || [];
    rows.push(row);
    readsByMessage.set(row.message_id, rows);
  });
  return messages.map((message) => ({
    ...message,
    sender_profile: profileMap.get(message.sender_id) || null,
    read_receipts: readsByMessage.get(message.id) || [],
  }));
}

async function requireMember(db, threadId, userId) {
  const { data, error } = await db
    .from("chat_thread_members")
    .select("id")
    .eq("thread_id", threadId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

async function getMemberIds(db, threadId) {
  const { data, error } = await db
    .from("chat_thread_members")
    .select("user_id")
    .eq("thread_id", threadId);
  if (error) throw new Error(error.message);
  return (data || []).map((member) => member.user_id);
}

export async function GET(request, { params }) {
  const supabase = await createClient(request);
  const db = getTaskDataClient(supabase);
  const { user, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role) && !isOperations(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { threadId } = await params;

  try {
    if (!(await requireMember(db, threadId, user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: messages, error } = await db
      .from("chat_messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) throw new Error(error.message);

    const unreadMessageIds = (messages || [])
      .filter((message) => message.sender_id !== user.id)
      .map((message) => message.id);

    const { data: existingReads = [] } = unreadMessageIds.length
      ? await db
          .from("chat_message_reads")
          .select("message_id")
          .eq("user_id", user.id)
          .in("message_id", unreadMessageIds)
      : { data: [] };

    const existingReadIds = new Set((existingReads || []).map((read) => read.message_id));
    const readAt = new Date().toISOString();
    const unreadMessages = unreadMessageIds
      .filter((messageId) => !existingReadIds.has(messageId))
      .map((messageId) => ({
        message_id: messageId,
        user_id: user.id,
        read_at: readAt,
      }));

    if (unreadMessages.length) {
      await db
        .from("chat_message_reads")
        .insert(unreadMessages);
    }

    await db
      .from("chat_thread_members")
      .update({ last_read_at: readAt })
      .eq("thread_id", threadId)
      .eq("user_id", user.id);

    return NextResponse.json({ messages: await enrichMessages(db, messages || []) }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Messages failed" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const supabase = await createClient(request);
  const db = getTaskDataClient(supabase);
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role) && !isOperations(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { threadId } = await params;
  const body = await request.json().catch(() => ({}));
  const messageBody = String(body.body || "").trim();

  if (!messageBody) return NextResponse.json({ error: "Message cannot be empty" }, { status: 400 });

  try {
    if (!(await requireMember(db, threadId, user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: message, error } = await db
      .from("chat_messages")
      .insert({
        thread_id: threadId,
        sender_id: user.id,
        body: messageBody,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    await db
      .from("chat_thread_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("thread_id", threadId)
      .eq("user_id", user.id);

    await db
      .from("chat_message_reads")
      .upsert({
        message_id: message.id,
        user_id: user.id,
        read_at: new Date().toISOString(),
      }, { onConflict: "message_id,user_id" });

    const recipients = (await getMemberIds(db, threadId)).filter((id) => id !== user.id);
    const { data: recipientProfiles = [] } = recipients.length
      ? await db.from("profiles").select("id, role").in("id", recipients)
      : { data: [] };
    const roleByRecipient = new Map((recipientProfiles || []).map((item) => [item.id, item.role]));
    await Promise.all(
      recipients.map((userId) =>
        createNotification(db, {
          userId,
          title: `New message from ${profile?.name || user.email || "CRM user"}`,
          message: messageBody.length > 120 ? `${messageBody.slice(0, 117)}...` : messageBody,
          type: "chat_message",
          entityType: "chat_thread",
          entityId: threadId,
          linkUrl: `${roleByRecipient.get(userId) === "operations" ? "/operations/dashboard" : "/admin/dashboard"}?chat=${threadId}`,
          metadata: { thread_id: threadId },
        })
      )
    );

    const [enrichedMessage] = await enrichMessages(db, [message]);
    return NextResponse.json({ message: enrichedMessage }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Message send failed" }, { status: 500 });
  }
}
