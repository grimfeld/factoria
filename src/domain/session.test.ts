import { describe, it, expect } from "vitest";
import {
  buildSessionQueue,
  buildCramQueue,
  poolCounts,
  questionsOf,
} from "./session";
import type { Question, ReviewState, Topic } from "./types";

const now = new Date("2026-06-04T12:00:00.000Z");

function q(fieldId: string): Question {
  return {
    topicId: "t1",
    fieldId,
    title: "France",
    fieldLabel: fieldId,
    type: "text",
    answer: "x",
  };
}

function rs(fieldId: string, due: Date): ReviewState {
  return {
    id: `rs-${fieldId}`,
    owner: "u1",
    topic: "t1",
    fieldId,
    interval: 6,
    ease: 2.5,
    reps: 3,
    lapses: 0,
    due: due.toISOString(),
    lastReviewed: now.toISOString(),
  };
}

describe("buildSessionQueue", () => {
  it("serves Due before New", () => {
    const queue = buildSessionQueue(
      [q("f1"), q("f2")],
      [rs("f1", new Date(now.getTime() - 1000))],
      now,
    );
    expect(queue[0].question.fieldId).toBe("f1");
    expect(queue[0].reviewState).not.toBeNull();
    expect(queue[1].question.fieldId).toBe("f2");
    expect(queue[1].reviewState).toBeNull();
  });

  it("excludes not-yet-due questions", () => {
    const future = new Date(now.getTime() + 86400000);
    expect(buildSessionQueue([q("f1")], [rs("f1", future)], now)).toEqual([]);
  });

  it("caps New at newCap", () => {
    const qs = Array.from({ length: 30 }, (_, i) => q(`f${i}`));
    const queue = buildSessionQueue(qs, [], now, 20);
    expect(queue.length).toBe(20);
  });

  it("orders Due earliest-first", () => {
    const queue = buildSessionQueue(
      [q("f1"), q("f2")],
      [
        rs("f1", new Date(now.getTime() - 1000)),
        rs("f2", new Date(now.getTime() - 5000)),
      ],
      now,
    );
    expect(queue.map((x) => x.question.fieldId)).toEqual(["f2", "f1"]);
  });
});

describe("buildCramQueue", () => {
  it("includes every question, no review state", () => {
    const queue = buildCramQueue([q("f1"), q("f2")]);
    expect(queue.map((x) => x.question.fieldId)).toEqual(["f1", "f2"]);
    expect(queue.every((x) => x.reviewState === null)).toBe(true);
  });
});

describe("poolCounts", () => {
  it("counts due and fresh", () => {
    const counts = poolCounts(
      [q("f1"), q("f2"), q("f3")],
      [rs("f1", new Date(now.getTime() - 1000))],
      now,
    );
    expect(counts).toEqual({ due: 1, fresh: 2 });
  });
});

describe("questionsOf", () => {
  it("flattens topics to their questions", () => {
    const topic: Topic = {
      id: "t1",
      owner: "u1",
      title: "France",
      fields: [
        { id: "f1", label: "capital", type: "text", value: "Paris", tags: [], decks: [] },
        { id: "f2", label: "anthem", type: "text", value: null, tags: [], decks: [] },
      ],
    };
    expect(questionsOf([topic]).map((x) => x.fieldId)).toEqual(["f1"]);
  });
});
