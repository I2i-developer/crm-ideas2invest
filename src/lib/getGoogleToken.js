import { supabase } from "./supabaseClient";

export async function getGoogleAccessToken() {
  const { data: sessionData } = await supabase.auth.getSession();

  const providerToken = sessionData?.session?.provider_token;

  if (!providerToken) {
    throw new Error("Google token not found. Please login again.");
  }

  return providerToken;
}