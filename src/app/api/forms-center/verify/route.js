import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";
import { getTaskDataClient } from "@/lib/tasks/assignees";
import { verifyFormsLink } from "@/lib/formsCenter/verifyLink";

export const maxDuration = 60;

export async function POST(request) {
  const supabase = await createClient(request);
  const db = getTaskDataClient(supabase);
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  let query = db.from("forms_information_links").select("id, display_name, forms_url");
  if (body.id) query = query.eq("id", body.id);

  const { data: links, error } = await query.order("display_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (body.id && !links?.length) return NextResponse.json({ error: "Forms link not found" }, { status: 404 });

  const results = await Promise.all((links || []).map(async (link) => {
    const verification = await verifyFormsLink(link.forms_url);
    const verifiedAt = new Date().toISOString();
    const { error: updateError } = await db
      .from("forms_information_links")
      .update({
        verification_status: verification.verificationStatus,
        last_http_status: verification.httpStatus,
        last_verified_at: verifiedAt,
        updated_by: user.id,
      })
      .eq("id", link.id);

    return {
      id: link.id,
      display_name: link.display_name,
      ...verification,
      updated: !updateError,
      error: updateError?.message || verification.error,
    };
  }));

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: body.id ? "forms_link_verified" : "forms_links_verified",
    entityType: "forms_information_link",
    entityId: body.id || null,
    metadata: {
      checked: results.length,
      healthy: results.filter((item) => item.verificationStatus === "healthy").length,
      redirected: results.filter((item) => item.verificationStatus === "redirected").length,
      broken: results.filter((item) => item.verificationStatus === "broken").length,
      unknown: results.filter((item) => item.verificationStatus === "unknown").length,
    },
    request,
  });

  return NextResponse.json({ results });
}
