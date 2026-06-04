# Factoria — PocketBase backend

Self-hosted PocketBase is the single source of truth (ADR-0002). Schema is
defined as code in `pb_migrations/` and applied automatically on first run.

## Run locally

1. Download the PocketBase binary for your OS from
   <https://pocketbase.io/docs/> and place it in this directory
   (`pocketbase/pocketbase.exe` on Windows). It is gitignored.

2. Start it pointing at this directory's migrations and hooks:

   ```powershell
   $env:OPENAI_API_KEY = "sk-..."   # only needed for the AI agent (ADR-0010)
   ./pocketbase.exe serve --dir ./pb_data --migrationsDir ./pb_migrations --hooksDir ./pb_hooks
   ```

   The `1717459200_init_schema.js` migration runs on first boot, creating all
   collections (`topics`, `review_state`, `decks`, `templates`, `media`) and
   closing public signup. The `pb_hooks/agent.pb.js` hook registers the AI-agent
   proxy route (below).

3. Open the admin UI at <http://127.0.0.1:8090/_/> and create the first admin,
   then create your single user account (signup is closed by design — users are
   admin-created).

4. Point the client at it via `VITE_POCKETBASE_URL` in the repo-root `.env`
   (defaults to `http://127.0.0.1:8090`).

## AI agent proxy (ADR-0010)

`pb_hooks/agent.pb.js` exposes `POST /api/factoria/agent`, an auth-guarded proxy
that forwards an OpenAI Chat Completions request to OpenAI using the server-side
`OPENAI_API_KEY`. The key never reaches the client. Optional `OPENAI_MODEL`
(default `gpt-4o`) overrides the model. Without the env var, the route returns
500 and the agent UI stays disabled — the rest of the app is unaffected.

## Schema notes

- Every collection is owner-scoped: rules require
  `@request.auth.id != '' && owner = @request.auth.id` (ADR-0002).
- `topics.title` is the plain-text name and prompt context for every Question
  (ADR-0005), **unique per owner** via `idx_topic_title_unique` (ADR-0009). `topics.fields` is an ordered JSON array of typed Fields:
  `{ id, label, type, value, tags[], decks[] }` where `type` is
  `text|image|audio`, `value` is a Markdown string (text) or a `media` id
  (image/audio) or `null` for empty, and tags/decks live per Field
  (ADR-0006/0007/0008).
- Field `id`s are app-level UUIDs inside the JSON, **not** PocketBase record
  ids. `review_state.fieldId` and `decks.fields` reference them as plain
  strings; there is no FK, so membership cleanup on delete is done in app code.
- `review_state` is keyed `(owner, fieldId)` via a unique index (ADR-0006) and
  lives in its own collection so practice writes don't collide with authoring
  writes (ADR-0004).
- `media` holds uploaded images **and** audio; Field values of type image/audio
  reference a media row by id (ADR-0007).
