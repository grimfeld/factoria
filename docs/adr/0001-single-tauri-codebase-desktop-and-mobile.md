# Single Tauri codebase for both desktop and mobile

We build one Tauri v2 + React/TypeScript codebase and produce both a desktop
build and a mobile build from it, rather than a PWA or two separate apps. The
two platforms have full feature parity; only the UI adapts responsively to
encourage different usage (desktop nudges toward authoring Records, mobile
toward practising).

## Considered Options

- **PWA / responsive web app** — simplest deploy, no Tauri-mobile maturity risk,
  but weaker native feel and no shared native shell.
- **Two separate apps** (desktop authoring app + mobile practice app) — clean
  per-platform UX, but duplicated logic and divergent feature sets.
- **One Tauri codebase, two builds** (chosen) — single source of truth, shared
  domain/sync logic, adaptive layouts.

## Consequences

- We accept Tauri v2 mobile's relative immaturity as a risk.
- "Feature parity, UI-only divergence" is a standing constraint: no feature may
  be desktop-only or mobile-only — layout may differ, capability may not.
