import { NextRequest, NextResponse } from "next/server";
import {
  buildSearchResults,
  type PersonSummary,
  type SearchResult,
  type TmdbTitleLike,
} from "@/lib/tmdb";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const MAX_PEOPLE = 10;
const CLOSE_MATCH_CHECK_LIMIT = 5;

type TmdbPersonItem = {
  id: number;
  name: string;
  profile_path: string | null;
  popularity?: number;
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function isCloseTitleMatch(title: string, query: string): boolean {
  const normTitle = normalize(title);
  const normQuery = normalize(query);
  if (!normQuery) return false;
  if (normTitle === normQuery) return true;

  const escaped = normQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wordBoundaryRegex = new RegExp(`\\b${escaped}\\b`, "i");
  return wordBoundaryRegex.test(title);
}

function hasCloseTitleMatch(items: TmdbTitleLike[], query: string): boolean {
  return items.slice(0, CLOSE_MATCH_CHECK_LIMIT).some((item) => {
    if (item.media_type !== "movie" && item.media_type !== "tv") return false;
    const titleField = item.media_type === "movie" ? item.title : item.name;
    return titleField ? isCloseTitleMatch(titleField, query) : false;
  });
}

// e.g. "Tom Cruise" — two capitalized words, no digits/punctuation typical of titles.
function looksLikePersonName(query: string): boolean {
  const words = query.trim().split(/\s+/);
  if (words.length !== 2) return false;
  return words.every((word) => /^[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'-]*$/.test(word));
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("query")?.trim();

  if (!query) {
    return NextResponse.json({
      results: [] satisfies SearchResult[],
      people: [] satisfies PersonSummary[],
    });
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "TMDB_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const multiUrl = new URL(`${TMDB_BASE_URL}/search/multi`);
  multiUrl.searchParams.set("api_key", apiKey);
  multiUrl.searchParams.set("query", query);
  multiUrl.searchParams.set("include_adult", "false");

  const personUrl = new URL(`${TMDB_BASE_URL}/search/person`);
  personUrl.searchParams.set("api_key", apiKey);
  personUrl.searchParams.set("query", query);
  personUrl.searchParams.set("include_adult", "false");

  const [multiResponse, personResponse] = await Promise.all([
    fetch(multiUrl, { headers: { Accept: "application/json" } }),
    fetch(personUrl, { headers: { Accept: "application/json" } }),
  ]);

  if (!multiResponse.ok) {
    return NextResponse.json(
      { error: "Failed to fetch results from TMDb" },
      { status: multiResponse.status },
    );
  }

  const multiData: { results: TmdbTitleLike[] } = await multiResponse.json();
  const results = await buildSearchResults(multiData.results, apiKey);

  const suppressPersonResults =
    hasCloseTitleMatch(multiData.results, query) &&
    !looksLikePersonName(query);

  let people: PersonSummary[] = [];
  if (!suppressPersonResults && personResponse.ok) {
    const personData: { results: TmdbPersonItem[] } =
      await personResponse.json();
    people = personData.results
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
      .slice(0, MAX_PEOPLE)
      .map((person) => ({
        id: person.id,
        name: person.name,
        profilePath: person.profile_path,
      }));
  }

  return NextResponse.json({ results, people });
}
