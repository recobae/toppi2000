"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles, Star, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const HIDDEN_PREFIXES = ["/auth", "/onboarding"];

/**
 * The app's one primary navigation surface (Instagram/TikTok-style): three
 * tabs -- Für Dich (Discovery), My Taste (own taste/activity/lists), Profil
 * (social identity). Everything else in the app is reached FROM one of
 * these three, never the other way around.
 */
export function BottomNav() {
  const pathname = usePathname();
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const loadUsername = async (userId: string) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", userId)
        .maybeSingle();
      if (!cancelled) setUsername(profile?.username ?? null);
    };

    // Initial check for a session that already existed when this component
    // mounted (e.g. a page reload while logged in).
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) loadUsername(user.id);
    });

    // BottomNav lives in the root layout, so it's mounted ONCE for the whole
    // session and never remounts across client-side navigations -- if it
    // first mounted on the login page (no session yet), the one-shot check
    // above ran with no user and never re-ran. A fresh login/logout doesn't
    // reload the page (router.push, not a full navigation), so without this
    // subscription the bar would just silently never appear post-login until
    // a manual reload. onAuthStateChange fires SIGNED_IN/SIGNED_OUT on this
    // same long-lived instance regardless of which route triggered it.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadUsername(session.user.id);
      } else {
        setUsername(null);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const isVisible =
    !!username && !HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  // Reserves space at the bottom of the document so page content never sits
  // underneath the fixed bar -- set here (not per-page) since this is the
  // one component that actually knows, on every route, whether it's showing.
  useEffect(() => {
    document.body.style.paddingBottom = isVisible ? "calc(3.75rem + env(safe-area-inset-bottom))" : "";
    return () => {
      document.body.style.paddingBottom = "";
    };
  }, [isVisible]);

  if (!isVisible) return null;

  const profileHref = `/u/${username}`;
  const tabs = [
    { href: "/fuer-dich", label: "Für Dich", icon: Sparkles, active: pathname.startsWith("/fuer-dich") },
    { href: "/my-taste", label: "My Taste", icon: Star, active: pathname.startsWith("/my-taste") },
    {
      href: profileHref,
      label: "Profil",
      icon: User,
      active: pathname === profileHref || pathname.startsWith(`${profileHref}/`),
    },
  ];

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 border-t bg-background/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]"
      aria-label="Hauptnavigation"
    >
      <div className="mx-auto max-w-2xl grid grid-cols-3">
        {tabs.map(({ href, label, icon: Icon, active }) => (
          <Link
            key={href}
            href={href}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${
              active ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className={`size-5 ${active ? "fill-primary/15" : ""}`} />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
