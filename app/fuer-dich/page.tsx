import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { DiscoveryStream } from "@/components/discovery/discovery-stream";

export const metadata: Metadata = { title: "Für Dich" };

export default async function FuerDichPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/fuer-dich");
  }

  return (
    <main className="h-dvh overflow-hidden flex flex-col items-center">
      <div className="flex-1 min-h-0 w-full flex flex-col items-center gap-3 max-w-5xl p-5 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <h1 className="text-lg font-semibold shrink-0">Für Dich</h1>
        <DiscoveryStream userId={user.id} />
      </div>
    </main>
  );
}
