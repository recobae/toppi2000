import { redirect } from "next/navigation";

// /swipe was merged into My Taste, which is now itself the Quick-Swipe deck
// (Master-Audit round) -- kept as a redirect rather than deleted outright,
// so old links/bookmarks still land somewhere useful.
export default function SwipeRedirect() {
  redirect("/my-taste");
}
