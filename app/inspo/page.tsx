import { redirect } from "next/navigation";

// /inspo was merged into /inspiration, which was itself later removed in
// favor of the "Für Dich" discovery stream (Master-Audit consolidation).
// Kept as a redirect rather than deleted outright, so old links/bookmarks
// still land somewhere useful.
export default function InspoRedirect() {
  redirect("/fuer-dich");
}
