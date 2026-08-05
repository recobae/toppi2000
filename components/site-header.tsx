"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { getProfileAvatarImageUrl } from "@/lib/saved-items";

export function SiteHeader() {
  const pathname = usePathname();
  const [username, setUsername] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle();
      if (!profile?.username) return;
      setUsername(profile.username);

      setAvatarUrl(await getProfileAvatarImageUrl(supabase, user.id));
    })();
  }, []);

  if (!username) return null;

  // Own profile overview or any of its own list detail pages already carry
  // an equivalent "back to profile" affordance -- showing the avatar there
  // too would be a redundant link to the page you're already on. The swipe
  // screen has its own BackToProfileLink text link in-flow for the same
  // reason -- a second, floating icon button for the identical action is
  // redundant chrome on an already tight mobile viewport.
  const onOwnProfile =
    pathname === `/u/${username}` || pathname.startsWith(`/u/${username}/`);

  if (onOwnProfile || pathname === "/swipe") return null;

  return (
    // Same top-4 left-4 as the own-profile page's own avatar block -- this
    // used to sit top-right instead, a second, independently-positioned
    // implementation of "get back to my profile" that only agreed on the
    // page where SiteHeader hides itself entirely.
    <div className="fixed top-4 left-4 z-50 flex items-center gap-2">
      <Link
        href={`/u/${username}`}
        aria-label="Zu meinem Profil"
        className="rounded-full shadow-sm hover:opacity-90 transition-opacity"
      >
        <ProfileAvatar username={username} imageUrl={avatarUrl} size="sm" />
      </Link>
    </div>
  );
}
