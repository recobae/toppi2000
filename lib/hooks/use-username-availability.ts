import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isValidUsername } from "@/lib/username";

export type AvailabilityStatus =
  | "idle"
  | "checking"
  | "available"
  | "taken"
  | "invalid";

export function useUsernameAvailability(
  username: string,
  currentUsername?: string | null,
) {
  const [status, setStatus] = useState<AvailabilityStatus>("idle");

  useEffect(() => {
    if (!username) {
      setStatus("idle");
      return;
    }

    if (username === currentUsername) {
      setStatus("available");
      return;
    }

    if (!isValidUsername(username)) {
      setStatus("invalid");
      return;
    }

    setStatus("checking");
    const supabase = createClient();
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username)
        .maybeSingle();

      setStatus(data ? "taken" : "available");
    }, 400);

    return () => clearTimeout(timeout);
  }, [username, currentUsername]);

  return status;
}
