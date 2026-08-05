"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { SwipeInspirationSwitch } from "@/components/swipe/mode-switch";
import { MoviesInspirationTab } from "@/components/inspiration/movies-inspiration-tab";
import { OrteInspirationTab } from "@/components/inspiration/orte-inspiration-tab";
import { FollowSuggestionsModal } from "@/components/profile/follow-suggestions-modal";
import { GuestSignupModal } from "@/components/guest-signup-modal";
import { ImportModal } from "@/components/import/import-modal";
import { CATEGORY_LABELS, isSavedCategory } from "@/lib/categories";

type InspirationTab = "movies" | "orte";

const TABS: { key: InspirationTab; label: string }[] = [
  { key: "movies", label: "Filme & Serien" },
  { key: "orte", label: "Orte" },
];

type Toast = { id: number; message: string };

export default function InspirationPage() {
  const searchParams = useSearchParams();
  const addToCategory = searchParams.get("addTo");
  const addToLabel =
    addToCategory && isSavedCategory(addToCategory) ? CATEGORY_LABELS[addToCategory] : null;
  const personId = searchParams.get("person");
  const personName = searchParams.get("name");

  const [activeTab, setActiveTab] = useState<InspirationTab>("movies");
  const [user, setUser] = useState<User | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showFindPeople, setShowFindPeople] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showGuestModal, setShowGuestModal] = useState(false);

  const showToast = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      setUser(currentUser);
    })();
  }, []);

  useEffect(() => {
    if (addToCategory || personId) {
      setActiveTab("movies");
    } else if (searchParams.get("tab") === "orte") {
      setActiveTab("orte");
    }
  }, [addToCategory, personId, searchParams]);

  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="rounded-md bg-foreground text-background px-4 py-2 text-sm shadow-lg"
          >
            {toast.message}
          </div>
        ))}
      </div>

      {/* No page heading per spec -- straight into the tabs. */}
      <div className="flex-1 w-full flex flex-col items-center gap-4 max-w-5xl p-5 pt-8">
        <div className="w-full flex flex-col gap-2">
          <SwipeInspirationSwitch active="inspiration" />
          <div className="w-full flex items-center gap-1.5 border-b">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    isActive
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
            {/* Same tab-button component/weight as "Filme & Serien"/"Orte" --
                triggers the existing import modal directly instead of
                switching to a persistent tab view, since there's no
                standalone "Import" content to show once opened. */}
            <button
              type="button"
              onClick={() => (user ? setShowImport(true) : setShowGuestModal(true))}
              className="px-3 py-2 text-sm font-medium border-b-2 border-transparent -mb-px text-muted-foreground hover:text-foreground transition-colors"
            >
              Importieren
            </button>
            <div className="ml-auto mb-1 flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Neue Personen finden"
                onClick={() => (user ? setShowFindPeople(true) : setShowGuestModal(true))}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-input text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <Plus className="size-4" />
              </button>
            </div>
          </div>
        </div>

        {showFindPeople && user && (
          <FollowSuggestionsModal
            currentUserId={user.id}
            onClose={() => setShowFindPeople(false)}
          />
        )}

        {showImport && user && (
          <ImportModal
            userId={user.id}
            showToast={showToast}
            onClose={() => setShowImport(false)}
          />
        )}

        {showGuestModal && (
          <GuestSignupModal
            message="Melde dich an, um Listen zu importieren oder neue Personen zu finden, die dich inspirieren."
            next="/inspiration"
            onClose={() => setShowGuestModal(false)}
          />
        )}

        {activeTab === "movies" ? (
          <MoviesInspirationTab
            user={user}
            showToast={showToast}
            addToLabel={addToLabel}
            deepLinkPerson={personId ? { id: personId, name: personName ?? "" } : null}
          />
        ) : (
          <OrteInspirationTab user={user} showToast={showToast} />
        )}
      </div>
    </main>
  );
}
