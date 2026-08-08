-- ============================================================================
-- Lohnt-sich-Umbau: SQL-Migration
-- ============================================================================
-- WICHTIG: Diese Datei wird NICHT automatisch ausgeführt. Sie wird hier nur
-- erstellt und im Chat präsentiert (siehe Anfrage §6/§9). Ausführung nur nach
-- expliziter Freigabe, manuell im Supabase-Dashboard/via Supabase CLI.
--
-- Jeder Abschnitt ist additiv und einzeln zurückrollbar (Rollback-SQL jeweils
-- direkt darunter, auskommentiert). Kein DROP TABLE, kein Datenverlust.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) item_interactions: dritter Bewertungszustand "neutral" ("Kenne ich
--    noch nicht")
-- ----------------------------------------------------------------------------
-- Zweck: RatingDecision "kenne_ich_nicht" (lib/rating-engine.ts) schreibt
-- interaction_type = 'neutral'. Ohne diese Erweiterung schlägt der Insert an
-- einem eventuell bestehenden CHECK-Constraint fehl.
--
-- WICHTIG (per Diagnose bestätigt, 2026-08): der bestehende Constraint erlaubt
-- bereits 'skip' zusätzlich zu 'like'/'dislike' -- 23 historische Zeilen aus
-- der Zeit, bevor "Skip" als eigenständiges Konzept entfernt wurde (siehe
-- lib/item-skips.ts's Doku-Kommentar). 'skip' bleibt hier bewusst im
-- CHECK erhalten (nie mehr aktiv geschrieben von aktuellem Code -- lib/
-- interactions.ts's InteractionType-Typ kennt nur noch 'like'/'dislike'/
-- 'neutral'), damit diese 23 Zeilen gültig bleiben, statt sie zu löschen
-- oder zu erraten, in welchen der drei neuen Werte sie migriert werden
-- sollten. Gleiche Praxis wie bei den ungelesenen Alt-Tabellen "likes"/
-- "item_ratings" (lib/interactions.ts's Kommentar): historische Zeilen
-- bleiben liegen, statt sie zu mutieren.
--
-- Auswirkung auf Bestandsdaten: keine -- rein additiv, bestehende Zeilen
-- ('like'/'dislike'/'skip') bleiben unverändert gültig.
--
-- Prüfen Sie vor Ausführung den EXAKTEN Namen des bestehenden Constraints
-- (z. B. via `\d item_interactions` im psql oder im Supabase-Dashboard unter
-- Database > Tables > item_interactions > Constraints) -- der Name unten
-- (`item_interactions_interaction_type_check`) ist Postgres' Standard-
-- Benennung für einen unbenannt angelegten CHECK-Constraint und muss ggf.
-- angepasst werden.

ALTER TABLE item_interactions
  DROP CONSTRAINT IF EXISTS item_interactions_interaction_type_check;

ALTER TABLE item_interactions
  ADD CONSTRAINT item_interactions_interaction_type_check
  CHECK (interaction_type IN ('like', 'dislike', 'neutral', 'skip'));

-- Rollback:
-- ALTER TABLE item_interactions DROP CONSTRAINT IF EXISTS item_interactions_interaction_type_check;
-- ALTER TABLE item_interactions ADD CONSTRAINT item_interactions_interaction_type_check CHECK (interaction_type IN ('like', 'dislike', 'skip'));
-- (Rollback schlägt fehl, falls bereits 'neutral'-Zeilen existieren -- diese müssten vorher gelöscht/migriert werden.)


-- ----------------------------------------------------------------------------
-- 2) quick_swipe_events: dritter Event-Typ "neutral"
-- ----------------------------------------------------------------------------
-- Zweck: lib/quick-swipe-events.ts's QuickSwipeEventType wurde um "neutral"
-- erweitert (Tracking von "Kenne ich noch nicht"-Entscheidungen im Lohnt-
-- sich?-Deck). Gleiche Vorsicht wie oben: exakten Constraint-Namen prüfen.
-- Auswirkung: keine, rein additiv.

ALTER TABLE quick_swipe_events
  DROP CONSTRAINT IF EXISTS quick_swipe_events_event_type_check;

ALTER TABLE quick_swipe_events
  ADD CONSTRAINT quick_swipe_events_event_type_check
  CHECK (event_type IN ('like', 'dislike', 'neutral', 'battle_choice', 'detail_open'));

-- Rollback:
-- ALTER TABLE quick_swipe_events DROP CONSTRAINT IF EXISTS quick_swipe_events_event_type_check;
-- ALTER TABLE quick_swipe_events ADD CONSTRAINT quick_swipe_events_event_type_check CHECK (event_type IN ('like', 'dislike', 'battle_choice', 'detail_open'));


-- ----------------------------------------------------------------------------
-- 3) Neue Tabelle: region_familiarity ("Wo warst du schon mal?")
-- ----------------------------------------------------------------------------
-- Zweck: §4 der Anfrage verlangt getrennte Signale für "war ich schon dort"
-- vs. "lohnt sich dieser Ort" (item_interactions bewertet einzelne Orte,
-- diese Tabelle bewertet eine ganze Stadt/Region als Vertrautheits-Status).
-- Bewusst NICHT in item_interactions oder place_regions eingebettet, weil
-- beide eine andere fachliche Bedeutung tragen (Item-Bewertung bzw. eigener
-- Listenbesitz einer Region), nicht "kenne ich diese Stadt überhaupt".
-- Auswirkung auf Bestandsdaten: keine, komplett neue, leere Tabelle.
-- Status: von diesem Umbau NUR als Schema vorbereitet -- die zugehörige UI
-- (region-prompts.tsx Karten-/Listenmodus) ist noch nicht verdrahtet (siehe
-- Abschlussbericht, Abschnitt "Verbleibende Risiken").

CREATE TABLE IF NOT EXISTS region_familiarity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  region_key text NOT NULL,
  region_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('visited', 'unknown', 'want_to_explore')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, region_key)
);

