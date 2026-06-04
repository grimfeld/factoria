# Store Fact values as TipTap JSON, not Markdown

Fact values are rich-content blocks (text, images, tables, code, math) edited
in TipTap. We persist them as TipTap's native JSON document in PocketBase, with
images uploaded as PocketBase files referenced by id inside the JSON — rather
than serialising to Markdown. We chose fidelity and a seamless single editing
surface over portability, accepting editor lock-in because we control the app.

## Considered Options

- **Markdown string + image file refs** — portable and diffable, but lossy
  round-trips for complex nodes and extra serialise/parse work.
- **HTML string** — sanitisation burden, rejected.
- **TipTap JSON** (chosen) — exact fidelity, editor-native, opaque blob.

## Consequences

- Fact values are tied to the TipTap schema; a future Markdown export would be a
  separate feature.
- Images live in a PocketBase file collection and are referenced by id from
  within the Fact value JSON.
