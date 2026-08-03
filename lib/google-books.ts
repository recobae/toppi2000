const GOOGLE_BOOKS_URL = "https://www.googleapis.com/books/v1/volumes";

export type BookMatch = {
  id: string;
  title: string;
  author: string | null;
  year: string | null;
  coverUrl: string | null;
};

type GoogleBookItem = {
  id: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    publishedDate?: string;
    imageLinks?: { thumbnail?: string };
  };
};

/**
 * Best-effort single match for a book title, following the same shape as
 * lib/tmdb.ts's searchBestTitleMatch. The public Google Books volumes
 * endpoint works without an API key (more strictly rate-limited without
 * one, but functional) -- no new env var required.
 */
export async function searchBestBookMatch(title: string): Promise<BookMatch | null> {
  try {
    const url = new URL(GOOGLE_BOOKS_URL);
    url.searchParams.set("q", title);
    url.searchParams.set("maxResults", "1");

    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;

    const data: { items?: GoogleBookItem[] } = await response.json();
    const best = data.items?.[0];
    if (!best) return null;

    const info = best.volumeInfo ?? {};
    return {
      id: best.id,
      title: info.title ?? title,
      author: info.authors?.[0] ?? null,
      year: info.publishedDate ? info.publishedDate.slice(0, 4) : null,
      coverUrl: info.imageLinks?.thumbnail?.replace("http://", "https://") ?? null,
    };
  } catch {
    return null;
  }
}
