import type { Field, FieldType } from "@/domain/types";
import type { ImportPlan } from "@/domain/import";

/**
 * A write the agent has proposed but not committed (ADR-0010). The loop
 * accumulates these; the user approves them before the executor runs them
 * through the repo layer. Each variant maps to a repo operation.
 */
/**
 * A deck reference in a pending write may be a real Deck id or a temp id of the
 * form `new:<name>` produced by a pending createDeck in the same batch. The
 * executor creates such decks first and rewrites temp ids to real ones before
 * running dependent writes (ADR-0010).
 */
export const TEMP_DECK_PREFIX = "new:";

export type PendingWrite =
  | { kind: "createDeck"; name: string; tempId: string }
  | { kind: "importFacts"; label: string; type: FieldType; plan: ImportPlan }
  | { kind: "createTopic"; title: string; fields: Field[] }
  | { kind: "addField"; topicId: string; topicTitle: string; field: Field }
  | {
      kind: "updateField";
      topicId: string;
      fieldId: string;
      patch: Partial<Field>;
    }
  // Tags/Decks live per Field (ADR-0008). Setting them never resets Review
  // state (only a value/type change does — ADR-0006), so they are their own
  // variants rather than going through updateField's reset path.
  | {
      kind: "setFieldTags";
      topicId: string;
      topicTitle: string;
      fieldLabel: string;
      fieldId: string;
      tags: string[];
    }
  | {
      kind: "setFieldDecks";
      topicId: string;
      topicTitle: string;
      fieldLabel: string;
      fieldId: string;
      deckIds: string[];
    };

/** OpenAI chat message shape (subset used by the loop). */
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
