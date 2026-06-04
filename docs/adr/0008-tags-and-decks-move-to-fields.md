# Tags and Deck membership move from Topics to Fields

Tags and Deck membership are properties of a **Field**, not of a Topic. A Tag
resolves to the set of Fields carrying it; a Deck holds a list of Field ids
(equivalently, the Questions those Fields yield). Templates carry default Tags
and Decks per Field. This supersedes the Topic-level Tag and Deck decisions in
the original model.

## Context

Tags and Decks were attached to whole Topics, so studying a Tag or Deck drilled
*all* of a Topic's Questions. The desire is finer control: tag and group
individual facts (a single `population` Field as `hard`, a specific Question into
an "exam" Deck) rather than entire Topics. With Fields now first-class and
stably identified (ADR-0006), they can own this metadata.

## Decision

- **Tags live on Fields.** A Field carries `tags[]`, edited in its row of the
  editor. Studying a Tag resolves to all Fields carrying it → their Questions.
  Topics have no tags of their own (the library does not display Topic tags).
- **Decks hold Field ids.** `deck.fields = [fieldId, ...]`. The Field editor has
  an optional, multi-select Deck picker that writes into the chosen Decks. The
  Deck owns the membership list. Studying a Deck drills its Fields' Questions.
- **Deleting a Field** removes it from every Deck and drops its Tags (ADR-0006).
- **Templates carry per-Field defaults.** Each Template entry is
  `{ label, type, tags[], decks[] }`. Stamping pre-fills label, Type, default
  Tags, and adds the Field to its default Decks; default Decks that no longer
  exist are skipped silently (Templates keep no live reference — ADR-0005).

## Consequences

- Membership and tagging are Field-grained: studying a Tag or Deck drills a
  precise set of Questions, not whole Topics.
- The `decks.topics` relation becomes `decks.fields` (a list of Field ids, since
  a Field is identified within its Topic by id — ADR-0006).
- Study-entry-point resolution changes from "pool of Topics → their Questions"
  to "pool of Questions directly" for Tag and Deck entry points.
- Templates grow from "name + Field labels" (ADR-0005) to "name + ordered
  `{label, type, tags, decks}`"; they still carry no Title and no values.
