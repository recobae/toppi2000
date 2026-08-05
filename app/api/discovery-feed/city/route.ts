import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCityDiscoveryFeed } from "@/lib/discovery";

/**
 * Backs the "Warst du schon mal hier?" city drill-down -- fetched on tile
 * click so the full suggestion list appears inline, not as a navigation.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const city = request.nextUrl.searchParams.get("city");
  if (!city) {
    return NextResponse.json({ error: "Stadt fehlt" }, { status: 400 });
  }

  const feed = await getCityDiscoveryFeed(supabase, user.id, city, process.env.GOOGLE_PLACES_API_KEY);
  return NextResponse.json(feed);
}
