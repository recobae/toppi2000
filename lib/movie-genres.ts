export const SORT_FILTERS: { key: string; label: string }[] = [
  { key: "popular", label: "Beliebt" },
  { key: "top_rated", label: "Top bewertet" },
  { key: "newest", label: "Neu erschienen" },
];

// TMDB movie genre IDs, ordered roughly by popularity/frequency rather than
// alphabetically (matches how people actually browse by genre).
export const GENRE_FILTERS: { id: string; label: string }[] = [
  { id: "18", label: "Drama" },
  { id: "35", label: "Komödie" },
  { id: "28", label: "Action" },
  { id: "53", label: "Thriller" },
  { id: "27", label: "Horror" },
  { id: "10749", label: "Romance" },
  { id: "878", label: "Science Fiction" },
  { id: "80", label: "Krimi" },
  { id: "14", label: "Fantasy" },
  { id: "16", label: "Animation" },
  { id: "12", label: "Abenteuer" },
  { id: "10751", label: "Familie" },
  { id: "9648", label: "Mystery" },
  { id: "99", label: "Dokumentation" },
  { id: "10402", label: "Musik" },
  { id: "36", label: "Historie" },
  { id: "10752", label: "Kriegsfilm" },
  { id: "37", label: "Western" },
];
