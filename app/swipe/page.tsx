import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { BackToProfileLink } from "@/components/profile/back-to-profile-link";
import { SwipeDeck } from "@/components/swipe/swipe-deck";

export const metadata: Metadata = { title: "Swipe" };

export default async function SwipePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/swipe");
  }

  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col items-center gap-4 max-w-5xl p-5 pt-8">
        <div className="w-full flex flex-col gap-2">
          <BackToProfileLink />
          <div className="w-full flex items-center justify-between gap-2">
            <h1 className="text-lg font-semibold">Swipe</h1>
            {/*
              Secondary, always-reachable path into the full Inspiration
              screen (search, filters, city picker, curated lists) -- kept
              deliberately unassuming so it never competes with the swipe
              deck as the primary entry point (see the "Hierarchie statt
              Gleichrangigkeit" decision: Swipe is now the sole default
              landing view, Inspiration is a secondary deep-dive path, not a
              second equally-weighted destination).
            */}
            <Link
              href="/inspiration"
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-input text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
              <Search className="size-3" />
              Stöbern & suchen
            </Link>
          </div>
        </div>
        <SwipeDeck userId={user.id} />
      </div>
    </main>
  );
}
