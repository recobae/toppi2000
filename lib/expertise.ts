import { MapPin, Star, type LucideIcon } from "lucide-react";
import type { SavedCategory } from "@/lib/categories";
import { PLACES_EXPERTISE_MIN_ITEMS } from "@/lib/places";

// Central, extensible mapping of "expertise" categories a user can be known
// for -- e.g. "Kuzi is my movie guy". Two flavors of source exist:
// - static, fixed-key labels (Filme & Serien, sourced from top_list)
// - dynamic, per-region labels (Orte, one label per region a user has
//   enough saved places in -- there's no fixed set of these, so they're
//   resolved separately via resolvePlaceExpertiseLabels instead of a fixed
//   config entry). Both shapes share the same ExpertiseLabelDefinition, so
// display components never need to know which kind they're rendering.
export type ExpertiseLabelDefinition = {
  key: string;
  label: string;
};

type StaticExpertiseLabelDefinition = ExpertiseLabelDefinition & {
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
): ExpertiseLabelDefinition[] {
  return EXPERTISE_LABELS.filter(
    (definition) =>
      (itemCountByCategory[definition.sourceCategory] ?? 0) >=
      definition.minItems,
  );
}

const PLACES_KEY_PREFIX = "places:";

/**
 * Orte expertise is region-based and dynamic (there's no fixed list of
 * regions), so labels are generated on the fly, one per region that's
 * crossed the (deliberately higher) place-count threshold -- unlike
 * Filme & Serien, a single saved restaurant doesn't make someone "the
 * Düsseldorf expert" yet.
 */
export function resolvePlaceExpertiseLabels(
  regions: { key: string; name: string; itemCount: number }[],
): ExpertiseLabelDefinition[] {
  return regions
    .filter((region) => region.itemCount >= PLACES_EXPERTISE_MIN_ITEMS)
    .map((region) => ({
      key: `${PLACES_KEY_PREFIX}${region.key}`,
      label: region.name,
    }));
}

/** Compact icon per label, used for tight spaces (e.g. the following-bar avatar corner badge). */
export function getExpertiseIcon(key: string): LucideIcon {
  if (key.startsWith(PLACES_KEY_PREFIX)) return MapPin;
  return Star;
}
