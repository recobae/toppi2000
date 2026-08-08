/**
 * Minimaler In-Memory-Mock für den Supabase-JS-Query-Builder, genau so weit
 * gebaut wie lib/rating-engine.ts und seine Abhängigkeiten (lib/interactions,
 * lib/item-skips, lib/interaction-credits, lib/saved-items, lib/place-items,
 * lib/notifications) ihn tatsächlich nutzen: `.from(table).<chain
 * methods>.<terminal>()`. Jeder Chain-Aufruf protokolliert sich selbst in
 * `calls`, sodass Tests exakt prüfen können, welche Tabelle mit welchen
 * Daten angefasst wurde -- ohne eine echte Datenbank zu brauchen.
 */
export type MockCall = { table: string; op: string; payload?: unknown };

export type MockResponses = Record<string, { data?: unknown; error?: unknown; count?: number }>;

export function createSupabaseMock(responses: MockResponses = {}) {
  const calls: MockCall[] = [];

  function chain(table: string, op: string, payload?: unknown) {
    calls.push({ table, op, payload });
    const resolved = () => Promise.resolve(responses[`${table}.${op}`] ?? { data: null, error: null, count: 0 });
    const obj: Record<string, unknown> = {
      eq: () => obj,
      in: () => obj,
      gt: () => obj,
      not: () => obj,
      order: () => obj,
      limit: () => obj,
      select: () => obj,
      maybeSingle: resolved,
      single: resolved,
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => resolved().then(resolve, reject),
    };
    return obj;
  }

  return {
    from(table: string) {
      return {
        select: (cols?: string, opts?: unknown) => chain(table, "select", { cols, opts }),
        upsert: (rows: unknown, opts?: unknown) => chain(table, "upsert", { rows, opts }),
        insert: (row: unknown) => chain(table, "insert", { row }),
        delete: () => chain(table, "delete"),
        update: (patch: unknown) => chain(table, "update", { patch }),
      };
    },
    calls,
  };
}
