import { Coffee, Landmark, Martini, MapPin, Utensils, Bed, type LucideIcon } from "lucide-react";

// Curated, generic filter set derived from Google Places' broader "types"
// list. New categories (e.g. "shopping") are just a new entry here plus a
// branch in normalizePlaceCategory -- nothing else needs to change.
export type PlaceCategory =
  | "restaurant"
  | "bar"
  | "cafe"
  | "tourist_attraction"
  | "hotel"
  | "other";

export const PLACE_CATEGORIES: PlaceCategory[] = [
  "restaurant",
  "bar",
  "cafe",
  "tourist_attraction",
  "hotel",
  "other",
];

export const PLACE_CATEGORY_LABELS: Record<PlaceCategory, string> = {
  restaurant: "Restaurants",
  bar: "Bars",
  cafe: "Cafés",
  tourist_attraction: "Sehenswürdigkeiten",
  hotel: "Hotels",
  other: "Sonstiges",
};

export const PLACE_CATEGORY_ICONS: Record<PlaceCategory, LucideIcon> = {
  restaurant: Utensils,
  bar: Martini,
  cafe: Coffee,
  tourist_attraction: Landmark,
  hotel: Bed,
  other: MapPin,
};

export function isPlaceCategory(value: string): value is PlaceCategory {
  return (PLACE_CATEGORIES as string[]).includes(value);
}

/** Maps Google Places' (often multiple, overlapping) "types" to one primary filter bucket. */
export function normalizePlaceCategory(types: string[]): PlaceCategory {
  if (types.includes("restaurant") || types.includes("meal_takeaway")) return "restaurant";
  if (types.includes("bar") || types.includes("night_club")) return "bar";
  if (types.includes("cafe") || types.includes("bakery")) return "cafe";
  if (types.includes("tourist_attraction") || types.includes("museum") || types.includes("park")) {
    return "tourist_attraction";
  }
  if (types.includes("lodging") || types.includes("hotel")) return "hotel";
  return "other";
}

/** Normalizes a region display name (e.g. "Düsseldorf") into a stable dedup key. */
export function normalizeRegionKey(regionName: string): string {
  return regionName
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type PlacePriceLevel =
  | "free"
  | "inexpensive"
  | "moderate"
  | "expensive"
  | "very_expensive";

export const PRICE_LEVEL_LABELS: Record<PlacePriceLevel, string> = {
  free: "Kostenlos",
  inexpensive: "€",
  moderate: "€€",
  expensive: "€€€",
  very_expensive: "€€€€",
};

// Editorial fallback shown after the user's own dynamic city labels in the
// Inspiration Orte tab -- top 10 German cities by population plus common
// international travel destinations, so there's always something to browse
// beyond whatever regions the user (or their friends) already have lists
// for.
export const CURATED_CITY_LABELS: string[] = [
  "Berlin",
  "Hamburg",
  "München",
  "Köln",
  "Frankfurt am Main",
  "Stuttgart",
  "Düsseldorf",
  "Leipzig",
  "Dortmund",
  "Essen",
  "Paris",
  "London",
  "New York",
  "Barcelona",
  "Rom",
  "Amsterdam",
  "Wien",
  "Lissabon",
  "Istanbul",
  "Dubai",
];

// A user needs at least this many saved places in a region before it counts
// as "expertise" -- deliberately higher than the 1-item threshold for
// Filme & Serien, since a single restaurant tip doesn't make someone the
// go-to person for a whole city.
export const PLACES_EXPERTISE_MIN_ITEMS = 3;
