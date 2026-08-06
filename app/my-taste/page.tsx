import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { QuickSwipeDeck } from "@/components/swipe/quick-swipe-deck";
import { getQuickSwipeMotivation } from "@/lib/quick-swipe-motivation";

export const metadata: Metadata = { title: "My Taste" };

/**
 * My Taste = reiner Quick-Swipe-Bereich (Master-Audit round). Kein
 * sichtbarer Seitentitel, keine Filter/Kategorien/Listen -- nur eine
 * fokussierte Karte (oder ein Battle) und die zwei Bewertungen, so groß wie
 * der Viewport hergibt. Eigene Listen leben wieder im Profil, das
 * Hinzufügen-Werkzeug lebt unter /hinzufuegen. Fixed-viewport (h-dvh,
 * overflow-hidden) statt scrollbarer Seite -- die untere Bottom-Nav bleibt
 * sichtbar (My Taste ist einer ihrer drei Tabs), das Padding hier reserviert
 * exakt deren Höhe.
 */
export default async function MyTastePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/login?next=/my-taste");
  }

  const motivation = await getQuickSwipeMotivation(supabase, user.id, process.env.TMDB_API_KEY);

  return (
    <main className="h-dvh overflow-hidden flex flex-col items-center">
      <div className="flex-1 min-h-0 w-full flex flex-col items-center gap-2 max-w-5xl px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[calc(3.75rem+max(0.75rem,env(safe-area-inset-bottom)))]">
        {motivation && (
          <p className="shrink-0 text-center text-xs font-medium text-muted-foreground px-4">{motivation}</p>
        )}
        <QuickSwipeDeck userId={user.id} />
      </div>
    </main>
  );
}
