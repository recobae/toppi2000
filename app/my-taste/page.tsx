import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { QuickSwipeDeck } from "@/components/swipe/quick-swipe-deck";

export const metadata: Metadata = { title: "My Taste" };

/**
 * My Taste = reiner Quick-Swipe-Bereich (Master-Audit round). Kein
 * Header-Menü, keine Filter/Kategorien/Listen -- nur eine fokussierte
 * Karte (oder ein Battle) und die zwei Bewertungen. Eigene Listen leben
 * wieder im Profil, das Hinzufügen-Werkzeug lebt unter /hinzufuegen.
 */
export default async function MyTastePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/login?next=/my-taste");
  }

  return (
    <main className="h-dvh overflow-hidden flex flex-col items-center">
      <div className="flex-1 min-h-0 w-full flex flex-col items-center gap-4 max-w-5xl p-5 pt-[max(2rem,env(safe-area-inset-top))] pb-[calc(3.75rem+max(1.25rem,env(safe-area-inset-bottom)))]">
        <h1 className="text-lg font-semibold shrink-0">My Taste</h1>
        <QuickSwipeDeck userId={user.id} />
      </div>
    </main>
  );
}
