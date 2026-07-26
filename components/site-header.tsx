import Link from "next/link";
import { CircleUser } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export async function SiteHeader() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data?.user;

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single();

  if (!profile?.username) return null;

  return (
    <Link
      href={`/u/${profile.username}`}
      aria-label="Zu meinem Profil"
      className="fixed top-4 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-accent transition-colors"
    >
      <CircleUser className="size-5" />
    </Link>
  );
}
