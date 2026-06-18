import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";
import { getTaskDataClient } from "@/lib/tasks/assignees";

export async function GET(request) {
  try {
    const supabase = await createClient(request);
    const { user } = await getAuthContext(supabase);

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const readClient = getTaskDataClient(supabase);
    const { data, error } = await readClient
      .from("company_details")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ company: data }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Company details failed" }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const supabase = await createClient(request);
    const { user, profile, role } = await getAuthContext(supabase);

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isAdmin(role)) {
      await writeAuditLog(supabase, {
        actor: user,
        profile,
        action: "permission_denied_company_update",
        entityType: "company_details",
        request,
      });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const payload = {
      company_name: body.company_name || "Ideas2Invest",
      arn: body.arn || null,
      euin_details: body.euin_details || null,
      registered_address: body.registered_address || null,
      contact_email: body.contact_email || null,
      contact_phone: body.contact_phone || null,
      website: body.website || null,
      metadata: body.metadata || {},
      updated_by: user.id,
    };

    const { data: existing } = await supabase
      .from("company_details")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const query = existing
      ? supabase.from("company_details").update(payload).eq("id", existing.id)
      : supabase.from("company_details").insert(payload);

    const { data, error } = await query.select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: existing ? "company_details_updated" : "company_details_created",
      entityType: "company_details",
      entityId: data.id,
      oldValue: existing,
      newValue: data,
      request,
    });

    return NextResponse.json({ company: data }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Company update failed" }, { status: 500 });
  }
}
