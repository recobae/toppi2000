"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2 } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { sanitizeUsername } from "@/lib/username";
import { useUsernameAvailability } from "@/lib/hooks/use-username-availability";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const UNIQUE_VIOLATION_CODE = "23505";

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [username, setUsername] = useState("");
  const [usernameMessage, setUsernameMessage] = useState<string | null>(null);
  const [isSavingUsername, setIsSavingUsername] = useState(false);

  const [email, setEmail] = useState("");
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [isSavingEmail, setIsSavingEmail] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const usernameStatus = useUsernameAvailability(username, currentUsername);
  const isEmailProvider = user?.app_metadata?.provider === "email";

  useEffect(() => {
    const supabase = createClient();

    (async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        router.push("/auth/login");
        return;
      }

      setUser(currentUser);
      setEmail(currentUser.email ?? "");

      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", currentUser.id)
        .maybeSingle();

      setCurrentUsername(profile?.username ?? null);
      setUsername(profile?.username ?? "");
      setIsLoading(false);
    })();
  }, [router]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  };

  const handleUsernameSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (usernameStatus !== "available" || !user) return;

    setIsSavingUsername(true);
    setUsernameMessage(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, username }, { onConflict: "id" });

    if (error) {
      setUsernameMessage(
        error.code === UNIQUE_VIOLATION_CODE
          ? "Dieser Username ist gerade vergeben worden."
          : "Username konnte nicht gespeichert werden.",
      );
    } else {
      setCurrentUsername(username);
      setUsernameMessage("Username gespeichert!");
    }
    setIsSavingUsername(false);
  };

  const handleEmailSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email || email === user?.email) return;

    setIsSavingEmail(true);
    setEmailMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ email });

    setEmailMessage(
      error
        ? "E-Mail konnte nicht geändert werden."
        : "Bestätigungslinks wurden an die alte und neue Adresse gesendet.",
    );
    setIsSavingEmail(false);
  };

  const handlePasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordMessage(null);

    if (newPassword.length < 6) {
      setPasswordMessage("Das Passwort muss mindestens 6 Zeichen haben.");
      return;
    }
    if (newPassword !== repeatPassword) {
      setPasswordMessage("Passwörter stimmen nicht überein.");
      return;
    }

    setIsSavingPassword(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });

    setPasswordMessage(
      error ? "Passwort konnte nicht geändert werden." : "Passwort geändert!",
    );
    if (!error) {
      setNewPassword("");
      setRepeatPassword("");
    }
    setIsSavingPassword(false);
  };

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-6 max-w-lg p-5 pt-10">
        <h1 className="font-medium text-xl">Einstellungen</h1>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Username</CardTitle>
            <CardDescription>
              So wirst du auf Toppi angezeigt.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUsernameSubmit} className="flex flex-col gap-3">
              <div className="relative">
                <Input
                  value={username}
                  onChange={(e) => {
                    setUsername(sanitizeUsername(e.target.value));
                    setUsernameMessage(null);
                  }}
                  className="pr-8"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  {usernameStatus === "checking" && (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  )}
                  {usernameStatus === "available" && (
                    <Check className="size-4 text-green-600" />
                  )}
                  {(usernameStatus === "taken" || usernameStatus === "invalid") && (
                    <X className="size-4 text-destructive" />
                  )}
                </div>
              </div>
              {usernameStatus === "invalid" && username.length > 0 && (
                <p className="text-xs text-destructive">
                  3–20 Zeichen, nur Kleinbuchstaben, Zahlen, Punkt und
                  Unterstrich.
                </p>
              )}
              {usernameMessage && (
                <p className="text-xs text-muted-foreground">{usernameMessage}</p>
              )}
              <Button
                type="submit"
                size="sm"
                className="w-fit"
                disabled={
                  usernameStatus !== "available" ||
                  username === currentUsername ||
                  isSavingUsername
                }
              >
                {isSavingUsername ? "Wird gespeichert…" : "Speichern"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">E-Mail</CardTitle>
            <CardDescription>Deine Anmelde-E-Mail-Adresse.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleEmailSubmit} className="flex flex-col gap-3">
              <Label htmlFor="email">E-Mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailMessage(null);
                }}
              />
              {emailMessage && (
                <p className="text-xs text-muted-foreground">{emailMessage}</p>
              )}
              <Button
                type="submit"
                size="sm"
                className="w-fit"
                disabled={!email || email === user?.email || isSavingEmail}
              >
                {isSavingEmail ? "Wird gespeichert…" : "Speichern"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {isEmailProvider && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Passwort</CardTitle>
              <CardDescription>Neues Passwort festlegen.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="new-password">Neues Passwort</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="repeat-new-password">
                    Neues Passwort wiederholen
                  </Label>
                  <Input
                    id="repeat-new-password"
                    type="password"
                    value={repeatPassword}
                    onChange={(e) => setRepeatPassword(e.target.value)}
                  />
                </div>
                {passwordMessage && (
                  <p className="text-xs text-muted-foreground">
                    {passwordMessage}
                  </p>
                )}
                <Button
                  type="submit"
                  size="sm"
                  className="w-fit"
                  disabled={isSavingPassword}
                >
                  {isSavingPassword ? "Wird gespeichert…" : "Speichern"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <Button variant="outline" onClick={handleLogout} className="w-fit">
          Abmelden
        </Button>
      </div>
    </main>
  );
}
