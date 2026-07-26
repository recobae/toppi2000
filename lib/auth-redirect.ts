import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_POST_AUTH_PATH = "/search";

export async function resolvePostAuthPath(
  supabase: SupabaseClient,
  userId: string,
  next: string,
): Promise<string> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.username) {
    return `/onboarding?next=${encodeURIComponent(next)}`;
  }

  return next;
}
