import { redirect } from "next/navigation";

// /swipe was merged into My Taste (now itself renamed to the "Lohnt sich?"
// tab, see /lohnt-sich) -- kept as a redirect rather than deleted outright,
// so old links/bookmarks still land somewhere useful.
export default function SwipeRedirect() {
  redirect("/lohnt-sich");
}
