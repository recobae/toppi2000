# Toppi – Ist-Zustands-Audit

**Erstellt:** 2026-08-08, rein lesend, ohne jede Code-/DB-/Git-Änderung.
**Branch:** `main`, sauber bis auf eine unveränderte Alt-Anomalie: `public/logo.png` steht seit mehreren früheren Runden dauerhaft als "modified" in `git status`, ohne dass eine dieser Runden sie committet oder verworfen hätte. Ursache nicht ermittelbar (evtl. lokale Bildmetadaten/Tool-Artefakt) – siehe Offene Fragen.

Statusklassen für jede Zeile unten:
① bereits funktionierend und im Code belegt · ② teilweise implementiert · ③ nur vorbereitet/ungenutzt · ④ fehlerhaft · ⑤ nicht vorhanden

---

## 1. Kurzbeschreibung des tatsächlich laufenden Projekts

Toppi ist eine Next.js-16-App (App Router, React 19) mit Supabase als Backend (Auth, Postgres, RLS – kein Storage). Das Kernprodukt: Nutzer sammeln Filme/Serien/Orte/freie Empfehlungen in festen Listen (Empfohlen, Watchlist, Orte-Regionen, Mein Topf), folgen einander, und ein swipe-basierter "My Taste"-Screen sowie ein algorithmischer "Für Dich"-Feed schlagen neue Items vor. Wer ein von einem Freund empfohlenes Item selbst liked/übernimmt, erzeugt eine Provenienz-Gutschrift ("X mal inspiriert"/"übernommen"), die auf Profilen sichtbar wird. Es gibt keine Push-Benachrichtigungen, nur In-App-Benachrichtigungen (Glocke) für zwei Ereignistypen: Follow und "adopted" (Item übernommen).

Das Produkt hat laut Commit-Historie sehr viele iterative Umbaurunden hinter sich; etliche frühere Konzepte (Skip als Nutzeraktion, Taste-Match-Prozent, Story-Feature, `/topf`- und `/orte`-Standalone-Routen, tägliches Swipe-Limit) wurden bewusst entfernt oder hinter Feature-Flags gelegt, aber der Code dazu existiert oft noch (siehe Abschnitt 5).

---

## 2. Architektur-Überblick

**Framework/Deps** (`package.json`):
- Next.js "latest" → real. installiert: 16.2.11 (App Router, `experimental.cacheComponents: true` in `next.config.ts:1`)
- React "latest" → 19.2.8 (package.json deklariert `^19.0.0`)
- `@supabase/ssr` 0.12.3, `@supabase/supabase-js` "latest"
- `eslint-config-next`: 15.3.1 (③ – ein Versions-Lag gegenüber Next 16, keine funktionale Auswirkung, aber lint-Regeln evtl. nicht 1:1 auf Next-16-Konventionen abgestimmt)
- framer-motion, leaflet, lucide-react, tailwindcss 3.4.1
- **Keine Test-Infrastruktur**: `package.json` `scripts` enthält nur `dev`, `build`, `start`, `lint` – kein `test`-Skript, keine `*.test.*`/`*.spec.*`-Dateien im gesamten Projekt (⑤ für "existierende Tests").

**Next.js 16 "Proxy"-Konvention**: `proxy.ts` (Projekt-Root) exportiert `proxy(request)` und ersetzt das alte `middleware.ts`. Korrekt implementiert (①), delegiert an `lib/supabase/proxy.ts#updateSession`, welches `auth.getClaims()` statt `getUser()` nutzt.

**Auth-Gate** (`lib/supabase/proxy.ts`, ~Z. 1–80): Liste öffentlicher Pfad-Präfixe ohne Login-Zwang: `/login`, `/auth`, `/search`, `/lists`, `/u/`, `/vorschlag`, `/inspo`, `/hinzufuegen`, `/api`.
- `/login` existiert als eigene Route nicht mehr (echter Login liegt unter `/auth/login`) – vermutlich toter Guard-Eintrag (③).
- `/lists` hat kein Verzeichnis unter `app/` – ebenfalls vermutlich verwaister Guard-Eintrag (③).

**Supabase-Clients**: getrennt für Browser (`lib/supabase/client.ts`), Server (`lib/supabase/server.ts`, cookie-basiert via `next/headers`), Proxy/Middleware (`lib/supabase/proxy.ts`). Kein Storage-Bucket-Zugriff irgendwo im Code – alle Bilder sind externe CDN-URLs (siehe unten).

**Externe Dienste** (`next.config.ts` `images.remotePatterns`):
- `image.tmdb.org` – TMDB (Filme/Serien)
- `places.googleapis.com` – Google Places (Orte, Fotos, Öffnungszeiten)
- `books.google.com` – Google Books (Mein-Topf "Bücher")
- `**.mzstatic.com` – Apple/iTunes (Mein-Topf "Musik", Song-Suche fürs Profil)
- Kein Supabase Storage.

