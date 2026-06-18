export const ROLES = {
  ADMIN: "admin",
  OPERATIONS: "operations",
};

export const DOCUMENT_LOCKED_STATUSES = ["Verified", "Exception approved"];

export async function getAuthContext(supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, profile: null, role: null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, name")
    .eq("id", user.id)
    .maybeSingle();

  return {
    user,
    profile,
    role: profile?.role || null,
  };
}

export function isAdmin(role) {
  return role === ROLES.ADMIN;
}

export function isOperations(role) {
  return role === ROLES.OPERATIONS;
}

export function canManageClients(role) {
  return isAdmin(role);
}

export function canManageUsers(role) {
  return isAdmin(role);
}

export async function canAccessClient(supabase, userId, role, clientId) {
  if (!userId || !clientId) return false;
  if (isAdmin(role)) return true;
  if (!isOperations(role)) return false;

  // Operations users need to preview and inspect client documents from
  // operational queues even when ownership is not explicitly assigned yet.
  return true;
}

export async function canUploadClientDocument(supabase, userId, role, clientId) {
  if (isAdmin(role)) return true;
  if (!isOperations(role)) return false;
  return canAccessClient(supabase, userId, role, clientId);
}

export function canDeleteClientDocument(role) {
  return isAdmin(role);
}

export function canVerifyClientDocument(role) {
  return isAdmin(role);
}

export function canReplaceDocument(role, existingDocument) {
  if (isAdmin(role)) return true;
  if (!isOperations(role)) return false;
  return !DOCUMENT_LOCKED_STATUSES.includes(existingDocument?.status);
}
