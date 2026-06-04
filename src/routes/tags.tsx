import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTags } from "@/lib/hooks";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/tags")({
  component: TagsPage,
});

function TagsPage() {
  const tags = useTags();
  const navigate = useNavigate();

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Tags</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Tags are cross-cutting labels. Tap one to study every Topic that carries
        it.
      </p>
      <div className="flex flex-wrap gap-2">
        {tags.data?.map((t) => (
          <Button
            key={t}
            variant="secondary"
            size="sm"
            onClick={() =>
              navigate({ to: "/study", search: { entry: "tag", id: t } })
            }
          >
            {t}
          </Button>
        ))}
        {tags.data?.length === 0 && (
          <p className="text-muted-foreground">No tags yet.</p>
        )}
      </div>
    </div>
  );
}
