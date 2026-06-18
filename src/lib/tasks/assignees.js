import { createClient as createSupabaseServiceClient } from "@supabase/supabase-js";

export function createTaskServiceClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  return createSupabaseServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

export function getTaskDataClient(supabase) {
  return createTaskServiceClient() || supabase;
}

function isAssignableProfile(profile) {
  const role = String(profile.role || "").trim().toLowerCase();
  const status = String(profile.status || "Active").trim().toLowerCase();

  return ["admin", "operations"].includes(role) && profile.is_active !== false && status !== "inactive";
}

function displayName(profile) {
  return profile.name || profile.full_name || profile.email || "Unnamed User";
}

async function keepProfilesWithAuthUsers(serviceClient, profiles) {
  if (!serviceClient) return profiles;

  const checks = await Promise.all(
    profiles.map(async (profile) => {
      const { data, error } = await serviceClient.auth.admin.getUserById(profile.id);
      return !error && data?.user ? profile : null;
    })
  );

  return checks.filter(Boolean);
}

export async function listAssignableTaskUsers(supabase) {
  const serviceClient = createTaskServiceClient();
  const readClient = serviceClient || supabase;
  const { data, error } = await readClient
    .from("profiles")
    .select("id, name, full_name, email, designation, role, is_active, status")
    .order("name", { ascending: true, nullsFirst: false });

  if (error) throw new Error(error.message);

  const assignableProfiles = (data || []).filter(isAssignableProfile);
  const profilesWithAuthUsers = await keepProfilesWithAuthUsers(serviceClient, assignableProfiles);

  return profilesWithAuthUsers
    .map((profile) => ({
      ...profile,
      role: String(profile.role || "").trim().toLowerCase(),
      name: displayName(profile),
    }))
    .sort((a, b) => displayName(a).localeCompare(displayName(b)));
}

export async function getValidTaskAssigneeIds(supabase, assigneeIds = []) {
  const uniqueIds = [...new Set((Array.isArray(assigneeIds) ? assigneeIds : []).filter(Boolean))];

  if (uniqueIds.length === 0) return [];

  const serviceClient = createTaskServiceClient();
  const readClient = serviceClient || supabase;
  const { data, error } = await readClient
    .from("profiles")
    .select("id, role, is_active, status")
    .in("id", uniqueIds);

  if (error) throw new Error(error.message);

  const validProfiles = (data || []).filter(isAssignableProfile);
  const profilesWithAuthUsers = await keepProfilesWithAuthUsers(serviceClient, validProfiles);
  const validIds = profilesWithAuthUsers.map((profile) => profile.id);

  if (validIds.length !== uniqueIds.length) {
    throw new Error("Assign To contains a CRM profile that is inactive, invalid, or not linked to a Supabase Auth user");
  }

  return validIds;
}
