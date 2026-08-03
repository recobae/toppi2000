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
