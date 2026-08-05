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
import {
  NOTES_VISIBILITY_OPTIONS,
  isNotesVisibility,
  type NotesVisibility,
} from "@/lib/notes";
import { PLACES_EXPERTISE_MIN_ITEMS } from "@/lib/places";
import { FavoriteSongCard, type FavoriteSong } from "@/components/settings/favorite-song-card";

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

  const [notesVisibility, setNotesVisibility] = useState<NotesVisibility>("all");
  const [isSavingNotesVisibility, setIsSavingNotesVisibility] = useState(false);

  const [homeCity, setHomeCity] = useState("");
  const [currentHomeCity, setCurrentHomeCity] = useState("");
  const [homeCityMessage, setHomeCityMessage] = useState<string | null>(null);
  const [isSavingHomeCity, setIsSavingHomeCity] = useState(false);
  const [cityLabels, setCityLabels] = useState<string[]>([]);

  const [favoriteSong, setFavoriteSong] = useState<FavoriteSong | null>(null);

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

      const [{ data: profile }, { data: regionRows }, { data: placeRows }] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "username, notes_visibility, home_city, favorite_song_title, favorite_song_artist, favorite_song_preview_url, favorite_song_artwork_url",
          )
          .eq("id", currentUser.id)
          .maybeSingle(),
        supabase.from("place_regions").select("id, region_name").eq("user_id", currentUser.id),
        supabase.from("places").select("region_id").eq("user_id", currentUser.id),
      ]);

      setCurrentUsername(profile?.username ?? null);
      setUsername(profile?.username ?? "");
      if (profile?.notes_visibility && isNotesVisibility(profile.notes_visibility)) {
        setNotesVisibility(profile.notes_visibility);
      }
      setHomeCity(profile?.home_city ?? "");
      setCurrentHomeCity(profile?.home_city ?? "");
      if (profile?.favorite_song_title && profile.favorite_song_preview_url) {
        setFavoriteSong({
          title: profile.favorite_song_title,
          artist: profile.favorite_song_artist ?? null,
          previewUrl: profile.favorite_song_preview_url,
          artworkUrl: profile.favorite_song_artwork_url ?? null,
        });
      }

      // Only offer cities that actually show up as a tag under the username
      // (same PLACES_EXPERTISE_MIN_ITEMS threshold as the tag row) -- picking
      // a home city here always means picking one of those existing tags.
      const itemCountByRegionId = new Map<string, number>();
      for (const row of placeRows ?? []) {
        itemCountByRegionId.set(row.region_id, (itemCountByRegionId.get(row.region_id) ?? 0) + 1);
      }
      const eligibleCities = (regionRows ?? [])
        .filter((region) => (itemCountByRegionId.get(region.id) ?? 0) >= PLACES_EXPERTISE_MIN_ITEMS)
        .map((region) => region.region_name);
      setCityLabels([...new Set(eligibleCities)]);
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
      // Re-run server components (e.g. the profile icon in the root layout)
      // so they pick up the new username instead of the stale cached one.
      router.refresh();
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

  const handleHomeCitySubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || homeCity === currentHomeCity) return;

    setIsSavingHomeCity(true);
    setHomeCityMessage(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ home_city: homeCity || null })
      .eq("id", user.id);

    if (error) {
      setHomeCityMessage("Konnte nicht gespeichert werden.");
    } else {
      setCurrentHomeCity(homeCity);
      setHomeCityMessage("Gespeichert!");
      router.refresh();
    }
    setIsSavingHomeCity(false);
  };

  const handleNotesVisibilityChange = async (value: NotesVisibility) => {
    if (!user || value === notesVisibility) return;
    const previous = notesVisibility;
    setNotesVisibility(value);
    setIsSavingNotesVisibility(true);

    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ notes_visibility: value })
      .eq("id", user.id);

    if (error) setNotesVisibility(previous);
    setIsSavingNotesVisibility(false);
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
        <div className="w-full flex flex-col gap-2">
          <h1 className="w-full text-center font-medium text-xl">Einstellungen</h1>
        </div>

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
            <CardTitle className="text-lg">Wo bist du gerade</CardTitle>
            <CardDescription>
              Erscheint als Pin neben dem passenden Tag unter deinem Namen und bestimmt den
              Orte-Feed in Inspiration.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {cityLabels.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Lege zuerst genug Orte in einer Stadt an, damit dort ein Tag erscheint,
                dann kannst du hier auswählen, wo du gerade bist.
              </p>
            ) : (
              <form onSubmit={handleHomeCitySubmit} className="flex flex-col gap-3">
                <select
                  value={homeCity}
                  onChange={(e) => {
                    setHomeCity(e.target.value);
                    setHomeCityMessage(null);
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Keine</option>
                  {cityLabels.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
                {homeCityMessage && (
                  <p className="text-xs text-muted-foreground">{homeCityMessage}</p>
                )}
                <Button
                  type="submit"
                  size="sm"
                  className="w-fit"
                  disabled={homeCity === currentHomeCity || isSavingHomeCity}
                >
                  {isSavingHomeCity ? "Wird gespeichert…" : "Speichern"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {user && <FavoriteSongCard userId={user.id} initialSong={favoriteSong} />}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Notizen</CardTitle>
            <CardDescription>
              Wer deine Notizen zu Empfehlungen sehen kann.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {NOTES_VISIBILITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={isSavingNotesVisibility}
                  onClick={() => handleNotesVisibilityChange(option.value)}
                  className={`flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-50 ${
                    notesVisibility === option.value
                      ? "border-primary bg-primary/5"
                      : "border-input hover:bg-accent"
                  }`}
                >
                  <span className="text-sm font-medium">{option.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {option.description}
                  </span>
                </button>
              ))}
            </div>
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
