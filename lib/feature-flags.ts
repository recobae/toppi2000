// Google OAuth is fully implemented (see components/login-form.tsx,
// components/sign-up-form.tsx, app/auth/callback/route.ts) but hidden until
// the Google Cloud Console / Supabase provider setup is finalized. Flip this
// to true to re-enable the "Mit Google anmelden/registrieren" button.
export const GOOGLE_LOGIN_ENABLED = false;

// The Story feature (components/profile/story-viewer.tsx and the story ring
// around profile avatars) is fully implemented but its avatar "slot" was
// handed to the favorite-song-snippet feature instead, to avoid two
// competing tap behaviors on the same element. Code stays in place -- flip
// this back to true to restore it (also re-enables app/api/story-updates).
export const STORY_FEATURE_ENABLED = false;

// TESTPHASE ONLY: every brand-new signup auto-follows, and is auto-followed
// back by, every existing profile (see lib/system-profile.ts's
// autoFollowAllExistingProfiles, wired into lib/auth-redirect.ts's
// resolveSignupRedirectPath) -- makes the follower/recommendation-network
// features look populated while the user base is still small and everyone
// testing already knows each other.
//
// TODO (production launch checklist): flip this to false before opening
// signups to the public. In production a follow must be a deliberate,
// confirmed action (or at least a real one-directional follow the followed
// user can see and revoke) -- silently bidirectionally auto-following every
// stranger who ever signs up is a testphase-only shortcut, not a real
// feature. Nothing else needs to change in code: the gate below is the only
// place this needs to be turned off.
export const TEST_PHASE_AUTO_FOLLOW_ALL_ENABLED = true;
