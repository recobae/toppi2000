"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { BackToProfileLink } from "@/components/profile/back-to-profile-link";
import { MoviesInspoTab } from "@/components/inspo/movies-inspo-tab";
import { OrteInspoTab } from "@/components/inspo/orte-inspo-tab";

type InspoTab = "movies_shows" | "orte";

const TABS: { key: InspoTab; label: string }[] = [
  { key: "movies_shows", label: "Filme & Serien" },
  { key: "orte", label: "Orte" },
];

type Toast = { id: number; message: string };

export default function InspoPage() {
  const [activeTab, setActiveTab] = useState<InspoTab>("movies_shows");
  const [user, setUser] = useState<User | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

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

      <div className="flex-1 w-full flex flex-col items-center gap-4 max-w-md p-5 pt-8">
        <div className="w-full flex flex-col gap-2">
          <BackToProfileLink />
          <h1 className="font-medium text-xl">Entdecke und empfehle neue Titel</h1>
        </div>

        <div className="w-full flex gap-1.5 border-b">
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
        </div>

        {activeTab === "movies_shows" ? (
          <MoviesInspoTab user={user} showToast={showToast} />
        ) : (
          <OrteInspoTab user={user} showToast={showToast} />
        )}
      </div>
    </main>
  );
}
