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
 * A handful of question cards to actively prompt the viewer into asking (or
 * answering) something, rather than just passively consuming the stream --
 * cheap social-discovery trigger, no LLM involved. Mixes the viewer's own
 * home city (if set) with a couple of curated destinations so it's never
 * empty, and mixes Mein-Topf-style questions with an Orte-style one.
 */
export function buildQuestionPrompts(homeCity: string | null, limit = 4): QuestionPrompt[] {
  const cities = [
    ...(homeCity ? [homeCity] : []),
    ...CURATED_CITY_LABELS.filter((city) => city !== homeCity).slice(0, 6),
  ];

  const prompts: QuestionPrompt[] = [];
  for (let i = 0; i < TOPF_TEMPLATES.length && prompts.length < limit - 1; i++) {
    const template = TOPF_TEMPLATES[i];
    const city = cities[i % cities.length];
    if (!city) continue;
    prompts.push({ kind: "topf", categoryKey: template.categoryKey, question: template.phrase(city) });
  }

  const orteCity = cities[cities.length - 1] ?? "Bali";
  prompts.push({ kind: "orte", city: orteCity, question: ORTE_TEMPLATE(orteCity) });

  return prompts.slice(0, limit);
}
