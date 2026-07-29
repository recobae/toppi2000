import { NextRequest, NextResponse } from "next/server";
import { reverseGeocodeRegion } from "@/lib/google-places";

export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lng = Number(request.nextUrl.searchParams.get("lng"));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GOOGLE_PLACES_API_KEY is not configured", region: null },
      { status: 200 },
    );
  }

  const region = await reverseGeocodeRegion(lat, lng, apiKey);
  return NextResponse.json({ region });
}
