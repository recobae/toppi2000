"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ListChecks, Lock, Plus, Sparkles, Star, UserPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ProgressRing } from "@/components/profile/progress-badges";
import { markForMeUnlockNotified, type ForMeStatus } from "@/lib/for-me";
import { FollowingBar, type FollowingProfile } from "@/components/profile/following-bar";

const HERO_SIZE = 96;
const HERO_STROKE = 4;

const COLD_START_USECASES = [
  { icon: Star, text: "Bewerte Filme & Serien in My Taste" },
  { icon: UserPlus, text: "Verbinde dich mit Freunden, um ihre Empfehlungen zu sehen" },
  { icon: Sparkles, text: "Lege eigene Listen an, damit wir dein Interesse besser verstehen" },
];

/**
 * Shown instead of navigating to /topf while For Me is still locked --
 * same unlock threshold as always (lib/for-me.ts), just explains what
 * feeds it instead of landing on an empty Mein-Topf page.
 */
function ColdStartExplainer({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="For Me ist noch gesperrt"
    >
      <div
        className="relative w-full max-w-sm rounded-lg bg-background border p-4 flex flex-col gap-4"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Schließen"
          onClick={onClose}
          className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
        >
          <X className="size-4" />
        </button>

        <div className="flex flex-col gap-1 pr-8">
          <Lock className="size-5 text-muted-foreground" />
          <p className="text-sm font-medium leading-snug">
            Sammle mehr persönliche Empfehlungen, damit Du hier Deine Top Picks siehst.
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          {COLD_START_USECASES.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-start gap-2 text-sm text-muted-foreground">
              <Icon className="size-4 mt-0.5 shrink-0 text-primary" />
              <span>{text}</span>
            </div>
          ))}
        </div>

        <Link
          href="/swipe"
          className="flex items-center justify-center h-10 rounded-full bg-primary text-primary-foreground text-sm font-medium"
        >
          Zu My Taste
        </Link>
      </div>
    </div>
  );
}

/**
 * Own-profile hero: replaces the avatar at the top of the page (same size/
 * position the avatar used to have). "My Taste" (renamed Swipe) sits above
 * it as the input side of the funnel -- what you rate there is what feeds
 * this. The ring/lock/sparkle logic itself is unchanged from the old
 * FollowingBar ForMeWidget, just sized up to hero scale.
 */
