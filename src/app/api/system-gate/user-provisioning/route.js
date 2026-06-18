import { NextResponse } from "next/server";
import { createClient as createSupabaseServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";

const ALLOWED_ROLES = ["admin", "operations"];

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return null;

  return createSupabaseServiceClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function hasValidSecret(secret) {
  return Boolean(process.env.USER_PROVISIONING_SECRET) && secret === process.env.USER_PROVISIONING_SECRET;
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
}

async function audit(supabase, request, { user, profile, action, entityId = null, newValue = null, metadata = {} }) {
  if (!supabase) return;

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action,
    entityType: "user",
    entityId,
    newValue,
    metadata,
    request,
  });
}

async function assertProvisioningAccess(request, secret) {
  const supabase = await createClient(request);
  const serviceSupabase = getServiceClient();
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) {
    await audit(serviceSupabase, request, {
      user: null,
      profile: null,
      action: "unauthorized_user_provisioning_access",
      metadata: { reason: "not_authenticated" },
    });
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (!isAdmin(role)) {
    await audit(serviceSupabase, request, {
      user,
      profile,
      action: "unauthorized_user_provisioning_access",
      metadata: { reason: "not_admin" },
    });
    return { error: NextResponse.json({ error: "Only admin can provision users" }, { status: 403 }) };
  }

  if (!process.env.USER_PROVISIONING_SECRET) {
    return { error: NextResponse.json({ error: "Provisioning secret is not configured" }, { status: 503 }) };
  }

  if (!hasValidSecret(secret)) {
    await audit(serviceSupabase, request, {
      user,
      profile,
      action: "failed_user_provisioning_secret",
      metadata: { reason: "invalid_secret" },
    });
    return { error: NextResponse.json({ error: "Invalid provisioning secret" }, { status: 403 }) };
  }

  return { supabase, serviceSupabase, user, profile };
}

export async function POST(request) {
  const body = await request.json();
  const access = await assertProvisioningAccess(request, body.provisioning_secret);

  if (access.error) return access.error;

  const { serviceSupabase, user, profile } = access;
  if (!serviceSupabase) {
    return NextResponse.json({ error: "Supabase service role key is not configured" }, { status: 503 });
  }

  const fullName = String(body.full_name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const confirmPassword = String(body.confirm_password || "");
  const role = String(body.role || "");
  const mobile = String(body.mobile || "").trim();
  const isActive = body.is_active !== false;

  if (!fullName) return NextResponse.json({ error: "Full name is required" }, { status: 400 });
  if (!validEmail(email)) return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  if (!password) return NextResponse.json({ error: "Password is required" }, { status: 400 });
  if (password !== confirmPassword) return NextResponse.json({ error: "Passwords do not match" }, { status: 400 });
  if (!ALLOWED_ROLES.includes(role)) return NextResponse.json({ error: "Role must be admin or operations" }, { status: 400 });

  const { data: authData, error: authError } = await serviceSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      role,
    },
  });

  if (authError || !authData?.user) {
    await audit(serviceSupabase, request, {
      user,
      profile,
      action: "failed_user_creation_attempt",
      metadata: { email, role, reason: authError?.message || "auth_user_missing" },
    });
    return NextResponse.json({ error: authError?.message || "User creation failed" }, { status: 400 });
  }

  const newUser = authData.user;
  const createdAt = new Date().toISOString();

  const profilePayload = {
    id: newUser.id,
    name: fullName,
    full_name: fullName,
    email,
    mobile: mobile || null,
    role,
    status: isActive ? "Active" : "Inactive",
    is_active: isActive,
    created_by: user.id,
    created_at: createdAt,
    updated_at: createdAt,
  };

  const { error: profileError } = await serviceSupabase
    .from("profiles")
    .upsert(profilePayload, { onConflict: "id" });

  if (profileError) {
    await serviceSupabase.auth.admin.deleteUser(newUser.id);
    await audit(serviceSupabase, request, {
      user,
      profile,
      action: "failed_user_creation_attempt",
      metadata: { email, role, reason: profileError.message, stage: "profile_upsert" },
    });
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  await audit(serviceSupabase, request, {
    user,
    profile,
    action: "user_created",
    entityId: newUser.id,
    newValue: {
      id: newUser.id,
      full_name: fullName,
      email,
      mobile: mobile || null,
      role,
      is_active: isActive,
    },
  });

  return NextResponse.json({
    user: {
      id: newUser.id,
      full_name: fullName,
      email,
      mobile: mobile || null,
      role,
      is_active: isActive,
    },
  }, { status: 201 });
}

export async function PUT(request) {
  const body = await request.json();
  const access = await assertProvisioningAccess(request, body.provisioning_secret);

  if (access.error) return access.error;

  return NextResponse.json({ allowed: true }, { status: 200 });
}
