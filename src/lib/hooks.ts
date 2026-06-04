import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import * as topicsRepo from "./repos/topics";
import * as decksRepo from "./repos/decks";
import * as templatesRepo from "./repos/templates";
import type { TopicInput } from "./repos/topics";

/** Centralised query keys so mutations can invalidate precisely. */
export const qk = {
  topics: ["topics"] as const,
  topic: (id: string) => ["topics", id] as const,
  tags: ["tags"] as const,
  decks: ["decks"] as const,
  deck: (id: string) => ["decks", id] as const,
  templates: ["templates"] as const,
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

export function useCreateTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TopicInput) => topicsRepo.createTopic(input),
    onSuccess: () => invalidateAfterTopicWrite(qc),
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
    }) => topicsRepo.updateTopic(id, input, { resetFieldIds }),
    onSuccess: (_data, { id }) => {
      invalidateAfterTopicWrite(qc);
      qc.invalidateQueries({ queryKey: qk.topic(id) });
    },
  });
}

export function useDeleteTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => topicsRepo.deleteTopic(id),
    onSuccess: () => invalidateAfterTopicWrite(qc),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.decks }),
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
    },
  });
}

export function useDeleteDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => decksRepo.deleteDeck(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.decks }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.templates }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => templatesRepo.deleteTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.templates }),
  });
}
