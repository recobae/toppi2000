import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

const FALLBACK_USERNAME = "einem Nutzer";

export const getListWithAccess = cache(async (id: string) => {
  const supabase = await createClient();

  const { data: list, error: listError } = await supabase
    .from("lists")
    .select("id, title, category, user_id, is_public")
    .eq("id", id)
    .single();

  if (listError || !list) return null;

  const { data: claimsData } = await supabase.auth.getClaims();
  const isOwner = claimsData?.claims?.sub === list.user_id;

  if (!isOwner && !list.is_public) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", list.user_id)
    .single();

  return {
    list,
    isOwner,
    username: profile?.username ?? FALLBACK_USERNAME,
    profileUsername: profile?.username ?? null,
  };
});
