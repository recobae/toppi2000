import { createClient } from "@/lib/supabase/server";
import { resolvePostAuthPath, DEFAULT_POST_AUTH_PATH } from "@/lib/auth-redirect";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? DEFAULT_POST_AUTH_PATH;

  if (code) {
    const supabase = await createClient();
    const { error, data } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const redirectPath = await resolvePostAuthPath(supabase, data.user.id, next);
      redirect(redirectPath);
    }
  }

  redirect(`/auth/error?error=Google-Anmeldung fehlgeschlagen`);
}
