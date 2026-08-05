import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The curated-content account every new user auto-follows (and is
 * auto-followed back by) on signup. Resolved by username at call time,
 * never hardcoded as a user id -- keeps working even if the account is
 * ever recreated.
 */
export const SYSTEM_ACCOUNT_USERNAME = "tomatotomato";

const UNIQUE_VIOLATION_CODE = "23505";

async function insertFollow(supabase: SupabaseClient, followerId: string, followedId: string) {
  const { error } = await supabase
    .from("user_follows")
    .insert({ follower_id: followerId, followed_id: followedId });
  // Already following is not a failure -- matches app/api/follows/route.ts's
  // handling of the same unique constraint.
  if (error && error.code !== UNIQUE_VIOLATION_CODE) return error;
  return null;
}

/**
 * Bidirectional auto-follow between a brand-new user and the system
 * account, run once at signup (see resolveSignupRedirectPath). A missing or
 * misconfigured system account (or a write failure) is logged, never
 * thrown -- this is a supplementary signup side effect and must never block
 * the user from reaching their new profile.
 */
export async function followSystemAccount(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data: systemProfile, error: lookupError } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", SYSTEM_ACCOUNT_USERNAME)
    .maybeSingle();

  if (lookupError) {
    console.error("system account lookup failed", lookupError);
    return;
  }
  if (!systemProfile || systemProfile.id === userId) return;

  const [followError, followBackError] = await Promise.all([
    insertFollow(supabase, userId, systemProfile.id),
    insertFollow(supabase, systemProfile.id, userId),
  ]);

  if (followError) console.error("auto-follow of system account failed", followError);
  if (followBackError) console.error("system account auto-follow-back failed", followBackError);
}

/**
 * TESTPHASE ONLY (see lib/feature-flags.ts's TEST_PHASE_AUTO_FOLLOW_ALL_ENABLED
 * for the production-launch TODO): bidirectionally follows -- and is
 * followed back by -- every other existing profile, run once at signup
 * alongside followSystemAccount. Same fire-and-forget error handling: a
 * partial failure here must never block the user from reaching their new
 * profile.
 */
export async function autoFollowAllExistingProfiles(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { data: otherProfiles, error } = await supabase
    .from("profiles")
    .select("id")
    .neq("id", userId);

  if (error) {
    console.error("test-phase auto-follow-all lookup failed", error);
    return;
  }
  if (!otherProfiles || otherProfiles.length === 0) return;

  const results = await Promise.all(
    otherProfiles.flatMap((other) => [
      insertFollow(supabase, userId, other.id),
      insertFollow(supabase, other.id, userId),
    ]),
  );

  const firstError = results.find((result) => result !== null);
  if (firstError) console.error("test-phase auto-follow-all failed for one or more pairs", firstError);
}
