import type { SupabaseClient } from "@supabase/supabase-js";

// The one in-app reciprocity/return-trigger channel: no push infra exists
// in this project, so "notification" here always means "shows up next time
// you open the app", surfaced via the bell in the Für-Dich header + a full
// list at /benachrichtigungen. Two events cover the core loop directly:
// someone followed you, and someone adopted (liked -> saved) something you
// recommended -- the exact moment the core loop's promise ("zeig deinen
// Geschmack, bekomm dadurch die Empfehlungen deiner Freunde") pays off for
// the person who shared it.
export type NotificationType = "follow" | "adopted";

export type NotificationRow = {
  id: string;
  actorId: string | null;
  actorUsername: string | null;
  type: NotificationType;
  title: string | null;
  readAt: string | null;
  createdAt: string;
};

/** Never notifies yourself (e.g. liking your own re-shared item) -- best-effort, never throws. */
export async function createNotification(
  supabase: SupabaseClient,
  params: { userId: string; actorId: string; type: NotificationType; title?: string | null },
): Promise<void> {
  if (params.userId === params.actorId) return;
  const { error } = await supabase.from("notifications").insert({
    user_id: params.userId,
    actor_id: params.actorId,
    type: params.type,
    title: params.title ?? null,
  });
  if (error) console.error("createNotification failed", error);
}

export async function getNotifications(
  supabase: SupabaseClient,
  userId: string,
  limit = 30,
): Promise<NotificationRow[]> {
  const { data } = await supabase
    .from("notifications")
    .select("id, actor_id, type, title, read_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!data || data.length === 0) return [];

  const actorIds = [...new Set(data.map((row) => row.actor_id).filter((id): id is string => !!id))];
  const { data: profiles } =
    actorIds.length > 0
      ? await supabase.from("profiles").select("id, username").in("id", actorIds)
      : { data: [] as { id: string; username: string }[] };
  const usernameById = new Map((profiles ?? []).map((profile) => [profile.id, profile.username]));

  return data.map((row) => ({
    id: row.id,
    actorId: row.actor_id,
    actorUsername: row.actor_id ? (usernameById.get(row.actor_id) ?? null) : null,
    type: row.type as NotificationType,
    title: row.title,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));
}

export async function getUnreadNotificationCount(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);
  return count ?? 0;
}

export async function markAllNotificationsRead(supabase: SupabaseClient, userId: string) {
  return supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
}

export function notificationText(row: NotificationRow): string {
  const actor = row.actorUsername ?? "Jemand";
  if (row.type === "follow") return `${actor} folgt dir jetzt`;
  if (row.type === "adopted") {
    return row.title ? `${actor} hat „${row.title}“ von dir übernommen` : `${actor} hat etwas von dir übernommen`;
  }
  return `${actor} hat etwas gemacht`;
}
