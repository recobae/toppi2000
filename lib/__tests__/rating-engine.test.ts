import { describe, it, expect } from "vitest";
import { createSupabaseMock, type MockCall } from "./supabase-mock";
import { applyItemRating, addItemToOwnList, rateCandidate } from "@/lib/rating-engine";
import type { DiscoveryCandidate } from "@/lib/discovery";
import type { SupabaseClient } from "@supabase/supabase-js";

// Sammelt Zeilen aus ALLEN upsert-Aufrufen auf `table`, nicht nur dem ersten
// -- z. B. rateCandidate("lohnt_sich") upserted interaction_credits zweimal
// (einmal "like" aus applyItemRating, einmal "inspired" aus addItemToOwnList).
function upsertRowsFor(calls: MockCall[], table: string): Record<string, unknown>[] {
  return calls
    .filter((c) => c.table === table && c.op === "upsert")
    .flatMap((c) => {
      const rows = (c.payload as { rows: unknown } | undefined)?.rows;
      return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : rows ? [rows as Record<string, unknown>] : [];
    });
}

const ITEM = { itemId: "42", mediaType: "movie" as const };

describe("applyItemRating -- die eine zentrale Bewertungsfunktion (§5)", () => {
  it('"Lohnt sich" schreibt item_interactions(like) + Credits für alle Owner', async () => {
    const supabase = createSupabaseMock();
    await applyItemRating(supabase as unknown as SupabaseClient, "actor", ITEM, "lohnt_sich", ["owner1", "owner2"]);

    const interactionRow = upsertRowsFor(supabase.calls, "item_interactions")[0];
    expect(interactionRow.interaction_type).toBe("like");

    const creditRows = upsertRowsFor(supabase.calls, "interaction_credits");
    expect(creditRows).toHaveLength(2);
    expect(creditRows.map((r) => r.owner_user_id).sort()).toEqual(["owner1", "owner2"]);
    expect(creditRows.every((r) => r.credit_type === "like")).toBe(true);
  });

  it('"Lohnt sich nicht" schreibt item_interactions(dislike), keine Credits, kein Notification', async () => {
    const supabase = createSupabaseMock();
    await applyItemRating(supabase as unknown as SupabaseClient, "actor", ITEM, "lohnt_sich_nicht", ["owner1"]);

    const interactionRow = upsertRowsFor(supabase.calls, "item_interactions")[0];
    expect(interactionRow.interaction_type).toBe("dislike");

    expect(supabase.calls.some((c) => c.table === "interaction_credits" && c.op === "upsert")).toBe(false);
    expect(supabase.calls.some((c) => c.table === "notifications")).toBe(false);
    // 30-Tage-Wiedervorlage wird gestartet (lib/item-skips.ts).
    const skipRow = upsertRowsFor(supabase.calls, "item_skips")[0] as { expires_at: string; skipped_at: string };
    const days = (new Date(skipRow.expires_at).getTime() - new Date(skipRow.skipped_at).getTime()) / 86_400_000;
    expect(days).toBeCloseTo(30, 0);
  });

  it('"Kenne ich noch nicht" schreibt item_interactions(neutral), KEINE Credit-Änderung, kein Notification', async () => {
    const supabase = createSupabaseMock();
    await applyItemRating(supabase as unknown as SupabaseClient, "actor", ITEM, "kenne_ich_nicht", ["owner1"]);

    const interactionRow = upsertRowsFor(supabase.calls, "item_interactions")[0];
    expect(interactionRow.interaction_type).toBe("neutral");

    // Weder Grant (upsert) noch Clear (delete) auf interaction_credits --
    // "kenne_ich_nicht" ist wörtlich weder positiv noch negativ (§2).
    expect(supabase.calls.some((c) => c.table === "interaction_credits")).toBe(false);
    expect(supabase.calls.some((c) => c.table === "notifications")).toBe(false);

    // Kürzere, 7-tägige Wiedervorlage statt der 30 Tage bei "Lohnt sich nicht".
    const skipRow = upsertRowsFor(supabase.calls, "item_skips")[0] as { expires_at: string; skipped_at: string };
    const days = (new Date(skipRow.expires_at).getTime() - new Date(skipRow.skipped_at).getTime()) / 86_400_000;
    expect(days).toBeCloseTo(7, 0);
  });

  it("mehrere Listenbesitzer desselben Items erhalten alle ihren Credit, der Actor selbst nie", async () => {
    const supabase = createSupabaseMock();
    // Der Actor taucht versehentlich in der Owner-Liste auf (z. B. weil er
    // sein eigenes Item auch gefolgt hat) -- upsertCredits filtert ihn raus.
    await applyItemRating(supabase as unknown as SupabaseClient, "actor", ITEM, "lohnt_sich", ["owner1", "owner2", "actor"]);

    const creditRows = upsertRowsFor(supabase.calls, "interaction_credits");
    expect(creditRows.map((r) => r.owner_user_id).sort()).toEqual(["owner1", "owner2"]);
    expect(creditRows.some((r) => r.owner_user_id === "actor")).toBe(false);
  });

  it("Credit-Upserts zielen auf den Unique-Constraint (kein doppelter Credit bei wiederholtem identischem Event)", async () => {
    const supabase = createSupabaseMock();
    await applyItemRating(supabase as unknown as SupabaseClient, "actor", ITEM, "lohnt_sich", ["owner1"]);
    await applyItemRating(supabase as unknown as SupabaseClient, "actor", ITEM, "lohnt_sich", ["owner1"]);

    const creditCalls = supabase.calls.filter((c) => c.table === "interaction_credits" && c.op === "upsert");
    expect(creditCalls).toHaveLength(2); // zwei Aufrufe, aber ...
    for (const call of creditCalls) {
      const payload = call.payload as { opts?: { onConflict?: string } };
      // ... beide zielen auf denselben Unique-Key -- Postgres upsert dedupt,
      // es entstehen nie zwei Zeilen für dasselbe (actor, owner, item, media, credit_type)-Tupel.
      expect(payload.opts?.onConflict).toBe("actor_user_id,owner_user_id,item_id,media_type,credit_type");
    }
  });
});

