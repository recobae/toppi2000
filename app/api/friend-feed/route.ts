import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getExcludedMovieKeys, getExcludedPlaceIds } from "@/lib/exclusions";

const FEED_LIMIT = 20;
const PER_LIST_FETCH_LIMIT = 60;

type NameGroup = { count: number; names: string[]; userIds: string[] };

function toNameGroup(userIds: string[], usernameByUserId: Map<string, string>): NameGroup {
  const uniqueIds = [...new Set(userIds)].filter((id) => usernameByUserId.has(id));
  const names = uniqueIds.map((id) => usernameByUserId.get(id)!);
  return { count: names.length, names, userIds: uniqueIds };
}

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type");
  if (type !== "movies" && type !== "places") {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();

  if (!viewer) {
    return NextResponse.json({ items: [] });
  }

  const { data: followRows } = await supabase
    .from("user_follows")
    .select("followed_id")
    .eq("follower_id", viewer.id);
  const followedIds = (followRows ?? []).map((row) => row.followed_id);

  if (followedIds.length === 0) {
    return NextResponse.json({ items: [] });
  }

  if (type === "movies") {
    const [{ data: topListRows }, { data: watchlistRows }, excluded] = await Promise.all([
      supabase
        .from("top_list")
        .select("user_id, item_id, media_type, title, image_url, metadata, created_at")
        .in("user_id", followedIds)
        .order("created_at", { ascending: false })
        .limit(PER_LIST_FETCH_LIMIT),
      supabase
        .from("watchlist")
        .select("user_id, item_id, media_type, title, image_url, metadata, created_at")
        .in("user_id", followedIds)
        .order("created_at", { ascending: false })
        .limit(PER_LIST_FETCH_LIMIT),
      getExcludedMovieKeys(supabase, viewer.id),
    ]);

    const key = (itemId: number | string, mediaType: string) => `${mediaType}-${itemId}`;
    const allRows = [...(topListRows ?? []), ...(watchlistRows ?? [])];
    type CandidateRow = (typeof allRows)[number];
    const candidateByKey = new Map<string, CandidateRow>();
    for (const row of allRows) {
      const k = key(row.item_id, row.media_type);
      if (excluded.has(k)) continue;
      const existing = candidateByKey.get(k);
      if (!existing || row.created_at > existing.created_at) {
        candidateByKey.set(k, row);
      }
    }

    const candidates = Array.from(candidateByKey.values())
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, FEED_LIMIT);

    if (candidates.length === 0) {
      return NextResponse.json({ items: [] });
    }

    const candidateItemIds = [...new Set(candidates.map((c) => c.item_id))];

    const [{ data: allTopListForItems }, { data: allInteractionsForItems }] = await Promise.all([
      supabase
        .from("top_list")
        .select("user_id, item_id, media_type")
        .in("user_id", followedIds)
        .in("item_id", candidateItemIds),
      supabase
        .from("item_interactions")
        .select("user_id, item_id, media_type, interaction_type")
        .in("user_id", followedIds)
        .in("item_id", candidateItemIds),
    ]);

    const relevantUserIds = new Set<string>([
      ...(allTopListForItems ?? []).map((r) => r.user_id),
      ...(allInteractionsForItems ?? []).map((r) => r.user_id),
    ]);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username")
      .in("id", [...relevantUserIds]);
    const usernameByUserId = new Map((profiles ?? []).map((p) => [p.id, p.username]));

    const items = candidates.map((row) => {
      const k = key(row.item_id, row.media_type);
      const topListUserIds = (allTopListForItems ?? [])
        .filter((r) => key(r.item_id, r.media_type) === k)
        .map((r) => r.user_id);
      const likedUserIds = (allInteractionsForItems ?? [])
        .filter((r) => key(r.item_id, r.media_type) === k && r.interaction_type === "like")
        .map((r) => r.user_id);
      const dislikedUserIds = (allInteractionsForItems ?? [])
        .filter((r) => key(r.item_id, r.media_type) === k && r.interaction_type === "dislike")
        .map((r) => r.user_id);

      return {
        itemId: String(row.item_id),
        mediaType: row.media_type as "movie" | "tv",
        title: row.title,
        imageUrl: row.image_url,
        year: (row.metadata as { year?: string | null } | null)?.year ?? null,
        addedAt: row.created_at,
        topList: toNameGroup(topListUserIds, usernameByUserId),
        liked: toNameGroup(likedUserIds, usernameByUserId),
        disliked: toNameGroup(dislikedUserIds, usernameByUserId),
      };
    });

    return NextResponse.json({ items });
  }

  // type === "places"
  const [{ data: placeRows }, excludedPlaceIds] = await Promise.all([
    supabase
      .from("places")
      .select(
        "id, user_id, google_place_id, name, address, lat, lng, places_category, photo_url, region_id, created_at",
      )
      .in("user_id", followedIds)
      .order("created_at", { ascending: false })
      .limit(PER_LIST_FETCH_LIMIT),
    getExcludedPlaceIds(supabase, viewer.id),
  ]);

  const candidateByPlaceId = new Map<string, NonNullable<typeof placeRows>[number]>();
  for (const row of placeRows ?? []) {
    if (excludedPlaceIds.has(row.google_place_id)) continue;
    const existing = candidateByPlaceId.get(row.google_place_id);
    if (!existing || row.created_at > existing.created_at) {
      candidateByPlaceId.set(row.google_place_id, row);
    }
  }

  const candidates = Array.from(candidateByPlaceId.values())
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, FEED_LIMIT);

  if (candidates.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const candidatePlaceIds = candidates.map((c) => c.google_place_id);
  const regionIds = [...new Set(candidates.map((c) => c.region_id))];

  const [{ data: allPlacesForIds }, { data: allInteractionsForIds }, { data: regionRows }] =
    await Promise.all([
      supabase
        .from("places")
        .select("user_id, google_place_id")
        .in("user_id", followedIds)
        .in("google_place_id", candidatePlaceIds),
      supabase
        .from("item_interactions")
        .select("user_id, item_id, interaction_type")
        .in("user_id", followedIds)
        .in("item_id", candidatePlaceIds),
      supabase.from("place_regions").select("id, region_name").in("id", regionIds),
    ]);

  const regionNameById = new Map((regionRows ?? []).map((r) => [r.id, r.region_name]));

  const relevantUserIds = new Set<string>([
    ...(allPlacesForIds ?? []).map((r) => r.user_id),
    ...(allInteractionsForIds ?? []).map((r) => r.user_id),
  ]);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username")
    .in("id", [...relevantUserIds]);
  const usernameByUserId = new Map((profiles ?? []).map((p) => [p.id, p.username]));

  const items = candidates.map((row) => {
    const recommendedUserIds = (allPlacesForIds ?? [])
      .filter((r) => r.google_place_id === row.google_place_id)
      .map((r) => r.user_id);
    const likedUserIds = (allInteractionsForIds ?? [])
      .filter((r) => r.item_id === row.google_place_id && r.interaction_type === "like")
      .map((r) => r.user_id);
    const dislikedUserIds = (allInteractionsForIds ?? [])
      .filter((r) => r.item_id === row.google_place_id && r.interaction_type === "dislike")
      .map((r) => r.user_id);

    return {
      placeId: row.google_place_id,
      name: row.name,
      address: row.address,
      lat: row.lat,
      lng: row.lng,
      category: row.places_category,
      photoUrl: row.photo_url,
      regionName: regionNameById.get(row.region_id) ?? "",
      addedAt: row.created_at,
      recommended: toNameGroup(recommendedUserIds, usernameByUserId),
      liked: toNameGroup(likedUserIds, usernameByUserId),
      disliked: toNameGroup(dislikedUserIds, usernameByUserId),
    };
  });

  return NextResponse.json({ items });
}
