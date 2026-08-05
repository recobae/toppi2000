import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { DiscoveryStream } from "@/components/discovery/discovery-stream";
import { DiscoverySection } from "@/components/discovery/discovery-section";
import { getDiscoverySections } from "@/lib/discovery";
import { ScrollToTopButton } from "@/components/ui/scroll-to-top-button";

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

  const sections = await getDiscoverySections(supabase, user.id, {
    homeCity: profile?.home_city ?? null,
    tmdbApiKey: process.env.TMDB_API_KEY,
    placesApiKey: process.env.GOOGLE_PLACES_API_KEY,
  });

  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-6 max-w-2xl p-5 pt-6">
        {/* Kein erklärender Untertext -- die Karten selbst (frisch, sozial, mit Begründung) machen sofort klar, worum es hier geht. */}
        <h1 className="text-lg font-semibold">Für Dich</h1>

        <DiscoveryStream userId={user.id} />

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
