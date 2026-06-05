import type { RecordModel } from "pocketbase";
import type {
  Deck,
  Field,
  Topic,
  ReviewState,
  Template,
  TemplateField,
} from "@/domain/types";

/**
 * Translate PocketBase rows into domain entities. PB returns json fields
 * already parsed; we narrow them to domain shapes and default missing arrays.
 */

/**
 * Normalize one Field out of the topics.fields JSON. The JSON column is
 * schemaless, so a stored Field may predate ADR-0008 (when `tags`/`decks` moved
 * onto Fields) or come from an external/agent write that omitted them — leaving
 * `tags`/`decks` `undefined`. Downstream code (study Tag resolution,
 * `listAllTags`, the editor) iterates those arrays directly, so guarantee they
 * are always present here at the boundary rather than crashing later.
 */
function toField(raw: unknown): Field {
  const f = (raw ?? {}) as Partial<Field>;
  return {
    id: f.id ?? "",
    label: f.label ?? "",
    type: f.type ?? "text",
    value: f.value ?? null,
    tags: Array.isArray(f.tags) ? f.tags : [],
    decks: Array.isArray(f.decks) ? f.decks : [],
  };
}

export function toTopic(row: RecordModel): Topic {
  return {
    id: row.id,
    owner: row.owner,
    title: row.title,
    fields: Array.isArray(row.fields) ? row.fields.map(toField) : [],
  };
}

export function toReviewState(row: RecordModel): ReviewState {
  return {
    id: row.id,
    owner: row.owner,
    topic: row.topic,
    fieldId: row.fieldId,
    interval: row.interval ?? 0,
    ease: row.ease ?? 2.5,
    reps: row.reps ?? 0,
    lapses: row.lapses ?? 0,
    due: row.due,
    lastReviewed: row.lastReviewed || null,
  };
}

export function toTemplate(row: RecordModel): Template {
  return {
    id: row.id,
    owner: row.owner,
    name: row.name,
    fields: Array.isArray(row.fields) ? (row.fields as TemplateField[]) : [],
  };
}

export function toDeck(row: RecordModel): Deck {
  return {
    id: row.id,
    owner: row.owner,
    name: row.name,
    fields: Array.isArray(row.fields) ? row.fields : [],
  };
}
