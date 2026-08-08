"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { GuestSignupModal } from "@/components/guest-signup-modal";

export function FollowButton({
  targetUserId,
  targetUsername,
  initialIsLoggedIn,
  initialIsFollowing,
  iconOnly,
}: {
  targetUserId: string;
  targetUsername: string;
  /**
   * Server-known initial state -- the caller's page already resolved
   * viewer.id and profile.id, so it can pass these to skip the client-side
   * getUser()+user_follows roundtrip on first render entirely. Optional:
   * callers that don't know this server-side (e.g. a client-fetched
   * suggestions list) can omit both and keep the old client-fetch behavior.
   */
  initialIsLoggedIn?: boolean;
  initialIsFollowing?: boolean;
  /**
   * Kompakter Icon-Button statt der vollen "Inspirierend"-Pille -- gleiches
   * Prop-Muster wie ShareListButton's `iconOnly` (components/lists/
   * share-list-button.tsx). Für den bereits-folgend-Zustand ändert sich
   * nichts, der ist schon immer icon-only (MoreHorizontal).
   */
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const hasInitialState = initialIsLoggedIn !== undefined;
  const [isLoggedIn, setIsLoggedIn] = useState(initialIsLoggedIn ?? false);
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing ?? false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [showUnfollowConfirm, setShowUnfollowConfirm] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (hasInitialState) return;
    const supabase = createClient();

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setIsLoggedIn(!!user);
      if (!user) return;

      const { data } = await supabase
        .from("user_follows")
        .select("id")
        .eq("follower_id", user.id)
        .eq("followed_id", targetUserId)
        .maybeSingle();
      setIsFollowing(!!data);
    })();
  }, [targetUserId, hasInitialState]);

  useEffect(() => {
    if (!errorMessage) return;
    const timeout = setTimeout(() => setErrorMessage(null), 3000);
    return () => clearTimeout(timeout);
  }, [errorMessage]);

  const handleFollow = async () => {
    if (!isLoggedIn) {
      setShowGuestModal(true);
      return;
    }
    if (isSubmitting) return;
    setIsSubmitting(true);
    setIsFollowing(true);
    try {
      const response = await fetch("/api/follows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followedId: targetUserId }),
      });

      if (!response.ok) {
        setIsFollowing(false);
        setErrorMessage("Fehlgeschlagen");
        return;
      }
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnfollow = async () => {
    setShowUnfollowConfirm(false);
    if (isSubmitting) return;
    setIsSubmitting(true);
    const supabase = createClient();

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      setIsFollowing(false);
      const { error } = await supabase
        .from("user_follows")
        .delete()
        .eq("follower_id", user.id)
        .eq("followed_id", targetUserId);

      if (error) {
        setIsFollowing(true);
        setErrorMessage("Fehlgeschlagen");
        return;
      }
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isFollowing) {
    return (
      <div className="relative inline-flex items-center">
        <button
          type="button"
          aria-label={`${targetUsername} nicht mehr inspirieren lassen`}
          disabled={isSubmitting}
          onClick={() => setShowUnfollowConfirm(true)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
        >
          <MoreHorizontal className="size-4" />
        </button>

        {errorMessage && (
          <span className="absolute top-full mt-1 whitespace-nowrap rounded bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5 z-10">
            {errorMessage}
          </span>
        )}

        {showUnfollowConfirm && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
            onClick={() => setShowUnfollowConfirm(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Nicht mehr inspirieren lassen bestätigen"
          >
            <div
              className="w-full max-w-sm rounded-lg bg-background border p-5 flex flex-col gap-4"
              onClick={(event) => event.stopPropagation()}
            >
              <p className="text-sm">
                Möchtest du {targetUsername} wirklich nicht mehr folgen / dich nicht mehr
                inspirieren lassen?
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowUnfollowConfirm(false)}
                >
                  Abbrechen
                </Button>
                <Button type="button" variant="destructive" size="sm" onClick={handleUnfollow}>
                  Nicht mehr inspirieren lassen
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (iconOnly) {
    return (
      <div className="relative inline-flex items-center">
        <button
          type="button"
          aria-label={`${targetUsername} inspirieren lassen`}
          title="Inspirierend folgen"
          disabled={isSubmitting}
          onClick={handleFollow}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-input text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
        >
          <Sparkles className="size-4" />
        </button>

        {errorMessage && (
          <span className="absolute top-full mt-1 whitespace-nowrap rounded bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5 z-10">
            {errorMessage}
          </span>
        )}

        {showGuestModal && (
          <GuestSignupModal
            message={`Melde dich an, um dich von ${targetUsername} inspirieren zu lassen und immer auf dem Laufenden zu bleiben.`}
            next={`/u/${targetUsername}`}
            onClose={() => setShowGuestModal(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="relative flex flex-col items-center gap-1">
      <Button
        variant="default"
        size="sm"
        disabled={isSubmitting}
        onClick={handleFollow}
        className="min-h-11"
      >
        <Sparkles className="size-4" />
        Inspirierend
      </Button>

      {errorMessage && (
        <span className="absolute top-full mt-1 whitespace-nowrap rounded bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5 z-10">
          {errorMessage}
        </span>
      )}

      {showGuestModal && (
        <GuestSignupModal
          message={`Melde dich an, um dich von ${targetUsername} inspirieren zu lassen und immer auf dem Laufenden zu bleiben.`}
          next={`/u/${targetUsername}`}
          onClose={() => setShowGuestModal(false)}
        />
      )}
    </div>
  );
}
