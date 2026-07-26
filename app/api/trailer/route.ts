import { NextRequest, NextResponse } from "next/server";
import { getTrailerKey } from "@/lib/tmdb";

export async function GET(request: NextRequest) {
  const idParam = request.nextUrl.searchParams.get("id");
  const mediaType = request.nextUrl.searchParams.get("mediaType");
  const id = Number(idParam);

  if (!Number.isFinite(id) || (mediaType !== "movie" && mediaType !== "tv")) {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "TMDB_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const key = await getTrailerKey(id, mediaType, apiKey);
  return NextResponse.json({ key });
}
