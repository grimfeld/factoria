import { isActiveField } from "./questions";
import { newReviewState } from "./scheduler";
import type { Field, Topic, ReviewState } from "./types";

/**
 * A plan for bringing a Topic's persisted Review state in line with its current
 * Fields after an authoring edit (ADR-0006). Identity is the Field **id**.
 *
 *   - A Field id that is active (non-empty) and has no Review state → CREATE
 *     one, due immediately.
 *   - A Field id present in the edit but whose value is empty → leave its
 *     Review state DORMANT (kept, not deleted; not served while empty).
 *   - A Field id that was removed from the Topic entirely → DELETE its Review
 *     state.
 *   - A Field id that is active and already has Review state → KEEP it.
 *
 * Renaming a label, retagging, or re-decking never appears here — none touch
 * identity. Changing a value or type is detected separately by
 * {@link detectAnswerChanges}; the *reset* it may cause is user-confirmed and
 * applied by the data layer, not by this structural plan.
 *
 * This planner is pure; the data layer executes create/delete.
 */
export interface ReconcilePlan {
  /** Field ids to create fresh, due-immediately Review state for. */
  toCreate: { fieldId: string; state: ReturnType<typeof newReviewState> }[];
  /** Review-state ids to delete (their Field was removed from the Topic). */
  toDeleteIds: string[];
  /** Field ids whose Review state is kept (active or dormant). */
  keptFieldIds: string[];
}

export function reconcileReviewState(
  topic: Topic,
  existing: ReviewState[],
  now: Date,
): ReconcilePlan {
  const presentIds = new Set(topic.fields.map((f) => f.id));
  const activeIds = new Set(topic.fields.filter(isActiveField).map((f) => f.id));
  const existingByField = new Map(existing.map((rs) => [rs.fieldId, rs]));

  const toCreate: ReconcilePlan["toCreate"] = [];
  const keptFieldIds: string[] = [];

  for (const field of topic.fields) {
    const has = existingByField.has(field.id);
    if (activeIds.has(field.id) && !has) {
      // Newly active Field with no history → create.
      toCreate.push({ fieldId: field.id, state: newReviewState(now) });
    } else if (has) {
      // Active-with-history, or empty-with-history (dormant): keep either way.
      keptFieldIds.push(field.id);
    }
  }

  const toDeleteIds: string[] = [];
  for (const rs of existing) {
    // Delete only when the Field is gone from the Topic entirely — an emptied
    // Field is still present, so its state stays dormant.
    if (!presentIds.has(rs.fieldId)) toDeleteIds.push(rs.id);
  }

  return { toCreate, toDeleteIds, keptFieldIds };
}

/**
 * Compare the previous Fields against the edited ones and return the ids of
 * Fields whose **answer** changed — a value edit or a type change (ADR-0006,
 * ADR-0007). The UI prompts the user per id whether to reset that Field's
 * Review state. Label/tag/deck-only edits are not answer changes and are
 * excluded. Fields with no prior Review state are excluded (nothing to reset).
 */
export function detectAnswerChanges(
  prevFields: Field[],
  nextFields: Field[],
  existing: ReviewState[],
): string[] {
  const hasHistory = new Set(existing.map((rs) => rs.fieldId));
  const prevById = new Map(prevFields.map((f) => [f.id, f]));
  const changed: string[] = [];

  for (const next of nextFields) {
    const prev = prevById.get(next.id);
    if (!prev || !hasHistory.has(next.id)) continue;
    const valueChanged = prev.value !== next.value;
    const typeChanged = prev.type !== next.type;
    // Only count a change between two non-empty states as an "answer change".
    // Empty↔filled is handled by dormant/create, not by a reset prompt.
    const bothFilled = isActiveField(prev) && isActiveField(next);
    if (bothFilled && (valueChanged || typeChanged)) changed.push(next.id);
  }

  return changed;
}
