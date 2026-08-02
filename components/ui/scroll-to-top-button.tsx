"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

const SHOW_AFTER_PX = 400;

/**
 * Dezenter, sticky "nach oben"-Button für lange Listen-Ansichten (eigene
 * Filme&Serien-/Orte-Listen und fremde Profil-Listen) -- blendet sich erst
 * nach einer gewissen Scroll-Distanz ein, statt permanent im Weg zu stehen.
 */
export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      aria-label="Nach oben scrollen"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed bottom-4 right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-background/90 border border-input text-muted-foreground shadow-md backdrop-blur transition-colors hover:text-foreground hover:border-primary"
    >
      <ArrowUp className="size-4" />
    </button>
  );
}
