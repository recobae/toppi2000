import { Star, type LucideIcon } from "lucide-react";
import type { SavedCategory } from "@/lib/categories";

// Central, extensible mapping of "expertise" categories a user can be known
// for -- e.g. "Kuzi is my movie guy". Each entry ties a display label to the
// saved-category list that currently represents it, plus the threshold that
// earns it. Adding a future category (music, places) is just a new entry
// here once that category's data model exists -- no other code needs to
// change, since labels are always resolved through this table.
export type ExpertiseLabelKey = "movies_shows";

export type ExpertiseLabelDefinition = {
  key: ExpertiseLabelKey;
  label: string;
  sourceCategory: SavedCategory;
  minItems: number;
};

export const EXPERTISE_LABELS: ExpertiseLabelDefinition[] = [
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
// Compact icon per label, used for tight spaces (e.g. the following-bar
// avatar corner badge) where the full text label doesn't fit.
export const EXPERTISE_ICONS: Record<ExpertiseLabelKey, LucideIcon> = {
  movies_shows: Star,
};

export function resolveEarnedExpertiseLabels(
  itemCountByCategory: Partial<Record<SavedCategory, number>>,
): ExpertiseLabelDefinition[] {
  return EXPERTISE_LABELS.filter(
    (definition) =>
      (itemCountByCategory[definition.sourceCategory] ?? 0) >=
      definition.minItems,
  );
}
