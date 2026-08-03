import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchSongs } from "@/lib/itunes";

/**
 * Proxies the iTunes Search API for the favorite-song-snippet settings
 * picker -- same "route our own server calls the free external API"
 * convention as /api/places-search and /api/story-updates.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get("q") ?? "";
  const results = await searchSongs(query);
  return NextResponse.json({ results });
}
