import { redirect } from "next/navigation";

// /vorschlag was replaced by the new /inspo system (friend feed + algorithmic
// fallback, category tabs). Keep this as a redirect rather than deleting the
// route outright, so old links/bookmarks still land somewhere useful.
export default function VorschlagRedirect() {
  redirect("/inspo");
}
