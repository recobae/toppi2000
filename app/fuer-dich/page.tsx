import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { DiscoveryStream } from "@/components/discovery/discovery-stream";
import { DiscoverySection } from "@/components/discovery/discovery-section";
import { RegionPrompts } from "@/components/discovery/region-prompts";
import { QuestionPrompts } from "@/components/discovery/question-prompts";
import { getDiscoverySections, getNetworkRegionPrompts } from "@/lib/discovery";
import { buildQuestionPrompts } from "@/lib/question-prompts";
import { ScrollToTopButton } from "@/components/ui/scroll-to-top-button";
import { NotificationBell } from "@/components/notifications/notification-bell";

export const metadata: Metadata = { title: "Für Dich" };

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

  const [sections, regionPrompts] = await Promise.all([
    getDiscoverySections(supabase, user.id, {
      homeCity,
      tmdbApiKey: process.env.TMDB_API_KEY,
      placesApiKey: process.env.GOOGLE_PLACES_API_KEY,
    }),
    getNetworkRegionPrompts(supabase, user.id),
  ]);
  const questionPrompts = buildQuestionPrompts(homeCity);

  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-6 max-w-2xl p-5 pt-6">
        {/* Kein erklärender Untertext -- die Karten selbst (frisch, sozial, mit Begründung) machen sofort klar, worum es hier geht. */}
        <div className="w-full flex items-center justify-between">
          <h1 className="text-lg font-semibold">Für Dich</h1>
          <NotificationBell userId={user.id} />
        </div>

        <DiscoveryStream userId={user.id} />

        <RegionPrompts prompts={regionPrompts} userId={user.id} />
        <QuestionPrompts userId={user.id} prompts={questionPrompts} />

        {/*
          Sichtbare Zäsur vor dem fortlaufenden Stream -- macht klar, dass
          hier ein neuer, dynamischer Teil beginnt statt dass die Seite nach
          den ersten drei Blöcken "aufhört".
        */}
        <div className="w-full flex items-center gap-3 pt-1" aria-hidden="true">
          <span className="h-px flex-1 bg-border" />
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            Mehr aus deinem Netzwerk
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <DiscoverySection title="Gerade neu von Freunden" candidates={sections.freshFromFriends} userId={user.id} />
        <DiscoverySection title="Beliebt im Netzwerk" candidates={sections.popularInNetwork} userId={user.id} />
        <DiscoverySection title="Verwandte Empfehlungen" candidates={sections.related} userId={user.id} />
        <DiscoverySection title="Mehr aus deiner Region" candidates={sections.moreFromRegion} userId={user.id} />
        <DiscoverySection title="Neu für dich" candidates={sections.newForYou} userId={user.id} />
      </div>
      <ScrollToTopButton />
    </main>
  );
}
