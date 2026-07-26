"use client";

import { useEffect } from "react";
import Link from "next/link";

export function GuestSignupModal({
  message,
  next,
  onClose,
}: {
  message: string;
  next: string;
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

  const encodedNext = encodeURIComponent(next);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-sm rounded-lg bg-background border p-5 flex flex-col gap-4"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-sm">{message}</p>
        <div className="flex flex-col gap-2">
          <Link
            href={`/auth/sign-up?next=${encodedNext}`}
            className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-medium px-4 py-2 hover:bg-primary/90 transition-colors min-h-11"
          >
            Jetzt registrieren
          </Link>
          <Link
            href={`/auth/login?next=${encodedNext}`}
            className="text-center text-xs text-muted-foreground hover:underline"
          >
            Bereits registriert? Anmelden
          </Link>
        </div>
      </div>
    </div>
  );
}
