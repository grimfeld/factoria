import type {
  AutoGrade,
  Grade,
  Question,
  StudyMode,
} from "./types";

/**
 * Study-mode selection and auto-grading (ADR-0011, CONTEXT.md → Study mode).
 *
 * A Question's content (the Field value) never changes, but *how* it is drilled
 * rotates per review: `recall` (self-graded), `mcq`, or `text-input` (both
 * auto-graded). This module is pure — it decides the mode, builds MCQ choices
 * from the session pool, and checks typed/picked answers. No persistence, no
 * randomness: rotation and choice order are seeded by the review count so the
 * same Question is reproducible (and unit-testable).
 *
 * `image`/`audio` Fields are always `recall`: their value is a Media id, not
 * something the user can type or that reads as a plausible MCQ option.
 */

/** Modes in rotation order. Index 0 (`recall`) is what a New Question gets. */
const ROTATION: readonly StudyMode[] = ["recall", "mcq", "text-input"];

/** MCQ needs the correct answer plus this many distractors to be offered. */
const MIN_DISTRACTORS = 2;

/** Total options shown for an MCQ (1 correct + up to 3 distractors). */
const MAX_CHOICES = 4;

/**
 * A sibling answer usable as an MCQ distractor: a *different* Question for the
 * same Field label whose answer differs from the correct one.
 */
function distractorPool(question: Question, pool: Question[]): string[] {
  const seen = new Set<string>([normalize(question.answer)]);
  const out: string[] = [];
  for (const q of pool) {
    if (q.fieldId === question.fieldId) continue;
    if (q.type !== "text") continue;
    if (q.fieldLabel !== question.fieldLabel) continue;
    const key = normalize(q.answer);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(q.answer);
  }
  // Stable order so seeding is reproducible regardless of pool order.
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * The modes this Question may be drilled in, given the session pool. Always
 * includes `recall`. Adds `mcq`/`text-input` only for `text` Fields, and `mcq`
 * only when enough sibling distractors exist (else MCQ can't be built — falls
 * back to the rest).
 */
export function eligibleModes(
  question: Question,
  pool: Question[],
): StudyMode[] {
  if (question.type !== "text") return ["recall"];
  const modes: StudyMode[] = ["recall"];
  if (distractorPool(question, pool).length >= MIN_DISTRACTORS) {
    modes.push("mcq");
  }
  modes.push("text-input");
  return modes;
}

/**
 * Pick the mode for this review. Deterministic rotation seeded by `reps` (the
 * Question's completed-review count): `reps` 0 → first eligible mode (`recall`
 * for a New Question), then cycles. Keeping `recall` first means a freshly
 * added Field is always introduced by plain recall before harder modes appear.
 */
export function pickMode(
  question: Question,
  pool: Question[],
  reps: number,
): StudyMode {
  const eligible = eligibleModes(question, pool);
  // Preserve ROTATION order among the eligible modes.
  const ordered = ROTATION.filter((m) => eligible.includes(m));
  const seed = Math.max(0, Math.trunc(reps));
  return ordered[seed % ordered.length];
}

/**
 * Build the MCQ options: the correct answer plus up to three distractors drawn
 * from sibling Questions sharing the Field label. Order is seeded by `reps` so
 * the correct answer isn't always in the same slot, yet stays reproducible.
 * Returns `null` when too few distractors exist (caller should fall back).
 */
export function buildMcqChoices(
  question: Question,
  pool: Question[],
  reps: number,
): string[] | null {
  const distractors = distractorPool(question, pool);
  if (distractors.length < MIN_DISTRACTORS) return null;

  const seed = Math.max(0, Math.trunc(reps));
  // Rotate the stable distractor list by the seed, then take the first few.
  const rotated = distractors.map(
    (_, i) => distractors[(i + seed) % distractors.length],
  );
  const chosen = rotated.slice(0, MAX_CHOICES - 1);

  const options = [question.answer, ...chosen];
  // Deterministic placement of the correct answer: rotate by seed.
  const k = seed % options.length;
  return [...options.slice(k), ...options.slice(0, k)];
}

/**
 * Normalize an answer for comparison: strip Markdown emphasis, lowercase,
 * collapse internal whitespace, and trim surrounding whitespace/punctuation.
 * Intentionally forgiving on case/spacing/trailing punctuation, but not on
 * spelling — there is no fuzzy/edit-distance matching (ADR-0011).
 */
export function normalize(value: string): string {
  return value
    .replace(/[*_`~]/g, "") // markdown emphasis/code marks
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s.,;:!?'"()-]+|[\s.,;:!?'"()-]+$/g, "");
}

/** Auto-grade a typed or picked answer against the Question's value. */
export function checkAnswer(question: Question, input: string): AutoGrade {
  return normalize(input) === normalize(question.answer) ? "correct" : "wrong";
}

/**
 * Map an auto-grade to a scheduler {@link Grade} (ADR-0011): a correct answer
 * counts as `good`, a wrong one as `again`. The richer Hard/Easy distinctions
 * stay exclusive to self-graded `recall`.
 */
export function autoGradeToGrade(auto: AutoGrade): Grade {
  return auto === "correct" ? "good" : "again";
}
