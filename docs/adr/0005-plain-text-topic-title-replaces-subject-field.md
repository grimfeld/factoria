# A plain-text Topic Title replaces the Subject field

A Topic carries a dedicated, required, plain-text **Title** (e.g. `France`) as
the prompt context for every Question, instead of designating one of its fields
as a rich-content **Subject**. Every other field is now simply a **Field** (a
label + rich value), and a Question is `Title + Field-label → Field-value`. This
renames the former *Record* to *Topic* and removes the Subject concept entirely.

## Context

The original model (ADR-0004) made the prompt context *one of the fields*,
flagged as the Subject, so the prompt could itself be rich content (an image, a
table) and could be moved to a different field. In practice the Subject read as
"just another row with a radio button", and the thing users think of as the
Topic's name (`France`) had no first-class place. Users expected a titled Topic
with facts hanging off it, and questions phrased as `Field-label + Title`.

## Decision

- **Title is a dedicated `text` field**, required, **not unique**, prompt-only,
  and **never an answer** (generation stays one-directional).
- **Every other field is a Field** — there is no Subject flag. Each non-empty
  Field yields one Question.
- **Review-state identity is `(Topic, Field label)`** — the rename/delete/add/
  value-edit/empty rules from ADR-0004 carry over verbatim with *Record →
  Topic* and *Fact field → Field*.
- **Editing the Title resets no Review state.** The Title is not part of a
  Question's identity and is never an answer, so rewording it (`France` →
  `French Republic`) only changes prompt wording. This *replaces* ADR-0004's
  rule that moving the Subject regenerates Questions and resets Review state —
  there is no Subject to move.
- **Templates** carry a name and an ordered list of Field labels only — no
  Subject designation, no Title, no values.

## Considered options

- **Surface the Subject field as a title (no schema change)** — keep ADR-0003's
  rich, movable Subject and just render it as a heading. Rejected: the user
  wants a real, plain-text title field and a clearer editor, and accepts losing
  rich prompts.
- **Rich-content (TipTap) title** — keep image/table-as-prompt but separate
  from fields. Rejected: a title you cannot render as a plain string in lists,
  cards, and deck pickers defeats the point of a dedicated title.
- **Plain-text dedicated Title (chosen).**

## Consequences

- **Image/table-as-prompt is dropped.** ADR-0003's "the Subject's value is a
  rich-content block so an image/table can serve as the prompt" no longer holds
  for the prompt context. "Show this flag → recall the country" must instead be
  modelled as a Field with an image value (an answer), not as the prompt. Field
  *values* remain rich TipTap JSON; only the prompt context is now plain text.
- **The movable-Subject capability is gone.** There is nothing to move.
- **Schema change:** the Topic gains a required `title` text field and drops
  `subjectLabel`; the persisted field array holds only Fields.
- This ADR **supersedes the Subject-related parts of ADR-0003 and ADR-0004**;
  their remaining decisions (TipTap-JSON storage for Field values; Review state
  as a separate collection keyed by record + label) stand unchanged.
