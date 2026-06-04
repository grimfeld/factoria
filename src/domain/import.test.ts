import { describe, it, expect } from "vitest";
import { planImportFacts, summarizePlan } from "./import";
import type { Topic } from "./types";

function topic(id: string, title: string, fieldLabels: string[] = []): Topic {
  return {
    id,
    owner: "u1",
    title,
    fields: fieldLabels.map((label, i) => ({
      id: `${id}-f${i}`,
      label,
      type: "text",
      value: "x",
      tags: [],
      decks: [],
    })),
  };
}

const existing = [
  topic("t1", "France", ["capital"]),
  topic("t2", "Germany", ["capital"]),
];

describe("planImportFacts", () => {
  it("extends an existing Topic that lacks the Field", () => {
    const plan = planImportFacts(
      {
        label: "currency",
        type: "text",
        mode: "create-missing",
        rows: [{ title: "France", value: "euro" }],
      },
      existing,
    );
    expect(plan.extend).toHaveLength(1);
    expect(plan.extend[0].topicId).toBe("t1");
    expect(plan.extend[0].field.label).toBe("currency");
    expect(plan.extend[0].field.value).toBe("euro");
    expect(plan.create).toEqual([]);
  });

  it("creates a Topic for an unmatched row in create-missing mode", () => {
    const plan = planImportFacts(
      {
        label: "currency",
        type: "text",
        mode: "create-missing",
        rows: [{ title: "Atlantis", value: "drachma" }],
      },
      existing,
    );
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0].title).toBe("Atlantis");
    expect(plan.create[0].field.value).toBe("drachma");
  });

  it("skips an unmatched row in extend-only mode", () => {
    const plan = planImportFacts(
      {
        label: "currency",
        type: "text",
        mode: "extend-only",
        rows: [{ title: "Atlantis", value: "drachma" }],
      },
      existing,
    );
    expect(plan.create).toEqual([]);
    expect(plan.skip).toEqual([
      { kind: "skip", title: "Atlantis", reason: "no-match-extend-only" },
    ]);
  });

  it("skips (never overwrites) a Topic that already has the Field", () => {
    const plan = planImportFacts(
      {
        label: "capital",
        type: "text",
        mode: "create-missing",
        rows: [{ title: "France", value: "Lyon" }],
      },
      existing,
    );
    expect(plan.extend).toEqual([]);
    expect(plan.skip[0]).toMatchObject({
      title: "France",
      reason: "already-has-field",
    });
  });

  it("matches by trimmed Title", () => {
    const plan = planImportFacts(
      {
        label: "currency",
        type: "text",
        mode: "create-missing",
        rows: [{ title: "  France  ", value: "euro" }],
      },
      existing,
    );
    expect(plan.extend[0]?.topicId).toBe("t1");
  });

  it("de-dups repeated titles within one import", () => {
    const plan = planImportFacts(
      {
        label: "currency",
        type: "text",
        mode: "create-missing",
        rows: [
          { title: "Spain", value: "euro" },
          { title: "Spain", value: "peseta" },
        ],
      },
      existing,
    );
    expect(plan.create).toHaveLength(1);
    expect(plan.skip).toContainEqual({
      kind: "skip",
      title: "Spain",
      reason: "duplicate-row",
    });
  });

  it("ignores empty titles and values", () => {
    const plan = planImportFacts(
      {
        label: "currency",
        type: "text",
        mode: "create-missing",
        rows: [
          { title: "", value: "x" },
          { title: "Spain", value: "  " },
        ],
      },
      existing,
    );
    expect(plan.create).toEqual([]);
    expect(plan.extend).toEqual([]);
  });

  it("applies tags and deckIds to every imported Field", () => {
    const plan = planImportFacts(
      {
        label: "capital",
        type: "text",
        mode: "create-missing",
        tags: ["capital"],
        deckIds: ["deck1"],
        rows: [
          { title: "France", value: "Paris" }, // extend t1? France has capital already
          { title: "Spain", value: "Madrid" }, // create
        ],
      },
      [topic("t1", "Norway")], // no France/Spain -> both create
    );
    const fields = [
      ...plan.create.map((c) => c.field),
      ...plan.extend.map((x) => x.field),
    ];
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.every((f) => f.tags.includes("capital"))).toBe(true);
    expect(fields.every((f) => f.decks.includes("deck1"))).toBe(true);
  });

  it("defaults to empty tags/decks when not provided", () => {
    const plan = planImportFacts(
      {
        label: "capital",
        type: "text",
        mode: "create-missing",
        rows: [{ title: "Spain", value: "Madrid" }],
      },
      existing,
    );
    expect(plan.create[0].field.tags).toEqual([]);
    expect(plan.create[0].field.decks).toEqual([]);
  });

  it("summarizes a plan", () => {
    const plan = planImportFacts(
      {
        label: "currency",
        type: "text",
        mode: "create-missing",
        rows: [
          { title: "France", value: "euro" },
          { title: "Atlantis", value: "drachma" },
          { title: "Germany", value: "euro" },
        ],
      },
      existing,
    );
    expect(summarizePlan(plan)).toBe("create 1, extend 2, skip 0");
  });
});
