import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin, isOperations } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";
import { decryptSecret, encryptSecret } from "@/lib/security/credentials";

function sanitizeCredential(row) {
  return {
    ...row,
    has_secret: Boolean(row?.encrypted_secret),
    encrypted_secret: undefined,
  };
}

async function getCredential(supabase, id) {
  const { data, error } = await supabase
    .from("company_credentials")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function GET(request, { params }) {
  try {
    const supabase = await createClient(request);
    const { id } = await params;
    const { user, profile, role } = await getAuthContext(supabase);

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isAdmin(role) && !isOperations(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const credential = await getCredential(supabase, id);
    if (!credential) return NextResponse.json({ error: "Credential not found" }, { status: 404 });

    let secret = "";
    try {
      secret = decryptSecret(credential.encrypted_secret);
    } catch (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "company_credential_secret_revealed",
      entityType: "company_credential",
      entityId: id,
      metadata: { platform: credential.platform },
      request,
    });

    return NextResponse.json({ secret }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Credential reveal failed" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const supabase = await createClient(request);
    const { id } = await params;
    const { user, profile, role } = await getAuthContext(supabase);

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isAdmin(role) && !isOperations(role)) {
      await writeAuditLog(supabase, {
        actor: user,
        profile,
        action: "permission_denied_company_credential_update",
        entityType: "company_credential",
        entityId: id,
        request,
      });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const existing = await getCredential(supabase, id);
    if (!existing) return NextResponse.json({ error: "Credential not found" }, { status: 404 });

    const body = await request.json();
    const payload = {
      platform: body.platform || existing.platform,
      login_url: body.login_url || null,
      username: body.username || null,
      notes: body.notes || null,
      active: body.active !== false,
      updated_by: user.id,
    };

    if (body.secret) {
      try {
        payload.encrypted_secret = encryptSecret(body.secret);
      } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    const { data, error } = await supabase
      .from("company_credentials")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "company_credential_updated",
      entityType: "company_credential",
      entityId: id,
      oldValue: sanitizeCredential(existing),
      newValue: { ...sanitizeCredential(data), secret_changed: Boolean(body.secret) },
      request,
    });

    return NextResponse.json({ credential: sanitizeCredential(data) }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Credential update failed" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const supabase = await createClient(request);
    const { id } = await params;
    const { user, profile, role } = await getAuthContext(supabase);

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const existing = await getCredential(supabase, id);
    if (!existing) return NextResponse.json({ error: "Credential not found" }, { status: 404 });

    const { error } = await supabase.from("company_credentials").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "company_credential_deleted",
      entityType: "company_credential",
      entityId: id,
      oldValue: sanitizeCredential(existing),
      request,
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Credential delete failed" }, { status: 500 });
  }
}
