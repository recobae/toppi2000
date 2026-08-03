import { NextRequest, NextResponse } from "next/server";
import { searchPlaces } from "@/lib/google-places";
import { searchBestBookMatch } from "@/lib/google-books";
import { searchBestMediaMatch } from "@/lib/itunes";
import { getRecommendationCategory } from "@/lib/recommendation-categories";

export type RecommendationMatch = {
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  externalId: string | null;
  sourceType: "place" | "media" | "freeform";
  metadata: Record<string, unknown> | null;
};

/**
 * Resolves the anchor-API enrichment for a "Mein Topf" entry: Places for
 * group "place", Google Books/iTunes for group "media" (by mediaSubtype),
 * nothing for "freeform" (no external source exists for that group at
 * all -- match is always null there, not an error).
 */
export async function POST(request: NextRequest) {
  const body: { categoryKey?: string; query?: string } = await request.json();
  const categoryKey = body.categoryKey;
  const query = body.query?.trim();
  if (!categoryKey || !query) {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const category = getRecommendationCategory(categoryKey);
  if (!category) {
    return NextResponse.json({ error: "Unbekannte Kategorie" }, { status: 400 });
  }

  if (category.group === "freeform") {
    return NextResponse.json({ match: null });
  }

  if (category.group === "place") {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GOOGLE_PLACES_API_KEY is not configured" }, { status: 500 });
    }
    const results = await searchPlaces(query, apiKey);
    const best = results[0] ?? null;
    if (!best) return NextResponse.json({ match: null });

    const match: RecommendationMatch = {
      title: best.name,
      subtitle: best.address,
      imageUrl: best.photoUrl,
      externalId: best.placeId,
      sourceType: "place",
      metadata: {
        imageUrl: best.photoUrl,
        address: best.address,
        lat: best.lat,
        lng: best.lng,
        rating: best.rating,
        userRatingCount: best.userRatingCount,
        googleMapsUri: best.googleMapsUri,
        phoneNumber: best.phoneNumber,
        websiteUri: best.websiteUri,
      },
    };
    return NextResponse.json({ match });
  }

  // group === "media"
  if (category.mediaSubtype === "book") {
    const best = await searchBestBookMatch(query);
    if (!best) return NextResponse.json({ match: null });
    const match: RecommendationMatch = {
      title: best.title,
      subtitle: best.author,
      imageUrl: best.coverUrl,
      externalId: best.id,
      sourceType: "media",
      metadata: { imageUrl: best.coverUrl, author: best.author, year: best.year },
    };
    return NextResponse.json({ match });
  }

  if (category.mediaSubtype === "music" || category.mediaSubtype === "podcast") {
    const best = await searchBestMediaMatch(query, category.mediaSubtype);
    if (!best) return NextResponse.json({ match: null });
    const match: RecommendationMatch = {
      title: best.title,
      subtitle: best.artist,
      imageUrl: best.artworkUrl,
      externalId: best.id,
      sourceType: "media",
      metadata: { imageUrl: best.artworkUrl, artist: best.artist },
    };
    return NextResponse.json({ match });
  }

  return NextResponse.json({ match: null });
}
