"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Upload } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { MovieSearchPanel } from "@/components/movies/movie-search-panel";
import { OrteSearchPanel } from "@/components/orte/orte-search-panel";
import { EntryModal } from "@/components/topf/entry-modal";
import { ImportModal } from "@/components/import/import-modal";
import { GuestSignupModal } from "@/components/guest-signup-modal";

type Tab = "movies" | "orte" | "sonstiges";

const TABS: { key: Tab; label: string }[] = [
  { key: "movies", label: "Filme & Serien" },
  { key: "orte", label: "Orte" },
  { key: "sonstiges", label: "Sonstiges" },
];

/**
 * The one "add something manually" tool -- reached from the Profil (own
 * lists live there now, not in My Taste, which is a pure Quick-Swipe area).
 * Not a discovery destination competing with "Für Dich", just a
 * search/import utility.
 */
export default function HinzufuegenPage() {
  return (
    <Suspense fallback={null}>
      <HinzufuegenContent />
    </Suspense>
  );
}

function HinzufuegenContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<Tab>(
    initialTab === "orte" ? "orte" : initialTab === "sonstiges" ? "sonstiges" : "movies",
  );
  const [user, setUser] = useState<User | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showEntry, setShowEntry] = useState(false);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      setUser(currentUser);
    })();
  }, []);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };

  return (
    <main className="min-h-screen flex flex-col items-center">
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="rounded-md bg-foreground text-background px-4 py-2 text-sm shadow-lg">{toastMessage}</div>
        </div>
      )}

      <div className="flex-1 w-full flex flex-col gap-4 max-w-5xl p-5 pt-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft className="size-4" />
          Zurück
        </Link>
        <h1 className="text-lg font-semibold">Hinzufügen</h1>

        <div className="w-full flex items-center gap-1.5 border-b">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
          {activeTab === "movies" && (
            <button
              type="button"
              onClick={() => (user ? setShowImport(true) : setShowGuestModal(true))}
              aria-label="Liste importieren"
              className="ml-auto mb-1 flex items-center gap-1 h-8 px-2.5 rounded-full border border-input text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
            >
              <Upload className="size-3.5" />
              Importieren
            </button>
          )}
        </div>

        {activeTab === "movies" && <MovieSearchPanel />}
        {activeTab === "orte" && <OrteSearchPanel />}
        {activeTab === "sonstiges" && (
          <div className="w-full flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
            <p className="text-sm font-medium">Handwerker, Bücher, Rezepte & mehr</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Alles außer Filmen/Serien und Orten landet in deinem Mein-Topf -- und taucht direkt für deine Freunde
              in &bdquo;Für Dich&ldquo; auf.
            </p>
            <button
              type="button"
              onClick={() => (user ? setShowEntry(true) : setShowGuestModal(true))}
              className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Empfehlung eintragen
            </button>
          </div>
        )}
      </div>

      {showImport && user && (
        <ImportModal userId={user.id} showToast={showToast} onClose={() => setShowImport(false)} />
      )}
      {showEntry && user && (
        <EntryModal userId={user.id} onClose={() => setShowEntry(false)} onSaved={() => setShowEntry(false)} />
      )}
      {showGuestModal && (
        <GuestSignupModal
          message="Melde dich an, um eigene Listen aufzubauen."
          next="/hinzufuegen"
          onClose={() => setShowGuestModal(false)}
        />
      )}
    </main>
  );
}
