import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin, isOperations } from "@/lib/auth/permissions";
import { getTaskDataClient } from "@/lib/tasks/assignees";

export const dynamic = "force-dynamic";

function displayName(profile) {
  return profile.name || profile.full_name || profile.email || "CRM User";
}

export async function GET(request) {
  const supabase = await createClient(request);
  const db = getTaskDataClient(supabase);
  const { user, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role) && !isOperations(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await db
    .from("profiles")
    .select("id, name, full_name, email, avatar_url, role, status, is_active")
    .in("role", ["admin", "operations"])
    .order("name", { ascending: true, nullsFirst: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const users = (data || [])
    .filter((profile) => profile.id !== user.id)
    .filter((profile) => profile.is_active !== false)
    .filter((profile) => String(profile.status || "Active").toLowerCase() !== "inactive")
    .map((profile) => ({
      id: profile.id,
      name: displayName(profile),
      email: profile.email,
      role: profile.role,
      avatar_url: profile.avatar_url,
    }));

  return NextResponse.json({ users }, { status: 200 });
}
