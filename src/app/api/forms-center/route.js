import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin, isOperations } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";
import { getTaskDataClient } from "@/lib/tasks/assignees";

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function validExternalUrl(value) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function buildLinkPayload(body, userId) {
  return {
    display_name: String(body.display_name || "").trim(),
    slug: normalizeSlug(body.slug || body.display_name),
    organization_type: ["RTA", "AMC", "Other"].includes(body.organization_type)
      ? body.organization_type
      : "AMC",
    forms_url: String(body.forms_url || "").trim(),
    factsheet_url: String(body.factsheet_url || "").trim() || null,
    description: String(body.description || "").trim() || null,
    active: body.active !== false,
    display_order: Number(body.display_order) || 0,
    logo_url: String(body.logo_url || "").trim() || null,
    updated_by: userId,
  };
}

export async function GET(request) {
  const supabase = await createClient(request);
  const db = getTaskDataClient(supabase);
  const { user, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role) && !isOperations(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let linksQuery = db
    .from("forms_information_links")
    .select("*")
    .order("display_order", { ascending: true })
    .order("display_name", { ascending: true });

  if (!isAdmin(role)) linksQuery = linksQuery.eq("active", true);

  const [linksResult, favoritesResult, activityResult] = await Promise.all([
    linksQuery,
    db.from("forms_link_favorites").select("link_id, created_at").eq("user_id", user.id),
    db
      .from("forms_link_activity")
      .select("link_id, opened_at")
      .eq("user_id", user.id)
      .order("opened_at", { ascending: false })
      .limit(250),
  ]);

  const error = linksResult.error || favoritesResult.error || activityResult.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const activityByLink = new Map();
  for (const activity of activityResult.data || []) {
    const current = activityByLink.get(activity.link_id) || { openCount: 0, lastOpenedAt: null };
    current.openCount += 1;
    current.lastOpenedAt = current.lastOpenedAt || activity.opened_at;
    activityByLink.set(activity.link_id, current);
  }

  const favoriteIds = new Set((favoritesResult.data || []).map((item) => item.link_id));
  const links = (linksResult.data || []).map((link) => ({
    ...link,
    is_favorite: favoriteIds.has(link.id),
    open_count: activityByLink.get(link.id)?.openCount || 0,
    last_opened_at: activityByLink.get(link.id)?.lastOpenedAt || null,
  }));

  return NextResponse.json({ links, role });
}

export async function POST(request) {
  const supabase = await createClient(request);
  const db = getTaskDataClient(supabase);
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role) && !isOperations(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const payload = { ...buildLinkPayload(body, user.id), created_by: user.id };
  if (!payload.display_name || !payload.slug) {
    return NextResponse.json({ error: "Organization name is required" }, { status: 400 });
  }
  if (!validExternalUrl(payload.forms_url)) {
    return NextResponse.json({ error: "A valid HTTP or HTTPS forms URL is required" }, { status: 400 });
  }
  if (payload.factsheet_url && !validExternalUrl(payload.factsheet_url)) {
    return NextResponse.json({ error: "Factsheet URL must be a valid HTTP or HTTPS URL" }, { status: 400 });
  }

  const { data, error } = await db.from("forms_information_links").insert(payload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "forms_link_created",
    entityType: "forms_information_link",
    entityId: data.id,
    newValue: data,
    request,
  });

  return NextResponse.json({ link: data }, { status: 201 });
}
