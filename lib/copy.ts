import type { RatingDecision } from "@/lib/rating-engine";

/**
 * Die einzige Quelle für sichtbare Produktsprache (Lohnt-sich-Umbau §8).
 * Jede Komponente, die einen dieser Begriffe anzeigt -- Buttons, Tooltips,
 * Benachrichtigungen, Empty States -- importiert von hier, statt den
 * String selbst zu wiederholen. Interne technische Werte (DB-Spalten,
 * Variablennamen wie `"like"`/`"dislike"`/`RatingDecision`) dürfen davon
 * abweichen (siehe lib/rating-engine.ts), müssen aber immer durch genau
 * diese eine Stelle in Anzeigetext übersetzt werden.
 */
export const RATING_LABELS: Record<RatingDecision, string> = {
  lohnt_sich: "Lohnt sich",
  lohnt_sich_nicht: "Lohnt sich nicht",
  kenne_ich_nicht: "Kenne ich noch nicht",
};

export const ADD_LABEL = "Hinzufügen";
export const ADDED_LABEL = "Hinzugefügt";
export const INSPIRED_LABEL = "Inspiriert";
export const MORE_INSPIRATION_LABEL = "Weitere Inspiration";

/** "{actor} wurde von deiner Empfehlung „{title}" inspiriert" -- die eine Formulierung für dieses Ereignis (lib/notifications.ts). */
export function inspiredNotificationText(actor: string, title: string | null): string {
  return title
    ? `${actor} wurde von deiner Empfehlung „${title}“ inspiriert`
    : `${actor} wurde von deiner Empfehlung inspiriert`;
}
