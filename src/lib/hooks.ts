import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import * as topicsRepo from "./repos/topics";
import * as decksRepo from "./repos/decks";
import * as templatesRepo from "./repos/templates";
import * as conversationsRepo from "./repos/conversations";
import {
  PostSaveWarning,
  TitleConflictError,
  type TopicInput,
} from "./repos/topics";

/**
 * Human-readable message for a thrown write error. Recognises our domain errors
 * and PocketBase's ClientResponseError shape; falls back to a generic line so
 * the user never sees a raw stack or "[object Object]".
 */
function errorMessage(err: unknown): string {
  if (err instanceof TitleConflictError) return err.message;
  if (err instanceof PostSaveWarning) return err.message;
  const status = (err as { status?: number })?.status;
  if (status === 0 || status === undefined) {
    if (err instanceof Error && err.message) return err.message;
  }
  // PocketBase ClientResponseError carries a useful `.message`.
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong. Please try again.";
}

/**
 * Toast the outcome of a write. PostSaveWarning means the DB DID accept the
 * change — show it as a warning, not an error, so we stop telling users a save
 * failed when it actually succeeded.
 */
function notifyWriteError(err: unknown, fallback: string): void {
  if (err instanceof PostSaveWarning) {
    toast.warning(err.message);
    return;
  }
  toast.error(errorMessage(err) || fallback);
}

/** Centralised query keys so mutations can invalidate precisely. */
export const qk = {
  topics: ["topics"] as const,
  topic: (id: string) => ["topics", id] as const,
  tags: ["tags"] as const,
  decks: ["decks"] as const,
  deck: (id: string) => ["decks", id] as const,
  templates: ["templates"] as const,
  conversations: ["conversations"] as const,
  conversation: (id: string) => ["conversations", id] as const,
};

// ---- Topics -------------------------------------------------------------

export function useTopics() {
  return useQuery({ queryKey: qk.topics, queryFn: topicsRepo.listTopics });
}

export function useTopic(id: string | undefined) {
  return useQuery({
    queryKey: id ? qk.topic(id) : ["topics", "none"],
    queryFn: () => topicsRepo.getTopic(id!),
    enabled: !!id,
  });
}

export function useTags() {
  return useQuery({ queryKey: qk.tags, queryFn: topicsRepo.listAllTags });
}

function invalidateAfterTopicWrite(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: qk.topics });
  qc.invalidateQueries({ queryKey: qk.tags });
  qc.invalidateQueries({ queryKey: qk.decks });
}

/**
 * Run a write whose follow-up steps may raise {@link PostSaveWarning}. The
 * primary record is already saved in that case, so we resolve successfully
 * (letting `onSuccess` invalidate + the caller navigate) and surface the
 * follow-up trouble as a warning toast — never as a rejected mutation. Any
 * other error propagates as a real failure.
 */
async function withPostSaveWarning<T>(run: () => Promise<T>): Promise<void> {
  try {
    await run();
  } catch (err) {
    if (err instanceof PostSaveWarning) {
      toast.warning(err.message);
      return; // treated as success: the write landed
    }
    throw err;
  }
}

export function useCreateTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TopicInput) =>
      withPostSaveWarning(() => topicsRepo.createTopic(input)),
    onSuccess: () => {
      invalidateAfterTopicWrite(qc);
      toast.success("Topic created.");
    },
    onError: (err) => notifyWriteError(err, "Could not create topic."),
  });
}

export function useUpdateTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
      resetFieldIds,
    }: {
      id: string;
      input: TopicInput;
      resetFieldIds?: string[];
    }) =>
      withPostSaveWarning(() =>
        topicsRepo.updateTopic(id, input, { resetFieldIds }),
      ),
    onSuccess: (_data, { id }) => {
      invalidateAfterTopicWrite(qc);
      qc.invalidateQueries({ queryKey: qk.topic(id) });
      toast.success("Topic saved.");
    },
    onError: (err) => notifyWriteError(err, "Could not save topic."),
  });
}

export function useDeleteTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      withPostSaveWarning(() => topicsRepo.deleteTopic(id)),
    onSuccess: () => {
      invalidateAfterTopicWrite(qc);
      toast.success("Topic deleted.");
    },
    onError: (err) => notifyWriteError(err, "Could not delete topic."),
  });
}

// ---- Decks --------------------------------------------------------------

export function useDecks() {
  return useQuery({ queryKey: qk.decks, queryFn: decksRepo.listDecks });
}

export function useCreateDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => decksRepo.createDeck(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.decks });
      toast.success("Deck created.");
    },
    onError: (err) => notifyWriteError(err, "Could not create deck."),
  });
}

export function useSetDeckFields() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: string[] }) =>
      decksRepo.setDeckFields(id, fields),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: qk.decks });
      qc.invalidateQueries({ queryKey: qk.deck(id) });
      toast.success("Deck updated.");
    },
    onError: (err) => notifyWriteError(err, "Could not update deck."),
  });
}

export function useDeleteDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => decksRepo.deleteDeck(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.decks });
      toast.success("Deck deleted.");
    },
    onError: (err) => notifyWriteError(err, "Could not delete deck."),
  });
}

// ---- Templates ----------------------------------------------------------

export function useTemplates() {
  return useQuery({
    queryKey: qk.templates,
    queryFn: templatesRepo.listTemplates,
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: templatesRepo.createTemplate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.templates });
      toast.success("Template saved.");
    },
    onError: (err) => notifyWriteError(err, "Could not save template."),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => templatesRepo.deleteTemplate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.templates });
      toast.success("Template deleted.");
    },
    onError: (err) => notifyWriteError(err, "Could not delete template."),
  });
}

// ---- Conversations ------------------------------------------------------

export function useConversations() {
  return useQuery({
    queryKey: qk.conversations,
    queryFn: conversationsRepo.listConversations,
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => conversationsRepo.deleteConversation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.conversations });
      toast.success("Conversation deleted.");
    },
    onError: (err) => notifyWriteError(err, "Could not delete conversation."),
  });
}
