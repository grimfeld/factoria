import { deriveQuestions } from "./questions";
import { buildMcqChoices, pickMode } from "./modes";
import { isDue } from "./scheduler";
import type { StudyMode, Topic, ReviewState, Question } from "./types";

export const DEFAULT_NEW_PER_DAY = 20;

/** A Question paired with its Review state (or null if never studied = New). */
export interface ScheduledQuestion {
  question: Question;
  reviewState: ReviewState | null;
}

/**
 * A queue item ready to drill (ADR-0011): a {@link ScheduledQuestion} plus the
 * presentation {@link StudyMode} chosen for this review and, for `mcq`, the
 * shuffled options. The mode rotates with the Question's review count; `choices`
 * is non-null only when `mode === "mcq"`.
 */
export interface StudyTask extends ScheduledQuestion {
  mode: StudyMode;
  choices: string[] | null;
}

/**
 * Attach the per-review presentation mode (and MCQ choices) to a scheduled
 * Question. `pool` is every Question in the session — the source of sibling
 * distractors. The rotation seed is the Question's review count; cram has no
 * Review state, so callers pass a positional seed to keep modes varied there.
 *
 * If `mcq` is picked but choices can't be built (too few distractors), the task
 * falls back to `recall` — never a broken MCQ.
 */
export function toStudyTask(
  sq: ScheduledQuestion,
  pool: Question[],
  seed: number,
): StudyTask {
  const mode = pickMode(sq.question, pool, seed);
  if (mode !== "mcq") return { ...sq, mode, choices: null };
  const choices = buildMcqChoices(sq.question, pool, seed);
  return choices
    ? { ...sq, mode, choices }
    : { ...sq, mode: "recall", choices: null };
}

/**
 * Build the ordered queue for a study session from a pool of Questions
 * (CONTEXT.md → Study session). Serves **Due** Questions first, then up to
 * `newCap` **New** Questions (never studied). Cram ignores this — see
 * {@link buildCramQueue}.
 *
 * The pool is supplied as Questions (already resolved from a Deck / Tag / All
 * entry point — ADR-0008), plus all Review-state rows keyed by Field id.
 */
export function buildSessionQueue(
  questions: Question[],
  reviewStates: ReviewState[],
  now: Date,
  newCap: number = DEFAULT_NEW_PER_DAY,
): StudyTask[] {
  const rsByField = new Map(reviewStates.map((rs) => [rs.fieldId, rs]));

  const due: ScheduledQuestion[] = [];
  const fresh: ScheduledQuestion[] = [];

  for (const question of questions) {
    const rs = rsByField.get(question.fieldId) ?? null;
    if (rs === null) {
      fresh.push({ question, reviewState: null });
    } else if (isDue(rs, now)) {
      due.push({ question, reviewState: rs });
    }
  }

  due.sort(
    (a, b) =>
      new Date(a.reviewState!.due).getTime() -
      new Date(b.reviewState!.due).getTime(),
  );

  const queue = [...due, ...fresh.slice(0, Math.max(0, newCap))];
  // Mode rotates with each Question's own review count; New Questions (reps 0)
  // start at `recall`. The whole queue is the distractor pool.
  return queue.map((sq) =>
    toStudyTask(sq, questions, sq.reviewState?.reps ?? 0),
  );
}

/**
 * Cram queue: every Question in the pool, ignoring the schedule. Ratings during
 * cram do not change Review state (CONTEXT.md → Study session). Cram has no
 * Review state to seed mode rotation, so position in the queue is used instead
 * — varying the modes across a cram run without touching the schedule.
 */
export function buildCramQueue(questions: Question[]): StudyTask[] {
  return questions.map((question, i) =>
    toStudyTask({ question, reviewState: null }, questions, i),
  );
}

/** Count Due and New Questions in a pool — for entry-point badges. */
export function poolCounts(
  questions: Question[],
  reviewStates: ReviewState[],
  now: Date,
): { due: number; fresh: number } {
  const rsByField = new Map(reviewStates.map((rs) => [rs.fieldId, rs]));
  let due = 0;
  let fresh = 0;
  for (const q of questions) {
    const rs = rsByField.get(q.fieldId) ?? null;
    if (rs === null) fresh++;
    else if (isDue(rs, now)) due++;
  }
  return { due, fresh };
}

/** Flatten a pool of Topics into all their Questions (the "All" entry point). */
export function questionsOf(topics: Topic[]): Question[] {
  return topics.flatMap(deriveQuestions);
}
