"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ShareListButton({
  shareTitle,
  url,
  iconOnly = false,
}: {
  shareTitle: string;
  url?: string;
  iconOnly?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleShare = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const shareUrl = url
      ? new URL(url, window.location.origin).toString()
      : window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ title: shareTitle, url: shareUrl });
      } catch {
        // user cancelled the share sheet; nothing to do
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard access failed; no further fallback
    }
  };

  if (iconOnly) {
    return (
      <span className="relative inline-flex">
        <Button
          variant="ghost"
          size="icon"
          // Visible box stays 24px (matches the other header icons). The
          // negative margin only expands the invisible hit area a little
          // (4px/side, not 10px) -- a wider overflow risked bleeding into
          // whatever sits directly below in tightly-spaced layouts (e.g.
          // the profile header's expertise-label row sits only 16px below
          // this button) and silently eating clicks meant for that element.
          className="h-8 w-8 -m-1 text-muted-foreground hover:text-foreground"
          aria-label="Liste teilen"
          onClick={handleShare}
        >
          {copied ? <Check className="size-3.5" /> : <Share2 className="size-3.5" />}
        </Button>
        {copied && (
          <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap rounded bg-foreground text-background text-[10px] px-1.5 py-0.5 z-10">
            Link kopiert!
          </span>
        )}
      </span>
    );
  }

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
