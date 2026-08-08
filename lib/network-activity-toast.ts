const SEEN_KEY = "toppi:network-toast-seen";
const COUNT_KEY = "toppi:network-rating-count";
const THRESHOLD = 3;

/**
 * "Der Bereich wird immer wertvoller..."-Hinweis (Profil-Umbau §8) -- rein
 * lokal in localStorage, kein Supabase-Feld (siehe Plan-Begründung: kein
 * bestehender "einmal für immer gesehen"-Mechanismus im Projekt, ein neues
 * DB-Feld würde eine weitere unangewendete Migration erzeugen). Nachteil:
 * nicht geräteübergreifend -- für einen Onboarding-Hinweis akzeptabel.
 */
export function hasSeenNetworkToast(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(SEEN_KEY) === "1";
}

function markNetworkToastSeen(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SEEN_KEY, "1");
}

/**
 * Increments the locally tracked count of rated network items and returns
 * whether the toast should fire now (count just reached THRESHOLD and it
 * hasn't been shown before). Marks it as seen immediately so it never
 * repeats, even across later visits.
 */
export function registerNetworkRatingAndShouldToast(): boolean {
  if (typeof window === "undefined" || hasSeenNetworkToast()) return false;
  const next = Number(window.localStorage.getItem(COUNT_KEY) ?? "0") + 1;
  window.localStorage.setItem(COUNT_KEY, String(next));
  if (next >= THRESHOLD) {
    markNetworkToastSeen();
    return true;
  }
  return false;
}
