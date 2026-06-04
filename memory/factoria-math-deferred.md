---
name: factoria-math-deferred
description: Factoria TipTap editor ships without LaTeX math despite the spec listing it
metadata:
  type: project
---

Factoria's CONTEXT.md lists math (LaTeX) as a supported Fact-value content type,
but the initial scaffold ships the TipTap editor *without* it (text, image,
table, code only — `src/components/editor/extensions.ts`).

**Why:** the available `tiptap-math@1.0.0` package was unverified/risky and
would have jeopardised a clean first build. Deferring kept the build green.

**How to apply:** when adding math, only the editor extension list changes —
the PocketBase schema and TipTap-JSON persistence (ADR-0003) are unaffected, so
existing Fact values stay valid. `katex`/`tiptap-math` were removed from
package.json; re-add the chosen math extension when wiring it in.
