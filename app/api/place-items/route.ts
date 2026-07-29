import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canViewOwnerNotes, isNotesVisibility } from "@/lib/notes";
import { computeOpeningStatus, type OpeningPeriod } from "@/lib/opening-hours";

export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username");
  const regionKey = request.nextUrl.searchParams.get("region");

  if (!username || !regionKey) {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, notes_visibility")
    .eq("username", username)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  const { data: region } = await supabase
    .from("place_regions")
    .select("id, region_name, region_key")
    .eq("user_id", profile.id)
    .eq("region_key", regionKey)
    .single();

  if (!region) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();
  const isOwner = viewer?.id === profile.id;

  const notesVisibility = isNotesVisibility(profile.notes_visibility)
    ? profile.notes_visibility
    : "all";
  const canViewNotes = await canViewOwnerNotes(supabase, {
    ownerId: profile.id,
    viewerId: viewer?.id ?? null,
    notesVisibility,
  });

  const { data: rows, error } = await supabase
    .from("places")
    .select(
      "id, google_place_id, name, address, lat, lng, places_category, photo_url, note, position, google_maps_uri, rating, user_rating_count, price_level, phone_number, website_uri, opening_periods, utc_offset_minutes",
    )
    .eq("region_id", region.id)
    .order("position", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = (rows ?? []).map((row) => ({
    id: row.id,
    placeId: row.google_place_id,
    name: row.name,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    category: row.places_category,
    photoUrl: row.photo_url,
    note: canViewNotes ? (row.note ?? null) : null,
    googleMapsUri: row.google_maps_uri,
    rating: row.rating,
    userRatingCount: row.user_rating_count,
    priceLevel: row.price_level,
    phoneNumber: row.phone_number,
    websiteUri: row.website_uri,
    openingStatus: computeOpeningStatus(
      row.opening_periods as OpeningPeriod[] | null,
      row.utc_offset_minutes,
    ),
  }));

  return NextResponse.json({
    items,
    isOwner,
    ownerId: profile.id,
    regionId: region.id,
    regionName: region.region_name,
  });
}
