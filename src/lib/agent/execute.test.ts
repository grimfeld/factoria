import { describe, it, expect, vi, beforeEach } from "vitest";

// execute.ts reaches the database through the repo layer; mock it so we can
// drive the write-then-warn classification without a live PocketBase.
const createTopic = vi.fn();
const updateTopic = vi.fn();
const getTopic = vi.fn();

vi.mock("@/lib/repos/decks", () => ({
  createDeck: vi.fn(),
}));

vi.mock("@/lib/repos/topics", async () => {
  // Keep the real PostSaveWarning class so `instanceof` in execute.ts matches.
  const actual =
    await vi.importActual<typeof import("@/lib/repos/topics")>(
      "@/lib/repos/topics",
    );
  return {
    PostSaveWarning: actual.PostSaveWarning,
    createTopic: (...args: unknown[]) => createTopic(...args),
    updateTopic: (...args: unknown[]) => updateTopic(...args),
    getTopic: (...args: unknown[]) => getTopic(...args),
  };
});

import { executePendingWrites } from "./execute";
import { PostSaveWarning } from "@/lib/repos/topics";
import type { Topic } from "@/domain/types";
import type { PendingWrite } from "./types";

const topic: Topic = { id: "t1", owner: "u1", title: "France", fields: [] };

const createTopicWrite: PendingWrite = {
  kind: "createTopic",
  title: "France",
  fields: [],
};

beforeEach(() => {
  createTopic.mockReset();
  updateTopic.mockReset();
  getTopic.mockReset();
});

describe("executePendingWrites — write-then-warn", () => {
  it("counts a createTopic that only raised PostSaveWarning as created", async () => {
    // The DB row landed; only schedule/deck sync hiccuped.
    createTopic.mockRejectedValueOnce(
      new PostSaveWarning(topic, new Error("sync flaked")),
    );

    const r = await executePendingWrites([createTopicWrite]);

    // The regression: this used to report 0 created + 1 error.
    expect(r.created).toBe(1);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0].title).toBe("France");
  });

  it("counts a clean createTopic as created with no warnings", async () => {
    createTopic.mockResolvedValueOnce(topic);

    const r = await executePendingWrites([createTopicWrite]);

    expect(r.created).toBe(1);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("reports a real failure as an error, not created", async () => {
    createTopic.mockRejectedValueOnce(new Error("network down"));

    const r = await executePendingWrites([createTopicWrite]);

    expect(r.created).toBe(0);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].error).toBe("network down");
    expect(r.warnings).toEqual([]);
  });

  it("renames a Topic via a title-only update that preserves its fields", async () => {
    const withFields: Topic = {
      ...topic,
      fields: [
        {
          id: "f1",
          label: "capital",
          type: "text",
          value: "Paris",
          tags: [],
          decks: [],
        },
      ],
    };
    getTopic.mockResolvedValueOnce(withFields);
    updateTopic.mockResolvedValueOnce({ ...withFields, title: "French Republic" });

    const renameWrite: PendingWrite = {
      kind: "renameTopic",
      topicId: "t1",
      fromTitle: "France",
      toTitle: "French Republic",
    };
    const r = await executePendingWrites([renameWrite]);

    expect(r.extended).toBe(1);
    expect(r.errors).toEqual([]);
    // Title changes; fields are passed through untouched and no reset is asked.
    expect(updateTopic).toHaveBeenCalledWith("t1", {
      title: "French Republic",
      fields: withFields.fields,
    });
  });
});
