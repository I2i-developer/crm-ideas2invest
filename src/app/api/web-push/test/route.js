import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext } from "@/lib/auth/permissions";
import { createNotification } from "@/lib/notifications/service";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const supabase = await createClient(request);
  const { user } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const notification = await createNotification(supabase, {
    userId: user.id,
    title: "Web push is enabled",
    message: "This is a test notification from your CRM.",
    type: "web_push_test",
    entityType: "web_push_subscription",
    linkUrl: "/notifications",
    metadata: { test: true },
    dedupeKey: `web_push_test:${user.id}:${Date.now()}`,
  });

  return NextResponse.json({ notification }, { status: 201 });
}
