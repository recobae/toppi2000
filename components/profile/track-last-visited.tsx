"use client";

import { useEffect } from "react";

export const LAST_VISITED_PROFILE_KEY = "lastVisitedProfile";

export function TrackLastVisitedProfile({ username }: { username: string }) {
  useEffect(() => {
    try {
      localStorage.setItem(LAST_VISITED_PROFILE_KEY, username);
    } catch {
      // localStorage unavailable (e.g. private browsing); nothing to persist
    }
  }, [username]);

  return null;
}
