import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Plus, ListChecks } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getListOverviewData } from "@/lib/list-overview";
import { ListOverviewSection } from "@/components/profile/list-overview-section";
import { getOwnInteractionRows } from "@/lib/taste-match";
import { ScrollToTopButton } from "@/components/ui/scroll-to-top-button";

export const metadata: Metadata = { title: "My Taste" };

export default async function MyTastePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/login?next=/my-taste");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, home_city")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) {
    redirect("/");
  }

  const [listOverview, ownInteractionRows, { count: dontWatchCount }, { count: topfEntryCount }] = await Promise.all([
    getListOverviewData(supabase, {
      userId: user.id,
      username: profile.username,
      homeCity: profile.home_city,
      showTierProgress: true,
    }),
    getOwnInteractionRows(supabase, user.id),
    supabase.from("dont_watch").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase
      .from("recommendations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "active"),
  ]);

  // Selbe "Bewertungen"-Summe wie im Profil, hier aber der einzige Ort, an
  // dem sie noch mit einem Einstieg in die Detailliste verknüpft ist.
  const totalActivityCount =
    ownInteractionRows.length +
    listOverview.movieListItemCount +
    (dontWatchCount ?? 0) +
    listOverview.totalPlacesCount +
    (topfEntryCount ?? 0);

  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-5 max-w-2xl p-5 pt-6">
        <h1 className="text-lg font-semibold">My Taste</h1>

        <div className="w-full flex flex-col items-center gap-2 rounded-lg border p-4">
          <Link
            href="/swipe"
            aria-label="Jetzt bewerten"
            className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-gradient-to-br from-primary to-primary/60 text-primary-foreground text-base font-semibold shadow-sm"
          >
            <Plus className="size-5" />
            Jetzt bewerten
          </Link>
          <Link
            href="/meine-aktivitaet"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ListChecks className="size-3.5" />
            {totalActivityCount} {totalActivityCount === 1 ? "Bewertung" : "Bewertungen"} von dir
          </Link>
        </div>

        <ListOverviewSection rows={listOverview.rows} isGuest={false} isOwner />
      </div>
      <ScrollToTopButton />
    </main>
  );
}
