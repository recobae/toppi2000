import { CURATED_CITY_LABELS } from "@/lib/places";

export type QuestionPrompt =
  | { kind: "topf"; categoryKey: string; question: string }
  | { kind: "orte"; city: string; question: string };

// Handwerker/Ärzte/Friseure/... -- the place-group Mein-Topf categories
// (see lib/recommendation-categories.ts), each with a natural-sounding
// "kennst du..." phrasing. Templated, not AI-generated: these are meant as
// low-effort nudges to open the existing "Empfehlen"-Flow (EntryModal), not
// a claim of real personalization.
const TOPF_TEMPLATES: { categoryKey: string; phrase: (city: string) => string }[] = [
  { categoryKey: "handwerker", phrase: (city) => `Kennst du einen guten Handwerker in ${city}?` },
  { categoryKey: "friseure", phrase: (city) => `Weißt du einen guten Friseur in ${city}?` },
  { categoryKey: "aerzte", phrase: (city) => `Kennst du einen guten Arzt in ${city}?` },
  { categoryKey: "autowerkstaetten", phrase: (city) => `Kennst du eine gute Werkstatt in ${city}?` },
  { categoryKey: "fitnessstudios", phrase: (city) => `Welches Fitnessstudio in ${city} ist wirklich gut?` },
];

const ORTE_TEMPLATE = (city: string) => `Welcher Ort in ${city} ist wirklich empfehlenswert?`;

/**
 * "Gib deinen Freunden besondere Empfehlungen" -- all question cards are
 * deliberately anchored to the SAME city, the viewer's own home_city from
 * Settings, so the section reads as one coherent prompt ("frag dein
 * Netzwerk über DEINE Stadt") instead of a random assortment of cities.
 * Falls back to a curated city only when no home_city is set at all.
 */
export function buildQuestionPrompts(homeCity: string | null, limit = 4): QuestionPrompt[] {
  const city = homeCity ?? CURATED_CITY_LABELS[0];

  const prompts: QuestionPrompt[] = TOPF_TEMPLATES.slice(0, limit - 1).map((template) => ({
    kind: "topf",
    categoryKey: template.categoryKey,
    question: template.phrase(city),
  }));
  prompts.push({ kind: "orte", city, question: ORTE_TEMPLATE(city) });

  return prompts.slice(0, limit);
}
