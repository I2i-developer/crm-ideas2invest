import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin, isOperations } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";
import { getTaskDataClient } from "@/lib/tasks/assignees";

export const dynamic = "force-dynamic";

function displayName(profile) {
  return profile?.name || profile?.full_name || profile?.email || "CRM User";
}

async function getProfiles(db, userIds) {
  if (!userIds.length) return new Map();
  const { data } = await db
    .from("profiles")
    .select("id, name, full_name, email, avatar_url, role")
    .in("id", [...new Set(userIds)]);
  return new Map((data || []).map((profile) => [profile.id, profile]));
}

async function listThreads(db, userId) {
  const { data: memberships, error: membershipError } = await db
    .from("chat_thread_members")
    .select("thread_id, last_read_at, muted")
    .eq("user_id", userId);

  if (membershipError) throw new Error(membershipError.message);

  const threadIds = (memberships || []).map((membership) => membership.thread_id);
  if (!threadIds.length) return [];

  const [{ data: threads, error: threadError }, { data: allMembers }, { data: messages }] = await Promise.all([
    db.from("chat_threads").select("*").in("id", threadIds).order("last_message_at", { ascending: false }),
    db.from("chat_thread_members").select("*").in("thread_id", threadIds),
    db.from("chat_messages").select("*").in("thread_id", threadIds).order("created_at", { ascending: false }).limit(500),
  ]);

  if (threadError) throw new Error(threadError.message);

  const profileMap = await getProfiles(db, (allMembers || []).map((member) => member.user_id));
  const membershipMap = new Map((memberships || []).map((membership) => [membership.thread_id, membership]));

  return (threads || []).map((thread) => {
    const members = (allMembers || [])
      .filter((member) => member.thread_id === thread.id)
      .map((member) => ({
        ...member,
        profile: profileMap.get(member.user_id) || null,
      }));
    const lastMessage = (messages || []).find((message) => message.thread_id === thread.id) || null;
    const myMembership = membershipMap.get(thread.id);
    const lastReadAt = myMembership?.last_read_at ? new Date(myMembership.last_read_at).getTime() : 0;
    const unreadCount = (messages || []).filter((message) =>
      message.thread_id === thread.id &&
      message.sender_id !== userId &&
      new Date(message.created_at).getTime() > lastReadAt
    ).length;
    const otherMembers = members.filter((member) => member.user_id !== userId);

    return {
      ...thread,
      members,
      unread_count: unreadCount,
      last_message: lastMessage,
      display_title: thread.title || otherMembers.map((member) => displayName(member.profile)).join(", ") || "Saved chat",
    };
  });
}

export async function GET(request) {
  const supabase = await createClient(request);
  const db = getTaskDataClient(supabase);
  const { user, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role) && !isOperations(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const threads = await listThreads(db, user.id);
    return NextResponse.json({
      threads,
      unread_count: threads.reduce((sum, thread) => sum + (thread.unread_count || 0), 0),
    }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Chat threads failed" }, { status: 500 });
  }
}

export async function POST(request) {
  const supabase = await createClient(request);
  const db = getTaskDataClient(supabase);
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role) && !isOperations(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const targetUserIds = [...new Set((body.user_ids || [body.user_id]).filter(Boolean))].filter((id) => id !== user.id);

  if (!targetUserIds.length) {
    return NextResponse.json({ error: "Select at least one chat recipient" }, { status: 400 });
  }

  const { data: targets, error: targetError } = await db
    .from("profiles")
    .select("id, role, status, is_active")
    .in("id", targetUserIds);

  if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 });
  if ((targets || []).length !== targetUserIds.length) return NextResponse.json({ error: "Invalid chat recipient" }, { status: 400 });

  const invalidTarget = (targets || []).find((target) =>
    !["admin", "operations"].includes(target.role) ||
    target.is_active === false ||
    String(target.status || "Active").toLowerCase() === "inactive"
  );
  if (invalidTarget) return NextResponse.json({ error: "Recipient is not an active CRM user" }, { status: 400 });

  try {
    if (targetUserIds.length === 1) {
      const existingThreads = await listThreads(db, user.id);
      const existing = existingThreads.find((thread) =>
        thread.thread_type === "direct" &&
        thread.members.length === 2 &&
        thread.members.some((member) => member.user_id === targetUserIds[0])
      );
      if (existing) return NextResponse.json({ thread: existing }, { status: 200 });
    }

    const { data: thread, error: threadError } = await db
      .from("chat_threads")
      .insert({
        thread_type: targetUserIds.length > 1 ? "group" : "direct",
        title: targetUserIds.length > 1 ? body.title || "Group chat" : null,
        created_by: user.id,
      })
      .select()
      .single();

    if (threadError) throw new Error(threadError.message);

    const members = [user.id, ...targetUserIds].map((userId) => ({
      thread_id: thread.id,
      user_id: userId,
      role_snapshot: (userId === user.id ? role : targets.find((target) => target.id === userId)?.role) || null,
      last_read_at: userId === user.id ? new Date().toISOString() : null,
    }));

    const { error: memberError } = await db.from("chat_thread_members").insert(members);
    if (memberError) throw new Error(memberError.message);

    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "chat_thread_created",
      entityType: "chat_thread",
      entityId: thread.id,
      metadata: { member_count: members.length },
      request,
    });

    const threads = await listThreads(db, user.id);
    return NextResponse.json({ thread: threads.find((item) => item.id === thread.id) || thread }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Chat thread create failed" }, { status: 500 });
  }
}
