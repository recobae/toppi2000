import { redirect } from "next/navigation";

// /vorschlag was replaced by /inspiration, later removed in favor of the
// "Für Dich" discovery stream (Master-Audit consolidation). Kept as a
// redirect rather than deleted outright, so old links/bookmarks still land
// somewhere useful.
export default function VorschlagRedirect() {
  redirect("/fuer-dich");
}