CREATE INDEX IF NOT EXISTS region_familiarity_user_id_idx ON region_familiarity (user_id);

ALTER TABLE region_familiarity ENABLE ROW LEVEL SECURITY;

-- RLS-Vorschlag, analog zu bestehenden Tabellen wie place_regions: jeder
-- Nutzer liest/schreibt ausschließlich eigene Zeilen. Vor Ausführung mit den
-- tatsächlichen Policy-Namen/Konventionen im Supabase-Dashboard abgleichen.
CREATE POLICY "region_familiarity_select_own" ON region_familiarity
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "region_familiarity_insert_own" ON region_familiarity
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "region_familiarity_update_own" ON region_familiarity
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "region_familiarity_delete_own" ON region_familiarity
  FOR DELETE USING (auth.uid() = user_id);

-- Rollback:
-- DROP TABLE IF EXISTS region_familiarity;
-- (Policies/Index werden von Postgres automatisch mit der Tabelle entfernt.)


-- ----------------------------------------------------------------------------
-- 4) Indizes für Credit-Aggregation und Owner-Auflösung
-- ----------------------------------------------------------------------------
-- Zweck: lib/interaction-credits.ts's getInspiredCountBatch/getInspiredCount
-- filtern nach (owner_user_id, credit_type) bzw. (actor_user_id, credit_type)
-- -- ohne passenden Index scannt Postgres bei wachsender interaction_credits-
-- Tabelle die komplette Tabelle für jede Profilstatistik-Anzeige.
-- lib/discovery.ts's Owner-Auflösung (sourceOwnerIds) gruppiert top_list/
-- watchlist/places-Zeilen nach (item_id, media_type) -- Index beschleunigt
-- das Zusammenführen über viele gefolgte Nutzer.
-- Auswirkung auf Bestandsdaten: keine, nur Lesegeschwindigkeit.

CREATE INDEX IF NOT EXISTS interaction_credits_owner_credit_idx
  ON interaction_credits (owner_user_id, credit_type);

