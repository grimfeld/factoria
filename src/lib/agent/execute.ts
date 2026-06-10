import {
  createTopic,
  getTopic,
  updateTopic,
  PostSaveWarning,
} from "@/lib/repos/topics";
import { createDeck } from "@/lib/repos/decks";
import { TEMP_DECK_PREFIX, type PendingWrite } from "./types";
import type { ImportPlan } from "@/domain/import";

export interface ExecutionResult {
  created: number;
  extended: number;
  skipped: number;
  decksCreated: number;
  /** Hard failures — the primary write did NOT land. */
  errors: { title: string; error: string }[];
  /**
   * Soft failures — the primary write landed but a follow-up (schedule/deck
   * sync) hiccuped (PostSaveWarning). These count as successes for created/
   * extended; they must NOT be reported as "did nothing" (write-then-warn).
   */
  warnings: { title: string; warning: string }[];
}

/**
 * Commit approved pending writes through the repo layer (ADR-0010), so all
 * domain invariants — Field ids, review-state reconcile, deck sync, unique
 * Titles — are enforced by code.
 *
 * Dependency order: any pending `createDeck` runs FIRST, building a
 * temp-id → real-id map; then every dependent write's deck references (temp ids
 * of the form `new:<name>`) are rewritten to real ids before it runs. This lets
 * the agent chain "create a deck, then import into it" in a single approval.
 */
export async function executePendingWrites(
  writes: PendingWrite[],
): Promise<ExecutionResult> {
  const out: ExecutionResult = {
    created: 0,
    extended: 0,
    skipped: 0,
    decksCreated: 0,
    errors: [],
    warnings: [],
  };

  // Phase 1: create decks, map temp ids to real ids.
  const tempToReal = new Map<string, string>();
  for (const write of writes) {
    if (write.kind !== "createDeck") continue;
    try {
      const deck = await createDeck(write.name);
      tempToReal.set(write.tempId, deck.id);
      out.decksCreated++;
    } catch (err) {
      out.errors.push({ title: write.name, error: msg(err) });
    }
  }

  const resolve = (deckId: string): string =>
    deckId.startsWith(TEMP_DECK_PREFIX)
      ? tempToReal.get(deckId) ?? ""
      : deckId;
  const resolveAll = (ids: string[]): string[] =>
    ids.map(resolve).filter((id) => id !== "");

  // Phase 2: the rest, with deck references resolved.
  for (const write of writes) {
    if (write.kind === "createDeck") continue;
    switch (write.kind) {
      case "importFacts":
        await executeImportPlan(write.plan, out, resolveAll);
        break;

      case "createTopic":
        try {
          await createTopic({ title: write.title, fields: write.fields });
          out.created++;
        } catch (err) {
          if (!recordSoft(err, write.title, out)) {
            out.errors.push({ title: write.title, error: msg(err) });
          } else {
            out.created++;
          }
        }
        break;

      case "renameTopic":
        try {
          const topic = await getTopic(write.topicId);
          // Title-only change: keep fields as-is, no resetFieldIds, so every
          // Field id and its Review state survive (ADR-0009 / CONTEXT.md).
          await updateTopic(write.topicId, {
            title: write.toTitle,
            fields: topic.fields,
          });
          out.extended++;
        } catch (err) {
          if (!recordSoft(err, write.toTitle, out)) {
            out.errors.push({ title: write.toTitle, error: msg(err) });
          } else {
            out.extended++;
          }
        }
        break;

      case "addField":
        try {
          const topic = await getTopic(write.topicId);
          await updateTopic(write.topicId, {
            title: topic.title,
            fields: [...topic.fields, write.field],
          });
          out.extended++;
        } catch (err) {
          if (!recordSoft(err, write.topicTitle, out)) {
            out.errors.push({ title: write.topicTitle, error: msg(err) });
          } else {
            out.extended++;
          }
        }
        break;

      case "updateField":
        try {
          const topic = await getTopic(write.topicId);
          await updateTopic(
            write.topicId,
            {
              title: topic.title,
              fields: topic.fields.map((f) =>
                f.id === write.fieldId ? { ...f, ...write.patch } : f,
              ),
            },
            { resetFieldIds: [write.fieldId] },
          );
          out.extended++;
        } catch (err) {
          if (!recordSoft(err, write.topicId, out)) {
            out.errors.push({ title: write.topicId, error: msg(err) });
          } else {
            out.extended++;
          }
        }
        break;

      case "setFieldTags":
        try {
          const topic = await getTopic(write.topicId);
          await updateTopic(write.topicId, {
            title: topic.title,
            fields: topic.fields.map((f) =>
              f.id === write.fieldId ? { ...f, tags: write.tags } : f,
            ),
          });
          out.extended++;
        } catch (err) {
          if (!recordSoft(err, write.topicTitle, out)) {
            out.errors.push({ title: write.topicTitle, error: msg(err) });
          } else {
            out.extended++;
          }
        }
        break;

      case "setFieldDecks":
        try {
          const topic = await getTopic(write.topicId);
          // Updating field.decks triggers deck-membership sync in updateTopic
          // (ADR-0008); no resetFieldIds, so review scheduling is untouched.
          await updateTopic(write.topicId, {
            title: topic.title,
            fields: topic.fields.map((f) =>
              f.id === write.fieldId
                ? { ...f, decks: resolveAll(write.deckIds) }
                : f,
            ),
          });
          out.extended++;
        } catch (err) {
          if (!recordSoft(err, write.topicTitle, out)) {
            out.errors.push({ title: write.topicTitle, error: msg(err) });
          } else {
            out.extended++;
          }
        }
        break;
    }
  }

  return out;
}

async function executeImportPlan(
  plan: ImportPlan,
  out: ExecutionResult,
  resolveAll: (ids: string[]) => string[],
): Promise<void> {
  for (const op of plan.create) {
    try {
      await createTopic({
        title: op.title,
        fields: [{ ...op.field, decks: resolveAll(op.field.decks) }],
      });
      out.created++;
    } catch (err) {
      if (!recordSoft(err, op.title, out)) {
        out.errors.push({ title: op.title, error: msg(err) });
      } else {
        out.created++;
      }
    }
  }
  for (const op of plan.extend) {
    try {
      const topic = await getTopic(op.topicId);
      await updateTopic(op.topicId, {
        title: topic.title,
        fields: [
          ...topic.fields,
          { ...op.field, decks: resolveAll(op.field.decks) },
        ],
      });
      out.extended++;
    } catch (err) {
      if (!recordSoft(err, op.title, out)) {
        out.errors.push({ title: op.title, error: msg(err) });
      } else {
        out.extended++;
      }
    }
  }
  out.skipped += plan.skip.length;
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Classify a thrown write error (write-then-warn). A {@link PostSaveWarning}
 * means the primary record DID land — only a follow-up (schedule/deck sync)
 * hiccuped. Record it as a warning and return true so the caller still counts
 * the write as a success, instead of reporting "0 changes, 1 error" for a save
 * that actually worked. Any other error is a real failure → return false.
 */
function recordSoft(
  err: unknown,
  title: string,
  out: ExecutionResult,
): boolean {
  if (err instanceof PostSaveWarning) {
    out.warnings.push({ title, warning: err.message });
    return true;
  }
  return false;
}