**Supabase RPCs (Postgres-Funktionen)** – genau 2 Aufrufstellen im ganzen Projekt:
1. `get_user_email` – für E-Mail-Benachrichtigungen, aber `RESEND_API_KEY` ist in `.env.local` nicht gesetzt → Pfad ist im Code vorhanden, aber inert (③, dokumentiert per TODO-Kommentar in `app/api/follows/route.ts`).
2. `find_similar_recommendations` – Fuzzy-Duplikat-Check für Mein-Topf (`lib/topf.ts`), vermutlich `pg_trgm`-basiert, aktiv genutzt (①).

**Bestätigte Supabase-Tabellen** (vollständige, saubere `Grep`-Erhebung über `\.from\("([a-z_]+)"\)` in allen `.ts`/`.tsx`-Dateien, 18 Tabellen):
`dont_watch, interaction_credits, item_interactions, item_skips, notifications, place_regions, places, profiles, quick_swipe_events, recommendation_recommenders, recommendation_thanks, recommendations, story_events, story_views, swipe_card_actions, top_list, user_follows, watchlist`

Kein SQL/Migrations-Verzeichnis im Repo (`supabase/` existiert nicht als CLI-Projektordner, keine `*.sql`-Dateien lokal) – Schema/RLS liegen ausschließlich in der Supabase-Instanz selbst und sind **aus dem Code allein nicht verifizierbar** (siehe Abschnitt 8, Blind Spot).

**Datenfluss-Beispiel (Like im Quick-Swipe)**: Klick auf "Gefällt mir" in `QuickSwipeCard` → `QuickSwipeDeck.handleSingleAction` (`components/swipe/quick-swipe-deck.tsx:113`) → `likeAndSaveCandidate` (`lib/discovery-like.ts:29`) schreibt parallel in `item_interactions` (via `recordInteraction`) und in die Zielliste (`top_list`/`places`/Mein-Topf via `saveToCategory`/`savePlaceToRegion`/`saveRecommendation`), danach sequentiell `notifySource` (`notifications`-Insert) → zurück im Deck: `recordSwipeCardAction` (`swipe_card_actions`) + `recordQuickSwipeEvent` (`quick_swipe_events`), erst danach `dismissCurrent()` und die nächste Karte wird angezeigt. Kein separater "inspiriert"-Credit-Aufruf in diesem Pfad – Credits (`interaction_credits`) entstehen laut Code nur über `setInteractionWithCredits`/`recordInspiredCredits` (`lib/interaction-credits.ts`), die von den Inspo-/Feed-Oberflächen aufgerufen werden, **nicht** vom Quick-Swipe-Like-Pfad selbst (② – "inspiriert"-Zuschreibung ist nicht überall gleich verdrahtet, siehe Abschnitt 6).

---

## 3. Tabellen-/Datenmodell-Übersicht

| Tabelle | Zweck (aus Code erschlossen) | Zentrale Nutzung |
|---|---|---|
| `profiles` | Nutzerprofil, `home_city`, Song-Feld | überall |
| `user_follows` | Follow-Graph | `app/api/follows/route.ts`, `follow-button.tsx` |
| `item_interactions` | **Eine** Zeile pro (Nutzer, Item): aktueller Like/Dislike-Stand | `lib/interactions.ts`, Grundlage für alle Ausschlüsse |
| `interaction_credits` | Provenienz-Ledger: (Actor, Owner, Item, credit_type) → `"like"` / `"inspired"` | `lib/interaction-credits.ts`, Profil-Statistiken |
| `item_skips` | interne 30-Tage-Wiedervorlage nach Dislike (kein Nutzer-Feature) | `lib/item-skips.ts`, `lib/rating.ts` |
| `top_list`, `watchlist` | Filme/Serien-Listen (Empfohlen/Watchlist), `top_list` zusätzl. `is_favorite`/`favorited_at` | `lib/saved-items.ts` |
| `place_regions`, `places` | Orte-Listen nach Region, `places.status` (`recommended`/`want_to_visit`) | `lib/place-items.ts`, `lib/google-places.ts` |
| `dont_watch` | separate "Nicht interessiert"-Ablage (Filme) | vereinzelt referenziert |
| `recommendations`, `recommendation_recommenders`, `recommendation_thanks` | Mein-Topf: freie Empfehlungen (Bücher/Musik/Sonstiges) + Mehrfach-Empfehler + "Bedanken" | `lib/topf.ts` |
| `notifications` | In-App-Benachrichtigungen, Typ `"follow"` \| `"adopted"` | `lib/notifications.ts` |
| `story_events`, `story_views` | Story-Feature-Datenmodell | vorhanden, Feature per Flag deaktiviert (siehe 5) |
| `quick_swipe_events`, `swipe_card_actions` | Tracking/Analytics für den Quick-Swipe-Screen | `lib/quick-swipe-events.ts`, `lib/swipe-activity.ts` |

