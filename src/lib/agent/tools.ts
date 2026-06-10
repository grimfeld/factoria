import { listTopics, getTopic } from "@/lib/repos/topics";
import { listDecks } from "@/lib/repos/decks";
import { listAllTags } from "@/lib/repos/topics";
import { planImportFacts, summarizePlan } from "@/domain/import";
import { newFieldId } from "@/domain/ids";
import type { FieldType } from "@/domain/types";
import { TEMP_DECK_PREFIX, type PendingWrite } from "./types";

/**
 * The agent's tool surface (ADR-0010). Read tools execute immediately and
 * return data to the model. Write tools do NOT touch the database — they return
 * a {@link PendingWrite} the loop accumulates for user approval, plus a summary
 * string the model can reason about.
 */

/** OpenAI function-tool definitions sent with every request. */
export const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "searchTopics",
      description:
        "Search the user's Topics by a text query against Title and Field labels/values. Returns matching Topics with their Fields.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getTopic",
      description: "Get one Topic by id, with all its Fields.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listDecks",
      description: "List the user's Decks (id, name, question count).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "listTags",
      description: "List all Tags used across the user's Fields.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "importFacts",
      description:
        "Bulk-add one Field named `label` across many Topics from rows of {title, value}. Additive only: extends an existing Topic matched by exact Title, and (by default) creates a Topic when there is no match. It never overwrites a Topic that already has that Field. For requests like 'add all world capitals' just call it with label='capital' and the rows — the default mode creates the missing country Topics automatically; do NOT ask the user whether to create them, the approval preview already lets them confirm. Only pass mode='extend-only' when the user explicitly says to add facts to EXISTING topics only. If the user also wants the imported fields tagged or put in a deck, pass `tags` and/or `deckIds` IN THIS SAME CALL — every imported Field gets them. Get deck ids from listDecks first; if the named deck does not exist, tell the user (this tool does not create decks).",
      parameters: {
        type: "object",
        properties: {
          label: { type: "string", description: "the Field label, e.g. 'capital'" },
          type: {
            type: "string",
            enum: ["text", "image", "audio"],
            description: "Field type; almost always 'text' for bulk facts",
          },
          mode: {
            type: "string",
            enum: ["create-missing", "extend-only"],
            description:
              "Defaults to 'create-missing' (creates Topics for unmatched rows). Omit unless the user explicitly wants extend-only.",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description:
              "Tags applied to every imported Field (e.g. ['capital']). Optional.",
          },
          deckIds: {
            type: "array",
            items: { type: "string" },
            description:
              "Deck ids (from listDecks) every imported Field joins. Optional.",
          },
          rows: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                value: { type: "string" },
              },
              required: ["title", "value"],
            },
          },
        },
        required: ["label", "rows"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createTopic",
      description:
        "Create one Topic with a Title and some text Fields. Titles must be unique.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          fields: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                value: { type: "string" },
              },
              required: ["label", "value"],
            },
          },
        },
        required: ["title", "fields"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "renameTopic",
      description:
        "Rename a Topic — change ONLY its Title (e.g. 'France' → 'French Republic'). Identify the Topic by its id from searchTopics or getTopic. This rewords the prompt of every Question derived from the Topic but keeps all Fields, their answers, and their review history intact (it never resets scheduling). Titles are unique per user, so the new Title must not already belong to another Topic. Use this for renames only; to change a Field's answer use a field tool instead.",
      parameters: {
        type: "object",
        properties: {
          topicId: { type: "string" },
          newTitle: { type: "string", description: "the new Topic Title" },
        },
        required: ["topicId", "newTitle"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "setFieldTags",
      description:
        "Set the Tags on a specific Field (replaces its existing tags). Tags are free-form lowercase labels (e.g. 'hard', 'europe'). Identify the Field by topicId + fieldId, obtained from searchTopics or getTopic. Setting tags never changes review scheduling.",
      parameters: {
        type: "object",
        properties: {
          topicId: { type: "string" },
          fieldId: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["topicId", "fieldId", "tags"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "setFieldDecks",
      description:
        "Set which Decks a specific Field belongs to (replaces its existing deck membership). Identify the Field by topicId + fieldId; identify Decks by their ids from listDecks. Pass an empty array to remove the Field from all Decks. Setting decks never changes review scheduling.",
      parameters: {
        type: "object",
        properties: {
          topicId: { type: "string" },
          fieldId: { type: "string" },
          deckIds: { type: "array", items: { type: "string" } },
        },
        required: ["topicId", "fieldId", "deckIds"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createDeck",
      description:
        "Create a new Deck with the given name. Returns a temporary deck id of the form 'new:<name>'. You may use that temporary id immediately in the SAME response as a deckId for importFacts or setFieldDecks — it will be turned into a real deck on approval. Use this when the user asks to put fields in a deck that does not exist yet (check listDecks first).",
      parameters: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
    },
  },
] as const;

export interface ToolOutcome {
  /** JSON-serialisable result handed back to the model. */
  result: unknown;
  /** A write to queue for approval, if this was a write tool. */
  pendingWrite?: PendingWrite;
}

/** Execute a tool call by name. Read tools hit repos; write tools queue. */
export async function runTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  switch (name) {
    case "searchTopics":
      return { result: await searchTopics(String(args.query ?? "")) };

    case "getTopic":
      return { result: await getTopic(String(args.id)) };

    case "listDecks": {
      const decks = await listDecks();
      return {
        result: decks.map((d) => ({
          id: d.id,
          name: d.name,
          questions: d.fields.length,
        })),
      };
    }

    case "listTags":
      return { result: await listAllTags() };

    case "importFacts": {
      const label = String(args.label);
      const type = (args.type as FieldType) ?? "text";
      const mode =
        args.mode === "extend-only" ? "extend-only" : "create-missing";
      const rows = (args.rows as { title: string; value: string }[]) ?? [];
      const tags = (args.tags as string[]) ?? [];
      const deckIds = (args.deckIds as string[]) ?? [];
      const topics = await listTopics();
      const plan = planImportFacts(
        { label, type, mode, rows, tags, deckIds },
        topics,
      );
      return {
        result: {
          summary: summarizePlan(plan),
          appliedTags: tags,
          appliedDeckCount: deckIds.length,
          create: plan.create.map((c) => c.title),
          extend: plan.extend.map((x) => x.title),
          skip: plan.skip.map((s) => ({ title: s.title, reason: s.reason })),
        },
        pendingWrite: { kind: "importFacts", label, type, plan },
      };
    }

    case "createTopic": {
      const title = String(args.title);
      const rawFields =
        (args.fields as { label: string; value: string }[]) ?? [];
      // Each Field in a Topic is a distinct question, so labels must be unique
      // within the Topic. Reject duplicates instead of silently creating useless
      // duplicate prompts — the model sees this error and corrects the labels.
      const dup = firstDuplicateLabel(rawFields.map((f) => f.label));
      if (dup) {
        return {
          result: {
            error: `Duplicate Field label "${dup}" in Topic "${title}". Each Field in a Topic must have a distinct label (e.g. "capital", "currency", "population") — they are separate questions. Re-send createTopic with unique labels.`,
          },
        };
      }
      const fields = rawFields.map((f) => ({
        id: newFieldId(),
        label: f.label,
        type: "text" as FieldType,
        value: f.value,
        tags: [],
        decks: [],
      }));
      return {
        result: { summary: `create Topic "${title}" with ${fields.length} fields` },
        pendingWrite: { kind: "createTopic", title, fields },
      };
    }

    case "renameTopic": {
      const topicId = String(args.topicId);
      const toTitle = String(args.newTitle ?? "").trim();
      if (!toTitle) return { result: { error: "New title is required." } };
      let topic;
      try {
        topic = await getTopic(topicId);
      } catch {
        return { result: { error: `Topic ${topicId} not found.` } };
      }
      if (topic.title === toTitle) {
        return {
          result: { error: `Topic is already titled "${toTitle}".` },
        };
      }
      return {
        result: {
          summary: `rename Topic "${topic.title}" → "${toTitle}"`,
          note: "Keeps all fields and review history; only the prompt wording changes.",
        },
        pendingWrite: {
          kind: "renameTopic",
          topicId,
          fromTitle: topic.title,
          toTitle,
        },
      };
    }

    case "setFieldTags": {
      const topicId = String(args.topicId);
      const fieldId = String(args.fieldId);
      const tags = (args.tags as string[]) ?? [];
      const located = await locateField(topicId, fieldId);
      if (!located) return { result: { error: "Field not found." } };
      return {
        result: {
          summary: `set tags on "${located.topicTitle} / ${located.fieldLabel}" to [${tags.join(", ")}]`,
        },
        pendingWrite: {
          kind: "setFieldTags",
          topicId,
          fieldId,
          topicTitle: located.topicTitle,
          fieldLabel: located.fieldLabel,
          tags,
        },
      };
    }

    case "setFieldDecks": {
      const topicId = String(args.topicId);
      const fieldId = String(args.fieldId);
      const deckIds = (args.deckIds as string[]) ?? [];
      const located = await locateField(topicId, fieldId);
      if (!located) return { result: { error: "Field not found." } };
      return {
        result: {
          summary: `set decks on "${located.topicTitle} / ${located.fieldLabel}" (${deckIds.length} deck(s))`,
        },
        pendingWrite: {
          kind: "setFieldDecks",
          topicId,
          fieldId,
          topicTitle: located.topicTitle,
          fieldLabel: located.fieldLabel,
          deckIds,
        },
      };
    }

    case "createDeck": {
      const deckName = String(args.name).trim();
      if (!deckName) return { result: { error: "Deck name is required." } };
      const tempId = TEMP_DECK_PREFIX + deckName;
      return {
        result: {
          summary: `create Deck "${deckName}"`,
          tempDeckId: tempId,
          note: "Use this tempDeckId as a deckId in this same response to add fields to the new deck.",
        },
        pendingWrite: { kind: "createDeck", name: deckName, tempId },
      };
    }

    default:
      return { result: { error: `Unknown tool: ${name}` } };
  }
}

/**
 * First label that repeats in a list (case-insensitive, trimmed), or null if
 * all are distinct. Used to reject same-label Fields within one Topic. Returns
 * the label as originally written for a readable error.
 */
function firstDuplicateLabel(labels: string[]): string | null {
  const seen = new Set<string>();
  for (const raw of labels) {
    const key = raw.trim().toLowerCase();
    if (!key) continue;
    if (seen.has(key)) return raw.trim();
    seen.add(key);
  }
  return null;
}

/** Resolve a (topicId, fieldId) to its Topic Title and Field label. */
async function locateField(
  topicId: string,
  fieldId: string,
): Promise<{ topicTitle: string; fieldLabel: string } | null> {
  try {
    const topic = await getTopic(topicId);
    const field = topic.fields.find((f) => f.id === fieldId);
    if (!field) return null;
    return { topicTitle: topic.title, fieldLabel: field.label };
  } catch {
    return null;
  }
}

/** Simple client-side search over Topics (Title + Field labels/values). */
async function searchTopics(query: string) {
  const q = query.trim().toLowerCase();
  const topics = await listTopics();
  const hits = q
    ? topics.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.fields.some(
            (f) =>
              f.label.toLowerCase().includes(q) ||
              (f.type === "text" &&
                (f.value ?? "").toLowerCase().includes(q)),
          ),
      )
    : topics;
  return hits.slice(0, 50).map((t) => ({
    id: t.id,
    title: t.title,
    fields: t.fields.map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      tags: f.tags,
      decks: f.decks,
    })),
  }));
}
