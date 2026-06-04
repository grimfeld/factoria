import type { Field, Question, Topic } from "./types";

/**
 * Derive the Questions of a Topic (ADR-0005..0008). One Question per non-empty
 * Field — the prompt is the Topic Title plus the Field label, the answer is the
 * Field value (interpreted by type). Generation is one-directional: the Title is
 * always the prompt, never an answer. An empty Field yields no Question.
 */
export function deriveQuestions(topic: Topic): Question[] {
  return topic.fields
    .filter((f) => f.value !== null && f.value !== "")
    .map((f) => ({
      topicId: topic.id,
      fieldId: f.id,
      title: topic.title,
      fieldLabel: f.label,
      type: f.type,
      answer: f.value as string,
    }));
}

/** True when a Field currently yields a Question (non-empty value). */
export function isActiveField(field: Field): boolean {
  return field.value !== null && field.value !== "";
}

/** The ids of Fields that currently yield a Question. */
export function activeFieldIds(topic: Topic): string[] {
  return topic.fields.filter(isActiveField).map((f) => f.id);
}
