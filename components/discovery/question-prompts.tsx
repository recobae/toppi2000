"use client";

import { useState } from "react";
import Link from "next/link";
import { HelpCircle } from "lucide-react";
import { EntryModal } from "@/components/topf/entry-modal";
import type { QuestionPrompt } from "@/lib/question-prompts";

/**
 * "Gib deinen Freunden besondere Empfehlungen" -- active nudges rather than
 * passive cards, all anchored to the viewer's Settings-Stadt. A Mein-Topf-
 * style question opens the existing Empfehlen-Flow pre-scoped to that
 * category; an Orte-style question sends the viewer straight into the
 * Inspiration Orte tab, since travel/restaurant discovery lives there, not
 * in Mein-Topf (see lib/recommendation-categories.ts).
 */
export function QuestionPrompts({ userId, prompts }: { userId: string; prompts: QuestionPrompt[] }) {
  const [openCategoryKey, setOpenCategoryKey] = useState<string | null>(null);

  if (prompts.length === 0) return null;

  return (
    <div className="w-full flex flex-col gap-2.5">
      <h2 className="text-sm font-medium text-muted-foreground">Gib deinen Freunden besondere Empfehlungen</h2>
      <div className="w-full flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {prompts.map((prompt, index) =>
          prompt.kind === "topf" ? (
            <button
              key={index}
              type="button"
              onClick={() => setOpenCategoryKey(prompt.categoryKey)}
              className="shrink-0 flex items-start gap-2 max-w-[220px] rounded-xl border p-3 text-left shadow-sm hover:shadow-md hover:border-primary/40 transition-all"
            >
              <HelpCircle className="size-4 shrink-0 text-primary mt-0.5" />
              <span className="text-xs font-medium leading-snug">{prompt.question}</span>
            </button>
          ) : (
            <Link
              key={index}
              href="/my-taste/hinzufuegen?tab=orte"
              className="shrink-0 flex items-start gap-2 max-w-[220px] rounded-xl border p-3 text-left shadow-sm hover:shadow-md hover:border-primary/40 transition-all"
            >
              <HelpCircle className="size-4 shrink-0 text-primary mt-0.5" />
              <span className="text-xs font-medium leading-snug">{prompt.question}</span>
            </Link>
          ),
        )}
      </div>

      {openCategoryKey && (
        <EntryModal
          userId={userId}
          initialCategoryKey={openCategoryKey}
          onClose={() => setOpenCategoryKey(null)}
          onSaved={() => setOpenCategoryKey(null)}
        />
      )}
    </div>
  );
}
