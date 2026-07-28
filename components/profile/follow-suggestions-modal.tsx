"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { FollowButton } from "@/components/profile/follow-button";

type SuggestedProfile = {
  id: string;
  username: string;
};

export function FollowSuggestionsModal({
  currentUserId,
  onClose,
}: {
  currentUserId: string;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [profiles, setProfiles] = useState<SuggestedProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
    const trimmed = query.trim();
    setIsLoading(true);

    const timeout = setTimeout(async () => {
      let request = supabase
        .from("profiles")
        .select("id, username")
        .neq("id", currentUserId)
        .order("username", { ascending: true })
        .limit(20);

      if (trimmed) {
        request = request.ilike("username", `%${trimmed}%`);
      }

      const { data } = await request;
      setProfiles(data ?? []);
      setIsLoading(false);
    }, 250);

    return () => clearTimeout(timeout);
  }, [query, currentUserId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Profile vorschlagen"
    >
      <div
        className="w-full max-w-sm max-h-[80vh] overflow-y-auto rounded-lg bg-background border p-5 flex flex-col gap-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Profile entdecken</p>
          <button
            type="button"
            aria-label="Schließen"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
          >
            <X className="size-4" />
          </button>
        </div>

        <input
          type="text"
          placeholder="Username suchen…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus
          className="w-full rounded-md border border-input px-3 py-2 text-sm bg-transparent"
        />

        <div className="flex flex-col gap-1">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Lädt…</p>
          ) : profiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Profile gefunden.</p>
          ) : (
            profiles.map((profile) => (
              <div
                key={profile.id}
                className="flex items-center gap-3 py-1.5"
              >
                <ProfileAvatar
                  username={profile.username}
                  imageUrl={null}
                  size="sm"
                />
                <span className="flex-1 text-sm font-medium truncate">
                  {profile.username}
                </span>
                <FollowButton
                  targetUserId={profile.id}
                  targetUsername={profile.username}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
