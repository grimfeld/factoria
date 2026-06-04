import { pb, requireUserId } from "../pocketbase";
import { toTemplate } from "../mappers";
import { newFieldId } from "@/domain/ids";
import type { Field, Topic, Template, TemplateField } from "@/domain/types";

export async function listTemplates(): Promise<Template[]> {
  const rows = await pb.collection("templates").getFullList({ sort: "name" });
  return rows.map(toTemplate);
}

export async function createTemplate(input: {
  name: string;
  fields: TemplateField[];
}): Promise<Template> {
  const owner = requireUserId();
  return toTemplate(
    await pb.collection("templates").create({ owner, ...input }),
  );
}

export async function deleteTemplate(id: string): Promise<void> {
  await pb.collection("templates").delete(id);
}

/** Save an existing Topic's shape as a Template — labels, types, tags, decks. */
export function templateInputFromTopic(topic: Topic, name: string) {
  return {
    name,
    fields: topic.fields.map(
      (f): TemplateField => ({
        label: f.label,
        type: f.type,
        tags: [...f.tags],
        decks: [...f.decks],
      }),
    ),
  };
}

/**
 * Stamp blank Fields from a Template — fresh ids, empty values, default type/
 * tags/decks (ADR-0008). Default Decks that no longer exist are dropped by the
 * caller against the live deck list.
 */
export function blankFieldsFromTemplate(
  template: Template,
  liveDeckIds: Set<string>,
): Field[] {
  return template.fields.map((tf) => ({
    id: newFieldId(),
    label: tf.label,
    type: tf.type,
    value: null,
    tags: [...tf.tags],
    decks: tf.decks.filter((d) => liveDeckIds.has(d)),
  }));
}
