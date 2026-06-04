# Factoria

A trivia flashcards app for practising recall, built on spaced repetition. You
enter structured **Records** (a Subject field + Fact fields); the app derives a
**Question** per Fact field and drills the due ones (CONTEXT.md, `docs/adr/`).

One Tauri v2 + React/TypeScript codebase produces both desktop and mobile builds
with full feature parity — layout adapts (desktop nudges authoring, mobile nudges
practice) but capability does not (ADR-0001).

## Stack

- **Shell:** Tauri v2 (Rust) → `src-tauri/`
- **UI:** React 19 + TypeScript + Vite
- **Routing:** TanStack Router (file-based, `src/routes/`)
- **Server cache:** TanStack Query over the PocketBase SDK (`src/lib/hooks.ts`)
- **Ephemeral state:** Zustand (`src/stores/` — auth, study session)
- **Rich content:** TipTap, persisted as JSON (ADR-0003)
- **Backend:** self-hosted PocketBase, owner-scoped, closed signup (ADR-0002) →
  schema as code in `pocketbase/pb_migrations/`

## Layout

```
src/
  domain/      pure, framework-free core (no PB/React imports)
    types.ts       Record / Question / ReviewState / Template / Deck
    questions.ts   deriveQuestions: Record -> Question[] (ADR-0004)
    scheduler.ts   SM-2-lite (applyGrade, isDue)
    reconcile.ts   review-state plan on Record save (ADR-0004)
    session.ts     buildSessionQueue / buildCramQueue (Due then New, cap 20)
    *.test.ts      Vitest — the ADR-critical logic (25 tests)
  lib/         PocketBase client, mappers, repos/, query hooks, study pool
  stores/      Zustand: auth, session
  components/  AppShell, LoginScreen, RecordEditor, editor/ (TipTap)
  routes/      index (Library), record.new, record.$id, study, decks, tags
pocketbase/    schema-as-code + run instructions
```

The **domain layer is the spec made executable** — question derivation, the
scheduler, review-state reconciliation, and session-queue building are all pure
functions with tests, isolated from PocketBase and React.

## Develop

```powershell
pnpm install
pnpm dev          # web only, http://localhost:1420
pnpm tauri dev    # desktop shell
```

You need a running PocketBase instance — see `pocketbase/README.md`. Point the
client at it via `VITE_POCKETBASE_URL` in `.env` (copy from `.env.example`).

## Checks

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build                                   # tsc + vite
cargo check --manifest-path src-tauri/Cargo.toml
```

## Mobile

`pnpm tauri android init` / `ios init` scaffold the native targets from this same
codebase (ADR-0001). Not yet initialised.

## Known follow-ups

- **Math (LaTeX) in Fact values** is specced (CONTEXT.md → Fact value) but not
  yet wired into the TipTap editor — the schema and TipTap-JSON persistence are
  unaffected when it is added (`src/components/editor/extensions.ts`).
- The client bundle is a single ~900 kB chunk; code-split before shipping.
