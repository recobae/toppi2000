import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { BackToProfileLink } from "@/components/profile/back-to-profile-link";
import { TopfActions } from "@/components/topf/topf-actions";
import { RECOMMENDATION_CATEGORIES } from "@/lib/recommendation-categories";
import { movieListHref } from "@/lib/categories";
import {
  getTopfOverview,
  getCategoryCounts,
  getRecentRecommendationsWithRecommenders,
} from "@/lib/topf";

export const metadata: Metadata = { title: "Mein Topf" };

export default async function TopfPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/login?next=/topf");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) {
    redirect("/");
  }

  const [overview, categoryCounts, recent] = await Promise.all([
    getTopfOverview(supabase, user.id),
    getCategoryCounts(supabase, user.id),
    getRecentRecommendationsWithRecommenders(supabase, user.id),
  ]);

  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-5 max-w-2xl p-5 pt-8">
        <div className="w-full flex flex-col gap-2">
          <BackToProfileLink username={profile.username} />
          <h1 className="w-full text-center text-lg font-semibold">Mein Topf</h1>
        </div>

        <TopfActions userId={user.id} />

        <p className="text-sm text-muted-foreground">
          {overview.totalItems === 0
            ? "Noch leer -- trag deine erste Empfehlung ein."
            : `${overview.totalItems} Empfehlungen von ${overview.distinctRecommenderCount} ${
                overview.distinctRecommenderCount === 1 ? "Beiträger" : "Beiträgern"
              } · ${overview.categoryCount} ${overview.categoryCount === 1 ? "Kategorie" : "Kategorien"}`}
        </p>

        <div className="w-full flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Link
            href={movieListHref(profile.username)}
            className="shrink-0 whitespace-nowrap h-8 px-3 rounded-full border border-input text-xs font-medium hover:bg-accent transition-colors"
          >
            🎬 Filme & Serien
          </Link>
          <Link
            href={`/u/${profile.username}`}
            className="shrink-0 whitespace-nowrap h-8 px-3 rounded-full border border-input text-xs font-medium hover:bg-accent transition-colors"
          >
            📍 Orte
          </Link>
          {RECOMMENDATION_CATEGORIES.map((category) => {
            const count = categoryCounts[category.key] ?? 0;
            const Icon = category.icon;
            return (
              <Link
                key={category.key}
                href={`/topf/${category.key}`}
                className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1 h-8 px-3 rounded-full border text-xs font-medium transition-colors hover:bg-accent ${
                  count === 0 ? "border-dashed border-input text-muted-foreground/70" : "border-input"
                }`}
              >
                <Icon className="size-3.5" />
                {category.label} ({count})
              </Link>
            );
          })}
        </div>

        {recent.length > 0 && (
          <div className="w-full flex flex-col gap-3">
            <h2 className="text-sm font-medium text-muted-foreground">Zuletzt hinzugefügt</h2>
            <div className="w-full flex flex-col gap-2">
              {recent.map((item) => {
                const category = RECOMMENDATION_CATEGORIES.find((entry) => entry.key === item.categoryKey);
                const imageUrl =
                  item.metadata && typeof item.metadata.imageUrl === "string" ? item.metadata.imageUrl : null;
                const recommenderNames = item.recommenders
                  .map((recommender) => recommender.recommenderUsername)
                  .filter(Boolean);

                return (
                  <Link
                    key={item.id}
                    href={`/topf/${item.categoryKey}`}
                    className="flex items-center gap-3 rounded-lg border p-2.5 hover:bg-accent transition-colors"
                  >
                    <div className="relative size-11 shrink-0 rounded-md overflow-hidden bg-muted flex items-center justify-center text-muted-foreground">
                      {imageUrl ? (
                        <Image src={imageUrl} alt="" fill sizes="44px" className="object-cover" />
                      ) : (
                        category && <category.icon className="size-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <p className="text-sm font-medium leading-tight truncate">{item.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {category?.label ?? item.categoryKey}
                        {recommenderNames.length > 0 && ` · von ${recommenderNames.join(", ")}`}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
