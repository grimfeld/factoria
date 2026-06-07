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
 * varies per review: `recall` (self-graded), `mcq`, or `text-input` (both
 * auto-graded). The mode is chosen at random among the eligible ones, and MCQ
 * distractors are sampled (and the options shuffled) at random too.
 *
 * This module stays pure: randomness is *injected* as a {@link Rand}
 * (`Math.random`-shaped, a float in [0, 1)). Callers pass `Math.random` at
 * runtime; tests pass a stub for reproducible assertions.
 *
 * `image`/`audio` Fields are always `recall`: their value is a Media id, not
 * something the user can type or that reads as a plausible MCQ option.
 */

/** A `Math.random`-shaped source: returns a float in [0, 1). */
export type Rand = () => number;

/** MCQ needs the correct answer plus this many distractors to be offered. */
const MIN_DISTRACTORS = 2;

/** Total options shown for an MCQ (1 correct + up to 3 distractors). */
const MAX_CHOICES = 4;

/** Integer in [0, n). */
function randInt(rand: Rand, n: number): number {
  return Math.floor(rand() * n);
}

/** Fisher–Yates shuffle into a new array, driven by the injected `rand`. */
function shuffle<T>(items: readonly T[], rand: Rand): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rand, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

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
 * Pick the mode for this review at random among the eligible ones (uniform).
 * Every review independently re-rolls, so the same Field is drilled different
 * ways over time rather than cycling in a fixed order.
 */
export function pickMode(
  question: Question,
  pool: Question[],
  rand: Rand,
): StudyMode {
  const eligible = eligibleModes(question, pool);
  return eligible[randInt(rand, eligible.length)];
}

/**
 * Build the MCQ options: the correct answer plus up to three distractors
 * **sampled at random** from sibling Questions sharing the Field label, with the
 * whole set **shuffled** so the correct answer's slot varies too. Returns `null`
 * when too few distractors exist (caller should fall back).
 */
export function buildMcqChoices(
  question: Question,
  pool: Question[],
  rand: Rand,
): string[] | null {
  const distractors = distractorPool(question, pool);
  if (distractors.length < MIN_DISTRACTORS) return null;

  // Random subset of distractors, then shuffle the correct answer in among them.
  const chosen = shuffle(distractors, rand).slice(0, MAX_CHOICES - 1);
  return shuffle([question.answer, ...chosen], rand);
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
