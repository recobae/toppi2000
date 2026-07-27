"use client";

import { useEffect, useState } from "react";
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
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showGuestModal, setShowGuestModal] = useState(false);

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
        if (user) {
          await supabase
            .from("user_follows")
            .delete()
            .eq("follower_id", user.id)
            .eq("followed_id", targetUserId);
        }
        setIsFollowing(false);
      } else {
        const response = await fetch("/api/follows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ followedId: targetUserId }),
        });
        if (response.ok) setIsFollowing(true);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
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

      {showGuestModal && (
        <GuestSignupModal
          message={`Melde dich an, um ${targetUsername} zu folgen und immer auf dem Laufenden zu bleiben.`}
          next={`/u/${targetUsername}`}
          onClose={() => setShowGuestModal(false)}
        />
      )}
    </>
  );
}