**Duplikate/Überschneidungen**: `item_interactions` (aktueller Stand) und `interaction_credits` (Provenienz-Historie, mehrere Zeilen pro Item möglich) sind bewusst getrennte, nicht redundante Modelle laut Kommentar in `lib/interaction-credits.ts:4-9` – kein Datenmodell-Fehler, aber eine Doppelquelle, die man beim Lesen leicht verwechselt. `dont_watch` wirkt wie ein Relikt aus einer Vor-`item_interactions`-Ära; nicht abschließend klärbar, ob noch aktiv beschrieben wird (① Lesevorkommen bestätigt, Schreibpfad nicht mit Sicherheit lokalisiert – als Unsicherheit vermerkt).

---

## 4. Status-Matrix Produktfunktionen

| Funktion | Status | Beleg |
|---|---|---|
| Top-Liste ("Empfohlen") | ① | `lib/categories.ts`, `top_list`-Tabelle, `list-items-grid.tsx` |
| Watchlist | ① | `watchlist`-Tabelle, gleiche Grid-Komponente |
| Orts-/Regionslisten | ① | `place_regions`/`places`, `region-items-grid.tsx`, `lib/google-places.ts` |
| Inspo-Widget (in FollowingBar) | ① | `following-bar.tsx` zeigt `InspiredCountBadge` (Z. 44-53) direkt am Avatar |
| Eigene "Inspo-Seite" als Standalone-Route | ⑤ | `/inspo` ist reiner `redirect()`-Stub (`app/inspo/page.tsx`), Inhalt lebt in `/inspiration` (Task #110-111) |
| Freundes-Feed | ① | Teil von `/inspiration`/`app/api/friend-feed/route.ts` |
| Algorithmischer Fallback im Feed | ① | `lib/recommendations.ts`, Trending/Klassiker/Genre-Match |
| Story-Ringe (Ich-folge-Leiste) | ③ | `STORY_FEATURE_ENABLED = false` (`lib/feature-flags.ts:7-11`) – Code vollständig vorhanden (`following-bar.tsx:159-163`, `story-viewer.tsx`, 335 Zeilen), aber Ring-Rendering ist hart auf `hasUnseenStory = STORY_FEATURE_ENABLED && …` gegated → derzeit **nie** sichtbar |
| Story-Ringe auf Profilseiten | ③ | gleiche Flag-Abhängigkeit, Slot wurde laut Kommentar der Song-Snippet-Funktion übergeben |
| Eigene Story anlegen/löschen | ③ | Code vorhanden lt. `story-viewer.tsx` (335 Z.) und Task-Historie (#88 "Own avatar opens own story viewer with delete"), aber wegen Flag nicht erreichbar |
| Klick auf Profilnamen (Story-Viewer → Profil) | ③ | Code vorhanden (Task #94), aber nur über inaktiven Story-Pfad erreichbar |
| Like/Dislike/Skip + `item_interactions` | ② | Like/Dislike voll funktionsfähig und in `item_interactions` gespeichert (`lib/interactions.ts`); "Skip" als eigenständiges Nutzerkonzept existiert **nicht mehr** – nur eine interne 30-Tage-Wiedervorlage (`item_skips`/`lib/item-skips.ts`), die bei jedem Dislike automatisch mitläuft (`lib/rating.ts`). UI zeigt nirgends einen "Skip"-Button. |
| Profilstatistiken "X Likes" | ① | `interaction_credits` credit_type `"like"`, aggregiert z. B. in `lib/list-overview.ts` |
| Profilstatistiken "X mal inspiriert" | ② | Für Filme/Serien und Orte über `credit_type: "inspired"` vorhanden (`lib/interaction-credits.ts:102-110`, `getInspiredCount(Batch)`); Text/Variable/DB-Wert sind uneinheitlich benannt (siehe Abschnitt 6) |
| Attribution eines Items an alle gefolgten Listenbesitzer | ① | `upsertCredits` iteriert über die komplette `ownerUserIds[]` (`lib/interaction-credits.ts:20-22`) – mehrfache Besitzer werden alle gutgeschrieben |
| "Auf Top-Liste von …" + Likes/Dislikes auf Kacheln | ① | `AttributionLines`/`ListItemRowAttribution` in `components/items/list-item-row.tsx:31,87-100`; "Auch von X geliked/nicht gemocht" Z. 342-357 |
| Einheitlicher "+ Hinzufügen"-Button | ① | Ein einziger, wiederverwendeter `ListItemRow`/`ActionBar` (`components/items/list-item-row.tsx`), Text konsequent "Hinzufügen" (Z. 244) bzw. per `addLabel`-Prop |
| Suche Filme/Serien und Orte | ① | `app/search/page.tsx` ist Redirect-Stub → echte Suche in `/inspiration` (kategoriebewusste Suche, Task #80); `app/api/search/route.ts` aktiv |
| "Meine Aktivität" | ① | `app/meine-aktivitaet/page.tsx` (eigene Route, lädt `/api/my-activity`, Toggle Like/Dislike inline) |

---

## 5. Terminologie-Sweep

| Begriff | Vorkommen | Klassifikation |
|---|---|---|
| "Gefällt mir" | UI-Buttons (`list-item-row.tsx:129`, `quick-swipe-deck.tsx:187`) | UI-Text, aktueller Standardbegriff |
| "Like"/"like" | `CreditType`, `interaction_credits.credit_type`, `InteractionType` | interne Variable/DB-Wert (Englisch), nie im UI |
| "Nix für mich" | UI-Button, ersetzt das alte "Dislike" (`list-item-row.tsx:142`) | UI-Text |
| "dislike" | DB-Wert/Variable | interner Wert, nie im UI |
| "Merken" | `import-modal.tsx` (~Z. 340-365, Bulk-Import-Ziel-Chip), `places.status = "want_to_visit"` | UI-Text (nur noch **ein** verbliebener Eintrittspunkt) + DB-Wert; die frühere Inline-"+Merken"-Schnellaktion in Orte-Listenzeilen wurde in einer früheren Runde entfernt |
| "Übernehmen"/"übernommen" | `lib/notifications.ts:90` (`"… hat „X" von dir übernommen"`), `follow-button.tsx:125,152,165` ("… nicht mehr inspirieren lassen" nutzt dagegen "inspirieren") | UI-Text (Benachrichtigung) |
| "My Taste" | Route `/my-taste`, `app/my-taste/page.tsx`, Kommentare in `quick-swipe-deck.tsx:28` | UI-Konzeptname + Routenname |
| "Inspo"/"Inspirieren"/"Vorschlagen" | Route-Stub `/inspo`→`/inspiration`; "Inspirierend"-Button in `follow-button.tsx:185`; `InspiredCountBadge` | UI-Text + Variablennamen, teils historische Altlogik (Redirect-Stub) |
| "X Likes" | Profil-Statistik, `getInspiredCountBatch`-Pendant für Likes | UI-Text, aus `interaction_credits` aggregiert |
| "X mal inspiriert" | Profil-/`list-overview.ts:39` Statistik ("X Einträge – X von Dir inspiriert") | UI-Text |

**Kern-Widerspruch**: Ein und dasselbe Ereignis ("Freund X hat Item Y von mir übernommen") wird an drei Stellen mit drei verschiedenen Verben ausgedrückt: Datenbank/Variable = `"inspired"` (Englisch), Profil-Statistiktext = "… mal inspiriert", Live-Benachrichtigung = "… hat … von dir **übernommen**". Kein Bug, aber eine unentschiedene Terminologiefrage (④ im Sinne von "inkonsistent", nicht im Sinne von "kaputt").

**"Lohnt sich"-Begriffe** (`✅/❌/❓`, "Lohnt sich (nicht)", "Kenne ich noch nicht"): projektweite Suche über alle `.ts`/`.tsx`-Dateien liefert **null Treffer** (⑤ vollständig nicht vorhanden, weder als UI-Text noch als Variable).

---

## 6. "Lohnt-sich"-Konzept – Bewertung der Umsetzungsreife (nur Bestandsaufnahme, keine Implementierung)

| Baustein | Status | Begründung |
|---|---|---|
| ✅ „Lohnt sich" / ❌ „Lohnt sich nicht" / ❓ „Kenne ich noch nicht" als 3-Wege-Bewertung | ⑤ | Aktuell existiert nur ein binäres Like/Dislike (`item_interactions.interaction_type ∈ {like, dislike}`). Eine dritte, neutrale "kenne ich nicht"-Antwortoption gibt es weder als DB-Wert noch als UI-Button. Ein Umbau würde mindestens den `interaction_type`-Enum und alle darauf aufbauenden Aggregationen (`interaction_credits`, `lib/exclusions.ts`, Profilstatistiken) berühren. |
| Separates Skip als reine Navigationsaktion ohne Bewertungssignal | ⑤ (als Nutzerkonzept) | Der einzige "Skip"-Mechanismus im Code (`item_skips`) ist explizit **kein** navigationsneutraler Skip, sondern eine 30-Tage-Wiedervorlage, die **immer zusammen mit einem Dislike** ausgelöst wird (`lib/rating.ts`, jeder `recordDislike()`-Call). Es gibt aktuell keinen Button/Pfad, der eine Karte ohne jedes Bewertungssignal weiterschaltet. |
| Kategorie „Für dich" | ① (als Seitenname vorhanden) | `/fuer-dich` ist die reale Landing-Route für eingeloggte Nutzer (`app/page.tsx`); ob die intern verwendete Sektionslogik exakt dem im Konzept gemeinten "Für dich"-Algorithmus entspricht, wurde nicht vertieft geprüft. |
| „Gerade neu von deinem Netzwerk" | ② | `app/fuer-dich/page.tsx:136` zeigt aktuell den Titel **"Gerade neu von Freunden"** – inhaltlich sehr nah, aber wörtlich nicht die im Konzept genannte Formulierung. |
| „Weitere Inspiration" statt „Neu für dich" | ⑤ (Konzept-Wunsch noch nicht umgesetzt) | `app/fuer-dich/page.tsx:139` zeigt aktuell **"Neu für dich"** – exakt der Begriff, den das Konzept ersetzen möchte, steht noch im Code. |
| Städte-/Orte-Onboarding „Wo warst du schon mal?" | ⑤ als Onboarding-Schritt, ② als thematisch verwandtes Bestandsfeature an anderer Stelle | Der echte Onboarding-Flow (`app/onboarding/page.tsx`) ist ein kuratierter Start-Content-Picker (`getCuratedLists({featuredOnboardingOnly:true})`), **keine** Selbstauskunft über besuchte Städte. Es gibt aber innerhalb von Für Dich eine oberflächlich ähnliche, netzwerkgetriebene Funktion: `components/discovery/region-prompts.tsx:39` zeigt `<h2>Warst du schon mal hier?</h2>`, gespeist von `app/api/discovery-feed/city/route.ts`/`lib/discovery.ts`. Das ist **keine** Städte-Selbstauskunft beim Onboarding, sondern eine algorithmische Stadt-Drilldown-Sektion im laufenden Feed – beide Konzepte dürfen im weiteren Vorgehen nicht verwechselt werden. |

---

## 7. Daten-/Statistikprüfung

- **Speicherort Like/Dislike/Skip**: `item_interactions` (ein Datensatz pro Nutzer+Item, aktueller Stand, `lib/interactions.ts`). "Skip" hat keine eigene Nutzerbedeutung, nur die interne 30-Tage-Ausschlusstabelle `item_skips` (`lib/item-skips.ts`), immer gekoppelt an ein Dislike.
- **Löst "zu eigener Liste hinzufügen" ein "inspiriert"-Ereignis aus?** – **Uneinheitlich (②)**: Im Quick-Swipe-Pfad (`lib/discovery-like.ts`) wird bei einem Like direkt gespeichert **und** benachrichtigt (`notifySource`), aber **keine** `interaction_credits`-Zeile mit `credit_type: "inspired"` erzeugt – dieser Pfad schreibt (indirekt über `recordInteraction`) nur den "like"-Credit-Pfad, sofern der Aufrufer `ownerUserIds` mitgibt (`setInteractionWithCredits`, `lib/interaction-credits.ts:62-82`) – "inspired"-Credits entstehen laut Code ausschließlich über `recordInspiredCredits` (Z. 102-110), das laut Task-Historie (#84/#85) gezielt aus den Inspo-Tab-Komponenten (`movies-inspo-tab.tsx`, `orte-inspo-tab.tsx`) aufgerufen wird, nicht aus dem Quick-Swipe-Deck. D. h. dieselbe fachliche Handlung ("ein Item von einem Freund übernehmen") erzeugt je nach Einstiegspfad (Quick-Swipe vs. Inspiration-Feed) unterschiedliche Ledger-Einträge – nicht abschließend im UI verifiziert, aber im Code klar belegbar. **Muss vor jeder Weiterarbeit an "X mal inspiriert" geklärt werden.**
- **Mehrfachbesitzer-Ermittlung**: `upsertCredits` (`lib/interaction-credits.ts:13-39`) nimmt ein Array `ownerUserIds` entgegen und schreibt für jeden (außer dem Actor selbst) eine eigene Zeile – die Herkunft dieses Arrays (wie genau "alle gefolgten Listenbesitzer eines Items" ermittelt werden) liegt außerhalb dieser Datei in den jeweiligen Aufrufern (Inspo-Tabs) und wurde in dieser Runde nicht bis auf Zeilenebene zurückverfolgt.
- **Aggregation "X Likes"/"X mal inspiriert"**: `getInspiredCountBatch`/`getInspiredCount` (`lib/interaction-credits.ts:121-150`) zählen Zeilen in `interaction_credits` gefiltert nach `actor_user_id`, `owner_user_id`, `credit_type`. Aggregation selbst ist korrekt und effizient (eine Batch-Query statt N Einzelqueries).
- **Historische Rekonstruierbarkeit**: `interaction_credits` ist ein Append-Ledger (kein Überschreiben außer beim expliziten `clearLikeCredits` bei Dislike/Entfernen) – grundsätzlich historisch nachvollziehbar, solange keine Zeilen gelöscht werden. Kein Zeitstempel-Feld wurde in den gelesenen Ausschnitten geprüft (nicht abschließend verifiziert).
- **RLS/unterschiedliche User-IDs**: **nicht verifizierbar aus dem TypeScript-Code** – RLS-Policies liegen serverseitig in Supabase, es gibt keine lokalen Migrationsdateien. Muss über das Supabase-Dashboard geprüft werden (harte Grenze dieses Audits).
- **Doppelte/veraltete Datenmodelle**: `item_interactions` vs. `interaction_credits` sind laut Kommentar bewusst getrennt (kein Duplikat). `dont_watch` wirkt wie ein Auslaufmodell aus einer früheren Architekturphase – Schreibpfad nicht mit Sicherheit lokalisiert (Unsicherheit).

---

## 8. Performanceprüfung (nur lesbare Messungen/Code-Analyse – keine Lasttests durchgeführt)

**Ausdrücklich nicht messbar in diesem Audit**: tatsächliche Netzwerklatenzen, echte Ladezeiten im Browser, TMDB-/Google-Places-API-Antwortzeiten unter Realbedingungen – es wurde kein Server gestartet und keine Browser-Messung durchgeführt (rein statische Code-Analyse, wie vom Nutzer verlangt: "nur bestehende, read-only Messungen").

**API-Aufrufe pro Karte/Batch** (`app/api/quick-swipe/route.ts`, `lib/quick-swipe.ts`):
- Eine Deck-Ladung liefert **10 Karten pro Request** (`PAGE_SIZE = 10`), nicht pro Karte einzeln – das ist grundsätzlich effizient.
- Innerhalb **eines** `/api/quick-swipe`-Requests laufen serverseitig jedoch **5 weitgehend sequentielle Phasen** (`high_quality` → `topical` → `home_city` → `long_tail` → `exploration`, `lib/quick-swipe.ts:396-511`), von denen jede selbst wieder 1-3 externe HTTP-Calls (TMDB `discover`, Google Places `searchPlaces`) parallel per `Promise.all` ausführt, aber **nicht phasenübergreifend parallelisiert** ist. In Summe potenziell 8-12 externe API-Calls pro Deck-Ladung, sequenziell in 5 Blöcken statt komplett parallel – das ist der wahrscheinlichste Hauptfaktor für eine spürbare initiale Ladezeit des Decks.
- Zusätzlich vorab: `getTasteContext` (Genre-/Regionsermittlung) sowie `getExcludedMovieKeys`/`getExcludedPlaceIds` (je min. eine Supabase-Query) – laufen vor den 5 Phasen.
- **Pro Bewertungsaktion** (Like/Dislike einer Karte, `quick-swipe-deck.tsx:91-119`): mind. 2 sequentielle Await-Stufen – (1) `likeAndSaveCandidate`/`dislikeCandidate` (2 parallele Supabase-Writes + 1 Notification-Write beim Like), dann (2) `Promise.all([recordSwipeCardAction, recordQuickSwipeEvent])` (2 weitere Writes) – **erst danach** `dismissCurrent()`, welches die nächste Karte zeigt. D. h. die nächste Karte erscheint messbar erst nach Abschluss von mindestens 2 sequenziellen Netzwerk-Rundläufen zur Datenbank, nicht optimistisch sofort.
- **Kein Prefetching der nächsten Karte während der Bewertungsaktion sichtbar** – `dismissCurrent()` schneidet nur clientseitig das lokale `units[0]` ab; ein Nachladen (`loadMore`) passiert erst, wenn `units.length < REFILL_THRESHOLD (3)` unterschritten wird (`quick-swipe-deck.tsx:82-85`), reaktiv über einen `useEffect`, nicht spekulativ im Voraus während der Wartezeit auf die Bewertungs-Writes.
- **Re-Renders**: `QuickSwipeDeck` ist eine `"use client"`-Komponente mit mehreren `useState`; jede Bewertung löst `setPending(true)` → Writes → `dismissCurrent()` (State-Update) → `setPending(false)` aus – mindestens 2-3 React-Re-Renders der gesamten Deck-Komponente pro Bewertung. Keine Anzeichen von `memo`/`useMemo`-Optimierung an der Karte selbst, aber auch keine offensichtlich teure Berechnung im Render-Pfad (kein tiefes Re-Fetching bei jedem Render).
- **Server- vs. Client-Components/Caching**: `/api/quick-swipe` ist eine reine API-Route ohne erkennbares Response-Caching (`cacheComponents: true` in `next.config.ts` betrifft React-Server-Component-Rendering, nicht automatisch diese externen Fetches) – jeder externe TMDB/Places-Call in `lib/quick-swipe.ts` nutzt `fetch()` ohne sichtbare `next: { revalidate: … }`-Option, läuft also vermutlich unrevalidiert/uncached pro Request (nicht abschließend verifizierbar ohne Live-Netzwerkinspektion).
- **Bildladezeiten**: nicht messbar (kein Browser-Lauf); strukturell nutzt `list-item-row.tsx`/`quick-swipe-card.tsx` `next/image` mit externen `remotePatterns`, was Next.js' eigenes Bild-Resizing/Caching greifen lässt – das ist der Next-Standardpfad, keine erkennbare Fehlkonfiguration.

**Zusammengefasste Performance-Einschätzung**: Die spürbare "Langsamkeit" beim Swipen lässt sich aus dem Code plausibel auf zwei Faktoren zurückführen: (1) die 5-stufige, teils sequentielle externe-API-Kaskade beim initialen/Refill-Laden von 10 Karten, und (2) das Fehlen einer optimistischen/vorausschauenden Nachlade-Strategie während der 2-stufigen Schreib-Sequenz pro Bewertung. Beides ist im Code eindeutig belegbar; die tatsächliche Millisekunden-Größenordnung wäre nur mit einer echten Browser-/Netzwerkmessung zu beziffern (nicht Teil dieses Audits).

---

## 9. Widersprüche zwischen Code und (vermutetem) Konzept

1. **Zwei unterschiedliche Post-Login-Ziele**: `app/page.tsx` leitet eingeloggte Nutzer nach `/fuer-dich` weiter; `lib/auth-redirect.ts`s `resolvePostAuthPath`/`resolveSignupRedirectPath` leiten nach erfolgreichem Login/Signup dagegen nach `/swipe` (→ Redirect-Stub → `/my-taste`). Zwei verschiedene kanonische Landing-Screens, abhängig vom Eintrittspfad – bemerkenswert, weil ein sehr aktueller Commit ("Folgeänderungen: Nav-Bug nach Login…") genau in diesem Bereich gearbeitet hat, aber die Diskrepanz zwischen Homepage- und Login-Formular-Redirect nicht auflöst.
2. **Terminologie-Drift "inspiriert" vs. "übernommen"** (siehe Abschnitt 5/6) – dieselbe fachliche Handlung, drei Wörter.
3. **Stale Kommentar in `app/page.tsx`**: "My Taste (/swipe) is still reachable from there", obwohl die Route tatsächlich nach `/fuer-dich` umleitet.
4. **Stale Kommentar in `components/orte/create-free-list-modal.tsx:1-20`**: verweist auf einen "normalen Ja/Merken-Flow", der so nicht mehr existiert (weder "Ja" als Button-Text noch Merken als Inline-Schnellaktion in Orte-Listenzeilen).
5. **Root-Layout-Branding**: `app/layout.tsx` `metadata.title` lautet weiterhin generisch "Next.js and Supabase Starter Kit" – nie auf "Toppi" umbenannt.

---

## 10. Duplikate / Altlasten / ungenutzte Logik

- **Redirect-Stubs** (funktionieren wie vorgesehen, kein Bug): `/inspo`, `/vorschlag`, `/search`, `/swipe` – alle reine `redirect()`-Seiten mit erklärendem Kommentar zur historischen Konsolidierung.
- **Story-Feature** (`STORY_FEATURE_ENABLED = false`): kompletter, funktionsfähiger Code-Pfad (Ring-Styles, `StoryViewer`, `story_events`/`story_views`-Tabellen, API-Route `story-updates`) liegt inaktiv im Repo.
- **Google-OAuth-Login** (`GOOGLE_LOGIN_ENABLED = false`): laut `lib/feature-flags.ts:1-5` vollständig implementiert, nur vor Abschluss der Provider-Konfiguration verborgen.
- **Test-Phase-Auto-Follow** (`TEST_PHASE_AUTO_FOLLOW_ALL_ENABLED = false`): bewusst abgeschaltet, um den Discovery-Score gegen einen echten, dünnen Social-Graph zu testen (kein Bug, dokumentierte Design-Entscheidung).
- **Battle-Modus** im Quick-Swipe (`BATTLE_MODE_ENABLED = false`, `lib/quick-swipe.ts:44`): Code für Zwei-Karten-Duell-Einheiten existiert vollständig (`battle-card.tsx`, `buildBattles`), ist aber deaktiviert, weil die bisherige Interaktion (ein Tap = sofortige Entscheidung ohne Detailansicht) als UX-Problem erkannt wurde; ein dokumentierter Anforderungskatalog für die Reaktivierung steht direkt im Code (Z. 38-42).
- **`import-modal.tsx` "Merken"-Chip**: einziger verbliebener Merken-Eintrittspunkt (Bulk-Import), während die granularere Inline-Variante in normalen Orte-Listenzeilen entfernt wurde – Konzept nicht vollständig verschwunden, nur reduziert.
- **`lib/topf.ts`/`components/topf/`**: die Logik lebt weiter (genutzt vom "Sonstiges"-Tab in `/hinzufuegen`), obwohl die eigenständige `/topf`-Route in einer früheren Runde entfernt wurde.

---

## 11. Risiken und offene Fragen (benötigen eine Entscheidung vor Implementierung)

1. **RLS-Policies sind aus dem Code nicht prüfbar.** Für jede tiefere Aussage zu Sichtbarkeit/Datentrennung zwischen Nutzern wird direkter Supabase-Dashboard-Zugriff benötigt.
2. **`/fuer-dich` vs. `/my-taste` als Post-Login-Ziel** – welches ist die gewollte kanonische Landing Page? Muss vor jedem Nav-Fix entschieden werden.
3. **Uneinheitliche "inspiriert"-Credit-Erzeugung** zwischen Quick-Swipe-Like-Pfad und Inspiration-Feed-Pfad – vor jeder Weiterarbeit an den Statistiken zu klären, ob das Absicht oder ein Lücken-Bug ist.
4. **Terminologie-Entscheidung "inspiriert" vs. "übernommen"** (und ggf. weitere Varianten) – auf einen Begriff vereinheitlichen oder bewusst kontextabhängig belassen?
5. **`dont_watch`-Tabelle**: Schreibpfad nicht abschließend lokalisiert – aktiv genutzt, halb-tot, oder komplett veraltet?
6. **`/login`- und `/lists`-Einträge im Proxy-Guard** (`lib/supabase/proxy.ts`) wirken wie tote Pfade – vor Bereinigung bestätigen, dass sie wirklich nirgends mehr referenziert werden.
7. **`public/logo.png`** ist bei jedem `git status` als "modified" markiert, über mehrere frühere Runden hinweg nie committet oder verworfen – Ursache unklar, sollte geklärt werden bevor sie versehentlich in einen Commit hineinrutscht.
8. **"Lohnt-sich"-Konzept** würde einen Umbau des bisher binären `interaction_type`-Enums (`like`/`dislike`) auf einen 3-Wege-Zustand bedeuten, der praktisch jede Aggregation (`interaction_credits`, `lib/exclusions.ts`, Profilstatistiken, Quick-Swipe-Ausschlüsse) berührt – Umfang vor Beginn realistisch einschätzen.
9. **Kein Test-Setup vorhanden** – jede zukünftige Änderung an den oben genannten Kernpfaden (Credits, Interactions, Quick-Swipe-Mix) hat aktuell keinerlei automatisierte Absicherung.

---

## 12. Empfohlene Implementierungsreihenfolge (nur Empfehlung, keine Ausführung)

1. Terminologie- und Landing-Page-Entscheidungen treffen (Punkte 2 und 4 oben) – kostenlos zu klären, blockiert aber sauberes Arbeiten an allem Weiteren.
2. Credit-Erzeugungslücke (Punkt 3) schließen oder bewusst dokumentieren, bevor an "X mal inspiriert" weitergebaut wird.
3. Performance-Kaskade im Quick-Swipe (Abschnitt 8) entschärfen: Phasen-Parallelisierung in `getQuickSwipeQueue` und optimistisches Vorabladen der nächsten Karte, bevor an neuen Swipe-Features gearbeitet wird – wirkt sich sofort auf die wahrgenommene Produktqualität aus.
4. Erst danach das "Lohnt-sich"-Konzept angehen (Punkt 8), da es das Datenmodell strukturell verändert und auf einem stabilen Credit-/Interaction-Fundament aufbauen sollte.
5. Tote/inaktive Pfade (`/login`, `/lists` Guards, `dont_watch`) klären und ggf. bereinigen, sobald die inhaltlichen Punkte stehen – niedrige Priorität, aber güntig zur Reduktion künftiger Verwirrung.

---

**Harte Rahmenbedingungen (wiederholt, gelten für die gesamte weitere Arbeit an dieser Aufgabe):**
Kein Commit. Kein Push zu GitHub. Kein Deploy zu Vercel. Keine Änderung an Supabase. Keine Änderung am Produktivsystem.
