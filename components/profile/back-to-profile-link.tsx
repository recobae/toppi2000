"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { LAST_VISITED_PROFILE_KEY } from "@/components/profile/track-last-visited";

export function BackToProfileLink({
  className,
}: {
  className?: string;
}) {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    (async () => {
      // Always resolve the actual signed-in user first -- localStorage is
      // not scoped per account, so a value written by a previous session
      // (a different account, or a guest browsing before logging in) must
      // never be trusted on its own.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle();
      const ownUsername = profile?.username ?? null;
      if (!ownUsername) return;

      let lastVisitedUsername: string | null = null;
      try {
        lastVisitedUsername = localStorage.getItem(LAST_VISITED_PROFILE_KEY);
      } catch {
        // localStorage unavailable; fall back to the own-profile link below
      }

      // Only a genuinely different, foreign profile is worth a shortcut back
      // to "the profile I was just looking at" -- otherwise this is just the
      // own-profile link.
      const target =
        lastVisitedUsername && lastVisitedUsername !== ownUsername
          ? lastVisitedUsername
          : ownUsername;

      setHref(`/u/${target}`);
    })();
  }, []);

  if (!href) return null;

  return (
    <Link
      href={href}
      className={className ?? "text-sm text-muted-foreground hover:underline w-fit"}
    >
      ← Zum Profil
    </Link>
  );
}
