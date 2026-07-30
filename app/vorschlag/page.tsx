import { redirect } from "next/navigation";

// /vorschlag was replaced by /inspiration (search + inspo merged). Keep
// this as a redirect rather than deleting the route outright, so old
// links/bookmarks still land somewhere useful.
export default function VorschlagRedirect() {
  redirect("/inspiration");
}
