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
      let lastVisitedUsername: string | null = null;
      try {
        lastVisitedUsername = localStorage.getItem(LAST_VISITED_PROFILE_KEY);
      } catch {
        // localStorage unavailable; fall back to the own-profile lookup below
      }

      if (lastVisitedUsername) {
        setHref(`/u/${lastVisitedUsername}`);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.username) {
        setHref(`/u/${profile.username}`);
      }
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
