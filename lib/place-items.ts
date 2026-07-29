import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeRegionKey, type PlaceCategory, type PlacePriceLevel } from "@/lib/places";
import type { OpeningPeriod } from "@/lib/opening-hours";

export type SavablePlace = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: PlaceCategory;
  photoUrl: string | null;
  googleMapsUri?: string | null;
  rating?: number | null;
  userRatingCount?: number | null;
  priceLevel?: PlacePriceLevel | null;
  phoneNumber?: string | null;
  websiteUri?: string | null;
  openingPeriods?: OpeningPeriod[] | null;
  utcOffsetMinutes?: number | null;
};

export type SavePlaceResult = {
  error: { message: string } | null;
  regionId?: string;
  regionName?: string;
  regionItemCount?: number;
};

/**
 * Saves a place, auto-creating (find-or-create, keyed by the normalized
 * region name) the region list it belongs to. Mirrors saveToCategory's
 * "new items on top" ranking, scoped per region.
 */
export async function savePlaceToRegion(
  supabase: SupabaseClient,
  userId: string,
  regionName: string,
  place: SavablePlace,
  adoptedFrom?: string | null,
): Promise<SavePlaceResult> {
  const regionKey = normalizeRegionKey(regionName);

  const { data: existingRegion } = await supabase
    .from("place_regions")
    .select("id")
    .eq("user_id", userId)
    .eq("region_key", regionKey)
    .maybeSingle();

  let regionId: string;
  if (existingRegion) {
    regionId = existingRegion.id;
  } else {
    const { data: inserted, error: insertRegionError } = await supabase
      .from("place_regions")
      .insert({ user_id: userId, region_name: regionName, region_key: regionKey })
      .select("id")
      .single();
    if (insertRegionError || !inserted) {
      return { error: insertRegionError };
    }
    regionId = inserted.id;
  }

  const { data: topRow } = await supabase
    .from("places")
    .select("position")
    .eq("user_id", userId)
    .eq("region_id", regionId)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  const nextPosition = (topRow?.position ?? 0) - 1;

  const { error } = await supabase.from("places").upsert(
    {
      user_id: userId,
      region_id: regionId,
      google_place_id: place.placeId,
      name: place.name,
      address: place.address,
      lat: place.lat,
      lng: place.lng,
      places_category: place.category,
      photo_url: place.photoUrl,
      google_maps_uri: place.googleMapsUri ?? null,
      rating: place.rating ?? null,
      user_rating_count: place.userRatingCount ?? null,
      price_level: place.priceLevel ?? null,
      phone_number: place.phoneNumber ?? null,
      website_uri: place.websiteUri ?? null,
      opening_periods: place.openingPeriods ?? null,
      utc_offset_minutes: place.utcOffsetMinutes ?? null,
      position: nextPosition,
      ...(adoptedFrom ? { adopted_from: adoptedFrom } : {}),
    },
    { onConflict: "user_id,google_place_id" },
  );

  if (error) return { error };

  const { count } = await supabase
    .from("places")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("region_id", regionId);

  return {
    error: null,
    regionId,
    regionName,
    regionItemCount: count ?? undefined,
  };
}

export async function removePlace(
  supabase: SupabaseClient,
  userId: string,
  googlePlaceId: string,
) {
  return supabase
    .from("places")
    .delete()
    .eq("user_id", userId)
    .eq("google_place_id", googlePlaceId);
}

export async function updatePlaceNote(
  supabase: SupabaseClient,
  userId: string,
  googlePlaceId: string,
  note: string | null,
) {
  return supabase
    .from("places")
    .update({ note })
    .eq("user_id", userId)
    .eq("google_place_id", googlePlaceId);
}
