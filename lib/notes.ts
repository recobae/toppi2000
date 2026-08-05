import type { SupabaseClient } from "@supabase/supabase-js";
import type { SavedCategory } from "@/lib/categories";

// A recommendation note is category-agnostic: it lives as a plain "note"
// column on whichever list-entry table the item belongs to (top_list,
// watchlist, dont_watch today; any future category table follows the same
// shape and gets note support the same way, with no changes here).
export const NOTE_MAX_LENGTH = 150;

// General region-level tip ("wo man in Bali am besten Roller leiht" etc.) --
// one per place_regions row, not tied to a single item, so it gets more room
// than a per-item note.
export const REGION_NOTE_MAX_LENGTH = 500;

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

// Same field, different prompt per category -- what's worth noting about a
// Top-Liste pick isn't the same as what's worth noting about an Overrated
// pick. Used both when the field appears at add-time and when editing later.
export const NOTE_PLACEHOLDERS: Record<SavedCategory, string> = {
  top_list: "Teile, was du daran besonders gut findest",
  dont_watch: "Was nervt dich daran am meisten?",
  watchlist: "Was erwartest Du?",
};

// Every category shows the optional note prompt right after adding --
// consistent behavior across Empfohlen/Watchlist/Orte, skippable but always
// offered.
export const SKIP_ADD_NOTE_PROMPT: SavedCategory[] = [];

export function truncateNote(note: string, maxLength = 48): string {
  const trimmed = note.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trimEnd()}…`;
}
