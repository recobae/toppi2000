import type { SupabaseClient } from "@supabase/supabase-js";
import { MapPin, Star, type LucideIcon } from "lucide-react";
import { MOVIE_LIST_LABEL, VISIBLE_SAVED_CATEGORIES, movieListHref } from "@/lib/categories";
import {
  resolveExpertiseTier,
  tierProgressLabel,
  CONTENT_TIER_THRESHOLDS,
  PLACE_TIER_THRESHOLDS,
  type ExpertiseTier,
} from "@/lib/expertise-tiers";

export type ListOverviewRowData = {
  key: string;
  title: string;
  icon: LucideIcon;
  preview: { type: "stack" | "collage"; urls: string[] };
  itemCount: number;
  noteCount: number;
  savedCount: number | undefined;
  href: string;
  tier: ExpertiseTier;
  tierProgress: string | null;
  isCurrentLocation: boolean;
  statsText: string | undefined;
  hasTip: boolean;
};

/**
 * The "kuratierte Listen" grid (Filme & Serien + every Orte-region) --
 * shared between a foreign profile visit (app/u/[username]/page.tsx) and
 * the owner's own My Taste tab (app/my-taste/page.tsx), which is where this
 * grid moved to for the owner (the profile itself stays lists-free now).
 * `showTierProgress` mirrors the old `isOwner` ternary: only the owner ever
 * sees "42/60 bis Experte" progress text, a visitor just sees the tier badge.
 */
export async function getListOverviewData(
  supabase: SupabaseClient,
  params: { userId: string; username: string; homeCity: string | null; showTierProgress: boolean },
): Promise<{ rows: ListOverviewRowData[]; movieListItemCount: number; totalPlacesCount: number }> {
  const { userId, username, homeCity, showTierProgress } = params;

  const previewByCategory = await Promise.all(
    VISIBLE_SAVED_CATEGORIES.map(async (category) => {
      let previewQuery = supabase.from(category).select("image_url").eq("user_id", userId);
      previewQuery =
        category === "top_list"
          ? previewQuery
              .order("is_favorite", { ascending: false })
              .order("favorited_at", { ascending: false, nullsFirst: false })
              .order("created_at", { ascending: false })
          : previewQuery.order("position", { ascending: true });

      const [{ data: previewRows }, { count }, { count: noteCount }] = await Promise.all([
        previewQuery.limit(4),
        supabase.from(category).select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabase
          .from(category)
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .not("note", "is", null),
      ]);

      return {
        category,
        posterUrls: (previewRows ?? []).map((row) => row.image_url).filter((url): url is string => !!url),
        itemCount: count ?? 0,
        noteCount: noteCount ?? 0,
      };
    }),
  );

  const topListPreview = previewByCategory.find((p) => p.category === "top_list");
  const watchlistPreview = previewByCategory.find((p) => p.category === "watchlist");
  const movieListItemCount = (topListPreview?.itemCount ?? 0) + (watchlistPreview?.itemCount ?? 0);
  const movieListNoteCount = (topListPreview?.noteCount ?? 0) + (watchlistPreview?.noteCount ?? 0);
  const movieListPosterUrls = [
    ...(topListPreview?.posterUrls ?? []),
    ...(watchlistPreview?.posterUrls ?? []),
  ].slice(0, 4);

  const [{ count: moviesRecommendedCount }, { count: seriesRecommendedCount }] = await Promise.all([
    supabase
      .from("top_list")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("media_type", "movie"),
    supabase
      .from("top_list")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("media_type", "tv"),
  ]);
  const movieListStatsText = [
    `${moviesRecommendedCount ?? 0} Filme empfohlen`,
    `${seriesRecommendedCount ?? 0} Serien empfohlen`,
    ...(movieListNoteCount > 0 ? [`${movieListNoteCount} mit Notiz`] : []),
    ...((watchlistPreview?.itemCount ?? 0) > 0 ? [`${watchlistPreview?.itemCount} gemerkt`] : []),
  ].join(" · ");

  const { data: regionRows } = await supabase
    .from("place_regions")
    .select("id, region_name, region_key, general_note")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  const allRegions = await Promise.all(
    (regionRows ?? []).map(async (region) => {
      const [{ data: previewRows }, { count }, { count: noteCount }, { count: savedCount }] = await Promise.all([
        supabase
          .from("places")
          .select("photo_url")
          .eq("region_id", region.id)
          .order("position", { ascending: true })
          .limit(4),
        supabase.from("places").select("id", { count: "exact", head: true }).eq("region_id", region.id),
        supabase
          .from("places")
          .select("id", { count: "exact", head: true })
          .eq("region_id", region.id)
          .not("note", "is", null),
        supabase
          .from("places")
          .select("id", { count: "exact", head: true })
          .eq("region_id", region.id)
          .eq("status", "want_to_visit"),
      ]);

      return {
        key: region.region_key,
        name: region.region_name,
        photoUrls: (previewRows ?? []).map((row) => row.photo_url).filter((url): url is string => !!url),
        itemCount: count ?? 0,
        noteCount: noteCount ?? 0,
        savedCount: savedCount ?? 0,
        hasTip: !!region.general_note,
      };
    }),
  );

  // A region list auto-empties out of the overview once its last place is
  // removed, instead of lingering as a dead 0-item row.
  const regions = allRegions.filter((region) => region.itemCount > 0);
  const totalPlacesCount = allRegions.reduce((sum, region) => sum + region.itemCount, 0);

  const rows: ListOverviewRowData[] = [
    {
      key: "movies",
      title: MOVIE_LIST_LABEL,
      icon: Star,
      preview: { type: "stack" as const, urls: movieListPosterUrls },
      itemCount: movieListItemCount,
      noteCount: movieListNoteCount,
      savedCount: undefined,
      href: movieListHref(username),
      tier: resolveExpertiseTier(movieListItemCount, CONTENT_TIER_THRESHOLDS),
      tierProgress: showTierProgress ? tierProgressLabel(movieListItemCount, CONTENT_TIER_THRESHOLDS) : null,
      isCurrentLocation: false,
      statsText: movieListStatsText,
      hasTip: false,
    },
    ...regions.map((region) => ({
      key: region.key,
      title: region.name,
      icon: MapPin,
      preview: { type: "collage" as const, urls: region.photoUrls },
      itemCount: region.itemCount,
      noteCount: region.noteCount,
      savedCount: region.savedCount,
      href: `/u/${username}/orte/${region.key}`,
      tier: resolveExpertiseTier(region.itemCount, PLACE_TIER_THRESHOLDS),
      tierProgress: showTierProgress ? tierProgressLabel(region.itemCount, PLACE_TIER_THRESHOLDS) : null,
      isCurrentLocation: region.name === homeCity,
      statsText: undefined as string | undefined,
      hasTip: region.hasTip,
    })),
  ].sort((a, b) => b.itemCount - a.itemCount);

  return { rows, movieListItemCount, totalPlacesCount };
}
