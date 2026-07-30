"use client";

import { useState } from "react";
import { Plus, UserPlus } from "lucide-react";
import { GuestSignupModal } from "@/components/guest-signup-modal";
import { DEFAULT_POST_AUTH_PATH } from "@/lib/auth-redirect";

const GUEST_CTA_MESSAGE =
  "Melde dich an, um eigene Listen zu erstellen und mit Freunden zu teilen.";

export function GuestProfileCta({ variant }: { variant: "tile" | "button" }) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      {variant === "tile" ? (
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="flex flex-col items-center justify-center gap-2 aspect-[2/3] w-full rounded-lg border-2 border-dashed border-input text-muted-foreground hover:border-primary hover:text-primary transition-colors"
        >
          <Plus className="size-8" />
          <span className="text-xs font-medium text-center">
            Jetzt eigene Listen erstellen
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground text-sm font-medium px-4 py-2 hover:bg-primary/90 transition-colors min-h-11"
        >
          <UserPlus className="size-4" />
          Teile deine Empfehlungen
        </button>
      )}

      {showModal && (
        <GuestSignupModal
          message={GUEST_CTA_MESSAGE}
          next={DEFAULT_POST_AUTH_PATH}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
