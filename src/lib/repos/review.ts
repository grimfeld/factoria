import { pb } from "../pocketbase";
import { toReviewState } from "../mappers";
import { applyGrade } from "@/domain/scheduler";
import type { Grade, ReviewState } from "@/domain/types";

/**
 * Max topics per filter request. PocketBase rejects overly long filter strings
 * ("max filter length limit reached"), so we chunk the OR-filter into batches.
 */
const TOPIC_FILTER_CHUNK_SIZE = 50;

/** All Review-state rows for a set of topics (keyed internally by Field id). */
export async function listReviewStatesForTopics(
  topicIds: string[],
): Promise<ReviewState[]> {
  if (topicIds.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < topicIds.length; i += TOPIC_FILTER_CHUNK_SIZE) {
    chunks.push(topicIds.slice(i, i + TOPIC_FILTER_CHUNK_SIZE));
  }
  const results = await Promise.all(
    chunks.map((chunk, chunkIndex) => {
      const filter = chunk.map((_, i) => `topic = {:t${i}}`).join(" || ");
      const params = Object.fromEntries(chunk.map((id, i) => [`t${i}`, id]));
      return pb.collection("review_state").getFullList({
        filter: pb.filter(filter, params),
        // Unique key per chunk; otherwise the SDK auto-cancels all but the last
        // parallel getFullList to the same collection.
        requestKey: `review_state_chunk_${chunkIndex}`,
      });
    }),
  );
  return results.flat().map(toReviewState);
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
