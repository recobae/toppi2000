import { NextRequest, NextResponse } from "next/server";
import {
  buildSearchResults,
  type SearchResult,
  type TmdbTitleLike,
} from "@/lib/tmdb";
import { createClient } from "@/lib/supabase/server";
import { getExcludedMovieKeys } from "@/lib/exclusions";
import { getSwipeQuota } from "@/lib/swipe-deck";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

/**
 * Same trending source + exclusion filtering as app/api/trending/route.ts
 * (reused, not reimplemented), plus the swipe deck's daily-limit
 * enforcement: results are truncated to whatever's left of today's quota
 * before being enriched, so a capped user never even pays for the extra
 * watch-provider/details lookups.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "TMDB_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const pageParam = request.nextUrl.searchParams.get("page");
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  const [excludedKeys, quota] = await Promise.all([
    getExcludedMovieKeys(supabase, user.id),
    getSwipeQuota(supabase, user.id),
  ]);

  if (quota.remaining === 0) {
    return NextResponse.json({ results: [], exhausted: true, remaining: 0 });
  }

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
    let filtered = data.results.filter(
      (item) => !excludedKeys.has(`${item.media_type}-${item.id}`),
    );
    if (quota.remaining !== null) {
      filtered = filtered.slice(0, quota.remaining);
    }

    const results: SearchResult[] = await buildSearchResults(filtered, apiKey);

    return NextResponse.json({
      results,
      exhausted: false,
      remaining: quota.remaining,
    });
  } catch {
    return NextResponse.json(
      { error: "Trending-Anfrage fehlgeschlagen" },
      { status: 502 },
    );
  }
}
