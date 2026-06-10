import { summarizePlan } from "@/domain/import";
import type { PendingWrite } from "./types";

/**
 * Turn the agent's machine actions into the plain language the user reads
 * (ADR-0010 follow-up — make the plan explicit). Two audiences:
 *
 * - {@link describeToolCall} narrates a tool call *as it runs* ("Searching
 *   Topics…"), so the page shows live activity instead of a bare spinner. It
 *   works from the raw tool name + args, before the result exists.
 * - {@link describePendingWrite} states one approved-pending change ("Create
 *   deck “Capitals”") for the ordered step list shown above the approval gate.
 */

/** Live, present-tense narration of a tool call in flight. */
export function describeToolCall(
  name: string,
  args: Record<string, unknown>,
): string {
  switch (name) {
    case "searchTopics": {
      const q = String(args.query ?? "").trim();
      return q ? `Searching Topics for “${q}”…` : "Searching Topics…";
    }
    case "getTopic":
      return "Reading a Topic…";
    case "listDecks":
      return "Listing your Decks…";
    case "listTags":
      return "Listing your Tags…";
    case "importFacts": {
      const label = String(args.label ?? "fields").trim() || "fields";
      const rows = Array.isArray(args.rows) ? args.rows.length : 0;
      return rows
        ? `Planning import of ${rows} “${label}” field(s)…`
        : `Planning import of “${label}” fields…`;
    }
    case "createTopic":
      return `Preparing new Topic “${String(args.title ?? "").trim()}”…`;
    case "renameTopic":
      return `Preparing rename → “${String(args.newTitle ?? "").trim()}”…`;
    case "createDeck":
      return `Preparing new Deck “${String(args.name ?? "").trim()}”…`;
    case "setFieldTags":
      return "Preparing tag change…";
    case "setFieldDecks":
      return "Preparing deck membership change…";
    default:
      return "Working…";
  }
}

/** One plain-language line describing a proposed (pending) change. */
export function describePendingWrite(w: PendingWrite): string {
  switch (w.kind) {
    case "createDeck":
      return `Create deck “${w.name}”`;
    case "importFacts": {
      const { create, extend, skip } = w.plan;
      const parts: string[] = [];
      if (create.length) parts.push(`create ${create.length} new Topic(s)`);
      if (extend.length) parts.push(`extend ${extend.length} existing Topic(s)`);
      if (skip.length) parts.push(`skip ${skip.length}`);
      const tail = parts.length ? ` — ${parts.join(", ")}` : ` — ${summarizePlan(w.plan)}`;
      return `Add a “${w.label}” field across Topics${tail}`;
    }
    case "createTopic":
      return `Create Topic “${w.title}” with ${w.fields.length} field(s)`;
    case "renameTopic":
      return `Rename Topic “${w.fromTitle}” → “${w.toTitle}” (keeps all fields & history)`;
    case "addField":
      return `Add field “${w.field.label}” to “${w.topicTitle}”`;
    case "updateField":
      return `Update a field in Topic ${w.topicId}`;
    case "setFieldTags":
      return `Set tags on “${w.topicTitle} / ${w.fieldLabel}” → [${w.tags.join(", ")}]`;
    case "setFieldDecks":
      return `Set decks on “${w.topicTitle} / ${w.fieldLabel}” (${w.deckIds.length} deck(s))`;
  }
}
