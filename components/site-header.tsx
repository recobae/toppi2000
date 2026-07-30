"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ProfileAvatar } from "@/components/profile/profile-avatar";

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

      const { data: firstItem } = await supabase
        .from("top_list")
        .select("image_url")
        .eq("user_id", user.id)
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle();
      setAvatarUrl(firstItem?.image_url ?? null);
    })();
  }, []);

  if (!username) return null;

  // Own profile overview or any of its own list detail pages already carry
  // an equivalent "back to profile" affordance -- showing the avatar there
  // too would be a redundant link to the page you're already on.
  const onOwnProfile =
    pathname === `/u/${username}` || pathname.startsWith(`/u/${username}/`);
  const onInspiration = pathname === "/inspiration";

  if (onOwnProfile && onInspiration) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
      {!onInspiration && (
        <Link
          href="/inspiration"
          aria-label="Inspiration"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-background border shadow-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Search className="size-4" />
        </Link>
      )}
      {!onOwnProfile && (
        <Link
          href={`/u/${username}`}
          aria-label="Zu meinem Profil"
          className="rounded-full shadow-sm hover:opacity-90 transition-opacity"
        >
          <ProfileAvatar username={username} imageUrl={avatarUrl} size="sm" />
        </Link>
      )}
    </div>
  );
}
