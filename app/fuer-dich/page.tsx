import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { DiscoverySection } from "@/components/discovery/discovery-section";
import { PersonalDiscoverySection } from "@/components/discovery/personal-discovery-section";
import { RegionPrompts } from "@/components/discovery/region-prompts";
import { QuestionPrompts } from "@/components/discovery/question-prompts";
import { getDiscoverySections, getNetworkRegionPrompts } from "@/lib/discovery";
import { getPersonalDiscoveryHighlight } from "@/lib/fuer-dich-personalization";
import { getLastSeenFriendRatingsAt, markFriendRatingsSeen } from "@/lib/friend-ratings-seen";
import { getForMeStatus, getTotalActivityCount } from "@/lib/for-me";
import { buildQuestionPrompts } from "@/lib/question-prompts";
import { ScrollToTopButton } from "@/components/ui/scroll-to-top-button";
import { NotificationBell } from "@/components/notifications/notification-bell";

export const metadata: Metadata = { title: "Für Dich" };

/**
 * 5 klar getrennte, nicht konkurrierende Abschnitte (Struktur-Runde):
 * 1. Neue Bewertungen von Freunden (sozial, aktuell) -- eigenes
 *    "seit letztem Besuch"-Gate über story_views (lib/friend-ratings-seen.ts).
 * 2. Persönliche Entdeckung (lib/fuer-dich-personalization.ts) -- die
 *    Kontext-Trigger, die früher My Taste zeigte, jetzt hier.
 * 3. Warst du schon mal hier? (RegionPrompts, unverändert wiederverwendet).
 * 4. Gib deinen Freunden besondere Empfehlungen (QuestionPrompts, unverändert).
 * 5. Weitere Aktivitäten aus deinem Netzwerk -- die restlichen, gegen 1+2
 *    deduplizierten DiscoverySection-Blöcke.
 */
export default async function FuerDichPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/fuer-dich");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("home_city")
    .eq("id", user.id)
    .maybeSingle();
  const homeCity = profile?.home_city ?? null;
  const tmdbApiKey = process.env.TMDB_API_KEY;
  const placesApiKey = process.env.GOOGLE_PLACES_API_KEY;

  const [sections, regionPrompts, highlight, lastSeenAt, ownActivityCount] = await Promise.all([
    getDiscoverySections(supabase, user.id, { homeCity, tmdbApiKey, placesApiKey }),
    getNetworkRegionPrompts(supabase, user.id),
    getPersonalDiscoveryHighlight(supabase, user.id, { homeCity, tmdbApiKey, placesApiKey }),
    getLastSeenFriendRatingsAt(supabase, user.id),
    getTotalActivityCount(supabase, user.id),
  ]);
  const questionPrompts = buildQuestionPrompts(homeCity);
  const forMeStatus = await getForMeStatus(supabase, user.id, ownActivityCount);

  // Fire-and-forget, must run AFTER lastSeenAt above was already read --
  // "opening Für Dich IS having seen today's friend-ratings feed" (same
  // convention story-updates already uses), so the NEXT visit's "new" set
  // starts from right now.
  void markFriendRatingsSeen(supabase, user.id);

  const newFriendCandidates = lastSeenAt
    ? sections.recentActivity.filter((candidate) => new Date(candidate.lastActivityAt) > new Date(lastSeenAt))
    : sections.recentActivity;
  const newFriendCount = newFriendCandidates.length;

  // Cross-section dedupe (Punkt 5 der Vorab-Antworten): everything shown in
  // Abschnitt 1 or 2 is excluded from Abschnitt 5's pools, so no candidate
  // appears twice on the same page load.
  const usedIds = new Set([...newFriendCandidates, ...(highlight?.candidates ?? [])].map((c) => c.id));
  const freshFromFriends = sections.freshFromFriends.filter((c) => !usedIds.has(c.id));
  const popularInNetwork = sections.popularInNetwork.filter((c) => !usedIds.has(c.id));
  const moreFromRegion = sections.moreFromRegion.filter((c) => !usedIds.has(c.id));
  const newForYou = sections.newForYou.filter((c) => !usedIds.has(c.id));
  const hasMoreNetworkActivity =
    freshFromFriends.length > 0 || popularInNetwork.length > 0 || moreFromRegion.length > 0 || newForYou.length > 0;

  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-6 max-w-2xl p-5 pt-6">
        <div className="w-full flex items-center justify-between">
          <h1 className="text-lg font-semibold">Für Dich</h1>
          <NotificationBell userId={user.id} />
        </div>

        {/* Abschnitt 1: Neue Bewertungen von Freunden -- steht nur oben, wenn wirklich etwas Neues da ist; keine falsche "0 neue"-Überschrift. */}
        {newFriendCount > 0 ? (
          <DiscoverySection
            emphasize
            title={`${newFriendCount} neue ${newFriendCount === 1 ? "Bewertung" : "Bewertungen"} von Freunden`}
            candidates={newFriendCandidates}
            userId={user.id}
          />
        ) : (
          sections.hasFollows && <h2 className="text-lg font-semibold">Nichts Neues von Freunden — entdecke weitere Ideen</h2>
        )}

        {/*
          Eigener Aktivitäts-Kontext -- kompakter Baustein direkt unter der
          wichtigsten Freundesaktivität, kein eigener Feed-Konkurrent. Klick
          auf "von dir" öffnet die bestehende Aktivitätsansicht
          (/meine-aktivitaet), keine zweite parallele Seite.
        */}
        <Link
          href="/meine-aktivitaet"
          className="w-full flex items-center justify-between rounded-lg border px-3 py-2.5 text-xs hover:bg-accent transition-colors"
        >
          <span className="font-medium text-green-600">{forMeStatus.ownCount} Bewertungen von dir</span>
          <span className="font-medium text-blue-600">{forMeStatus.friendCount} Bewertungen von Freunden</span>
        </Link>

        {/* Abschnitt 2: Persönliche Entdeckung */}
        {highlight && (
          <PersonalDiscoverySection message={highlight.message} candidates={highlight.candidates} userId={user.id} />
        )}

        {/* Abschnitt 3: Warst du schon mal hier? */}
        <RegionPrompts prompts={regionPrompts} userId={user.id} />

        {/* Abschnitt 4: Gib deinen Freunden besondere Empfehlungen */}
        <QuestionPrompts userId={user.id} prompts={questionPrompts} />

        {/* Abschnitt 5: Weitere Aktivitäten aus deinem Netzwerk */}
        {hasMoreNetworkActivity && (
          <>
            <div className="w-full flex items-center gap-3 pt-1" aria-hidden="true">
              <span className="h-px flex-1 bg-border" />
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Mehr aus deinem Netzwerk
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <DiscoverySection title="Gerade neu von Freunden" candidates={freshFromFriends} userId={user.id} />
            <DiscoverySection title="Beliebt im Netzwerk" candidates={popularInNetwork} userId={user.id} />
            <DiscoverySection title="Mehr aus deiner Region" candidates={moreFromRegion} userId={user.id} />
            <DiscoverySection title="Weitere Inspiration" candidates={newForYou} userId={user.id} />
          </>
        )}
      </div>
      <ScrollToTopButton />
    </main>
  );
}
