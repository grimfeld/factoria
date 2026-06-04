import { pb } from "../pocketbase";
import { toReviewState } from "../mappers";
import { applyGrade } from "@/domain/scheduler";
import type { Grade, ReviewState } from "@/domain/types";

/** All Review-state rows for a set of topics (keyed internally by Field id). */
export async function listReviewStatesForTopics(
  topicIds: string[],
): Promise<ReviewState[]> {
  if (topicIds.length === 0) return [];
  const filter = topicIds.map((_, i) => `topic = {:t${i}}`).join(" || ");
  const params = Object.fromEntries(topicIds.map((id, i) => [`t${i}`, id]));
  const rows = await pb.collection("review_state").getFullList({
    filter: pb.filter(filter, params),
  });
  return rows.map(toReviewState);
}

/**
 * Grade a Question during a real (non-cram) session: apply SM-2-lite and persist
 * the new Review state. Cram never calls this (CONTEXT.md → cram does not change
 * Review state).
 */
export async function gradeReviewState(
  state: ReviewState,
  grade: Grade,
  now: Date = new Date(),
): Promise<ReviewState> {
  const next = applyGrade(state, grade, now);
  const row = await pb.collection("review_state").update(state.id, next);
  return toReviewState(row);
}
