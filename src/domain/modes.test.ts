import { describe, it, expect } from "vitest";
import {
  autoGradeToGrade,
  buildMcqChoices,
  checkAnswer,
  eligibleModes,
  normalize,
  pickMode,
} from "./modes";
import type { Question } from "./types";

function q(
  fieldId: string,
  label: string,
  answer: string,
  type: Question["type"] = "text",
): Question {
  return { topicId: "t1", fieldId, title: "T", fieldLabel: label, type, answer };
}

/** A pool of "capital" siblings so MCQ has distractors. */
const capitals = [
  q("f1", "capital", "Paris"),
  q("f2", "capital", "Berlin"),
  q("f3", "capital", "Madrid"),
  q("f4", "capital", "Rome"),
];

describe("eligibleModes", () => {
  it("text Field with enough siblings → all three modes", () => {
    expect(eligibleModes(capitals[0], capitals)).toEqual([
      "recall",
      "mcq",
      "text-input",
    ]);
  });

  it("text Field with too few siblings → no mcq", () => {
    const pool = [q("f1", "capital", "Paris"), q("f2", "capital", "Berlin")];
    // only one distractor (Berlin) < MIN_DISTRACTORS(2)
    expect(eligibleModes(pool[0], pool)).toEqual(["recall", "text-input"]);
  });

  it("image Field → recall only", () => {
    const img = q("f9", "flag", "media123", "image");
    expect(eligibleModes(img, [img, ...capitals])).toEqual(["recall"]);
  });

  it("ignores siblings with a different label", () => {
    const pool = [
      q("f1", "capital", "Paris"),
      q("f2", "currency", "Euro"),
      q("f3", "currency", "Dollar"),
    ];
    expect(eligibleModes(pool[0], pool)).toEqual(["recall", "text-input"]);
  });

  it("ignores duplicate-answer siblings", () => {
    const pool = [
      q("f1", "capital", "Paris"),
      q("f2", "capital", "Paris"),
      q("f3", "capital", "Berlin"),
    ];
    // distinct distractors: just Berlin → < 2 → no mcq
    expect(eligibleModes(pool[0], pool)).toEqual(["recall", "text-input"]);
  });
});

describe("pickMode", () => {
  it("New Question (reps 0) starts at recall", () => {
    expect(pickMode(capitals[0], capitals, 0)).toBe("recall");
  });

  it("rotates deterministically through eligible modes", () => {
    const seen = [0, 1, 2, 3].map((r) => pickMode(capitals[0], capitals, r));
    expect(seen).toEqual(["recall", "mcq", "text-input", "recall"]);
  });

  it("rotation only spans eligible modes when mcq unavailable", () => {
    const pool = [q("f1", "capital", "Paris"), q("f2", "capital", "Berlin")];
    const seen = [0, 1, 2].map((r) => pickMode(pool[0], pool, r));
    expect(seen).toEqual(["recall", "text-input", "recall"]);
  });

  it("is stable regardless of negative/fractional reps", () => {
    expect(pickMode(capitals[0], capitals, -5)).toBe("recall");
    expect(pickMode(capitals[0], capitals, 1.9)).toBe("mcq");
  });
});

describe("buildMcqChoices", () => {
  it("includes the correct answer plus distractors, capped at 4", () => {
    const choices = buildMcqChoices(capitals[0], capitals, 1);
    expect(choices).not.toBeNull();
    expect(choices!.length).toBe(4);
    expect(choices).toContain("Paris");
    // every option is a real sibling answer
    expect(new Set(choices)).toEqual(new Set(["Paris", "Berlin", "Madrid", "Rome"]));
  });

  it("returns null when too few distractors", () => {
    const pool = [q("f1", "capital", "Paris"), q("f2", "capital", "Berlin")];
    expect(buildMcqChoices(pool[0], pool, 0)).toBeNull();
  });

  it("is deterministic for a given seed", () => {
    expect(buildMcqChoices(capitals[0], capitals, 2)).toEqual(
      buildMcqChoices(capitals[0], capitals, 2),
    );
  });

  it("places the correct answer in different slots across seeds", () => {
    const slots = [0, 1, 2, 3].map((s) =>
      buildMcqChoices(capitals[0], capitals, s)!.indexOf("Paris"),
    );
    expect(new Set(slots).size).toBeGreaterThan(1);
  });
});

describe("normalize / checkAnswer", () => {
  it("forgives case, whitespace, and surrounding punctuation", () => {
    expect(normalize("  Paris. ")).toBe("paris");
    expect(normalize("THE  euro")).toBe("the euro");
  });

  it("strips markdown emphasis", () => {
    expect(normalize("**Paris**")).toBe("paris");
  });

  it("checkAnswer is correct on a normalized match", () => {
    expect(checkAnswer(q("f1", "capital", "Paris"), "paris")).toBe("correct");
    expect(checkAnswer(q("f1", "capital", "Paris"), " PARIS! ")).toBe("correct");
  });

  it("checkAnswer is wrong on a spelling miss (no fuzzy matching)", () => {
    expect(checkAnswer(q("f1", "capital", "Paris"), "Pari")).toBe("wrong");
  });
});

describe("autoGradeToGrade", () => {
  it("maps correct→good and wrong→again", () => {
    expect(autoGradeToGrade("correct")).toBe("good");
    expect(autoGradeToGrade("wrong")).toBe("again");
  });
});
