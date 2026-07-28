"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
  if (pathname === `/u/${username}`) return null;

  return (
    <Link
      href={`/u/${username}`}
      aria-label="Zu meinem Profil"
      className="fixed top-4 right-4 z-50 rounded-full shadow-sm hover:opacity-90 transition-opacity"
    >
      <ProfileAvatar username={username} imageUrl={avatarUrl} size="sm" />
    </Link>
  );
}
