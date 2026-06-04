import type { RecordModel } from "pocketbase";
import type {
  Deck,
  Topic,
  ReviewState,
  Template,
  TemplateField,
} from "@/domain/types";

/**
 * Translate PocketBase rows into domain entities. PB returns json fields
 * already parsed; we narrow them to domain shapes and default missing arrays.
 */

export function toTopic(row: RecordModel): Topic {
  return {
    id: row.id,
    owner: row.owner,
    title: row.title,
    fields: Array.isArray(row.fields) ? row.fields : [],
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
