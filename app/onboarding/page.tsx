"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, X, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_POST_AUTH_PATH } from "@/lib/auth-redirect";
import {
  sanitizeUsername,
  suggestUsernameFromEmail,
  withRandomSuffix,
} from "@/lib/username";
import { useUsernameAvailability } from "@/lib/hooks/use-username-availability";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const UNIQUE_VIOLATION_CODE = "23505";

export default function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? DEFAULT_POST_AUTH_PATH;

  const [username, setUsername] = useState("");
  const [isPreparing, setIsPreparing] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = useUsernameAvailability(username);

  useEffect(() => {
    const supabase = createClient();

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/auth/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.username) {
        router.push(next);
        return;
      }

      const email = user.email ?? "";
      let candidate = suggestUsernameFromEmail(email);

      for (let attempt = 0; attempt < 5; attempt++) {
        const { data: existing } = await supabase
          .from("profiles")
          .select("id")
          .eq("username", candidate)
          .maybeSingle();

        if (!existing) break;
        candidate = withRandomSuffix(suggestUsernameFromEmail(email));
      }

      setUsername(candidate);
      setIsPreparing(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (status !== "available") return;

    setIsSubmitting(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/auth/login");
      return;
    }

    const { error: upsertError } = await supabase
      .from("profiles")
      .upsert({ id: user.id, username }, { onConflict: "id" });

    if (upsertError) {
      if (upsertError.code === UNIQUE_VIOLATION_CODE) {
        setError("Dieser Username ist gerade vergeben worden. Wähle einen anderen.");
      } else {
        setError("Username konnte nicht gespeichert werden.");
      }
      setIsSubmitting(false);
      return;
    }

    router.push(next);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="flex flex-col gap-1 text-center">
          <h1 className="text-xl font-semibold">Wähle deinen Username</h1>
          <p className="text-sm text-muted-foreground">
            So finden dich deine Freunde auf Toppi.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="username">Username</Label>
            <div className="relative">
              <Input
                id="username"
                value={username}
                disabled={isPreparing}
                onChange={(e) => setUsername(sanitizeUsername(e.target.value))}
                className="pr-8"
                autoFocus
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                {status === "checking" && (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                )}
                {status === "available" && (
                  <Check className="size-4 text-green-600" />
                )}
                {(status === "taken" || status === "invalid") && (
                  <X className="size-4 text-destructive" />
                )}
              </div>
            </div>
            {status === "taken" && (
              <p className="text-xs text-destructive">
                Dieser Username ist bereits vergeben.
              </p>
            )}
            {status === "invalid" && (
              <p className="text-xs text-destructive">
                3–20 Zeichen, nur Kleinbuchstaben, Zahlen, Punkt und
                Unterstrich.
              </p>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            type="submit"
            className="w-full"
            disabled={status !== "available" || isSubmitting}
          >
            {isSubmitting ? "Wird gespeichert…" : "Weiter"}
          </Button>
        </form>
      </div>
    </main>
  );
}
