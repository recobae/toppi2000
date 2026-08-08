"use client";

import { Check, HelpCircle, X, type LucideIcon } from "lucide-react";
import type { MouseEvent } from "react";
import { RATING_LABELS } from "@/lib/copy";
import type { RatingDecision } from "@/lib/rating-engine";

/**
 * Die eine Quelle für Icon/Farbe/aktiven-Zustand jeder der drei
 * Bewertungsaktionen -- vorher in list-item-row.tsx (ActionBar),
 * discovery-list-row.tsx und quick-swipe-deck.tsx jeweils separat getippt,
 * mit echten Abweichungen (discovery-list-row.tsx hatte z. B. gar keinen
 * aktiven Zustand). `size="sm"` ist die kompakte Listenzeilen-Variante
 * (h-8/size-4/border), `size="lg"` die große Swipe-Deck-Variante
 * (h-14 bzw. h-11 für "Kenne ich noch nicht"/size-6 bzw. size-5/border-2) --
 * bewusst zwei Größen, weil das Swipe-Deck als primäre Wisch-Fläche einen
 * größeren Tap-Target braucht, aber beide ziehen Icon/Farbe/Label jetzt aus
 * derselben Stelle.
 */
const ICON_BY_DECISION: Record<RatingDecision, LucideIcon> = {
  lohnt_sich: Check,
  lohnt_sich_nicht: X,
  kenne_ich_nicht: HelpCircle,
};

const COLOR_CLASSES: Record<RatingDecision, { idle: string; active: string }> = {
  lohnt_sich: {
    idle: "border-input text-green-600 hover:bg-green-600/10",
    active: "border-green-600 bg-green-600/10 text-green-600",
  },
  lohnt_sich_nicht: {
    idle: "border-input text-destructive hover:bg-destructive/10",
    active: "border-destructive bg-destructive/10 text-destructive",
  },
  kenne_ich_nicht: {
    idle: "border-input text-muted-foreground hover:bg-accent",
    active: "border-muted-foreground bg-accent text-foreground",
  },
};

const SM_SIZE_CLASSES = "h-8 w-8";
const SM_ICON_CLASSES = "size-4";
// Lohnt-sich/Lohnt-sich-nicht sind die primäre Wisch-Geste im Lohnt-sich?-
// Deck, deshalb größer als der reine Button "Kenne ich noch nicht" --
// gleiche Asymmetrie wie vorher in quick-swipe-deck.tsx, nur jetzt zentral.
const LG_SIZE_CLASSES: Record<RatingDecision, string> = {
  lohnt_sich: "h-14 w-14",
  lohnt_sich_nicht: "h-14 w-14",
  kenne_ich_nicht: "h-11 w-11",
};
const LG_ICON_CLASSES: Record<RatingDecision, string> = {
  lohnt_sich: "size-6",
  lohnt_sich_nicht: "size-6",
  kenne_ich_nicht: "size-5",
};

export function RatingIconButton({
  decision,
  active = false,
  onClick,
  disabled,
  size = "sm",
  className = "",
}: {
  decision: RatingDecision;
  /** Zeigt den "bereits gesetzt"-Zustand (gefüllte Farbe statt nur Umriss). */
  active?: boolean;
  onClick: (event: MouseEvent) => void;
  disabled?: boolean;
  size?: "sm" | "lg";
  className?: string;
}) {
  const Icon = ICON_BY_DECISION[decision];
  const label = active ? `${RATING_LABELS[decision]} (bereits gesetzt)` : RATING_LABELS[decision];
  const colors = COLOR_CLASSES[decision];
  const sizeClasses = size === "lg" ? LG_SIZE_CLASSES[decision] : SM_SIZE_CLASSES;
  const iconClasses = size === "lg" ? LG_ICON_CLASSES[decision] : SM_ICON_CLASSES;
  const border = size === "lg" ? "border-2" : "border";
  const shape = size === "lg" ? "bg-background shadow-card active:scale-95 transition-transform" : "transition-colors";

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center justify-center rounded-full ${border} ${sizeClasses} ${shape} disabled:opacity-50 ${
        active ? colors.active : colors.idle
      } ${className}`}
    >
      <Icon className={iconClasses} />
    </button>
  );
}
