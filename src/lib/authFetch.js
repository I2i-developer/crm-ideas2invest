import { supabase } from "@/lib/supabaseClient";

export async function authFetch(input, init = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

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
