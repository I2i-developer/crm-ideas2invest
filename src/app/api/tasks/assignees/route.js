import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, canCreateTasks } from "@/lib/auth/permissions";
import { listAssignableTaskUsers } from "@/lib/tasks/assignees";

export async function GET(request) {
  const supabase = await createClient(request);
  const { user, role } = await getAuthContext(supabase);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canCreateTasks(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const users = await listAssignableTaskUsers(supabase, { actorRole: role, actorId: user.id });
    return NextResponse.json({ users }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
