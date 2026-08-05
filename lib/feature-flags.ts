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

// Was TESTPHASE ONLY: every brand-new signup used to auto-follow, and be
// auto-followed back by, every existing profile -- made the social graph
// look dense while the user base was still tiny. Turned off deliberately
// (Master-Audit round): the whole point of the follow-based discovery score
// (lib/discovery.ts) is untested against a REAL, sparse graph as long as
// this stays on. New signups now only auto-follow the curated system
// account (lib/system-profile.ts's followSystemAccount, unaffected by this
// flag) -- everything else is a real, deliberate follow from here on.
export const TEST_PHASE_AUTO_FOLLOW_ALL_ENABLED = false;
