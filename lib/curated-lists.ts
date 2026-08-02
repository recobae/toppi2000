import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A curated place_regions row (is_curated = true) ready to render as a
 * ListOverviewRow -- the same "list-of-lists" shape/row component used
 * everywhere else in the app (profile Orte tiles, onboarding picker,
 * Inspiration's curated section). Two-step id-then-profiles lookup, same
 * pattern as the rest of the codebase, rather than a relational embed.
 */
export type CuratedListPreview = {
  key: string;
  name: string;
  ownerUsername: string;
  photoUrls: string[];
  itemCount: number;
  noteCount: number;
  savedCount: number;
};

export async function getCuratedLists(
  supabase: SupabaseClient,
  { featuredOnboardingOnly = false }: { featuredOnboardingOnly?: boolean } = {},
): Promise<CuratedListPreview[]> {
  let query = supabase
    .from("place_regions")
    .select("id, region_name, region_key, user_id")
    .eq("is_curated", true)
    .order("created_at", { ascending: true });

  if (featuredOnboardingOnly) {
    query = query.eq("is_featured_onboarding", true);
  }

  const { data: regionRows } = await query;
  if (!regionRows || regionRows.length === 0) return [];

  const ownerIds = [...new Set(regionRows.map((region) => region.user_id))];
  const { data: owners } = await supabase
    .from("profiles")
    .select("id, username")
    .in("id", ownerIds);
  const usernameByOwnerId = new Map((owners ?? []).map((owner) => [owner.id, owner.username]));

  const previews = await Promise.all(
    regionRows.map(async (region) => {
      const [{ data: previewRows }, { count }, { count: noteCount }, { count: savedCount }] =
        await Promise.all([
          supabase
            .from("places")
            .select("photo_url")
            .eq("region_id", region.id)
            .order("position", { ascending: true })
            .limit(4),
          supabase
            .from("places")
            .select("id", { count: "exact", head: true })
            .eq("region_id", region.id),
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
        ownerUsername: usernameByOwnerId.get(region.user_id) ?? "",
        photoUrls: (previewRows ?? [])
          .map((row) => row.photo_url)
          .filter((url): url is string => !!url),
        itemCount: count ?? 0,
        noteCount: noteCount ?? 0,
        savedCount: savedCount ?? 0,
      };
    }),
  );

  // A curated list a system account hasn't populated yet must not appear in
  // the onboarding picker or the Inspiration section -- both surfaces exist
  // specifically to hand a new user something to interact with immediately.
  return previews.filter((preview) => preview.itemCount > 0);
}
