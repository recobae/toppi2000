import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCuratedLists } from "@/lib/curated-lists";

/**
 * All is_curated = true place lists (city lists + freeform themed lists),
 * regardless of onboarding-featured status -- backs the "Kuratiert"
 * section on the Inspiration Orte tab. See app/onboarding/page.tsx for the
 * featured-only variant of the same underlying query.
 */
export async function GET() {
  const supabase = await createClient();
  const lists = await getCuratedLists(supabase);
  return NextResponse.json({ lists });
}
