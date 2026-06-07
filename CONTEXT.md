# Factoria — Context

A trivia flashcards app for practising recall of trivia factoids. Content is
entered manually. The unit of entry is a structured Topic; the unit of study
is a Question derived from each of its Fields.

## Glossary

### Topic

A multi-field entity entered once by the user, about one thing. Holds a plain-
text **Title** naming that thing, and one or more **Fields**. Example: a Topic
titled `France` with fields `capital = Paris`, `currency = euro`,
`population = 67M`.

A Topic is the unit of *entry*, not the unit of *study*.

_Avoid_: Record, Card, Entry.

### Title

The plain-text name of a Topic — the thing every Question about the Topic is
about (e.g. `France`). The Title is the prompt context for every Question
derived from the Topic. It is **required**, **unique per user** (ADR-0009), and
**never an answer** — generation is one-directional, the Title is always the
prompt, never the thing recalled.

Because a Title is unique, two genuinely different things that share a name are
disambiguated *in the Title itself* — `Mercury (planet)` and `Mercury (element)`
— rather than by allowing duplicates. Uniqueness makes the Title a natural key:
a bulk import can match a row to an existing Topic by Title and extend it.

The Title is plain text only: it cannot be an image, audio, or other typed
content (ADR-0005). Editing the Title (e.g. `France` → `French Republic`)
changes the wording of every Question's prompt but adds, removes, and resets
nothing — it never touches Review state.

_Avoid_: Subject, Name, Heading.

### Field

A first-class, identified piece of content within a Topic (ADR-0006). A Field
has a stable **id** that survives edits, a **label**, a **Type**, a **value**, a
set of **Tags**, and a set of **Deck** memberships. Each non-empty Field yields
one Question: "given the Title, recall this Field." Every Field is a fact to
recall — there is no special prompt field among them (the Title fills that role).

A Field's identity is its **id**, not its label (ADR-0006). Renaming the label
is cosmetic and keeps everything. What invalidates recall is changing the
**value** (the answer) or the **Type** — those prompt the user to optionally
reset that Field's Review state.

_Avoid_: Fact field, Subject field, Attribute, Property.

### Type

What kind of content a Field holds (ADR-0007). One of:

- **text** — a Markdown string (formatting via plain typed Markdown).
- **image** — a reference to an uploaded image in the Media collection.
- **audio** — a reference to an uploaded audio clip in the Media collection.

A Field is exactly one Type. The user picks the Type, then fills a single basic
input for it. Changing a Field's Type clears its value (storage differs) and is
treated as a value change for Review-state purposes.

_Avoid_: Kind, Format, Content type.

### Field value

The content held by a Field, interpreted according to its Type (ADR-0007): a
Markdown string for `text`, a Media file id for `image` and `audio`. Because a
value can be free text or media, it is not machine-checkable; recall is
self-graded (see Grading).

### Media

An uploaded file (image or audio) stored once and referenced by id from an
`image` or `audio` Field's value (ADR-0007). The reference is what the Field
holds; the file lives in the Media collection.

### Question

A single recall task derived from a Field: the Topic's **Title** plus the
Field's **label** as the prompt, the Field's **value** as the answer. For
example, Title `France` + Field label `capital` → recall `Paris`. This is the
unit of *study*. Questions are generated, never entered directly, and are
one-directional (the Title is never asked). One Question per non-empty Field.

### Template

A reusable Topic shape used to pre-fill a new Topic at creation time — a cookie
cutter, not a live link (ADR-0005, ADR-0008). A Template holds a name and an
ordered list of Field shapes, each carrying a **label**, a **Type**, default
**Tags**, and default **Deck** memberships. It carries no Title and no values.

When stamped, each Field is pre-filled with its label, Type, default Tags, and
added to its default Decks; default Decks that no longer exist are skipped
silently. Once a Topic is stamped from a Template it keeps no reference to it:
editing or deleting the Template never affects Topics already created, and
Topics are not grouped by Template. Templates shape *entry* only, never *study*.

