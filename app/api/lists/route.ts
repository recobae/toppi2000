import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PREDEFINED_LIST_OPTIONS } from "@/lib/lists";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const body: { title?: string } = await request.json();
  const option = PREDEFINED_LIST_OPTIONS.find(
    (candidate) => candidate.title === body.title,
  );

  if (!option) {
    return NextResponse.json(
      { error: "Ungültiger Listentyp" },
      { status: 400 },
    );
  }

  const { data: existing } = await supabase
    .from("lists")
    .select("id")
    .eq("user_id", user.id)
    .eq("title", option.title)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "Diese Liste existiert bereits" },
      { status: 409 },
    );
  }

  const { data: newList, error: insertError } = await supabase
    .from("lists")
    .insert({
      user_id: user.id,
      title: option.title,
      category: option.category,
      is_public: true,
    })
    .select("id")
    .single();

  if (insertError || !newList) {
    return NextResponse.json(
      { error: "Liste konnte nicht erstellt werden" },
      { status: 500 },
    );
  }

  return NextResponse.json({ id: newList.id });
}
