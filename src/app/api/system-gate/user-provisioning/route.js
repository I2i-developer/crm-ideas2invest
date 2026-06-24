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

function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "");
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

  if (!process.env.USER_PROVISIONING_SECRET) {
    return { error: NextResponse.json({ error: "Provisioning secret is not configured" }, { status: 503 }) };
  }

  const { user, profile, role } = await getAuthContext(supabase);
  const secretValid = hasValidSecret(secret);

  if (!secretValid) {
    await audit(serviceSupabase, request, {
      user,
      profile,
      action: "failed_user_provisioning_secret",
      metadata: { reason: "invalid_secret" },
    });
    return { error: NextResponse.json({ error: "Invalid provisioning secret" }, { status: 403 }) };
  }

  if (user && !isAdmin(role)) {
    await audit(serviceSupabase, request, {
      user,
      profile,
      action: "user_provisioning_secret_used_by_non_admin",
      metadata: { reason: "valid_secret_override" },
    });
  }

  if (!user) {
    await audit(serviceSupabase, request, {
      user: null,
      profile: null,
      action: "user_provisioning_secret_used_without_session",
      metadata: { reason: "valid_secret" },
    });
  }

  return { supabase, serviceSupabase, user, profile };
}

async function listProvisionableUsers(db) {
  const { data, error } = await db
    .from("profiles")
    .select("id, name, full_name, email, mobile, role, status, is_active")
    .in("role", ALLOWED_ROLES)
    .order("full_name", { ascending: true });

  if (error) throw error;

  return (data || []).map((profile) => ({
    id: profile.id,
    full_name: profile.full_name || profile.name || profile.email || "CRM User",
    email: profile.email,
    mobile: profile.mobile || "",
    role: profile.role,
    status: profile.status || (profile.is_active === false ? "Inactive" : "Active"),
    is_active: profile.is_active !== false,
  }));
}

