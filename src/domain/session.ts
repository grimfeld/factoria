import { deriveQuestions } from "./questions";
import { isDue } from "./scheduler";
import type { Topic, ReviewState, Question } from "./types";

export const DEFAULT_NEW_PER_DAY = 20;

/** A Question paired with its Review state (or null if never studied = New). */
export interface ScheduledQuestion {
  question: Question;
  reviewState: ReviewState | null;
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
): ScheduledQuestion[] {
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

  return [...due, ...fresh.slice(0, Math.max(0, newCap))];
}

/**
 * Cram queue: every Question in the pool, ignoring the schedule. Ratings during
 * cram do not change Review state (CONTEXT.md → Study session).
 */
export function buildCramQueue(questions: Question[]): ScheduledQuestion[] {
  return questions.map((question) => ({ question, reviewState: null }));
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
