import { newFieldId } from "./ids";
import type { Field, FieldType, Topic } from "./types";

/**
 * Bulk-import planning (ADR-0010). `importFacts` adds one Field (named `label`)
 * across many Topics from `{ title, value }` rows. It is **additive-only**:
 *
 *   - exact-Title match (Titles are unique — ADR-0009) → EXTEND that Topic,
 *     unless it already has a Field with `label`, in which case SKIP.
 *   - no match → CREATE a new Topic (mode `create-missing`) or SKIP it
 *     (mode `extend-only`).
 *
 * Pure: produces a plan the caller previews and then commits through the repo
 * layer. Nothing here writes or overwrites.
 */

export type ImportMode = "create-missing" | "extend-only";

export interface ImportRow {
  title: string;
  value: string;
}

export interface ImportFactsInput {
  label: string;
  type: FieldType;
  rows: ImportRow[];
  mode: ImportMode;
  /** Tags applied to every imported Field (ADR-0008). Default none. */
  tags?: string[];
  /** Deck ids every imported Field joins (ADR-0008). Default none. */
  deckIds?: string[];
}

/** A Topic to be created, with its single imported Field. */
export interface CreateOp {
  kind: "create";
  title: string;
  field: Field;
}

/** An existing Topic to be extended with one new Field. */
export interface ExtendOp {
  kind: "extend";
  topicId: string;
  title: string;
  field: Field;
}

/** A row that produced no write, with the reason. */
export interface SkipOp {
  kind: "skip";
  title: string;
  reason: "already-has-field" | "no-match-extend-only" | "duplicate-row";
}

export interface ImportPlan {
  create: CreateOp[];
  extend: ExtendOp[];
  skip: SkipOp[];
}

function normalize(title: string): string {
  return title.trim();
}

function makeField(
  label: string,
  type: FieldType,
  value: string,
  tags: string[],
  decks: string[],
): Field {
  return { id: newFieldId(), label, type, value, tags: [...tags], decks: [...decks] };
}

export function planImportFacts(
  input: ImportFactsInput,
  existingTopics: Topic[],
): ImportPlan {
  const tags = input.tags ?? [];
  const decks = input.deckIds ?? [];
  const byTitle = new Map(
    existingTopics.map((t) => [normalize(t.title), t]),
  );
  const plan: ImportPlan = { create: [], extend: [], skip: [] };
  const seen = new Set<string>(); // de-dup rows within one import

  for (const row of input.rows) {
    const title = normalize(row.title);
    if (title === "" || row.value.trim() === "") continue;

    if (seen.has(title)) {
      plan.skip.push({ kind: "skip", title, reason: "duplicate-row" });
      continue;
    }
    seen.add(title);

    const existing = byTitle.get(title);
    if (existing) {
      const hasField = existing.fields.some((f) => f.label === input.label);
      if (hasField) {
        plan.skip.push({ kind: "skip", title, reason: "already-has-field" });
      } else {
        plan.extend.push({
          kind: "extend",
          topicId: existing.id,
          title,
          field: makeField(input.label, input.type, row.value, tags, decks),
        });
      }
    } else if (input.mode === "create-missing") {
      plan.create.push({
        kind: "create",
        title,
        field: makeField(input.label, input.type, row.value, tags, decks),
      });
    } else {
      plan.skip.push({ kind: "skip", title, reason: "no-match-extend-only" });
    }
  }

  return plan;
}

/** One-line human summary of a plan, for the approval preview. */
export function summarizePlan(plan: ImportPlan): string {
  return `create ${plan.create.length}, extend ${plan.extend.length}, skip ${plan.skip.length}`;
}
