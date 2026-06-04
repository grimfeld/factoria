# Fields are first-class with a stable id; Review state keys by Field id

A Field gains a stable, generated **id** that survives label renames, value
edits, and Type changes. A Field's identity is its id, not its `(Topic, label)`
pair. Review state, Tags, and Deck membership all key by Field id. This
supersedes ADR-0004's "identity is the label" rule.

## Context

ADR-0004 keyed a Question's Review state by `(Topic, Field-label)`, so renaming
a Field silently dropped its review history. Once Tags and Deck membership moved
onto the Field (ADR-0008), a label-keyed identity meant a rename would also
silently lose a Field's tags and deck memberships — surprising and lossy. A
stable id lets a Field be renamed, retagged, and re-decked freely while keeping
its history and memberships.

## Decision

- Each Field has a generated **id**, assigned at creation, immutable thereafter.
- **Review state keys by Field id**, not by label.
- **Renaming a label is cosmetic** — keeps Review state, Tags, Deck membership.
- **Changing the value or the Type prompts the user** to optionally reset that
  one Field's Review state (default: keep). This replaces ADR-0004's automatic
  reset-on-rename with an explicit, value-driven, user-confirmed reset.
- **Emptying a value** hides the Question but keeps the Field id and its Review
  state / Tags / Decks **dormant**; refilling resumes the same Question.
- **Deleting a Field** removes its Question, Review state, Tags, and Deck
  memberships, with no prompt.

## Consequences

- The persisted Field shape carries an `id`. Review-state rows reference
  `fieldId` instead of `(topic, fieldLabel)`; the unique index becomes
  `(owner, fieldId)`.
- Reconciliation on save is now id-driven: new ids → create due-now state;
  ids whose value went empty → keep dormant; ids removed from the Topic →
  delete. A value/Type change on an existing id is surfaced to the UI, which
  asks whether to reset.
- Supersedes the identity and reset rules of ADR-0004; ADR-0004's other
  decision (Review state is a separate collection) stands.
