import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type SwipeBody = {
  tmdbId?: number;
  mediaType?: "movie" | "tv";
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const body: SwipeBody = await request.json();
  const { tmdbId, mediaType } = body;

  if (!tmdbId || (mediaType !== "movie" && mediaType !== "tv")) {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const { error } = await supabase.from("swiped_titles").upsert(
    {
      user_id: user.id,
      tmdb_id: tmdbId,
      media_type: mediaType,
      swiped_at: new Date().toISOString(),
    },
    { onConflict: "user_id,tmdb_id,media_type" },
  );

  if (error) {
    return NextResponse.json(
      { error: "Konnte nicht gespeichert werden" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
