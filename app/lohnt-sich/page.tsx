import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { QuickSwipeDeck } from "@/components/swipe/quick-swipe-deck";

export const metadata: Metadata = { title: "Lohnt sich?" };

/**
 * "Lohnt sich?" = reiner Quick-Swipe-Bereich (früher "My Taste", umbenannt im
 * Lohnt-sich-Umbau zur direkten Umsetzung des Produktprinzips: "Toppi zeigt
 * dir, was sich wirklich lohnt"). Kein sichtbarer Seitentitel im Deck selbst
 * -- nur eine fokussierte Karte (oder ein Battle) und die drei Bewertungen
 * (✅ Lohnt sich / ❌ Lohnt sich nicht / ❓ Kenne ich noch nicht), so groß wie
 * der Viewport hergibt. Eigene Listen leben im Profil, das Hinzufügen-
 * Werkzeug unter /hinzufuegen. Fixed-viewport (h-dvh, overflow-hidden) statt
 * scrollbarer Seite -- die untere Bottom-Nav bleibt sichtbar (Lohnt sich? ist
 * einer ihrer drei Tabs), das Padding hier reserviert exakt deren Höhe.
 */
export default async function LohntSichPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/login?next=/lohnt-sich");
  }

  return (
    <main className="h-dvh overflow-hidden flex flex-col items-center">
      <div className="flex-1 min-h-0 w-full flex flex-col items-center gap-2 max-w-5xl px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[calc(3.75rem+max(0.75rem,env(safe-area-inset-bottom)))]">
        <div className="w-full max-w-[min(92vw,420px)] text-center shrink-0 pb-1">
          <h1 className="text-xl font-semibold">Lohnt sich?</h1>
          <p className="text-xs text-muted-foreground">
            Bewerte schnell, was sich für dich und deine Freunde wirklich lohnt.
          </p>
        </div>
        <QuickSwipeDeck userId={user.id} />
      </div>
    </main>
  );
}
