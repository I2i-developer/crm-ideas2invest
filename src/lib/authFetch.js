import { supabase } from "@/lib/supabaseClient";

let cachedSession = null;
let cachedSessionAt = 0;
let pendingSession = null;

async function getCachedSession() {
  const now = Date.now();
  const expiresAt = cachedSession?.expires_at ? cachedSession.expires_at * 1000 : 0;
  const cacheValid = cachedSession
    && now - cachedSessionAt < 30_000
    && (!expiresAt || expiresAt - now > 60_000);

  if (cacheValid) return cachedSession;
  if (pendingSession) return pendingSession;

  pendingSession = supabase.auth.getSession()
    .then(({ data }) => {
      cachedSession = data?.session || null;
      cachedSessionAt = Date.now();
      return cachedSession;
    })
    .finally(() => {
      pendingSession = null;
    });

  return pendingSession;
}

supabase.auth.onAuthStateChange((_event, session) => {
  cachedSession = session || null;
  cachedSessionAt = Date.now();
});

export async function authFetch(input, init = {}) {
  const session = await getCachedSession();

  const headers = new Headers(init.headers || {});

  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  return fetch(input, {
    ...init,
    headers,
    credentials: "include",
  });
}
