import { NextRequest, NextResponse } from "next/server";
import { RECOMMENDATION_CATEGORIES } from "@/lib/recommendation-categories";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_CATEGORY_KEY = "sonstiges";

/**
 * Freetext entry point for "Mein Topf" (Abschnitt 4): asks Claude to split
 * one free-form sentence into a title, the best-matching fixed category,
 * and a note. Same raw-fetch Claude pattern as
 * app/api/import/extract-image/route.ts. Requires ANTHROPIC_API_KEY, which
 * is not yet configured in this environment -- this route will 500 with a
 * clear error until that's set.
 */
export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 500 });
  }

  const body: { text?: string } = await request.json();
  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const categoryList = RECOMMENDATION_CATEGORIES.map((category) => `${category.key}: ${category.label}`).join("\n");

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `Extrahiere aus folgendem Text drei Dinge: (a) den eigentlichen Namen/Titel der Empfehlung, (b) die passendste Kategorie aus dieser festen Liste (antworte NUR mit dem Key, exakt wie unten geschrieben):\n${categoryList}\n(c) den Rest des Texts als kurze Notiz (kann leer/null sein, falls nichts übrig bleibt).\n\nText: "${text}"\n\nAntworte AUSSCHLIESSLICH mit kompaktem JSON in dieser Form, ohne Erklärung, ohne Markdown-Codeblock: {"name": "...", "category_key": "...", "note": "..." oder null}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    return NextResponse.json({ error: "Klassifizierung fehlgeschlagen" }, { status: 502 });
  }

  const data: { content?: { type: string; text?: string }[] } = await response.json();
  const raw = (data.content ?? []).find((block) => block.type === "text")?.text ?? "";

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed: { name?: string; category_key?: string; note?: string | null } = JSON.parse(
      jsonMatch ? jsonMatch[0] : raw,
    );
    const categoryKey = RECOMMENDATION_CATEGORIES.some((category) => category.key === parsed.category_key)
      ? (parsed.category_key as string)
      : DEFAULT_CATEGORY_KEY;

    return NextResponse.json({
      name: parsed.name?.trim() || text,
      categoryKey,
      note: parsed.note?.trim() || null,
    });
  } catch {
    // Claude's response didn't parse as the requested JSON shape -- fall
    // back to a usable default rather than blocking the entry flow.
    return NextResponse.json({ name: text, categoryKey: DEFAULT_CATEGORY_KEY, note: null });
  }
}
