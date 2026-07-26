"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ShareListButton({ shareTitle }: { shareTitle: string }) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ title: shareTitle, url });
      } catch {
        // user cancelled the share sheet; nothing to do
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard access failed; no further fallback
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleShare}>
      {copied ? (
        <>
          <Check className="size-4" />
          Link kopiert!
        </>
      ) : (
        <>
          <Share2 className="size-4" />
          Teilen
        </>
      )}
    </Button>
  );
}
