# Study modes rotate per review, with auto-grading for MCQ and text input

A Question is drilled in one of three **study modes** — `recall`, `mcq`, or
`text-input` — chosen per review rather than fixed. `recall` keeps the existing
4-button self-grade; `mcq` and `text-input` are **auto-graded** (the answer is
machine-checked) and feed the scheduler directly. This supersedes the original
"recall only, always self-graded, no multiple choice / no typed-answer checking"
decision recorded in CONTEXT.md → Grading (under ADR-0007).

## Context

Questions were presented one way: show the Title + Field label, the user recalls
silently, reveals the value, and self-grades Again/Hard/Good/Easy. CONTEXT.md
explicitly excluded multiple choice and typed-answer checking because a Field
value is free text or media and therefore "not machine-checkable" in general.

Self-graded recall is honest but offers a single retrieval shape and leans on
the user to grade truthfully. Varying *how* a fact is retrieved (recognition vs.
production vs. free recall) strengthens memory, and for the common case — a short
`text` answer — the value *is* checkable against sibling answers and against what
the user types. We want those richer modes without storing anything new or
changing how Topics are entered.

## Decision

- A **study mode** is orthogonal to a Field's **Type** (ADR-0007). It is chosen
  per review and **never persisted** — like the session queue, it is derived.
- Modes: `recall` (self-graded, unchanged), `mcq`, `text-input` (both
  auto-graded). Only `text` Fields are eligible for `mcq`/`text-input`;
  `image`/`audio` Fields are always `recall` (their value is a Media id).
- **Mode selection** is **random**: each review independently picks uniformly
  among the eligible modes, so the same Field is drilled different ways over time
  rather than cycling in a fixed order. Randomness is *injected* as a
  `rand: () => number` so the selection functions stay pure and unit-testable
  (runtime passes `Math.random`; tests pass a stub).
- **MCQ distractors** are sibling answers from the **session pool** — other
  Questions sharing the same Field label. Because the pool is already scoped by
  the entry point, a Deck/Tag session draws distractors only from that Deck/Tag.
  Distractors are **sampled at random** (not the first few), and the options —
  including the correct answer — are **shuffled**. `mcq` is offered only when at
  least two distinct distractors exist; otherwise the review falls back to
  `recall`/`text-input`.
- **Auto-grading** maps to the scheduler: `correct → good`, `wrong → again`.
  The finer Hard/Easy gradations stay exclusive to `recall`. `text-input` is
  matched after normalization (case-, whitespace-, surrounding-punctuation-, and
  Markdown-emphasis-insensitive); there is **no** fuzzy / edit-distance matching,
  so a misspelling counts as wrong.

## Considered options

- **Author-set mode per Field** — predictable, but adds authoring burden and a
  schema change. Rejected in favour of zero-author-cost random selection.
- **Fixed rotation seeded by review count** — reproducible and recall-first for
  New Questions, but felt mechanical: the next mode was predictable and MCQ
  reused the same distractors every time. Rejected in favour of random selection
  and random distractor sampling.
- **Auto-check then still self-grade** — keeps the 4-button scale but adds
  friction and lets the user override the machine. Rejected: the point of the
  auto modes is lower-friction, trustworthy grading.
- **Fuzzy text-input matching** — fewer false "wrong"s, but silent
  over-acceptance and tuning cost. Rejected for now; normalization only.
- **Cloze deletion mode** — deferred. It needs deletion-marker syntax in the
  `text` value and an editor affordance; revisit once that is designed.

## Consequences

- No persistence or entry-model change: modes are computed in `domain/modes.ts`
  and attached to the queue as `StudyTask` (`domain/session.ts`).
- The scheduler (`domain/scheduler.ts`) and Review state are untouched — auto
  modes reuse the same `applyGrade` path via the `correct→good`/`wrong→again`
  mapping.
- CONTEXT.md → Grading no longer holds as written; see the **Study mode** entry.
- A Field with no same-label siblings (e.g. a unique attribute) simply never
  shows MCQ; it alternates randomly between `recall` and `text-input`.
