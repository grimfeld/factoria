import { describe, it, expect } from "vitest";
import {
  applyGrade,
  newReviewState,
  isDue,
  MIN_EASE,
  DEFAULT_EASE,
} from "./scheduler";

const now = new Date("2026-06-04T12:00:00.000Z");

describe("newReviewState", () => {
  it("is due immediately at now", () => {
    const s = newReviewState(now);
    expect(s.due).toBe(now.toISOString());
    expect(s.reps).toBe(0);
    expect(s.ease).toBe(DEFAULT_EASE);
  });
});

describe("applyGrade", () => {
  it("'again' lapses: resets reps, drops ease, relearn step minutes out", () => {
    const s = applyGrade(newReviewState(now), "again", now);
    expect(s.reps).toBe(0);
    expect(s.lapses).toBe(1);
    expect(s.ease).toBeCloseTo(DEFAULT_EASE - 0.2);
    expect(new Date(s.due).getTime()).toBeGreaterThan(now.getTime());
    // under a day
    expect(new Date(s.due).getTime() - now.getTime()).toBeLessThan(86400000);
  });

  it("ease never drops below the floor", () => {
    let s = newReviewState(now);
    for (let i = 0; i < 20; i++) s = applyGrade(s, "again", now);
    expect(s.ease).toBeGreaterThanOrEqual(MIN_EASE);
  });

  it("'good' walks the 1 -> 6 -> interval*ease ladder", () => {
    let s = applyGrade(newReviewState(now), "good", now); // rep1
    expect(s.interval).toBe(1);
    s = applyGrade(s, "good", now); // rep2
    expect(s.interval).toBe(6);
    s = applyGrade(s, "good", now); // rep3 = round(6 * ease)
    expect(s.interval).toBe(Math.round(6 * DEFAULT_EASE));
  });

  it("'easy' grows faster than 'good' and bumps ease", () => {
    const good = applyGrade(newReviewState(now), "good", now);
    const easy = applyGrade(newReviewState(now), "easy", now);
    expect(easy.interval).toBeGreaterThanOrEqual(good.interval);
    expect(easy.ease).toBeGreaterThan(DEFAULT_EASE);
  });

  it("'hard' lowers ease and grows slowly", () => {
    const s = applyGrade(newReviewState(now), "hard", now);
    expect(s.ease).toBeLessThan(DEFAULT_EASE);
    expect(s.interval).toBeGreaterThanOrEqual(1);
  });

  it("intervals are always at least 1 day for passing grades", () => {
    for (const g of ["hard", "good", "easy"] as const) {
      expect(applyGrade(newReviewState(now), g, now).interval).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("isDue", () => {
  it("is true at or after the due date", () => {
    expect(isDue({ due: now.toISOString() }, now)).toBe(true);
    const past = new Date(now.getTime() - 1000).toISOString();
    expect(isDue({ due: past }, now)).toBe(true);
  });
  it("is false before the due date", () => {
    const future = new Date(now.getTime() + 86400000).toISOString();
    expect(isDue({ due: future }, now)).toBe(false);
  });
});
