import { describe, it, expect } from "vitest";
import { reconcileReviewState, detectAnswerChanges } from "./reconcile";
import type { Field, Topic, ReviewState } from "./types";

const now = new Date("2026-06-04T12:00:00.000Z");

function field(
  id: string,
  label: string,
  value: string | null,
  type: Field["type"] = "text",
): Field {
  return { id, label, type, value, tags: [], decks: [] };
}

function topic(fields: Field[]): Topic {
  return { id: "t1", owner: "u1", title: "France", fields };
}

function rs(fieldId: string, id: string): ReviewState {
  return {
    id,
    owner: "u1",
    topic: "t1",
    fieldId,
    interval: 6,
    ease: 2.5,
    reps: 3,
    lapses: 0,
    due: now.toISOString(),
    lastReviewed: now.toISOString(),
  };
}

describe("reconcileReviewState", () => {
  it("keeps state for unchanged active Fields", () => {
    const t = topic([field("f1", "capital", "Paris")]);
    const plan = reconcileReviewState(t, [rs("f1", "a")], now);
    expect(plan.toCreate).toEqual([]);
    expect(plan.toDeleteIds).toEqual([]);
    expect(plan.keptFieldIds).toEqual(["f1"]);
  });

  it("creates due-now state for a newly active Field", () => {
    const t = topic([
      field("f1", "capital", "Paris"),
      field("f2", "currency", "euro"),
    ]);
    const plan = reconcileReviewState(t, [rs("f1", "a")], now);
    expect(plan.toCreate.map((c) => c.fieldId)).toEqual(["f2"]);
    expect(plan.toCreate[0].state.due).toBe(now.toISOString());
  });

  it("deletes state when a Field is removed from the Topic", () => {
    const t = topic([field("f1", "capital", "Paris")]);
    const plan = reconcileReviewState(t, [rs("f1", "a"), rs("f2", "b")], now);
    expect(plan.toDeleteIds).toEqual(["b"]);
  });

  it("keeps state DORMANT when a Field is emptied (not deleted)", () => {
    const t = topic([field("f1", "capital", null)]); // present but empty
    const plan = reconcileReviewState(t, [rs("f1", "a")], now);
    expect(plan.toDeleteIds).toEqual([]); // not deleted — still present
    expect(plan.toCreate).toEqual([]); // not active — no new
    expect(plan.keptFieldIds).toEqual(["f1"]); // dormant, kept
  });

  it("renaming a label keeps state (identity is the id)", () => {
    const t = topic([field("f1", "capital city", "Paris")]); // label changed
    const plan = reconcileReviewState(t, [rs("f1", "a")], now);
    expect(plan.toCreate).toEqual([]);
    expect(plan.toDeleteIds).toEqual([]);
    expect(plan.keptFieldIds).toEqual(["f1"]);
  });
});

describe("detectAnswerChanges", () => {
  const existing = [rs("f1", "a"), rs("f2", "b")];

  it("flags a value change on a Field with history", () => {
    const prev = [field("f1", "capital", "Paris")];
    const next = [field("f1", "capital", "Lyon")];
    expect(detectAnswerChanges(prev, next, existing)).toEqual(["f1"]);
  });

  it("flags a type change", () => {
    const prev = [field("f1", "flag", "old", "text")];
    const next = [field("f1", "flag", "media1", "image")];
    expect(detectAnswerChanges(prev, next, existing)).toEqual(["f1"]);
  });

  it("does NOT flag a label-only rename", () => {
    const prev = [field("f1", "capital", "Paris")];
    const next = [field("f1", "capital city", "Paris")];
    expect(detectAnswerChanges(prev, next, existing)).toEqual([]);
  });

  it("does NOT flag empty↔filled (handled by dormant/create)", () => {
    const prev = [field("f1", "capital", null)];
    const next = [field("f1", "capital", "Paris")];
    expect(detectAnswerChanges(prev, next, existing)).toEqual([]);
  });

  it("ignores Fields with no prior history", () => {
    const prev = [field("f9", "x", "a")];
    const next = [field("f9", "x", "b")];
    expect(detectAnswerChanges(prev, next, existing)).toEqual([]);
  });
});