async function getTargetProfile(serviceSupabase, targetUserId) {
  const { data, error } = await serviceSupabase
    .from("profiles")
    .select("id, full_name, name, email, mobile, role, status, is_active")
    .eq("id", targetUserId)
    .maybeSingle();

  return { data, error };
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
    created_by: user?.id || null,
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

  try {
    const users = await listProvisionableUsers(access.serviceSupabase || access.supabase);
    return NextResponse.json({ allowed: true, users }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Could not load CRM users" }, { status: 500 });
  }
}

export async function PATCH(request) {
  const body = await request.json();
  const access = await assertProvisioningAccess(request, body.provisioning_secret);

  if (access.error) return access.error;

  const { serviceSupabase, user, profile } = access;
  if (!serviceSupabase) {
    return NextResponse.json({ error: "Supabase service role key is not configured" }, { status: 503 });
  }

  if (body.action === "update_user") {
    const targetUserId = String(body.user_id || "").trim();
    const fullName = String(body.full_name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const mobile = String(body.mobile || "").trim();
    const role = String(body.role || "").trim();
    const isActive = body.is_active !== false;

    if (!validUuid(targetUserId)) {
      return NextResponse.json({ error: "Select a valid CRM user" }, { status: 400 });
    }

    if (!fullName) return NextResponse.json({ error: "Full name is required" }, { status: 400 });
    if (!validEmail(email)) return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    if (!ALLOWED_ROLES.includes(role)) return NextResponse.json({ error: "Role must be admin or operations" }, { status: 400 });

    const { data: targetProfile, error: targetProfileError } = await getTargetProfile(serviceSupabase, targetUserId);

    if (targetProfileError) {
      return NextResponse.json({ error: targetProfileError.message }, { status: 500 });
    }

    if (!targetProfile) {
      await audit(serviceSupabase, request, {
        user,
        profile,
        action: "failed_user_profile_update",
        metadata: { target_user_id: targetUserId, reason: "profile_not_found" },
      });
      return NextResponse.json({ error: "CRM user not found" }, { status: 404 });
    }

    const { error: authError } = await serviceSupabase.auth.admin.updateUserById(targetUserId, {
      email,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role,
      },
    });

    if (authError) {
      await audit(serviceSupabase, request, {
        user,
        profile,
        action: "failed_user_profile_update",
        entityId: targetUserId,
        metadata: { reason: authError.message, target_email: targetProfile.email },
      });
      return NextResponse.json({ error: authError.message || "User update failed" }, { status: 400 });
    }

    const updatedAt = new Date().toISOString();
    const profilePayload = {
      name: fullName,
      full_name: fullName,
      email,
      mobile: mobile || null,
      role,
      status: isActive ? "Active" : "Inactive",
      is_active: isActive,
      updated_at: updatedAt,
    };

    const { error: profileUpdateError } = await serviceSupabase
      .from("profiles")
      .update(profilePayload)
      .eq("id", targetUserId);

    if (profileUpdateError) {
      await audit(serviceSupabase, request, {
        user,
        profile,
        action: "failed_user_profile_update",
        entityId: targetUserId,
        metadata: { reason: profileUpdateError.message, stage: "profile_update" },
      });
      return NextResponse.json({ error: profileUpdateError.message }, { status: 500 });
    }

    const updatedUser = {
      id: targetUserId,
      full_name: fullName,
      email,
      mobile,
      role,
      status: profilePayload.status,
      is_active: isActive,
    };

    await audit(serviceSupabase, request, {
      user,
      profile,
      action: "user_profile_updated",
      entityId: targetUserId,
      oldValue: targetProfile,
      newValue: updatedUser,
    });

    return NextResponse.json({ user: updatedUser }, { status: 200 });
  }

  const targetUserId = String(body.user_id || "").trim();
  const password = String(body.password || "");
  const confirmPassword = String(body.confirm_password || "");

  if (!validUuid(targetUserId)) {
    return NextResponse.json({ error: "Select a valid CRM user" }, { status: 400 });
  }

  if (!password || password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  if (password !== confirmPassword) {
    return NextResponse.json({ error: "Passwords do not match" }, { status: 400 });
  }

  const { data: targetProfile, error: targetProfileError } = await getTargetProfile(serviceSupabase, targetUserId);

  if (targetProfileError) {
    return NextResponse.json({ error: targetProfileError.message }, { status: 500 });
  }

  if (!targetProfile) {
    await audit(serviceSupabase, request, {
      user,
      profile,
      action: "failed_user_password_change",
      metadata: { target_user_id: targetUserId, reason: "profile_not_found" },
    });
    return NextResponse.json({ error: "CRM user not found" }, { status: 404 });
  }

  const { error: authError } = await serviceSupabase.auth.admin.updateUserById(targetUserId, {
    password,
  });

  if (authError) {
    await audit(serviceSupabase, request, {
      user,
      profile,
      action: "failed_user_password_change",
      entityId: targetUserId,
      metadata: { reason: authError.message, target_email: targetProfile.email },
    });
    return NextResponse.json({ error: authError.message || "Password change failed" }, { status: 400 });
  }

  await serviceSupabase
    .from("profiles")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", targetUserId);

  await audit(serviceSupabase, request, {
    user,
    profile,
    action: "user_password_changed",
    entityId: targetUserId,
    metadata: {
      target_email: targetProfile.email,
      target_role: targetProfile.role,
    },
  });

  return NextResponse.json({
    user: {
      id: targetUserId,
      full_name: targetProfile.full_name || targetProfile.name || targetProfile.email || "CRM User",
      email: targetProfile.email,
      role: targetProfile.role,
    },
  }, { status: 200 });
}

export async function DELETE(request) {
  const body = await request.json();
  const access = await assertProvisioningAccess(request, body.provisioning_secret);

  if (access.error) return access.error;

  const { serviceSupabase, user, profile } = access;
  if (!serviceSupabase) {
    return NextResponse.json({ error: "Supabase service role key is not configured" }, { status: 503 });
  }

  const targetUserId = String(body.user_id || "").trim();

  if (!validUuid(targetUserId)) {
    return NextResponse.json({ error: "Select a valid CRM user" }, { status: 400 });
  }

  if (user?.id === targetUserId) {
    return NextResponse.json({ error: "You cannot delete the currently signed-in user from this panel" }, { status: 400 });
  }

  const { data: targetProfile, error: targetProfileError } = await getTargetProfile(serviceSupabase, targetUserId);

  if (targetProfileError) {
    return NextResponse.json({ error: targetProfileError.message }, { status: 500 });
  }

  if (!targetProfile) {
    await audit(serviceSupabase, request, {
      user,
      profile,
      action: "failed_user_delete",
      metadata: { target_user_id: targetUserId, reason: "profile_not_found" },
    });
    return NextResponse.json({ error: "CRM user not found" }, { status: 404 });
  }

  const { error: authDeleteError } = await serviceSupabase.auth.admin.deleteUser(targetUserId);

  if (authDeleteError) {
    await audit(serviceSupabase, request, {
      user,
      profile,
      action: "failed_user_delete",
      entityId: targetUserId,
      metadata: { reason: authDeleteError.message, target_email: targetProfile.email },
    });
    return NextResponse.json({ error: authDeleteError.message || "User deletion failed" }, { status: 400 });
  }

  await serviceSupabase.from("profiles").delete().eq("id", targetUserId);

  await audit(serviceSupabase, request, {
    user,
    profile,
    action: "user_deleted",
    entityId: targetUserId,
    oldValue: targetProfile,
  });

  return NextResponse.json({
    deleted_user: {
      id: targetUserId,
      full_name: targetProfile.full_name || targetProfile.name || targetProfile.email || "CRM User",
      email: targetProfile.email,
      role: targetProfile.role,
    },
  }, { status: 200 });
}
