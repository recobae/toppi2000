import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Global back-navigation rule (no client state, no localStorage): every
 * list/activity page that belongs to a specific profile already has that
 * profile's username as a route param or a server-fetched value -- so the
 * back link is always exactly that username, passed in directly. A foreign
 * list's back link goes to the foreign profile it belongs to (Regel A),
 * never straight to the viewer's own profile (Regel C) -- getting from a
 * foreign list to your own profile takes two steps: this link to the
 * visited profile, then that profile's own SiteHeader avatar (Regel B).
 * This replaced a resolver that deliberately always pointed at the
 * viewer's own profile, and a localStorage "last visited" tracker that
 * could point at neither.
 */
export function BackToProfileLink({ username }: { username: string }) {
  return (
    <Link
      href={`/u/${username}`}
      aria-label={`Zurück zu ${username}`}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
    >
      <ArrowLeft className="size-4" />
      Zum Profil
    </Link>
  );
}
