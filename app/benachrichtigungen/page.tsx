import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { UserPlus, Heart } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getNotifications, markAllNotificationsRead, notificationText } from "@/lib/notifications";
import { BackToProfileLink } from "@/components/profile/back-to-profile-link";

export const metadata: Metadata = { title: "Benachrichtigungen" };

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "gerade eben";
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  return `vor ${days} Tg.`;
}

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/login?next=/benachrichtigungen");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  const notifications = await getNotifications(supabase, user.id);
  // Best-effort, fire-and-forget from the viewer's perspective -- the list
  // above already reflects the pre-read state for this render.
  await markAllNotificationsRead(supabase, user.id);

  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-4 max-w-2xl p-5 pt-6">
        <div className="w-full grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <span className="justify-self-start">
            {profile?.username && <BackToProfileLink username={profile.username} />}
          </span>
          <h1 className="justify-self-center text-center font-medium text-lg">Benachrichtigungen</h1>
          <span aria-hidden="true" />
        </div>

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed p-8 text-center">
            <p className="text-sm font-medium">Noch nichts los</p>
            <p className="text-xs text-muted-foreground">
              Sobald jemand dir folgt oder eine deiner Empfehlungen übernimmt, steht es hier.
            </p>
          </div>
        ) : (
          <div className="w-full flex flex-col gap-2">
            {notifications.map((notification) => {
              const Icon = notification.type === "follow" ? UserPlus : Heart;
              const profileHref = notification.actorUsername ? `/u/${notification.actorUsername}` : null;
              const content = (
                <div
                  className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                    notification.readAt ? "" : "bg-primary/5 border-primary/30"
                  } ${profileHref ? "hover:bg-accent" : ""}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-primary">
                    <Icon className="size-4" />
                  </span>
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <p className="text-sm leading-snug">{notificationText(notification)}</p>
                    <p className="text-[11px] text-muted-foreground">{timeAgo(notification.createdAt)}</p>
                  </div>
                </div>
              );
              return profileHref ? (
                <Link key={notification.id} href={profileHref}>
                  {content}
                </Link>
              ) : (
                <div key={notification.id}>{content}</div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
