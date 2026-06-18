import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext } from "@/lib/auth/permissions";
import { getTaskDataClient } from "@/lib/tasks/assignees";

export const dynamic = "force-dynamic";

export async function PUT(request, { params }) {
  const supabase = await createClient(request);
  const db = getTaskDataClient(supabase);
  const { user } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { threadId } = await params;
  const { error } = await db
    .from("chat_thread_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("thread_id", threadId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 200 });
}
