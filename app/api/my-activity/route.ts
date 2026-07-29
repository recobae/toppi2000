import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const { data: interactions, error } = await supabase
    .from("item_interactions")
    .select("id, item_id, media_type, interaction_type, created_at")
    .eq("user_id", user.id)
    .in("interaction_type", ["like", "dislike"])
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const movieItemIds = [
    ...new Set(
      (interactions ?? [])
        .filter((row) => row.media_type === "movie" || row.media_type === "tv")
        .map((row) => row.item_id),
    ),
  ];
  const placeIds = [
    ...new Set(
      (interactions ?? []).filter((row) => row.media_type === "place").map((row) => row.item_id),
    ),
  ];

  const [{ data: movieRows }, { data: watchlistRows }, { data: placeRows }] = await Promise.all([
    movieItemIds.length > 0
      ? supabase.from("top_list").select("item_id, media_type, title, image_url").in("item_id", movieItemIds)
      : Promise.resolve({ data: [] as { item_id: number; media_type: string; title: string; image_url: string | null }[] }),
    movieItemIds.length > 0
      ? supabase.from("watchlist").select("item_id, media_type, title, image_url").in("item_id", movieItemIds)
      : Promise.resolve({ data: [] as { item_id: number; media_type: string; title: string; image_url: string | null }[] }),
    placeIds.length > 0
      ? supabase.from("places").select("google_place_id, name, photo_url").in("google_place_id", placeIds)
      : Promise.resolve({ data: [] as { google_place_id: string; name: string; photo_url: string | null }[] }),
  ]);

  const movieInfoByKey = new Map<string, { title: string; imageUrl: string | null }>();
  for (const row of [...(movieRows ?? []), ...(watchlistRows ?? [])]) {
    const key = `${row.media_type}-${row.item_id}`;
    if (!movieInfoByKey.has(key)) {
      movieInfoByKey.set(key, { title: row.title, imageUrl: row.image_url });
    }
  }
  const placeInfoById = new Map(
    (placeRows ?? []).map((row) => [row.google_place_id, { title: row.name, imageUrl: row.photo_url }]),
  );

  const items = (interactions ?? []).map((row) => {
    const isPlace = row.media_type === "place";
    const info = isPlace
      ? placeInfoById.get(row.item_id)
      : movieInfoByKey.get(`${row.media_type}-${row.item_id}`);

    return {
      id: row.id,
      itemId: row.item_id,
      mediaType: row.media_type,
      interactionType: row.interaction_type,
      createdAt: row.created_at,
      title: info?.title ?? "Unbekannter Titel",
      imageUrl: info?.imageUrl ?? null,
    };
  });

  return NextResponse.json({ items });
}
