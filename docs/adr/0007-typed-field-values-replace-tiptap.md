# Typed Field values (text/image/audio) replace the TipTap rich editor

A Field has a **Type** — `text`, `image`, or `audio` — and a single basic input
per Type, instead of one rich-content TipTap surface. `text` is stored as a
Markdown string; `image` and `audio` are stored as references to files in a
Media collection. This supersedes ADR-0003 (TipTap JSON storage).

## Context

ADR-0003 stored every Field value as a TipTap JSON document and offered one
rich editor for all values. In use, the rich editor felt heavy and ambiguous —
there was no signal of *what kind* of answer a Field held. The preference is to
pick a content type up front and get a simple, type-appropriate input.

## Decision

- A Field declares one **Type**: `text`, `image`, or `audio`.
- **text** → a Markdown string (formatting via plain typed Markdown, rendered on
  the study/reveal side; no WYSIWYG editor).
- **image** / **audio** → a reference (file id) to an uploaded file in the
  **Media** collection.
- The editor shows a Type selector, then one basic input for the chosen Type.
- Changing a Field's Type **clears its value** (text string and file id are not
  interchangeable) and counts as a value change for Review state (ADR-0006).

## Considered options

- **Keep TipTap JSON (ADR-0003)** — richest single surface, but heavy UI and no
  per-Field type signal. Rejected.
- **Plain text only** — simplest, but loses all formatting and media. Rejected.
- **Typed values, text as Markdown, media by reference (chosen).**

## Consequences

- **Audio is now supported** — this reverses CONTEXT.md's earlier "No audio".
- Field values are no longer a single opaque blob; persistence is
  `{ type, value }` where `value` is a Markdown string or a Media file id.
- The former `images` file collection generalises to **Media** (images +
  audio). References live inside the Field value.
- Code/math/video are not types yet; the typed model makes adding a new Type
  (a new selector entry + input) straightforward later.
- Supersedes ADR-0003 in full. The Title remains plain text (ADR-0005).
