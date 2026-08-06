import { redirect } from "next/navigation";

// /search was merged into /inspiration, later removed in favor of a
// focused "Hinzufügen" tool (Master-Audit consolidation) -- the manual
// search/add flow lives there now instead of inside a competing discovery
// destination. Reached from the Profil, not from My Taste.
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
  redirect(queryString ? `/hinzufuegen?${queryString}` : "/hinzufuegen");
}