export function ForMeHero({
  userId,
  username,
  forMe,
  followerCount,
  followingProfiles,
  contributorIds,
}: {
  userId: string;
  username: string;
  forMe: ForMeStatus;
  followerCount: number;
  followingProfiles: FollowingProfile[];
  contributorIds?: string[];
}) {
  const [unlockToast, setUnlockToast] = useState(false);
  const [showExplainer, setShowExplainer] = useState(false);

  // Fires exactly once, at the actual unlock moment (server already
  // confirmed topf_unlocked_notified was still false) -- never re-shown.
  useEffect(() => {
    if (!forMe.justUnlocked) return;
    setUnlockToast(true);
    const supabase = createClient();
    markForMeUnlockNotified(supabase, userId);
    const timeout = setTimeout(() => setUnlockToast(false), 4000);
    return () => clearTimeout(timeout);
  }, [forMe.justUnlocked, userId]);

  return (
    <div className="w-full flex flex-col items-center gap-1.5">
      {/* Klein, zentriert, oberhalb von My Taste -- public/logo.png. */}
      <Image
        src="/logo.png"
        alt="Toppi"
        width={120}
        height={64}
        className="h-6 w-auto"
        priority
      />

      {/*
        Haupt-CTA für Input -- deutlich prominenter als zuvor, aber die
        Größen-Hierarchie For Me > My Taste bleibt: der Connector darunter
        ist entsprechend etwas kürzer, damit der Gesamtabstand zum Hero
        nicht wächst.
      */}
      <Link
        href="/swipe"
        aria-label="My Taste"
        className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-gradient-to-br from-primary to-primary/60 text-primary-foreground text-base font-semibold shadow-sm"
      >
        <Plus className="size-5" />
        My Taste
      </Link>
      <div className="h-3 w-px bg-border" aria-hidden="true" />

      {/*
        ownCount ist jetzt die gesamte aktive Erfassungssumme (geswiped,
        eingetragen, importiert, über Inspiration/Suche hinzugefügt --
        siehe app/u/[username]/page.tsx's totalActivityCount), nicht mehr
        nur item_interactions. Nie eine recommendations-Zeile im engeren
        Sinne -- "Empfehlung" bleibt dafür das falsche Wort.

        Anklickbar -> öffnet die bestehende Meine-Aktivität-Liste (ersetzt
        den separaten Link, der zuvor weiter unten im Profil stand). Das
        ListChecks-Icon steht bewusst VOR dem Text, damit sofort klar ist,
        dass die Zeile etwas öffnet statt nur eine reine Stat-Anzeige zu
        sein.
      */}
      <Link
        href="/meine-aktivitaet"
        className="inline-flex items-center gap-1 font-medium text-green-600 text-[11px] whitespace-nowrap hover:underline"
      >
        <ListChecks className="size-3" />
        {forMe.ownCount} Bewertungen von dir
      </Link>

      <Link
        href={forMe.isUnlocked ? "/topf" : "#"}
        onClick={
          forMe.isUnlocked
            ? undefined
            : (event) => {
                event.preventDefault();
                setShowExplainer(true);
              }
        }
        aria-label={forMe.isUnlocked ? "For Me" : "For Me (noch gesperrt)"}
        className="relative flex items-center justify-center rounded-full overflow-hidden bg-muted border border-border"
        style={{ height: HERO_SIZE, width: HERO_SIZE }}
      >
        {!forMe.isUnlocked && forMe.previewImageUrls.length > 0 && (
          <>
            <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
              {Array.from({ length: 4 }).map((_, index) => {
                const url = forMe.previewImageUrls[index % forMe.previewImageUrls.length];
                return (
                  <div key={index} className="relative bg-muted">
                    <Image
                      src={url}
                      alt=""
                      fill
                      sizes="48px"
                      className="object-cover blur-[4px] scale-125"
                    />
                  </div>
                );
              })}
            </div>
            <div className="absolute inset-0 bg-background/40" />
          </>
        )}
        <ProgressRing fraction={forMe.fraction} size={HERO_SIZE - 4} stroke={HERO_STROKE} />
        <span className="absolute inset-0 flex items-center justify-center">
          {forMe.isUnlocked ? (
            <Sparkles className="size-7 text-primary" />
          ) : (
            <Lock className="size-6 text-foreground" />
          )}
        </span>
      </Link>

      <span className="text-sm font-semibold">{username}</span>
      {/* Wieder eingefügt, gleiche Stelle/Stil wie zuvor -- Berechnung (forMe.friendCount) unverändert. */}
      <span className="font-medium text-blue-600 text-[11px] whitespace-nowrap">
        {forMe.friendCount} Bewertungen von Freunden
      </span>

      {/*
        Zweiter Zufluss, gleiche Technik wie der My-Taste-Connector oben --
        die Freunde, deren Empfehlungen mit einfließen, münden von unten in
        dieselbe Fläche.
      */}
      <div className="h-4 w-px bg-border" aria-hidden="true" />

      <FollowingBar
        currentUserId={userId}
        followerCount={followerCount}
        followingProfiles={followingProfiles}
        contributorIds={contributorIds}
      />

      {unlockToast && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="rounded-md bg-foreground text-background px-4 py-2 text-sm shadow-lg">
            🎉 Dein &bdquo;For Me&ldquo;-Bereich ist jetzt offen!
          </div>
        </div>
      )}

      {showExplainer && <ColdStartExplainer onClose={() => setShowExplainer(false)} />}
    </div>
  );
}
