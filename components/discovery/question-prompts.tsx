"use client";

import { useState } from "react";
import Link from "next/link";
import { HelpCircle } from "lucide-react";
import { EntryModal } from "@/components/topf/entry-modal";
import type { QuestionPrompt } from "@/lib/question-prompts";

/**
 * "Fragen anstoßen" -- active nudges rather than passive cards. A Mein-Topf-
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
      <h2 className="text-sm font-medium text-muted-foreground">Frag dein Netzwerk</h2>
      <div className="w-full flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {prompts.map((prompt, index) =>
          prompt.kind === "topf" ? (
            <button
              key={index}
              type="button"
              onClick={() => setOpenCategoryKey(prompt.categoryKey)}
              className="shrink-0 flex items-start gap-2 max-w-[220px] rounded-lg border p-3 text-left hover:bg-accent transition-colors"
            >
              <HelpCircle className="size-4 shrink-0 text-primary mt-0.5" />
              <span className="text-xs font-medium leading-snug">{prompt.question}</span>
            </button>
          ) : (
            <Link
              key={index}
              href="/inspiration?tab=orte"
              className="shrink-0 flex items-start gap-2 max-w-[220px] rounded-lg border p-3 text-left hover:bg-accent transition-colors"
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
