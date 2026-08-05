"use client";

import { useEffect } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { ProfileAvatar } from "@/components/profile/profile-avatar";

type FollowerProfile = {
  id: string;
  username: string;
  avatarUrl: string | null;
};

/**
 * Renders exactly the list already known to the caller (FollowingBar's
 * `followingProfiles`) instead of running its own `user_follows` query --
 * this used to independently fetch INBOUND followers of the profile while
 * FollowingBar's avatars/count are the OUTBOUND following list, so the
 * count shown on the button and the list opened here could describe two
 * different sets of people. Passing the identical array in guarantees they
 * can never diverge.
 */
export function FollowerListModal({
  profiles,
  onClose,
}: {
  profiles: FollowerProfile[];
  onClose: () => void;
}) {
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Gefolgte"
    >
      <div
        className="w-full max-w-sm max-h-[80vh] overflow-y-auto rounded-lg bg-background border p-5 flex flex-col gap-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Gefolgte</p>
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
          {profiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch niemandem gefolgt.</p>
          ) : (
            profiles.map((profile) => (
              <div key={profile.id} className="flex items-center gap-3 py-1.5">
                <Link
                  href={`/u/${profile.username}`}
                  onClick={onClose}
                  className="flex flex-1 items-center gap-3 min-w-0"
                >
                  <ProfileAvatar
                    username={profile.username}
                    imageUrl={profile.avatarUrl}
                    size="sm"
                  />
                  <span className="text-sm font-medium truncate">
                    {profile.username}
                  </span>
                </Link>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
