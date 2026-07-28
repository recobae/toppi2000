"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { FollowerListModal } from "@/components/profile/follower-list-modal";

export function FollowerCount({
  targetUserId,
  count,
}: {
  targetUserId: string;
  count: number;
}) {
  const [showModal, setShowModal] = useState(false);

  if (count === 0) {
    return (
      <div className="flex items-center gap-1.5">
        <Users className="size-4" />
        <span>0 Follower</span>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="flex items-center gap-1.5 hover:text-foreground transition-colors"
      >
        <Users className="size-4" />
        <span>{count} Follower</span>
      </button>
      {showModal && (
        <FollowerListModal
          targetUserId={targetUserId}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
