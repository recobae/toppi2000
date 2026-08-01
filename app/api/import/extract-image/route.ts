import { NextRequest, NextResponse } from "next/server";
import { extractNamesFromText } from "@/lib/import-extract";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Screenshot path of the import flow (Google Maps / TripAdvisor / a notes
 * app, ...): sends the uploaded image to Claude for name/title extraction,
 * then reuses the same line-splitting cleanup as the paste-text path so
 * both converge on an identical string[] before matching against TMDB/Places
 * (see app/api/import/match/route.ts).
 */
export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 500 });
  }

  const body: { imageBase64?: string; mediaType?: string; category?: "movies" | "orte" } =
    await request.json();
  if (!body.imageBase64 || !body.mediaType) {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const subject =
    body.category === "orte"
      ? "Orten (Restaurants, Cafés, Sehenswürdigkeiten, ...)"
      : "Filmen und Serien";

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: body.mediaType, data: body.imageBase64 },
            },
            {
              type: "text",
              text: `Dies ist ein Screenshot (z. B. aus Google Maps, TripAdvisor, einer Notizen-App oder einem Chat) mit einer Liste von ${subject}. Extrahiere ausschließlich die einzelnen Namen bzw. Titel, einer pro Zeile, ohne Nummerierung, Sternebewertungen, Adressen oder sonstigen Zusatztext. Antworte ausschließlich mit der Namensliste, ohne Einleitung oder Erklärung.`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    return NextResponse.json({ error: "Bilderkennung fehlgeschlagen" }, { status: 502 });
  }

  const data: { content?: { type: string; text?: string }[] } = await response.json();
  const text = (data.content ?? []).find((block) => block.type === "text")?.text ?? "";

  return NextResponse.json({ names: extractNamesFromText(text) });
}
