import { NextRequest, NextResponse } from "next/server";
import {
  buildSearchResults,
  type SearchResult,
  type TmdbTitleLike,
} from "@/lib/tmdb";
import { createClient } from "@/lib/supabase/server";
import { getExcludedMovieKeys } from "@/lib/exclusions";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

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
  const excludedKeys = user ? await getExcludedMovieKeys(supabase, user.id) : new Set<string>();

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
