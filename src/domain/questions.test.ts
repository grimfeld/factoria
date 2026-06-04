import { describe, it, expect } from "vitest";
import { deriveQuestions, activeFieldIds, isActiveField } from "./questions";
import type { Field, Topic } from "./types";

function field(id: string, label: string, value: string | null): Field {
  return { id, label, type: "text", value, tags: [], decks: [] };
}

const france: Topic = {
  id: "t1",
  owner: "u1",
  title: "France",
  fields: [
    field("f1", "capital", "Paris"),
    field("f2", "currency", "euro"),
    field("f3", "population", "67M"),
  ],
};

describe("deriveQuestions", () => {
  it("derives one Question per non-empty Field, keyed by field id", () => {
    const qs = deriveQuestions(france);
    expect(qs.map((q) => q.fieldId)).toEqual(["f1", "f2", "f3"]);
    expect(qs.map((q) => q.fieldLabel)).toEqual([
      "capital",
      "currency",
      "population",
    ]);
  });

  it("uses the Title as prompt, never as an answer", () => {
    const qs = deriveQuestions(france);
    expect(qs.every((q) => q.title === "France")).toBe(true);
  });

  it("carries type and value through as the answer", () => {
    const t: Topic = {
      ...france,
      fields: [{ id: "f1", label: "flag", type: "image", value: "media123", tags: [], decks: [] }],
    };
    const [q] = deriveQuestions(t);
    expect(q.type).toBe("image");
    expect(q.answer).toBe("media123");
  });

  it("skips empty Fields (null or empty string)", () => {
    const t: Topic = {
      ...france,
      fields: [
        field("f1", "capital", "Paris"),
        field("f2", "anthem", null),
        field("f3", "motto", ""),
      ],
    };
    expect(activeFieldIds(t)).toEqual(["f1"]);
  });

  it("isActiveField reflects emptiness", () => {
    expect(isActiveField(field("f1", "a", "x"))).toBe(true);
    expect(isActiveField(field("f1", "a", null))).toBe(false);
    expect(isActiveField(field("f1", "a", ""))).toBe(false);
  });
});
