import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useTopics, useDeleteTopic } from "@/lib/hooks";
import { activeFieldIds } from "@/domain/questions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Topic } from "@/domain/types";

export const Route = createFileRoute("/")({
  component: LibraryPage,
});

function LibraryPage() {
  const { data: topics, isLoading } = useTopics();
  const navigate = useNavigate();

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Library</h1>
        <div className="flex-1" />
        <Button onClick={() => navigate({ to: "/topic/new" })}>
          <Plus className="size-4" /> Add Topic
        </Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}
      {topics && topics.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-muted-foreground">
            No topics yet. Add one to start building your library.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
        {topics?.map((t) => <TopicCard key={t.id} topic={t} />)}
      </div>
    </div>
  );
}

function TopicCard({ topic }: { topic: Topic }) {
  const deleteTopic = useDeleteTopic();
  const questionCount = activeFieldIds(topic).length;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold">{topic.title}</span>
          <div className="flex-1" />
          <Badge variant="secondary">{questionCount} Q</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/topic/$id" params={{ id: topic.id }}>
              Edit
            </Link>
          </Button>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (confirm("Delete this topic and its review history?"))
                deleteTopic.mutate(topic.id);
            }}
          >
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
