import { MapPin, Star, type LucideIcon } from "lucide-react";
import { movieListHref, type SavedCategory } from "@/lib/categories";

// Central, extensible mapping of "expertise" categories a user can be known
// for -- e.g. "Kuzi is my movie guy". Only the FollowingBar avatar corner
// badge (ExpertiseCornerBadge) still uses this -- the profile page's own
// category/Orte rows show the tiered Kenner/Experte badges from
// lib/expertise-tiers.ts instead (Design-Iteration 2, Punkt 3).
export type ExpertiseLabelDefinition = {
  key: string;
  label: string;
  href: string;
};

type StaticExpertiseLabelDefinition = {
  key: string;
  label: string;
  sourceCategory: SavedCategory;
  minItems: number;
};

export const EXPERTISE_LABELS: StaticExpertiseLabelDefinition[] = [
  {
    key: "movies_shows",
    label: "Filme & Serien",
    sourceCategory: "top_list",
    minItems: 1,
  },
];

/**
 * Labels are derived live from list item counts, never stored -- a user
 * qualifies the moment their list crosses the threshold and loses the label
 * the moment it doesn't, with no backfill or sync step required.
 */
export function resolveEarnedExpertiseLabels(
  itemCountByCategory: Partial<Record<SavedCategory, number>>,
  username: string,
): ExpertiseLabelDefinition[] {
  return EXPERTISE_LABELS.filter(
    (definition) =>
      (itemCountByCategory[definition.sourceCategory] ?? 0) >=
      definition.minItems,
  ).map((definition) => ({
    key: definition.key,
    label: definition.label,
    // "movies_shows" is the only static label today and always points at
    // the merged Empfohlen+Watchlist view now, not the (redirecting)
    // standalone top_list route.
    href: definition.sourceCategory === "top_list" ? movieListHref(username) : `/u/${username}/${definition.sourceCategory}`,
  }));
}

const PLACES_KEY_PREFIX = "places:";

/** Compact icon per label, used for tight spaces (e.g. the following-bar avatar corner badge). */
export function getExpertiseIcon(key: string): LucideIcon {
  if (key.startsWith(PLACES_KEY_PREFIX)) return MapPin;
  return Star;
}
