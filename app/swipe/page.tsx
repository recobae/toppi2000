import { redirect } from "next/navigation";
import type { Metadata } from "next";
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
          <h1 className="text-lg font-semibold">Swipe</h1>
        </div>
        <SwipeDeck userId={user.id} />
      </div>
    </main>
  );
}
