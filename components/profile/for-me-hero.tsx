"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Lock, Plus, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ProgressRing } from "@/components/profile/progress-badges";
import { markForMeUnlockNotified, type ForMeStatus } from "@/lib/for-me";

const HERO_SIZE = 96;
const HERO_STROKE = 4;

/**
 * Own-profile hero: replaces the avatar at the top of the page (same size/
 * position the avatar used to have). "My Taste" (renamed Swipe) sits above
 * it as the input side of the funnel -- what you rate there is what feeds
 * this. The ring/lock/sparkle logic itself is unchanged from the old
 * FollowingBar ForMeWidget, just sized up to hero scale.
 */
export function ForMeHero({ userId, forMe }: { userId: string; forMe: ForMeStatus }) {
  const [unlockToast, setUnlockToast] = useState(false);

  // Fires exactly once, at the actual unlock moment (server already
  // confirmed topf_unlocked_notified was still false) -- never re-shown.
  useEffect(() => {
    if (!forMe.justUnlocked) return;
    setUnlockToast(true);
    const supabase = createClient();
    markForMeUnlockNotified(supabase, userId);
    const timeout = setTimeout(() => setUnlockToast(false), 4000);
    return () => clearTimeout(timeout);
  }, [forMe.justUnlocked, userId]);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <Link
        href="/swipe"
        aria-label="My Taste"
        className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-gradient-to-br from-primary to-primary/60 text-primary-foreground text-xs font-medium"
      >
        <Plus className="size-3.5" />
        My Taste
      </Link>
      <div className="h-4 w-px bg-border" aria-hidden="true" />

      <Link
        href="/topf"
        aria-label={forMe.isUnlocked ? "For Me" : "For Me (noch gesperrt)"}
        className="relative flex items-center justify-center rounded-full overflow-hidden bg-muted border border-border"
        style={{ height: HERO_SIZE, width: HERO_SIZE }}
      >
        {!forMe.isUnlocked && forMe.previewImageUrls.length > 0 && (
          <>
            <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
              {Array.from({ length: 4 }).map((_, index) => {
                const url = forMe.previewImageUrls[index % forMe.previewImageUrls.length];
                return (
                  <div key={index} className="relative bg-muted">
                    <Image
                      src={url}
                      alt=""
                      fill
                      sizes="48px"
                      className="object-cover blur-[4px] scale-125"
                    />
                  </div>
                );
              })}
            </div>
            <div className="absolute inset-0 bg-background/40" />
          </>
        )}
        <ProgressRing fraction={forMe.fraction} size={HERO_SIZE - 4} stroke={HERO_STROKE} />
        <span className="absolute inset-0 flex items-center justify-center">
          {forMe.isUnlocked ? (
            <Sparkles className="size-7 text-primary" />
          ) : (
            <Lock className="size-6 text-foreground" />
          )}
        </span>
      </Link>

      <span className="text-sm font-semibold">For Me</span>
      <span className="flex items-center gap-2 text-[11px]">
        <span className="font-medium text-green-600 whitespace-nowrap">{forMe.ownCount} von dir</span>
        <span className="font-medium text-blue-600 whitespace-nowrap">{forMe.friendCount} von Freunden</span>
      </span>

      {unlockToast && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="rounded-md bg-foreground text-background px-4 py-2 text-sm shadow-lg">
            🎉 Dein &bdquo;For Me&ldquo;-Bereich ist jetzt offen!
          </div>
        </div>
      )}
    </div>
  );
}
