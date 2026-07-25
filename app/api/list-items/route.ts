import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const UNIQUE_VIOLATION_CODE = "23505";

type AddListItemBody = {
  listId?: string;
  externalId?: number;
  title?: string;
  imageUrl?: string | null;
  mediaType?: "movie" | "tv";
  year?: string | null;
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const body: AddListItemBody = await request.json();
  const { listId, externalId, title, imageUrl, mediaType, year } = body;

  if (!listId || !externalId || !title || !mediaType) {
    return NextResponse.json(
      { error: "Ungültige Anfrage" },
      { status: 400 },
    );
  }

  const { data: list, error: listError } = await supabase
    .from("lists")
    .select("id, category")
    .eq("id", listId)
    .single();

  if (listError || !list) {
    return NextResponse.json(
      { error: "Liste nicht gefunden" },
      { status: 404 },
    );
  }

  if (list.category !== "watchlist" && list.category !== mediaType) {
    return NextResponse.json(
      { error: "Dieser Titel passt nicht zu dieser Liste" },
      { status: 422 },
    );
  }

  const { data: existing, error: maxError } = await supabase
    .from("list_items")
    .select("position")
    .eq("list_id", listId)
    .order("position", { ascending: false })
    .limit(1);

  if (maxError) {
    return NextResponse.json(
      { error: "Hinzufügen fehlgeschlagen" },
      { status: 500 },
    );
  }

  const nextPosition = (existing?.[0]?.position ?? 0) + 1;

  const { error: insertError } = await supabase.from("list_items").insert({
    external_id: externalId,
    title,
    image_url: imageUrl ?? null,
    list_id: listId,
    position: nextPosition,
    metadata: { year, type: mediaType },
  });

  if (insertError) {
    if (insertError.code === UNIQUE_VIOLATION_CODE) {
      return NextResponse.json(
        { error: "Titel bereits auf deiner Liste" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Hinzufügen fehlgeschlagen" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
