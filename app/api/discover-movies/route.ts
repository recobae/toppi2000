import { NextRequest, NextResponse } from "next/server";
import {
  buildSearchResults,
  type SearchResult,
  type TmdbTitleLike,
} from "@/lib/tmdb";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const SORT_OPTIONS: Record<
  string,
  { sortBy: string; extra?: Record<string, string> }
> = {
  popular: { sortBy: "popularity.desc" },
  top_rated: {
    sortBy: "vote_average.desc",
    extra: { "vote_count.gte": "200" },
  },
  newest: {
    sortBy: "release_date.desc",
    get extra() {
      return { "primary_release_date.lte": todayIso() };
    },
  },
};

export async function GET(request: NextRequest) {
  const pageParam = request.nextUrl.searchParams.get("page");
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const sortKey = request.nextUrl.searchParams.get("sort") ?? "popular";
  const genre = request.nextUrl.searchParams.get("genre");

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "TMDB_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const sortConfig = SORT_OPTIONS[sortKey] ?? SORT_OPTIONS.popular;

  const url = new URL(`${TMDB_BASE_URL}/discover/movie`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("page", String(page));
  url.searchParams.set("sort_by", sortConfig.sortBy);
  url.searchParams.set("include_adult", "false");

  for (const [key, value] of Object.entries(sortConfig.extra ?? {})) {
    url.searchParams.set(key, value);
  }

  if (genre) {
    url.searchParams.set("with_genres", genre);
  }

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: "Discover-Anfrage fehlgeschlagen" },
        { status: 502 },
      );
    }

    const data: { results: TmdbTitleLike[] } = await response.json();
    const withMediaType = data.results.map((item) => ({
      ...item,
      media_type: "movie" as const,
    }));
    const results: SearchResult[] = await buildSearchResults(
      withMediaType,
      apiKey,
    );

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json(
      { error: "Discover-Anfrage fehlgeschlagen" },
      { status: 502 },
    );
  }
}
