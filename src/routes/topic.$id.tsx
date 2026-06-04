import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TopicEditor, type EditorState } from "@/components/TopicEditor";
import { useTopic, useUpdateTopic } from "@/lib/hooks";
import { TitleConflictError } from "@/lib/repos/topics";

function errorMessage(err: unknown): string | null {
  if (!err) return null;
  if (err instanceof TitleConflictError) return err.message;
  return "Could not save. Please try again.";
}

export const Route = createFileRoute("/topic/$id")({
  component: EditTopicPage,
});

function EditTopicPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: topic, isLoading } = useTopic(id);
  const update = useUpdateTopic();

  if (isLoading || !topic)
    return <p className="text-muted-foreground">Loading…</p>;

  const initial: EditorState = {
    title: topic.title,
    fields: topic.fields,
  };

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Edit Topic</h1>
      <TopicEditor
        initial={initial}
        saving={update.isPending}
        errorText={errorMessage(update.error)}
        onCancel={() => navigate({ to: "/" })}
        onSave={(state, resetFieldIds) =>
          update.mutate(
            { id, input: state, resetFieldIds },
            { onSuccess: () => navigate({ to: "/" }) },
          )
        }
      />
    </div>
  );
}
