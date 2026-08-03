import {
  Wrench,
  Stethoscope,
  Scissors,
  Dumbbell,
  Car,
  BookOpen,
  Music,
  Mic,
  Shield,
  Shirt,
  Gift,
  ChefHat,
  Briefcase,
  AppWindow,
  Wine,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export type CategoryGroup = "place" | "media" | "freeform";

export type RecommendationCategory = {
  key: string;
  label: string;
  group: CategoryGroup;
  /** Only set for group === "media" -- which catalog API + result shape to use. */
  mediaSubtype?: "book" | "podcast" | "music";
  icon: LucideIcon;
};

/**
 * Fixed categories for the generic "Mein Topf" recommendations table.
 * Deliberately does NOT include Filme/Serien or Restaurants/Orte -- those
 * stay on their existing, unchanged top_list/watchlist/places flows. Adding
 * either here would create two parallel ways to save the same kind of item.
 */
export const RECOMMENDATION_CATEGORIES: RecommendationCategory[] = [
  { key: "handwerker", label: "Handwerker", group: "place", icon: Wrench },
  { key: "aerzte", label: "Ärzte", group: "place", icon: Stethoscope },
  { key: "friseure", label: "Friseure", group: "place", icon: Scissors },
  { key: "fitnessstudios", label: "Fitnessstudios", group: "place", icon: Dumbbell },
  { key: "autowerkstaetten", label: "Autowerkstätten", group: "place", icon: Car },

  { key: "buecher", label: "Bücher", group: "media", mediaSubtype: "book", icon: BookOpen },
  { key: "musik", label: "Musik", group: "media", mediaSubtype: "music", icon: Music },
  { key: "podcasts", label: "Podcasts", group: "media", mediaSubtype: "podcast", icon: Mic },

  { key: "versicherungen", label: "Versicherungen", group: "freeform", icon: Shield },
  { key: "kleidung", label: "Kleidung", group: "freeform", icon: Shirt },
  { key: "geschenkideen", label: "Geschenkideen", group: "freeform", icon: Gift },
  { key: "rezepte", label: "Rezepte", group: "freeform", icon: ChefHat },
  { key: "arbeitgeber", label: "Arbeitgeber", group: "freeform", icon: Briefcase },
  { key: "apps_software", label: "Apps & Software", group: "freeform", icon: AppWindow },
  { key: "weine", label: "Weine", group: "freeform", icon: Wine },
  { key: "sonstiges", label: "Sonstiges", group: "freeform", icon: Sparkles },
];

export function getRecommendationCategory(key: string): RecommendationCategory | undefined {
  return RECOMMENDATION_CATEGORIES.find((category) => category.key === key);
}

export function isRecommendationCategoryKey(key: string): boolean {
  return RECOMMENDATION_CATEGORIES.some((category) => category.key === key);
}
