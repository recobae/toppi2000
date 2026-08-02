import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSharedRatings } from "@/lib/taste-match";

export type TasteMatchDetailEntry = {
  itemId: string;
  mediaType: string;
  title: string;
  imageUrl: string | null;
  agreement: "like" | "dislike";
};

/**
 * Backs the expandable "show me the actual titles" breakdown under the
 * Taste-Match score on a foreign profile: every item both users rated the
 * same way, split into movies/tv vs. places. Title/image resolution mirrors
 * app/api/my-activity/route.ts exactly -- checks both users' own list
 * tables (top_list/watchlist/places), falls back to "Unbekannter Titel"
 * rather than an extra TMDB/Places lookup, same trade-off "Meine Aktivität"
 * already makes.
 */
export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username");
  if (!username) {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const supabase = await createClient();
  const [
    {
      data: { user: viewer },
    },
    { data: owner },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("profiles").select("id").eq("username", username).single(),
  ]);

  if (!viewer) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  if (!owner) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  const shared = (await getSharedRatings(supabase, owner.id, viewer.id)).filter(
    (entry) => entry.isMatch,
  );

  const movieItemIds = [
    ...new Set(shared.filter((entry) => entry.mediaType !== "place").map((entry) => entry.itemId)),
  ];
  const placeIds = [
    ...new Set(shared.filter((entry) => entry.mediaType === "place").map((entry) => entry.itemId)),
  ];
  const bothUserIds = [owner.id, viewer.id];

  const [{ data: topListRows }, { data: watchlistRows }, { data: placeRows }] = await Promise.all([
    movieItemIds.length > 0
      ? supabase
          .from("top_list")
          .select("item_id, media_type, title, image_url")
          .in("item_id", movieItemIds)
          .in("user_id", bothUserIds)
      : Promise.resolve({ data: [] as { item_id: number; media_type: string; title: string; image_url: string | null }[] }),
    movieItemIds.length > 0
      ? supabase
          .from("watchlist")
          .select("item_id, media_type, title, image_url")
          .in("item_id", movieItemIds)
          .in("user_id", bothUserIds)
      : Promise.resolve({ data: [] as { item_id: number; media_type: string; title: string; image_url: string | null }[] }),
    placeIds.length > 0
      ? supabase
          .from("places")
          .select("google_place_id, name, photo_url")
          .in("google_place_id", placeIds)
          .in("user_id", bothUserIds)
      : Promise.resolve({ data: [] as { google_place_id: string; name: string; photo_url: string | null }[] }),
  ]);

  const movieInfoByKey = new Map<string, { title: string; imageUrl: string | null }>();
  for (const row of [...(topListRows ?? []), ...(watchlistRows ?? [])]) {
    const key = `${row.media_type}-${row.item_id}`;
    if (!movieInfoByKey.has(key)) {
      movieInfoByKey.set(key, { title: row.title, imageUrl: row.image_url });
    }
  }
  const placeInfoById = new Map(
    (placeRows ?? []).map((row) => [row.google_place_id, { title: row.name, imageUrl: row.photo_url }]),
  );

  const toEntry = (entry: (typeof shared)[number]): TasteMatchDetailEntry => {
    const isPlace = entry.mediaType === "place";
    const info = isPlace
      ? placeInfoById.get(entry.itemId)
      : movieInfoByKey.get(`${entry.mediaType}-${entry.itemId}`);
    return {
      itemId: entry.itemId,
      mediaType: entry.mediaType,
      title: info?.title ?? "Unbekannter Titel",
      imageUrl: info?.imageUrl ?? null,
      agreement: entry.ownerType,
    };
  };

  return NextResponse.json({
    movies: shared.filter((entry) => entry.mediaType !== "place").map(toEntry),
    places: shared.filter((entry) => entry.mediaType === "place").map(toEntry),
  });
}
