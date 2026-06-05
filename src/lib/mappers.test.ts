import { describe, it, expect } from "vitest";
import type { RecordModel } from "pocketbase";
import { toTopic } from "./mappers";

function row(fields: unknown): RecordModel {
  return { id: "t1", owner: "u1", title: "France", fields } as unknown as RecordModel;
}

describe("toTopic field normalization", () => {
  it("keeps well-formed fields intact", () => {
    const t = toTopic(
      row([
        { id: "f1", label: "capital", type: "text", value: "Paris", tags: ["geo"], decks: ["d1"] },
      ]),
    );
    expect(t.fields[0]).toEqual({
      id: "f1",
      label: "capital",
      type: "text",
      value: "Paris",
      tags: ["geo"],
      decks: ["d1"],
    });
  });

  it("defaults missing tags/decks arrays (pre-ADR-0008 / external writes)", () => {
    // The topics.fields JSON column is schemaless: a stored Field may lack
    // `tags`/`decks`. They must come back as arrays so study Tag resolution and
    // listAllTags can iterate them without crashing.
    const t = toTopic(row([{ id: "fL", label: "fact", type: "text", value: "v" }]));
    expect(t.fields[0].tags).toEqual([]);
    expect(t.fields[0].decks).toEqual([]);
    // a normalized field is safe to study by tag
    expect(t.fields[0].tags.includes("anything")).toBe(false);
  });

  it("defaults a non-array fields column to empty", () => {
    expect(toTopic(row(undefined)).fields).toEqual([]);
    expect(toTopic(row(null)).fields).toEqual([]);
  });
});
