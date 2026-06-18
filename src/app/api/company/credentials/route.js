import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";
import { encryptSecret } from "@/lib/security/credentials";

function sanitizeCredential(row) {
  return {
    ...row,
    has_secret: Boolean(row?.encrypted_secret),
    encrypted_secret: undefined,
  };
}

export async function GET(request) {
  try {
    const supabase = await createClient(request);
    const { user, role } = await getAuthContext(supabase);

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("company_credentials")
      .select("*")
      .order("platform", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ credentials: (data || []).map(sanitizeCredential) }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Credentials failed" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = await createClient(request);
    const { user, profile, role } = await getAuthContext(supabase);

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isAdmin(role)) {
      await writeAuditLog(supabase, {
        actor: user,
        profile,
        action: "permission_denied_company_credential_create",
        entityType: "company_credential",
        request,
      });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    if (!body.platform) {
      return NextResponse.json({ error: "Platform is required" }, { status: 400 });
    }

    let encryptedSecret = null;
    try {
      encryptedSecret = encryptSecret(body.secret);
    } catch (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const payload = {
      platform: body.platform,
      login_url: body.login_url || null,
      username: body.username || null,
      encrypted_secret: encryptedSecret,
      notes: body.notes || null,
      active: body.active !== false,
      created_by: user.id,
      updated_by: user.id,
    };

    const { data, error } = await supabase
      .from("company_credentials")
      .insert(payload)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "company_credential_created",
      entityType: "company_credential",
      entityId: data.id,
      newValue: { ...sanitizeCredential(data), secret_changed: Boolean(body.secret) },
      request,
    });

    return NextResponse.json({ credential: sanitizeCredential(data) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Credential save failed" }, { status: 500 });
  }
}
