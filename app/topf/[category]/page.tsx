import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getRecommendationCategory } from "@/lib/recommendation-categories";
import {
  getRecommendationsForCategory,
  getThankedRecommenderIds,
  getAutoFillSuggestions,
} from "@/lib/topf";
import { CategoryList } from "@/components/topf/category-list";
import { TopfActions } from "@/components/topf/topf-actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category: categoryKey } = await params;
  const category = getRecommendationCategory(categoryKey);
  return { title: category ? `${category.label} -- Mein Topf` : "Nicht gefunden" };
}

export default async function TopfCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category: categoryKey } = await params;
  const category = getRecommendationCategory(categoryKey);
  if (!category) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/auth/login?next=/topf/${categoryKey}`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("home_city")
    .eq("id", user.id)
    .maybeSingle();

  const items = await getRecommendationsForCategory(supabase, user.id, categoryKey);
  const allRecommenderIds = items.flatMap((item) =>
    item.recommenders.filter((recommender) => recommender.recommenderUserId !== user.id).map((r) => r.id),
  );
  const thankedIds = await getThankedRecommenderIds(supabase, user.id, allRecommenderIds);

  // Auto-fill is only meaningful for the "place" group (see lib/topf.ts) --
  // shown as a supplementary, visually separated section rather than
  // gating strictly on "zero friend recommendations", since this project's
  // data model doesn't track the wireframe's finer per-need sub-grouping
  // (e.g. "Elektriker" within "Handwerker") -- see chat for the full
  // reasoning on this simplification.
  const autoFill =
    category.group === "place"
      ? await getAutoFillSuggestions(category, profile?.home_city ?? null, process.env.GOOGLE_PLACES_API_KEY)
      : [];

  const hasAnything = items.length > 0 || autoFill.length > 0;

  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-5 max-w-2xl p-5 pt-8">
        <div className="w-full flex flex-col gap-1">
          <Link href="/topf" className="text-sm text-muted-foreground hover:underline w-fit">
            ← Mein Topf
          </Link>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <category.icon className="size-5" />
            {category.label}
          </h1>
        </div>

        {!hasAnything ? (
          <div className="w-full flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
            <p className="text-sm font-medium">Noch nichts in „{category.label}“</p>
            <p className="text-xs text-muted-foreground">
              Deine Freunde haben hier noch nichts empfohlen.
            </p>
            <Link
              href="/inspiration"
              className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors inline-flex items-center"
            >
              Freunde einladen
            </Link>
            <p className="text-xs text-muted-foreground">oder direkt selbst starten</p>
          </div>
        ) : (
          <>
            {items.length > 0 && (
              <CategoryList
                items={items}
                userId={user.id}
                category={category}
                initiallyThankedIds={thankedIds}
              />
            )}

            {autoFill.length > 0 && (
              <div className="w-full flex flex-col gap-2 pt-2">
                <h2 className="text-xs font-medium text-muted-foreground">
                  Noch keine Empfehlung von Freunden -- hier, was in der Nähe gut bewertet ist
                </h2>
                <div className="w-full flex flex-col gap-2">
                  {autoFill.map((suggestion) => (
                    <div
                      key={suggestion.externalId}
                      className="flex gap-3 rounded-lg border border-dashed p-2.5"
                    >
                      <div className="relative size-12 shrink-0 rounded-md overflow-hidden bg-muted flex items-center justify-center text-muted-foreground">
                        {suggestion.imageUrl ? (
                          <Image src={suggestion.imageUrl} alt="" fill sizes="48px" className="object-cover" />
                        ) : (
                          <category.icon className="size-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                        <p className="text-sm font-medium leading-tight truncate">{suggestion.title}</p>
                        {suggestion.subtitle && (
                          <p className="text-[11px] text-muted-foreground truncate">{suggestion.subtitle}</p>
                        )}
                        {suggestion.rating && (
                          <p className="text-[11px] text-muted-foreground">
                            {suggestion.rating.toFixed(1)}★ ({suggestion.ratingCount} Bew.)
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <TopfActions userId={user.id} />
    </main>
  );
}
