import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ListOverviewRow } from "@/components/profile/list-overview-row";
import { Button } from "@/components/ui/button";
import { getCuratedLists } from "@/lib/curated-lists";

export const metadata: Metadata = { title: "Willkommen bei Toppi" };

/**
 * Shown exactly once, right after signup, before the (still empty) profile
 * page -- see resolveSignupRedirectPath in lib/auth-redirect.ts for the
 * routing decision. onboarding_completed is flipped here rather than at
 * redirect time, so a user who never actually reaches this page (network
 * error, closed tab) still gets it on their next login instead of skipping
 * it silently.
 */
export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect("/");
  }

  // Direct/repeat visit after the flow already ran once (or a system
  // account, which never gets routed here in the first place but is
  // guarded again here for safety) -- bounce straight into the deck
  // instead of re-showing the picker.
  if (profile.onboarding_completed) {
    redirect("/swipe");
  }

  const { error } = await supabase
    .from("profiles")
    .update({ onboarding_completed: true })
    .eq("id", user.id);
  if (error) {
    console.error("marking onboarding_completed failed", error);
  }

  const curatedLists = await getCuratedLists(supabase, { featuredOnboardingOnly: true });

  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-6 max-w-2xl p-5 pt-10">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">Willkommen bei Toppi!</h1>
          <p className="text-sm text-muted-foreground">
            Ein paar Startpunkte, kuratiert von TomatoTomato -- tippe rein und bewerte,
            was dich anspricht, oder überspringe direkt in die App.
          </p>
        </div>

        {curatedLists.length > 0 ? (
          <div className="w-full flex flex-col gap-2">
            {curatedLists.map((list) => (
              <ListOverviewRow
                key={list.key}
                title={list.name}
                icon={MapPin}
                preview={{ type: "collage", urls: list.photoUrls }}
                itemCount={list.itemCount}
                noteCount={list.noteCount}
                savedCount={list.savedCount}
                href={`/u/${list.ownerUsername}/orte/${list.key}`}
                shareUrl={`/u/${list.ownerUsername}/orte/${list.key}`}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Gerade keine Startlisten verfügbar -- leg direkt mit deinem eigenen Profil los.
          </p>
        )}

        <Button asChild size="lg" variant="outline" className="w-full">
          <Link href="/swipe">Überspringen</Link>
        </Button>
      </div>
    </main>
  );
}
