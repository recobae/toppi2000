import type { SupabaseClient } from "@supabase/supabase-js";
import { suggestUsernameFromEmail, withRandomSuffix } from "@/lib/username";
import { followSystemAccount, autoFollowAllExistingProfiles } from "@/lib/system-profile";
import { TEST_PHASE_AUTO_FOLLOW_ALL_ENABLED } from "@/lib/feature-flags";

export const DEFAULT_POST_AUTH_PATH = "/search";
export const ONBOARDING_PATH = "/onboarding";
const USERNAME_COLLISION_ATTEMPTS = 5;

export type EnsureUsernameResult = {
  username: string;
  /** True only the moment the profiles row itself is first created. */
  isNewProfile: boolean;
};

/**
 * Guarantees the user has a profiles.username, auto-generating one from
 * their email's local part (with a random numeric suffix on collision) the
 * first time they're seen. Returns the (existing or newly created) username,
 * plus whether this call is the one that actually created the profile row --
 * used to gate one-time-only signup side effects (auto-follow, onboarding).
 */
export async function ensureUsername(
  supabase: SupabaseClient,
  userId: string,
): Promise<EnsureUsernameResult> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.username) return { username: profile.username, isNewProfile: false };

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

  return { username: candidate, isNewProfile: true };
}

/**
 * Used after login: ensures a username exists, then sends the user to Für
 * Dich -- the same canonical landing tab app/page.tsx already uses for
 * returning logged-in visitors (Lohnt-sich-Umbau: previously routed to
 * /swipe→/my-taste instead, a second, different "zero-effort" destination
 * that disagreed with the homepage) -- unless `next` points somewhere more
 * specific (e.g. a shared list link).
 */
export async function resolvePostAuthPath(
  supabase: SupabaseClient,
  userId: string,
  next: string,
): Promise<string> {
  await ensureUsername(supabase, userId);
  if (next === DEFAULT_POST_AUTH_PATH) return "/fuer-dich";
  return next;
}

/**
 * Used after signup/email-confirmation and the OAuth callback: ensures a
 * username exists, then sends the user to Für Dich -- the same canonical
 * landing tab used everywhere else post-login -- unless `next` points
 * somewhere more specific (e.g. a shared list they signed up from).
 *
 * On a genuinely brand-new (non-system) profile, this is also the one-time
 * hook for the signup side effects: auto-following the curated content
 * system account, the testphase auto-follow-all-existing-profiles bypass
 * (feature-flagged, see TEST_PHASE_AUTO_FOLLOW_ALL_ENABLED), and routing
 * through /onboarding instead of straight into the deck. `onboarding_completed`
 * itself is only flipped by the onboarding
 * page once the user actually reaches it (see app/onboarding/page.tsx) --
 * this function only decides where to send them.
 */
export async function resolveSignupRedirectPath(
  supabase: SupabaseClient,
  userId: string,
  next: string,
): Promise<string> {
  const { isNewProfile } = await ensureUsername(supabase, userId);
  if (next !== DEFAULT_POST_AUTH_PATH) return next;

  if (isNewProfile) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_system_account, onboarding_completed")
      .eq("id", userId)
      .maybeSingle();

    if (profile && !profile.is_system_account) {
      await followSystemAccount(supabase, userId);
      // TESTPHASE ONLY -- see TEST_PHASE_AUTO_FOLLOW_ALL_ENABLED's doc
      // comment. Must be gated off before production launch.
      if (TEST_PHASE_AUTO_FOLLOW_ALL_ENABLED) {
        await autoFollowAllExistingProfiles(supabase, userId);
      }
      if (!profile.onboarding_completed) {
        return ONBOARDING_PATH;
      }
    }
  }

  return "/fuer-dich";
}
