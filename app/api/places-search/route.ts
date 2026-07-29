import { NextRequest, NextResponse } from "next/server";
import { searchPlaces } from "@/lib/google-places";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("query")?.trim();

  if (!query) {
    return NextResponse.json({ results: [] });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GOOGLE_PLACES_API_KEY is not configured", results: [] },
      { status: 200 },
    );
  }

  const results = await searchPlaces(query, apiKey);
  return NextResponse.json({ results });
}
