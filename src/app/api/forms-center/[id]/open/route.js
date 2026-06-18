import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin, isOperations } from "@/lib/auth/permissions";
import { getTaskDataClient } from "@/lib/tasks/assignees";

export async function POST(request, { params }) {
  const supabase = await createClient(request);
  const db = getTaskDataClient(supabase);
  const { user, role } = await getAuthContext(supabase);
  const { id } = await params;

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role) && !isOperations(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: link, error } = await db
    .from("forms_information_links")
    .select("id, forms_url, active")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!link || (!link.active && !isAdmin(role))) {
    return NextResponse.json({ error: "Forms link not found" }, { status: 404 });
  }

  const { error: activityError } = await db
    .from("forms_link_activity")
    .insert({ user_id: user.id, link_id: id });
  if (activityError) return NextResponse.json({ error: activityError.message }, { status: 500 });

  return NextResponse.json({ url: link.forms_url });
}
