import { getTopic, listTopics, listTopicsByTag } from "./repos/topics";
import { getDeck } from "./repos/decks";
import { listReviewStatesForTopics } from "./repos/review";
import { deriveQuestions } from "@/domain/questions";
import type {
  Question,
  ReviewState,
  StudyEntryPoint,
  Topic,
} from "@/domain/types";

/**
 * Resolve a Study entry point to a pool of Questions plus the Review state for
 * the Topics they come from (ADR-0008):
 *   - all   → every Question in the library
 *   - topic → every Question in a single Topic
 *   - tag   → Questions of Fields carrying the tag
 *   - deck  → Questions of the Fields in the Deck
 */
export async function resolveStudyPool(
  entry: StudyEntryPoint,
): Promise<{ questions: Question[]; reviewStates: ReviewState[] }> {
  let topics: Topic[];
  let keepFieldId: ((fieldId: string) => boolean) | null = null;

  switch (entry.kind) {
    case "all":
      topics = await listTopics();
      break;
    case "topic":
      topics = [await getTopic(entry.topicId)];
      break;
    case "tag": {
      topics = await listTopicsByTag(entry.tag);
      const tag = entry.tag;
      const allowed = new Set(
        topics.flatMap((t) =>
          t.fields.filter((f) => f.tags.includes(tag)).map((f) => f.id),
        ),
      );
      keepFieldId = (id) => allowed.has(id);
      break;
    }
    case "deck": {
      const deck = await getDeck(entry.deckId);
      const allowed = new Set(deck.fields);
      topics = await listTopics(); // fields can span many topics
      keepFieldId = (id) => allowed.has(id);
      break;
    }
  }

  let questions = topics.flatMap(deriveQuestions);
  if (keepFieldId) questions = questions.filter((q) => keepFieldId!(q.fieldId));

  const topicIds = [...new Set(questions.map((q) => q.topicId))];
  const reviewStates = await listReviewStatesForTopics(topicIds);
  return { questions, reviewStates };
}
