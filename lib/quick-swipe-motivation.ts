import type { SupabaseClient } from "@supabase/supabase-js";
import { getTasteContext } from "@/lib/quick-swipe-context";
import { getTodayInteractionCount } from "@/lib/interactions";

const TODAY_MINIMUM_THRESHOLD = 3;
const REGION_ITEM_THRESHOLD = 3;
const GENRE_LIKE_THRESHOLD = 3;

/**
 * One short, honest line above the Quick-Swipe card -- never a stock
 * phrase. Every branch here reads a real number computed for this request;
 * if none of them clear their threshold, this returns null and the UI shows
 * nothing rather than a fabricated "dein Feed wird genauer" (Master-Audit
 * round: "keine Fake-Motivation"). The numeric daily count itself is NOT
 * shown here anymore -- it moved to a one-time toast on leaving My Taste
 * (components/nav/daily-stats-toast.tsx), since a static on-screen number
 * that never updates mid-session was misleading. Priority: a real
 * list-based context (own region, own genre profile) first, then a soft
 * fallback that still requires at least minimal real activity this session.
 */
export async function getQuickSwipeMotivation(
  supabase: SupabaseClient,
  userId: string,
  tmdbApiKey: string | undefined,
): Promise<string | null> {
  const [todayCount, context] = await Promise.all([
    getTodayInteractionCount(supabase, userId),
    getTasteContext(supabase, userId, tmdbApiKey),
  ]);

  const topRegion = context.topRegions[0];
  if (topRegion && topRegion.itemCount >= REGION_ITEM_THRESHOLD) {
    return `Du hast bereits ${topRegion.itemCount} Orte in ${topRegion.name} gesammelt — entdecke weitere Vorschläge für ${topRegion.name}.`;
  }

  const topGenre = context.topGenreLabels[0];
  if (topGenre && context.movieLikeCount >= GENRE_LIKE_THRESHOLD) {
    return `Du bewertest gerade viele ${topGenre}.`;
  }

  if (todayCount >= TODAY_MINIMUM_THRESHOLD) {
    return "Dein Geschmack wird klarer.";
  }

  return null;
}
