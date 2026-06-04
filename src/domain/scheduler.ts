import type { Grade, ReviewState } from "./types";

/**
 * SM-2-lite spaced-repetition scheduler (CONTEXT.md → Review state).
 *
 * Pure function over the SRS fields of a ReviewState. Given a current state, a
 * 4-button grade, and the current time, returns the next SRS fields. Does not
 * touch identity/owner fields — callers spread the result onto the row.
 */

export const MIN_EASE = 1.3;
export const DEFAULT_EASE = 2.5;

/** SRS-only slice of a ReviewState — what the scheduler reads and writes. */
export type Schedulable = Pick<
  ReviewState,
  "interval" | "ease" | "reps" | "lapses" | "due" | "lastReviewed"
>;

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
}

/** Fresh state for a brand-new Question, due immediately at `now`. */
export function newReviewState(now: Date): Schedulable {
  return {
    interval: 0,
    ease: DEFAULT_EASE,
    reps: 0,
    lapses: 0,
    due: now.toISOString(),
    lastReviewed: null,
  };
}

/**
 * Apply a grade. SM-2-lite:
 *   - "again": lapse — reset reps, drop ease, short relearn step (10 min).
 *   - "hard":  small interval growth, ease nudged down.
 *   - "good":  standard SM-2 progression.
 *   - "easy":  faster progression with an ease bonus.
 */
export function applyGrade(
  state: Schedulable,
  grade: Grade,
  now: Date,
): Schedulable {
  const lastReviewed = now.toISOString();

  if (grade === "again") {
    return {
      interval: 0,
      ease: Math.max(MIN_EASE, state.ease - 0.2),
      reps: 0,
      lapses: state.lapses + 1,
      // relearn step: 10 minutes out
      due: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
      lastReviewed,
    };
  }

  const reps = state.reps + 1;
  let ease = state.ease;
  let interval: number;

  if (grade === "hard") {
    ease = Math.max(MIN_EASE, ease - 0.15);
    interval = reps === 1 ? 1 : Math.max(1, Math.round(state.interval * 1.2));
  } else if (grade === "good") {
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = 6;
    else interval = Math.round(state.interval * ease);
  } else {
    // easy
    ease = ease + 0.15;
    if (reps === 1) interval = 4;
    else interval = Math.round(state.interval * ease * 1.3);
  }

  interval = Math.max(1, interval);

  return {
    interval,
    ease,
    reps,
    lapses: state.lapses,
    due: addDays(now, interval).toISOString(),
    lastReviewed,
  };
}

/** True when the state's due date has arrived by `now` (CONTEXT.md → Due). */
export function isDue(state: Pick<ReviewState, "due">, now: Date): boolean {
  return new Date(state.due).getTime() <= now.getTime();
}
