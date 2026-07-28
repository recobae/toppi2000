import type { SupabaseClient } from "@supabase/supabase-js";

// A recommendation note is category-agnostic: it lives as a plain "note"
// column on whichever list-entry table the item belongs to (top_list,
// watchlist, dont_watch today; any future category table follows the same
// shape and gets note support the same way, with no changes here).
export const NOTE_MAX_LENGTH = 150;

export type NotesVisibility = "all" | "followers" | "self";

export const NOTES_VISIBILITY_OPTIONS: {
  value: NotesVisibility;
  label: string;
  description: string;
}[] = [
  {
    value: "all",
    label: "Alle",
    description: "Jeder kann deine Notizen sehen, auch ohne Login.",
  },
  {
    value: "followers",
    label: "Nur Follower",
    description: "Nur eingeloggte Nutzer, die dir folgen.",
  },
  {
    value: "self",
    label: "Nur ich",
    description: "Niemand außer dir sieht deine Notizen.",
  },
];

export function isNotesVisibility(value: string): value is NotesVisibility {
  return ["all", "followers", "self"].includes(value);
}

/**
 * Server-side visibility check -- this is a single global setting today
 * (profiles.notes_visibility), but kept as its own resolver function so a
 * later per-note override column can be checked first here without touching
 * any call site.
 */
export async function canViewOwnerNotes(
  supabase: SupabaseClient,
  params: {
    ownerId: string;
    viewerId: string | null;
    notesVisibility: NotesVisibility;
  },
): Promise<boolean> {
  const { ownerId, viewerId, notesVisibility } = params;

  if (viewerId && viewerId === ownerId) return true;
  if (notesVisibility === "all") return true;
  if (notesVisibility === "self") return false;

  // "followers"
  if (!viewerId) return false;
  const { data } = await supabase
    .from("user_follows")
    .select("id")
    .eq("follower_id", viewerId)
    .eq("followed_id", ownerId)
    .maybeSingle();
  return !!data;
}

export function truncateNote(note: string, maxLength = 48): string {
  const trimmed = note.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trimEnd()}…`;
}
