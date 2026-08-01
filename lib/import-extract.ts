// Turns freeform pasted text (a notes-app list, a WhatsApp chat export, ...)
// into candidate names, one per line -- deliberately simple line-splitting
// rather than an LLM call, since the input is already list-shaped in the
// overwhelming majority of real pastes and this keeps the "paste text" path
// instant and free.
export function extractNamesFromText(raw: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const rawLine of raw.split(/\r?\n/)) {
    const cleaned = rawLine
      .replace(/^[\s"'•·\-–—*]+/, "")
      .replace(/^\d+[.)]\s*/, "")
      .replace(/[\s"'*]+$/, "")
      .trim();

    if (!cleaned || cleaned.length > 120) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(cleaned);
  }

  return names;
}
