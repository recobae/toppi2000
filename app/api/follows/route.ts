import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { sendFollowerNotificationEmail } from "@/lib/email";
import { createNotification } from "@/lib/notifications";

const UNIQUE_VIOLATION_CODE = "23505";

type FollowBody = {
  followedId?: string;
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const body: FollowBody = await request.json();
  const { followedId } = body;

  if (!followedId) {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  if (followedId === user.id) {
    return NextResponse.json(
      { error: "Du kannst dir nicht selbst folgen" },
      { status: 400 },
    );
  }

  const { error: insertError } = await supabase.from("user_follows").insert({
    follower_id: user.id,
    followed_id: followedId,
  });

  if (insertError) {
    if (insertError.code === UNIQUE_VIOLATION_CODE) {
      return NextResponse.json({ success: true, alreadyFollowing: true });
    }
    return NextResponse.json(
      { error: "Folgen fehlgeschlagen" },
      { status: 500 },
    );
  }

  await createNotification(supabase, { userId: followedId, actorId: user.id, type: "follow" });

  // TODO: E-Mail-Versand pausiert, bis RESEND_API_KEY gesetzt ist.
  // Der Follow-Eintrag oben ist zu diesem Zeitpunkt bereits erfolgreich
  // angelegt; die Benachrichtigung ist rein optional (best effort) und ohne
  // Key wird dieser gesamte Block übersprungen, statt unnötig Profil- und
  // E-Mail-Lookups auszuführen. Sobald der Key gesetzt ist, greift der
  // Versand automatisch wieder, ohne dass hier etwas geändert werden muss.
  if (process.env.RESEND_API_KEY) {
    try {
      const [{ data: followerProfile }, { data: followedEmail }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("username")
            .eq("id", user.id)
            .maybeSingle(),
          supabase.rpc("get_user_email", { target_user_id: followedId }),
        ]);

      if (followerProfile?.username && typeof followedEmail === "string") {
        const headersList = await headers();
        const host = headersList.get("host") ?? "localhost:3000";
        const protocol = host.startsWith("localhost") ? "http" : "https";
        const followerProfileUrl = `${protocol}://${host}/u/${followerProfile.username}`;

        await sendFollowerNotificationEmail({
          to: followedEmail,
          followerUsername: followerProfile.username,
          followerProfileUrl,
        });
      }
    } catch {
      // ignore notification failures; the follow itself already succeeded
    }
  }

  return NextResponse.json({ success: true });
}
