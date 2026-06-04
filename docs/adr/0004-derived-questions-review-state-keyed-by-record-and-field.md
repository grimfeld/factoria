# Questions are derived; Review state is keyed by (Record, Fact-field label)

The unit of entry is a multi-field Record; the unit of study (a Question) is
*derived* from it — one Question per Fact field, "given the Subject, recall this
Fact", one-directional. Questions are not stored as first-class rows. Their
spaced-repetition Review state is persisted keyed by `(Record, Fact-field
label)` in a collection separate from Record content.

## Consequences

- **Identity is the label, not a stable id.** Renaming a Fact field is treated
  as a new Question and drops the old Review history. Deleting a field deletes
  its Question and Review state. Adding a field creates a new Question due
  immediately. Editing a Fact *value* keeps the Review state.
- **Review state is a separate collection** from Record content. This decouples
  practice writes (ratings) from authoring writes (content edits), so the two
  do not conflict under last-write-wins sync.
- Moving the Subject designation to a different field regenerates a Record's
  Questions and resets that Record's Review state.
