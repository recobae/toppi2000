"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ProfileAvatar } from "@/components/profile/profile-avatar";

type FollowerProfile = {
  id: string;
  username: string;
  avatarUrl: string | null;
};

export function FollowerListModal({
  targetUserId,
  onClose,
}: {
  targetUserId: string;
  onClose: () => void;
}) {
  const [followers, setFollowers] = useState<FollowerProfile[] | null>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    const supabase = createClient();

    (async () => {
      const { data: followRows } = await supabase
        .from("user_follows")
        .select("follower_id")
        .eq("followed_id", targetUserId);
      const followerIds = (followRows ?? []).map((row) => row.follower_id);

      if (followerIds.length === 0) {
        setFollowers([]);
        return;
      }

      const [{ data: profiles }, { data: avatarItems }] = await Promise.all([
        supabase.from("profiles").select("id, username").in("id", followerIds),
        supabase
          .from("top_list")
          .select("user_id, image_url")
          .in("user_id", followerIds)
          .order("position", { ascending: true }),
      ]);

      const avatarByUserId = new Map<string, string>();
      for (const item of avatarItems ?? []) {
        if (item.image_url && !avatarByUserId.has(item.user_id)) {
          avatarByUserId.set(item.user_id, item.image_url);
        }
      }

      setFollowers(
        (profiles ?? []).map((profile) => ({
          id: profile.id,
          username: profile.username,
          avatarUrl: avatarByUserId.get(profile.id) ?? null,
        })),
      );
    })();
  }, [targetUserId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Follower"
    >
      <div
        className="w-full max-w-sm max-h-[80vh] overflow-y-auto rounded-lg bg-background border p-5 flex flex-col gap-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Follower</p>
          <button
            type="button"
            aria-label="Schließen"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-1">
          {followers === null ? (
            <p className="text-sm text-muted-foreground">Lädt…</p>
          ) : followers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Follower.</p>
          ) : (
            followers.map((follower) => (
              <div
                key={follower.id}
                className="flex items-center gap-3 py-1.5"
              >
                <Link
                  href={`/u/${follower.username}`}
                  onClick={onClose}
                  className="flex flex-1 items-center gap-3 min-w-0"
                >
                  <ProfileAvatar
                    username={follower.username}
                    imageUrl={follower.avatarUrl}
                    size="sm"
                  />
                  <span className="text-sm font-medium truncate">
                    {follower.username}
                  </span>
                </Link>
                {/* Reserved for a future "Als Follower entfernen" action. */}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
