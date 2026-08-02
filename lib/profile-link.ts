import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolves which profile a page's "Zum Profil" link should point back to.
 * Always the current viewer's own profile when logged in -- never the
 * profile of whichever list happens to be on screen (e.g. a curated
 * TomatoTomato list reached via onboarding) -- falling back to the list's
 * own owner only for guests, who have no profile of their own to link to.
 */
export async function resolveBackToOwnProfileUsername(
  supabase: SupabaseClient,
  viewer: { id: string } | null,
  isOwner: boolean,
  fallbackUsername: string,
): Promise<string> {
  if (isOwner || !viewer) return fallbackUsername;

  const { data } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", viewer.id)
    .maybeSingle();

  return data?.username ?? fallbackUsername;
}
