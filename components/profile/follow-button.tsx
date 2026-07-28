"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { GuestSignupModal } from "@/components/guest-signup-modal";

export function FollowButton({
  targetUserId,
  targetUsername,
}: {
  targetUserId: string;
  targetUsername: string;
}) {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
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
  }, [targetUserId]);

  useEffect(() => {
    if (!errorMessage) return;
    const timeout = setTimeout(() => setErrorMessage(null), 3000);
    return () => clearTimeout(timeout);
  }, [errorMessage]);

  const handleClick = async () => {
    if (!isLoggedIn) {
      setShowGuestModal(true);
      return;
    }
    if (isSubmitting) return;
    setIsSubmitting(true);
    const supabase = createClient();

    try {
      if (isFollowing) {
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
          setErrorMessage("Entfolgen fehlgeschlagen");
          return;
        }
        router.refresh();
      } else {
        setIsFollowing(true);
        const response = await fetch("/api/follows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ followedId: targetUserId }),
        });

        if (!response.ok) {
          setIsFollowing(false);
          setErrorMessage("Folgen fehlgeschlagen");
          return;
        }
        router.refresh();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex flex-col items-center gap-1">
      <Button
        variant={isFollowing ? "outline" : "default"}
        size="sm"
        disabled={isSubmitting}
        onClick={handleClick}
        className="min-h-11"
      >
        {isFollowing ? (
          <UserCheck className="size-4" />
        ) : (
          <UserPlus className="size-4" />
        )}
        {isFollowing ? "Entfolgen" : "Folgen"}
      </Button>

      {errorMessage && (
        <span className="absolute top-full mt-1 whitespace-nowrap rounded bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5 z-10">
          {errorMessage}
        </span>
      )}

      {showGuestModal && (
        <GuestSignupModal
          message={`Melde dich an, um ${targetUsername} zu folgen und immer auf dem Laufenden zu bleiben.`}
          next={`/u/${targetUsername}`}
          onClose={() => setShowGuestModal(false)}
        />
      )}
    </div>
  );
}
