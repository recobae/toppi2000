"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getUnreadNotificationCount } from "@/lib/notifications";

/** Sits in the Für-Dich header -- the one place the return-trigger loop is visible from the app's actual landing surface. */
export function NotificationBell({ userId }: { userId: string }) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    getUnreadNotificationCount(supabase, userId).then(setUnreadCount);
  }, [userId]);

  return (
    <Link
      href="/benachrichtigungen"
      aria-label={unreadCount > 0 ? `Benachrichtigungen (${unreadCount} ungelesen)` : "Benachrichtigungen"}
      className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
    >
      <Bell className="size-5" />
      {unreadCount > 0 && (
        <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
