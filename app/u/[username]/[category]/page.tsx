import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { CategoryItemsGrid } from "@/components/lists/list-items-grid";
import {
  CATEGORY_LABELS,
  CATEGORY_PAGE_SUBTITLES,
  isSavedCategory,
} from "@/lib/categories";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string; category: string }>;
}): Promise<Metadata> {
  const { username, category } = await params;
  if (!isSavedCategory(category)) return { title: "Nicht gefunden" };
  return { title: `${CATEGORY_LABELS[category]} von ${username}` };
}

export default async function CategoryListPage({
  params,
}: {
  params: Promise<{ username: string; category: string }>;
}) {
  const { username, category } = await params;

  if (!isSavedCategory(category)) {
    notFound();
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username")
    .eq("username", username)
    .single();

  if (!profile) {
    notFound();
  }

  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-6 max-w-5xl p-5">
        <div className="flex flex-col gap-1 pt-8">
          <Link
            href={`/u/${profile.username}`}
            className="text-sm text-muted-foreground hover:underline w-fit"
          >
            ← Zum Profil
          </Link>
          <h1 className="font-medium text-xl">
            {CATEGORY_PAGE_SUBTITLES[category]}
          </h1>
        </div>
        <CategoryItemsGrid
          username={profile.username}
          category={category}
          ownerId={profile.id}
          currentUserId={viewer?.id ?? null}
        />
      </div>
    </main>
  );
}
