import { NextRequest, NextResponse } from "next/server";
import {
  buildSearchResults,
  type SearchResult,
  type TmdbTitleLike,
} from "@/lib/tmdb";
import { createClient } from "@/lib/supabase/server";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

// Once a trending item has been rated (Ja/Nein/Watchlist), it's gone from
// this feed for good, not just for the current session -- same permanent-
// exclusion rule item_interactions already drives everywhere else.
async function getExcludedKeys(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<Set<string>> {
  const [{ data: interactions }, { data: topList }, { data: watchlist }] = await Promise.all([
    supabase
      .from("item_interactions")
      .select("item_id, media_type")
      .eq("user_id", userId)
      .in("media_type", ["movie", "tv"]),
    supabase.from("top_list").select("item_id, media_type").eq("user_id", userId),
    supabase.from("watchlist").select("item_id, media_type").eq("user_id", userId),
  ]);

  const keys = new Set<string>();
  for (const rows of [interactions, topList, watchlist]) {
    for (const row of rows ?? []) {
      keys.add(`${row.media_type}-${row.item_id}`);
    }
  }
  return keys;
}

export async function GET(request: NextRequest) {
  const pageParam = request.nextUrl.searchParams.get("page");
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "TMDB_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const excludedKeys = user ? await getExcludedKeys(supabase, user.id) : new Set<string>();

  const url = new URL(`${TMDB_BASE_URL}/trending/all/week`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("page", String(page));

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: "Trending-Anfrage fehlgeschlagen" },
        { status: 502 },
      );
    }

    const data: { results: TmdbTitleLike[] } = await response.json();
    const filtered = data.results.filter(
      (item) => !excludedKeys.has(`${item.media_type}-${item.id}`),
    );
    const results: SearchResult[] = await buildSearchResults(filtered, apiKey);

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json(
      { error: "Trending-Anfrage fehlgeschlagen" },
      { status: 502 },
    );
  }
}