CREATE INDEX IF NOT EXISTS interaction_credits_actor_credit_idx
  ON interaction_credits (actor_user_id, credit_type);

CREATE INDEX IF NOT EXISTS item_interactions_item_media_idx
  ON item_interactions (item_id, media_type);

CREATE INDEX IF NOT EXISTS top_list_item_media_idx ON top_list (item_id, media_type);
CREATE INDEX IF NOT EXISTS watchlist_item_media_idx ON watchlist (item_id, media_type);
CREATE INDEX IF NOT EXISTS places_google_place_id_idx ON places (google_place_id);

-- Follow-Beziehungen: bereits mehrfach in jedem Feed-Aufbau gefiltert
-- (follower_id -> "wem folge ich" / followed_id -> "wer folgt mir").
CREATE INDEX IF NOT EXISTS user_follows_follower_id_idx ON user_follows (follower_id);
CREATE INDEX IF NOT EXISTS user_follows_followed_id_idx ON user_follows (followed_id);

-- Rollback:
-- DROP INDEX IF EXISTS interaction_credits_owner_credit_idx;
-- DROP INDEX IF EXISTS interaction_credits_actor_credit_idx;
-- DROP INDEX IF EXISTS item_interactions_item_media_idx;
-- DROP INDEX IF EXISTS top_list_item_media_idx;
-- DROP INDEX IF EXISTS watchlist_item_media_idx;
-- DROP INDEX IF EXISTS places_google_place_id_idx;
-- DROP INDEX IF EXISTS user_follows_follower_id_idx;
-- DROP INDEX IF EXISTS user_follows_followed_id_idx;


-- ----------------------------------------------------------------------------
-- 5) item_skips: als technisches Alt-System dokumentieren (kein Datenverlust)
-- ----------------------------------------------------------------------------
-- Zweck: lib/item-skips.ts wird weiterhin aktiv beschrieben (30 Tage bei
-- "Lohnt sich nicht", 7 Tage bei "Kenne ich noch nicht") -- bei genauerer
-- Prüfung (siehe Abschlussbericht) ist das KEIN Duplikat von
-- item_interactions (unterschiedliche Spalten/unterschiedlicher Zweck:
-- Wiedervorlage-Timer vs. permanente Geschmacksmeinung), deshalb bewusst
-- NICHT deprecated -- nur die COMMENT-Metadaten aktualisiert, damit das für
-- zukünftige Bearbeiter am Tabellen-Objekt selbst sichtbar ist.

COMMENT ON TABLE item_skips IS
  'Rein technischer Wiedervorlage-Timer (30 Tage bei "Lohnt sich nicht", 7 Tage bei "Kenne ich noch nicht"), siehe lib/rating-engine.ts. Kein Nutzer-Feature, kein Duplikat von item_interactions.';

-- Rollback:
-- COMMENT ON TABLE item_skips IS NULL;


-- ----------------------------------------------------------------------------
-- Prüfhinweise (nicht automatisierbar, manuell im Supabase-Dashboard)
-- ----------------------------------------------------------------------------
-- - RLS-Policies auf item_interactions/interaction_credits/quick_swipe_events
--   sind aus dem Anwendungscode nicht einsehbar -- vor Ausführung prüfen,
--   dass INSERT/UPDATE mit interaction_type/event_type = 'neutral' nicht von
--   einer restriktiveren Policy blockiert wird (z. B. falls eine Policy den
--   erlaubten Wertebereich selbst nochmal einschränkt).
-- - Die neuen UNIQUE-Constraints auf item_interactions/interaction_credits
--   (onConflict-Ziele in lib/interactions.ts/lib/interaction-credits.ts)
--   wurden nicht verändert -- nur geprüft, dass sie bereits existieren
--   (vorausgesetzt durch die bestehenden .upsert(..., { onConflict: ... })-
--   Aufrufe im Code). Bitte vor Ausführung im Dashboard verifizieren.
