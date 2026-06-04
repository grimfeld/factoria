# Topic Titles are unique per user

A Topic's Title must be unique within an owner's library. This reverses
ADR-0005's deliberate "Titles are not unique" decision. Two things that share a
name are disambiguated in the Title itself (`Mercury (planet)` vs
`Mercury (element)`), making the Title a natural key.

## Context

ADR-0005 allowed duplicate Titles, citing `Mercury` the planet and `Mercury` the
element as legitimately distinct Topics. That choice becomes a liability once we
want **bulk import that extends existing Topics** rather than duplicating them
(e.g. importing world capitals, then later importing currencies into the *same*
country Topics). With non-unique Titles, matching an import row to an existing
Topic by Title is ambiguous and needs per-row conflict resolution. Making Titles
unique turns the Title into a deterministic key and removes that whole class of
ambiguity.

## Decision

- A Title is **unique per owner**. No two of a user's Topics share a Title.
- Enforced on **create**, on **rename**, and on **import** (case-sensitive,
  trimmed). Create/rename that would collide is **rejected** with a clear error.
- An **import** row whose Title matches an existing Topic is not an error — it is
  the signal to **extend** that Topic (add the imported Field), which is the
  desired "extend, don't duplicate" behaviour.
- Same-named-but-different things are disambiguated **in the Title**
  (`Mercury (planet)`), not by a separate qualifier field. The Title remains the
  sole identity; no new model surface.

## Consequences

- **Supersedes ADR-0005's non-uniqueness clause.** ADR-0005's other decisions
  (plain-text Title; Title is prompt-only, never an answer; editing the Title
  resets no Review state) stand unchanged.
- A unique index `(owner, title)` is added to the `topics` collection; the
  domain/repo layer validates before write and surfaces collisions to the UI.
- `importFacts` (the planned AI-agent bulk tool) matches rows by exact Title
  with no conflict branch: one match → extend, no match → create.
- Existing duplicate Titles, if any, must be resolved before the unique index
  applies; the migration handles pre-release data by clearing it (consistent
  with prior migrations) or the user renames collisions.
