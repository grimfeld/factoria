# Self-hosted PocketBase with multi-user auth from day one

Although Factoria is a personal recall tool, we use a self-hosted remote
PocketBase instance as the single source of truth and build it multi-user from
the start: closed signup, every collection owner-scoped, data fully siloed per
user, no sharing in v1. This is what makes cross-device sync (desktop authoring
↔ mobile practice) work without a local-first data layer, and "building it
properly" was an explicit goal.

## Considered Options

- **Local-first, single-user, SQLite-in-app** — no server to host, no auth, but
  no real cross-device sync.
- **No-auth, network-locked PocketBase** (VPN/Tailscale) — no login friction,
  but fragile on cellular and risky if misconfigured.
- **Self-hosted PocketBase, multi-user, closed signup** (chosen).

## Consequences

- We host and maintain the PocketBase instance; clients require network access
  (no offline mode in v1 — see ADR-0004's sibling decision on sync).
- Every collection (Records, Decks, Tags, Templates, Review-state) carries an
  `owner` field and is locked by `@request.auth.id = owner`, even while usage is
  effectively single-user.
- Sharing between users is deliberately out of scope for v1.