### Tag

A free, flat label attached to a **Field** (ADR-0008). A Field may carry many
Tags; a Tag exists as soon as it is first used. Tags are cross-cutting and
ad-hoc (e.g. `europe`, `hard`, `2024`). A Tag can be studied directly: it
resolves to the set of Fields carrying it, and their Questions are drilled.

### Deck

A named, hand-picked collection of **Fields** — equivalently, of the Questions
those Fields yield — built deliberately by the user (ADR-0008). A Field is added
to a Deck explicitly, often from a Deck picker in the Field's editor. Decks are
static (no automatic or rule-based membership) and many-to-many (a Field may
belong to several Decks). Deleting a Field removes it from every Deck. A Deck is
a thing you sit down to study.

_Avoid_: collection-of-Topics (Decks hold Fields, not whole Topics).

### Grading

How a Question is scored. It depends on the **Study mode** (ADR-0011):

- **recall** — the user is shown the Title and Field label, recalls the answer
  from memory, then flips to reveal the Field value and rates their own recall on
  a 4-button scale: **Again / Hard / Good / Easy**. Self-graded.
- **mcq** / **text-input** — the answer is machine-checked and **auto-graded**:
  `correct → good`, `wrong → again`. The finer Hard/Easy ratings exist only in
  `recall`. Text input is matched leniently on case, whitespace, surrounding
  punctuation, and Markdown emphasis, but not on spelling — there is no fuzzy
  matching.

### Study mode

How a Question is presented and graded for a single review (ADR-0011), distinct
from the Field **Type** (what the content *is*). One of **recall**, **mcq**, or
**text-input**. The mode is chosen per review and **never stored** — it rotates
deterministically with the Question's review count, so a New Question is always
introduced by `recall`, then cycles through the eligible modes.

Only **text** Fields are eligible for `mcq`/`text-input`; **image**/**audio**
Fields are always `recall` (their value is a Media id, not checkable). **mcq**
distractors are sibling answers from the session pool — other Questions sharing
the same Field label — so a Deck or Tag session draws distractors only from that
pool. When too few distractors exist, that review falls back to another eligible
mode. (Cloze is not yet a mode — deferred in ADR-0011.)

### Study entry point

The ways to start a study session: a single **Topic** (its Questions), a
**Deck** (its Fields' Questions), a **Tag** (the Questions of all Fields
carrying it), or **All** (every Question in the library). Each resolves to a
pool of Questions to drill.

### Review state

The spaced-repetition memory of a single Question: its interval, ease, and due
date, updated by each 4-button rating (SM-2-lite scheduling). A Question is
identified for this purpose by its **Field id** (ADR-0006). Consequences:

- Renaming a Field's label keeps its Review state — the label is not the
  identity; renaming is cosmetic, like rewording the Title.
- Changing a Field's **value** or **Type** prompts the user to optionally reset
  that Field's Review state (default: keep). Only that one Field is affected.
- Deleting a Field deletes its Question, its Review state, its Tags, and its
  Deck memberships — no prompt; deletion is explicit intent.
- Adding a Field creates a new Question, due immediately.
- Emptying a Field's value hides its Question from study but keeps the Field id
  and its Review state, Tags, and Deck memberships **dormant**; refilling the
  value resumes the same Question with its history intact.
- Editing the **Title** keeps all of the Topic's Review state.

### Due

A Question is *due* when its Review-state due date has arrived. A spaced-
repetition study session serves the due Questions within the chosen Study entry
point's pool.

### New Question

A Question never yet studied (no Review state). New Questions are introduced into
sessions at a capped rate (default 20 per day) so the backlog stays manageable
and freshly added Fields still surface.

### Study session

One sitting of practice over a chosen Study entry point's pool. Serves the
**Due** Questions plus up to the daily cap of **New** Questions, Due first then
New. When nothing is Due in the pool, the user may **cram** — drill the pool
ignoring the schedule, which does not change Review state.