describe("addItemToOwnList -- eigenständig von der Bewertung (§5)", () => {
  it('Hinzufügen aus "Lohnt sich?"/Für Dich/Liste/Profil nutzen alle denselben Pfad -> identisches Credit-Ergebnis', async () => {
    const supabase = createSupabaseMock();
    const { error } = await addItemToOwnList(
      supabase as unknown as SupabaseClient,
      "actor",
      {
        kind: "movie",
        category: "top_list",
        item: { itemId: 42, mediaType: "movie", title: "Beispiel", imageUrl: null, year: "2024" },
      },
      ["owner1", "owner2"],
    );

    expect(error).toBeNull();
    expect(supabase.calls.some((c) => c.table === "top_list" && c.op === "upsert")).toBe(true);

    const creditRows = upsertRowsFor(supabase.calls, "interaction_credits");
    expect(creditRows).toHaveLength(2);
    expect(creditRows.every((r) => r.credit_type === "inspired")).toBe(true);

    const notificationInserts = supabase.calls.filter((c) => c.table === "notifications" && c.op === "insert");
    expect(notificationInserts).toHaveLength(2); // je einmal pro Owner benachrichtigt
  });

  it("Hinzufügen ohne bekannten Owner (z. B. Suchergebnis) erzeugt keinen Credit und keine Notification", async () => {
    const supabase = createSupabaseMock();
    await addItemToOwnList(supabase as unknown as SupabaseClient, "actor", {
      kind: "movie",
      category: "top_list",
      item: { itemId: 42, mediaType: "movie", title: "Beispiel", imageUrl: null, year: "2024" },
    });

    expect(supabase.calls.some((c) => c.table === "interaction_credits")).toBe(false);
    expect(supabase.calls.some((c) => c.table === "notifications")).toBe(false);
  });
});

describe("rateCandidate -- der eine Einstiegspunkt für Quick-Swipe/Für-Dich-Feeds", () => {
  const candidate: DiscoveryCandidate = {
    id: "movie-movie-42",
    title: "Beispiel",
    category: "Film",
    location: null,
    imageUrl: null,
    sourceType: "movie",
    sourceUserId: "owner1",
    sourceUsernames: ["marcus"],
    sourceOwnerIds: ["owner1"],
    note: null,
    rating: null,
    socialSupportCount: 1,
    personalSupportCount: 0,
    lastActivityAt: new Date().toISOString(),
    promptMatchScore: 0.5,
    finalScore: 0,
    reason: "Weil marcus ihn auf seiner Liste hat",
    ref: { mediaType: "movie", tmdbId: 42 },
  };

  it('"Lohnt sich" bewertet UND fügt zur eigenen Liste hinzu, mit Credit für den Feed-Owner', async () => {
    const supabase = createSupabaseMock();
    await rateCandidate(supabase as unknown as SupabaseClient, "actor", candidate, "lohnt_sich");

    expect(supabase.calls.some((c) => c.table === "item_interactions" && c.op === "upsert")).toBe(true);
    expect(supabase.calls.some((c) => c.table === "top_list" && c.op === "upsert")).toBe(true);
    const creditTypes = upsertRowsFor(supabase.calls, "interaction_credits").map((r) => r.credit_type);
    expect(creditTypes.sort()).toEqual(["inspired", "like"]);
  });

  it('"Lohnt sich nicht" bewertet, fügt NICHT zur Liste hinzu', async () => {
    const supabase = createSupabaseMock();
    await rateCandidate(supabase as unknown as SupabaseClient, "actor", candidate, "lohnt_sich_nicht");

    expect(supabase.calls.some((c) => c.table === "item_interactions" && c.op === "upsert")).toBe(true);
    expect(supabase.calls.some((c) => c.table === "top_list")).toBe(false);
  });

  it('"Kenne ich noch nicht" bewertet neutral, fügt NICHT zur Liste hinzu, keine Credits', async () => {
    const supabase = createSupabaseMock();
    await rateCandidate(supabase as unknown as SupabaseClient, "actor", candidate, "kenne_ich_nicht");

    expect(supabase.calls.some((c) => c.table === "top_list")).toBe(false);
    expect(supabase.calls.some((c) => c.table === "interaction_credits")).toBe(false);
  });
});
