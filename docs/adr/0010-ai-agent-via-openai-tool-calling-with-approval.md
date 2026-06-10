# In-app AI agent via OpenAI tool-calling, behind an approval gate and a backend proxy

Factoria gains an in-app chat agent that can read, query, and (with explicit
user approval) modify library data — its headline job being bulk content entry
("import all the world capitals"). The agent is powered by the OpenAI API
(Chat Completions + function calling). It never writes the database directly:
it emits structured tool calls that run through the existing domain/repo layer,
and every mutating batch is shown as a preview the user must approve before it
commits. The OpenAI key lives on the PocketBase backend, never on the client.

## Context

Bulk import is painful to model deterministically because content is rich and
typed (Topics with stably-identified, typed Fields carrying tags and deck
membership). An LLM is well suited to the *generative* and *query* halves
("give me the 50 US state birds", "show topics with no currency field"), but
free-form LLM writes would bypass the invariants that earlier decisions
established: stable Field ids and review-state reconciliation (ADR-0006), typed
values (ADR-0007), per-Field tags/decks and deck-membership sync (ADR-0008),
unique Titles (ADR-0009), and the value-change "reset history?" prompt. LLMs
also hallucinate, and in a *recall* app a confidently wrong answer that gets
drilled is worse than no answer.

## Decision

### Writes go through the domain layer, never raw

The agent's only writing power is a fixed set of **tools** that wrap the same
repo functions the editor calls (`createTopics`, `addFieldToTopics`,
`updateField`, `setTags`, `setDecks`, and a dedicated `importFacts`). Because
the writes flow through that layer, reconciliation, id generation, dormant
handling, deck sync, and Title-uniqueness are enforced by code — the model
cannot produce an invalid write.

### `importFacts` is additive-only

`importFacts({ label, rows, mode })` is the bulk primitive. For each
`{ title, value }` row it matches an existing Topic by **exact Title** (now
deterministic — ADR-0009): a match extends that Topic with the new Field; no
match creates a Topic when `mode` is `create-missing` (the default) or is
skipped when `mode` is `extend-only`. A Topic that already has the Field is
**skipped, never overwritten**. Nothing destructive happens in a bulk import;
changing an existing answer is a separate explicit `updateField` (which carries
the ADR-0006 reset prompt).

### Approval gate

Every mutating tool call (or batch) is materialised as a **preview** — "create
198 Topics, extend 12, skip 3" — that the user reviews and approves before it
executes. Reads (`searchTopics`, `getTopic`) run without a gate. The preview is
where both correctness and hallucination control live: a wrong "Australia →
Sydney" is caught by eye before it ever becomes a drilled Question.

### OpenAI mechanism

**Chat Completions with function calling.** The model returns tool calls; our
code executes the read tools immediately, queues the write tools into a preview,
and loops the results back. Chosen over the Assistants and Responses APIs for
its stability, minimal hidden state, and because interposing the approval gate
is straightforward when we own the loop.

### Key handling — backend proxy

The OpenAI API key is held **server-side on the self-hosted PocketBase backend**
as an environment variable. The client calls a PocketBase custom route
(`/api/factoria/agent`) which forwards the conversation to OpenAI and relays the
response. The key never ships to the client. This is consistent with ADR-0002
(PocketBase is the single source of truth and the trusted server) and keeps the
app multi-user-safe: no per-device secret to leak.

## Considered options

- **Free-form DB writes by the agent** — most flexible, but discards every
  invariant and safety prompt; rejected.
- **Read-only agent + deterministic importer** — safe, but loses the generative
  bulk-entry that motivated the feature; kept as a possible fallback, not chosen.
- **Client-held or Tauri-Rust-held OpenAI key** — simpler wiring, but exposes a
  shared key on each device (or forces every user to own an OpenAI account);
  rejected in favour of the backend proxy.
- **Assistants / Responses API** — more managed, but more lock-in and a harder
  approval-gate interposition than plain function calling; rejected.

## Consequences

- A new PocketBase route proxies OpenAI; the deployment now needs an
  `OPENAI_API_KEY` env var and a model choice. Calls cost money per use.
- A tool registry must mirror the repo layer; each tool is a thin, validated
  wrapper, so the agent inherits all domain invariants for free.
- The chat UI needs a preview/diff/approve surface for pending writes — the
  central new piece of UX. Until approved, no write occurs.
- Hallucination risk is mitigated, not eliminated; the preview is the human
  gate. Generated *answers* should be reviewable before drilling.
- Offline/headless contexts (cron, no network) cannot use the agent; authoring
  by hand and the existing flows remain fully functional without it.

## Follow-up: persisted conversations and an explicit plan

Two refinements once the agent shipped:

- **Conversations persist.** The Assistant page kept history only in React
  state, so navigating away lost it. An owner-scoped `conversations` collection
  (migration `1717545600_agent_conversations.js`) now stores the full
  `ChatMessage[]` history and the selected import mode after every turn, behind
  the same `@request.auth.id = owner` rule as all content (ADR-0002). The page
  lists past conversations, **reopens** one to continue it, or **restarts** its
  opening request in a fresh conversation. Un-approved pending writes are *not*
  stored — they are a live, un-committed proposal tied to a turn, not durable
  content; reopening starts with a clean approval surface.
- **The plan is explicit.** Each pending write is rendered as a numbered,
  plain-language step ("Create deck “Capitals”", "Add a “capital” field across
  Topics — create 198 new Topic(s)") above the approval gate, and the loop emits
  live activity ("Searching Topics…", "Planning import…") instead of a bare
  spinner. This sits on top of the existing gate; the approval preview remains
  the authoritative diff.
