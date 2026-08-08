"use client";

import { useEffect, useState } from "react";

const DEFAULT_DURATION_MS = 3500;

/**
 * Generischer Toast-Hook + Darstellung (Profil-Umbau §9) -- ersetzt keine der
 * 7 bestehenden eigenständigen useState+setTimeout-Umsetzungen im Projekt
 * (das wäre ein eigenständiges Migrationsprojekt), aber ab jetzt die eine
 * Quelle für neue Stellen wie den Netzwerk-Bewertungs-Hinweis. Selbes
 * fixed-bottom-Layout wie components/nav/daily-stats-toast.tsx.
 */
export function useToast(durationMs = DEFAULT_DURATION_MS) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const timeout = setTimeout(() => setMessage(null), durationMs);
    return () => clearTimeout(timeout);
  }, [message, durationMs]);

  return { message, showToast: setMessage };
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none px-4">
      <div className="rounded-full bg-foreground text-background px-4 py-2 text-xs font-medium shadow-raised text-center max-w-xs">
        {message}
      </div>
    </div>
  );
}
