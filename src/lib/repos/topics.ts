import { pb, requireUserId } from "../pocketbase";
import { toTopic, toReviewState } from "../mappers";
import { reconcileReviewState } from "@/domain/reconcile";
import { newReviewState } from "@/domain/scheduler";
import type { Field, Topic, ReviewState } from "@/domain/types";
import { removeFieldsFromAllDecks, syncFieldDeckMembership } from "./decks";

export interface TopicInput {
  title: string;
  fields: Field[];
}

/** Thrown when a Topic Title collides with an existing one (ADR-0009). */
export class TitleConflictError extends Error {
  constructor(public readonly title: string) {
    super(`A topic titled "${title}" already exists.`);
    this.name = "TitleConflictError";
  }
}

/** Canonical form for Title comparison and storage (trimmed). */
export function normalizeTitle(title: string): string {
  return title.trim();
}

/**
 * True if the user already owns a Topic with this Title (ADR-0009). Pass
 * `excludeId` when checking during a rename so the Topic doesn't clash itself.
 */
export async function titleExists(
  title: string,
  excludeId?: string,
): Promise<boolean> {
  const wanted = normalizeTitle(title);
  const matches = await pb.collection("topics").getFullList({
    filter: pb.filter("title = {:t}", { t: wanted }),
  });
  return matches.some((m) => m.id !== excludeId);
}

export async function listTopics(): Promise<Topic[]> {
  const rows = await pb.collection("topics").getFullList({ sort: "-created" });
  return rows.map(toTopic);
}

export async function getTopic(id: string): Promise<Topic> {
  return toTopic(await pb.collection("topics").getOne(id));
}

/**
 * Topics that contain at least one Field carrying the given tag. Tags live
 * inside the fields JSON (ADR-0008), so filtering is done client-side.
 */
export async function listTopicsByTag(tag: string): Promise<Topic[]> {
  const topics = await listTopics();
  return topics.filter((t) => t.fields.some((f) => f.tags.includes(tag)));
}

/** Distinct tags across all Fields in the library. */
export async function listAllTags(): Promise<string[]> {
  const topics = await listTopics();
  const set = new Set<string>();
  for (const t of topics) for (const f of t.fields) for (const g of f.tags) set.add(g);
  return [...set].sort();
}

export async function createTopic(
  input: TopicInput,
  now: Date = new Date(),
): Promise<Topic> {
  const owner = requireUserId();
  const title = normalizeTitle(input.title);
  if (await titleExists(title)) throw new TitleConflictError(title);
  const row = await pb
    .collection("topics")
    .create({ owner, ...input, title });
  const topic = toTopic(row);
  await reconcileOnSave(topic, now);
  await syncFieldDeckMembership(topic);
  return topic;
}

/**
 * Update a Topic's content, then reconcile its Review state by Field id
 * (ADR-0006): create due-now state for newly active Fields, delete state for
 * removed Fields, keep (active or dormant) the rest. Optionally reset specific
 * Fields whose answer changed — the caller passes those ids after the user
 * confirms (see {@link resetReviewStateForFields}).
 */
export async function updateTopic(
  id: string,
  input: TopicInput,
  opts: { resetFieldIds?: string[] } = {},
  now: Date = new Date(),
): Promise<Topic> {
  const title = normalizeTitle(input.title);
  if (await titleExists(title, id)) throw new TitleConflictError(title);
  const row = await pb.collection("topics").update(id, { ...input, title });
  const topic = toTopic(row);
  await reconcileOnSave(topic, now);
  await syncFieldDeckMembership(topic);
  if (opts.resetFieldIds?.length) {
    await resetReviewStateForFields(topic.id, opts.resetFieldIds, now);
  }
  return topic;
}

export async function deleteTopic(id: string): Promise<void> {
  const fieldIds = (await getTopic(id)).fields.map((f) => f.id);
  // review_state rows cascade-delete via the topic relation; Deck membership
  // has no FK, so purge it explicitly (ADR-0008).
  await removeFieldsFromAllDecks(fieldIds);
  await pb.collection("topics").delete(id);
}

async function reconcileOnSave(topic: Topic, now: Date): Promise<void> {
  const owner = requireUserId();
  const existing = await listReviewStatesForTopic(topic.id);
  const plan = reconcileReviewState(topic, existing, now);

  await Promise.all([
    ...plan.toCreate.map((c) =>
      pb.collection("review_state").create({
        owner,
        topic: topic.id,
        fieldId: c.fieldId,
        ...c.state,
      }),
    ),
    ...plan.toDeleteIds.map((rsId) =>
      pb.collection("review_state").delete(rsId),
    ),
  ]);
}

/** Reset the SM-2 state of specific Fields to fresh/due-now (user-confirmed). */
export async function resetReviewStateForFields(
  topicId: string,
  fieldIds: string[],
  now: Date = new Date(),
): Promise<void> {
  const existing = await listReviewStatesForTopic(topicId);
  const byField = new Map(existing.map((rs) => [rs.fieldId, rs]));
  await Promise.all(
    fieldIds.map((fid) => {
      const rs = byField.get(fid);
      if (!rs) return Promise.resolve();
      return pb.collection("review_state").update(rs.id, newReviewState(now));
    }),
  );
}

export async function listReviewStatesForTopic(
  topicId: string,
): Promise<ReviewState[]> {
  const rows = await pb.collection("review_state").getFullList({
    filter: pb.filter("topic = {:id}", { id: topicId }),
  });
  return rows.map(toReviewState);
}
