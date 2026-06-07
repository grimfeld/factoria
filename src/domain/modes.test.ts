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

/** Stub Rand returning a fixed value (for deterministic index picks). */
const always = (v: number) => () => v;
/** Stub Rand yielding successive values, then repeating the last. */
const seq = (vals: number[]) => {
  let i = 0;
  return () => vals[Math.min(i++, vals.length - 1)];
};

describe("pickMode", () => {
  it("picks the eligible mode at the rand-chosen index", () => {
    // eligible = [recall, mcq, text-input]; randInt = floor(rand*3)
    expect(pickMode(capitals[0], capitals, always(0))).toBe("recall");
    expect(pickMode(capitals[0], capitals, always(0.5))).toBe("mcq");
    expect(pickMode(capitals[0], capitals, always(0.9))).toBe("text-input");
  });

  it("only ever returns an eligible mode (mcq excluded when unavailable)", () => {
    const pool = [q("f1", "capital", "Paris"), q("f2", "capital", "Berlin")];
    // eligible = [recall, text-input]; index 1 → text-input, never mcq
    expect(pickMode(pool[0], pool, always(0.9))).toBe("text-input");
    expect(pickMode(pool[0], pool, always(0))).toBe("recall");
  });

  it("image Field is always recall regardless of rand", () => {
    const img = q("f9", "flag", "media123", "image");
    expect(pickMode(img, [img, ...capitals], always(0.99))).toBe("recall");
  });

  it("is observed to span all eligible modes over many rolls", () => {
    let n = 0;
    const rand = () => [0, 0.5, 0.9][n++ % 3];
    const seen = new Set(
      Array.from({ length: 9 }, () => pickMode(capitals[0], capitals, rand)),
    );
    expect(seen).toEqual(new Set(["recall", "mcq", "text-input"]));
  });
});

describe("buildMcqChoices", () => {
  it("includes the correct answer plus distractors, capped at 4", () => {
    const choices = buildMcqChoices(capitals[0], capitals, Math.random);
    expect(choices).not.toBeNull();
    expect(choices!.length).toBe(4);
    expect(choices).toContain("Paris");
    // every option is a real sibling answer (pool has exactly 4)
    expect(new Set(choices)).toEqual(
      new Set(["Paris", "Berlin", "Madrid", "Rome"]),
    );
  });

  it("samples a random subset when more distractors than slots exist", () => {
    const big = [
      q("f1", "capital", "Paris"),
      q("f2", "capital", "Berlin"),
      q("f3", "capital", "Madrid"),
      q("f4", "capital", "Rome"),
      q("f5", "capital", "Vienna"),
      q("f6", "capital", "Lisbon"),
    ];
    const choices = buildMcqChoices(big[0], big, seq([0.1, 0.7, 0.3, 0.9]))!;
    expect(choices.length).toBe(4);
    expect(choices).toContain("Paris");
    // distinct options only
    expect(new Set(choices).size).toBe(4);
  });

  it("returns null when too few distractors", () => {
    const pool = [q("f1", "capital", "Paris"), q("f2", "capital", "Berlin")];
    expect(buildMcqChoices(pool[0], pool, Math.random)).toBeNull();
  });

  it("places the correct answer in different slots across rolls", () => {
    const slots = new Set(
      Array.from({ length: 20 }, () =>
        buildMcqChoices(capitals[0], capitals, Math.random)!.indexOf("Paris"),
      ),
    );
    expect(slots.size).toBeGreaterThan(1);
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
