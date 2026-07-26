import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ensureUsername } from "@/lib/auth-redirect";
import { Button } from "@/components/ui/button";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const userId = data?.user?.id;

  if (userId) {
    const username = await ensureUsername(supabase, userId);
    redirect(`/u/${username}`);
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-6 max-w-md p-5 text-center">
        <h1 className="text-2xl font-semibold">
          Erstelle deine eigenen Toplisten und teile sie mit Freunden
        </h1>
        <p className="text-muted-foreground">
          Ranke deine Lieblingsfilme und -serien, verwalte deine Watchlist und
          zeig deinen Freunden per WhatsApp, was du noch schauen willst
        </p>
        <div className="flex gap-3">
          <Button asChild variant="outline">
            <Link href="/auth/login">Anmelden</Link>
          </Button>
          <Button asChild>
            <Link href="/auth/sign-up">Registrieren</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
