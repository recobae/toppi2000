import type { SupabaseClient } from "@supabase/supabase-js";
import { suggestUsernameFromEmail, withRandomSuffix } from "@/lib/username";

export const DEFAULT_POST_AUTH_PATH = "/search";
const USERNAME_COLLISION_ATTEMPTS = 5;

/**
 * Guarantees the user has a profiles.username, auto-generating one from
 * their email's local part (with a random numeric suffix on collision) the
 * first time they're seen. Returns the (existing or newly created) username.
 */
export async function ensureUsername(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.username) return profile.username;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? "";

  let candidate = suggestUsernameFromEmail(email);
  for (let attempt = 0; attempt < USERNAME_COLLISION_ATTEMPTS; attempt++) {
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", candidate)
      .maybeSingle();

    if (!existing) break;
    candidate = withRandomSuffix(suggestUsernameFromEmail(email));
  }

  await supabase
    .from("profiles")
    .upsert({ id: userId, username: candidate }, { onConflict: "id" });

  return candidate;
}

/** Used after login: ensures a username exists, then returns `next` unchanged. */
export async function resolvePostAuthPath(
  supabase: SupabaseClient,
  userId: string,
  next: string,
): Promise<string> {
  await ensureUsername(supabase, userId);
  return next;
}

/**
 * Used after signup/email-confirmation and the OAuth callback: ensures a
 * username exists, then sends the user straight to their own profile unless
 * `next` points somewhere more specific (e.g. a shared list they signed up
 * from).
 */
export async function resolveSignupRedirectPath(
  supabase: SupabaseClient,
  userId: string,
  next: string,
): Promise<string> {
  const username = await ensureUsername(supabase, userId);
  if (next === DEFAULT_POST_AUTH_PATH) {
    return `/u/${username}`;
  }
  return next;
}
