import { redirect } from "next/navigation";

// My Taste wurde im Lohnt-sich-Umbau zu /lohnt-sich umbenannt (dritter
// Haupt-Tab "Lohnt sich?") -- kept as a redirect rather than deleted
// outright, so old links/bookmarks still land somewhere useful.
export default function MyTasteRedirect() {
  redirect("/lohnt-sich");
}
