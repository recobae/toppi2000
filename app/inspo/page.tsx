import { redirect } from "next/navigation";

// /inspo was merged with /search into /inspiration. Keep this as a redirect
// rather than deleting the route outright, so old links/bookmarks still
// land somewhere useful.
export default function InspoRedirect() {
  redirect("/inspiration");
}
