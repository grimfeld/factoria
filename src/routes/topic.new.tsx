import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TopicEditor, type EditorState } from "@/components/TopicEditor";
import { useCreateTopic } from "@/lib/hooks";
import { TitleConflictError } from "@/lib/repos/topics";
import { newFieldId } from "@/domain/ids";

// Only title conflicts are shown inline (they point at a specific field the
// user must change). Every other failure is reported via toast from the
// mutation hook, so we don't double-report or show a stale generic error.
function inlineError(err: unknown): string | null {
  if (err instanceof TitleConflictError) return err.message;
  return null;
}

export const Route = createFileRoute("/topic/new")({
  component: NewTopicPage,
});

function blankInitial(): EditorState {
  return {
    title: "",
    fields: [
      { id: newFieldId(), label: "fact", type: "text", value: null, tags: [], decks: [] },
    ],
  };
}

function NewTopicPage() {
  const navigate = useNavigate();
  const create = useCreateTopic();

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">New Topic</h1>
      <TopicEditor
        initial={blankInitial()}
        saving={create.isPending}
        errorText={inlineError(create.error)}
        onCancel={() => navigate({ to: "/" })}
        onSave={(state) =>
          create.mutate(state, { onSuccess: () => navigate({ to: "/" }) })
        }
      />
    </div>
  );
}
