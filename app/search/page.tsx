import { redirect } from "next/navigation";

// /search was merged with /inspo into /inspiration. Keep this as a redirect
// (forwarding any query params like ?addTo=/?person=) rather than deleting
// the route outright, so old links/bookmarks still land somewhere useful.
export default async function SearchRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
  }
  const queryString = query.toString();
  redirect(queryString ? `/inspiration?${queryString}` : "/inspiration");
}
