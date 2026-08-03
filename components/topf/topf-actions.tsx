"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Mic, Plus } from "lucide-react";
import { AskOverlay } from "@/components/topf/ask-overlay";
import { EntryModal } from "@/components/topf/entry-modal";

/** The two client-interactive pieces of the "Mein Topf" home screen: the persistent "Frag einfach..." bar and the "+" entry trigger. Everything else on the page is server-rendered. */
export function TopfActions({ userId }: { userId: string }) {
  const router = useRouter();
  const [showAsk, setShowAsk] = useState(false);
  const [showEntry, setShowEntry] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setShowAsk(true)}
        className="w-full flex items-center gap-2 h-11 px-3 rounded-lg border border-input text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
      >
        <Mic className="size-4 shrink-0" />
        Frag einfach...
      </button>

      <button
        type="button"
        onClick={() => setShowEntry(true)}
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
        aria-label="Empfehlung eintragen"
      >
        <Plus className="size-5" />
      </button>

      {showAsk && <AskOverlay userId={userId} onClose={() => setShowAsk(false)} />}
      {showEntry && (
        <EntryModal
          userId={userId}
          onClose={() => setShowEntry(false)}
          onSaved={(categoryKey) => router.push(`/topf/${categoryKey}`)}
        />
      )}
    </>
  );
}
