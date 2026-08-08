"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getTodayInteractionCount } from "@/lib/interactions";

const MY_TASTE_PREFIX = "/lohnt-sich";
const TOAST_DURATION_MS = 3500;

function formatMessage(count: number): string {
  return count === 1
    ? "Heute 1 neue Bewertung für deine Freunde gesammelt"
    : `Heute ${count} neue Bewertungen für deine Freunde gesammelt`;
}

/**
 * Globally mounted (app/layout.tsx, alongside BottomNav) so it survives the
 * My-Taste page itself unmounting -- the toast has to render on whatever
 * screen the user landed on AFTER leaving Quick-Swipe (Für Dich, Profil,
 * browser back, another main tab), not on the page that's already gone.
 * Tracks entering/leaving "/my-taste" purely via usePathname transitions:
 * fetches a baseline today-count on entry, and on the transition away
 * (exactly once per visit, guarded by a ref so re-renders/route events
 * can't double-fire it) fetches the real current count and only shows a
 * toast if it's genuinely higher than the baseline -- never from a local
 * counter alone, since that would drift across reloads/multiple tabs.
 */
export function DailyStatsToast() {
  const pathname = usePathname();
  const [message, setMessage] = useState<string | null>(null);
  const wasOnMyTasteRef = useRef(false);
  const baselineRef = useRef<number | null>(null);
  const toastShownRef = useRef(false);
  const userIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const isOnMyTaste = pathname.startsWith(MY_TASTE_PREFIX);
    const wasOnMyTaste = wasOnMyTasteRef.current;
    wasOnMyTasteRef.current = isOnMyTaste;

    if (isOnMyTaste === wasOnMyTaste) return;

    (async () => {
      const supabase = createClient();
      if (userIdRef.current === undefined) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        userIdRef.current = user?.id ?? null;
      }
      const userId = userIdRef.current;
      if (!userId) return;

      if (isOnMyTaste) {
        baselineRef.current = await getTodayInteractionCount(supabase, userId);
        toastShownRef.current = false;
        return;
      }

      if (toastShownRef.current || baselineRef.current === null) return;
      toastShownRef.current = true;
      const current = await getTodayInteractionCount(supabase, userId);
      if (current > baselineRef.current) {
        setMessage(formatMessage(current));
      }
      baselineRef.current = current;
    })();
  }, [pathname]);

  useEffect(() => {
    if (!message) return;
    const timeout = setTimeout(() => setMessage(null), TOAST_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [message]);

  if (!message) return null;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none px-4">
      <div className="rounded-full bg-foreground text-background px-4 py-2 text-xs font-medium shadow-lg text-center">
        {message}
      </div>
    </div>
  );
}
