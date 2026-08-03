import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { BackToProfileLink } from "@/components/profile/back-to-profile-link";
import { SwipeInspirationSwitch } from "@/components/swipe/mode-switch";
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
    <main className="h-dvh overflow-hidden flex flex-col items-center">
      <div className="flex-1 min-h-0 w-full flex flex-col items-center gap-4 max-w-5xl p-5 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="w-full flex flex-col gap-2 shrink-0">
          <BackToProfileLink />
          <SwipeInspirationSwitch active="swipe" />
        </div>
        <SwipeDeck userId={user.id} />
      </div>
    </main>
  );
}
