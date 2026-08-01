import { NextRequest, NextResponse } from "next/server";
import { searchBestTitleMatch, type TitleMatch } from "@/lib/tmdb";
import { searchPlaces, type PlaceSearchResult } from "@/lib/google-places";

export type ImportCandidate =
  | { name: string; kind: "movie"; match: TitleMatch | null }
  | { name: string; kind: "place"; match: PlaceSearchResult | null };

const MAX_NAMES = 40;

/**
 * Matches each extracted name (from pasted text or a screenshot, see
 * lib/import-extract.ts / app/api/import/extract-image) against TMDB or
 * Google Places, whichever the user chose to import. One request per name,
 * capped at MAX_NAMES -- this is a manual, occasional bulk-import flow, not
 * a hot path, so no batching/caching layer is worth the complexity yet.
 */
export async function POST(request: NextRequest) {
  const body: { category?: "movies" | "orte"; names?: string[] } = await request.json();
  const category = body.category;
  const names = (body.names ?? []).map((name) => name.trim()).filter(Boolean).slice(0, MAX_NAMES);

  if ((category !== "movies" && category !== "orte") || names.length === 0) {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  if (category === "movies") {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "TMDB_API_KEY is not configured" }, { status: 500 });
    }
    const candidates: ImportCandidate[] = await Promise.all(
      names.map(async (name) => ({
        name,
        kind: "movie" as const,
        match: await searchBestTitleMatch(name, apiKey),
      })),
    );
    return NextResponse.json({ candidates });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GOOGLE_PLACES_API_KEY is not configured" }, { status: 500 });
  }
  const candidates: ImportCandidate[] = await Promise.all(
    names.map(async (name) => {
      const results = await searchPlaces(name, apiKey);
      return { name, kind: "place" as const, match: results[0] ?? null };
    }),
  );
  return NextResponse.json({ candidates });
}
