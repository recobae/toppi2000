const RESEND_API_URL = "https://api.resend.com/emails";

export async function sendFollowerNotificationEmail({
  to,
  followerUsername,
  followerProfileUrl,
}: {
  to: string;
  followerUsername: string;
  followerProfileUrl: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL ?? "Toppi <onboarding@resend.dev>",
        to,
        subject: "Du hast einen neuen Follower!",
        html: `
          <p><strong>${followerUsername}</strong> folgt dir jetzt auf Toppi.</p>
          <p><a href="${followerProfileUrl}">Profil von ${followerUsername} ansehen</a></p>
        `,
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}
