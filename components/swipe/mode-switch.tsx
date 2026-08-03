"use client";

import Link from "next/link";

/**
 * Pill-segmented Swipe/Inspiration switch. Plain <Link>s -- the App Router
 * already does a client-side soft navigation for these (no full page
 * reload), so this satisfies "tab-switch, not reload" without merging two
 * very different page trees into one client component.
 */
export function SwipeInspirationSwitch({
  active,
}: {
  active: "swipe" | "inspiration";
}) {
  return (
    <div className="inline-flex items-center gap-0.5 self-start rounded-full border border-input p-0.5">
      <Link
        href="/swipe"
        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
          active === "swipe"
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Swipe
      </Link>
      <Link
        href="/inspiration"
        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
          active === "inspiration"
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Inspiration
      </Link>
    </div>
  );
}
