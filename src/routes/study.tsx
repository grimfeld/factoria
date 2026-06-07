import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { resolveStudyPool } from "@/lib/studyPool";
import {
  buildSessionQueue,
  buildCramQueue,
  poolCounts,
} from "@/domain/session";
import { useSessionStore } from "@/stores/session";
import { useDecks, useTags, useTopics } from "@/lib/hooks";
import { TypedFieldViewer } from "@/components/field/TypedFieldViewer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { StudyEntryPoint, Grade, Topic } from "@/domain/types";

interface StudySearch {
  entry?: "all" | "topic" | "deck" | "tag";
  id?: string;
}

export const Route = createFileRoute("/study")({
  validateSearch: (s: Record<string, unknown>): StudySearch => ({
    entry: s.entry as StudySearch["entry"],
    id: typeof s.id === "string" ? s.id : undefined,
  }),
  component: StudyPage,
});

function toEntryPoint(s: StudySearch): StudyEntryPoint | null {
  if (s.entry === "all") return { kind: "all" };
  if (s.entry === "topic" && s.id) return { kind: "topic", topicId: s.id };
  if (s.entry === "deck" && s.id) return { kind: "deck", deckId: s.id };
  if (s.entry === "tag" && s.id) return { kind: "tag", tag: s.id };
  return null;
}

function StudyPage() {
  const search = Route.useSearch();
  const entry = toEntryPoint(search);
  return entry ? <Session entry={entry} /> : <EntryPicker />;
}

// ---- Entry picker -------------------------------------------------------

function EntryPicker() {
  const navigate = useNavigate();
  const topics = useTopics();
  const decks = useDecks();
  const tags = useTags();

  const go = (entry: StudySearch["entry"], id?: string) =>
    navigate({ to: "/study", search: { entry, id } });

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold">Study</h1>
      <p className="text-sm text-muted-foreground">
        Choose what to drill. A session serves Due questions first, then a few
        new ones.
      </p>

      <Card>
        <CardContent className="flex flex-col items-start gap-2 p-4">
          <span className="font-semibold">Everything</span>
          <Button onClick={() => go("all")}>Study all topics</Button>
        </CardContent>
      </Card>

      {topics.data && topics.data.length > 0 && (
        <Card>
          <CardContent className="flex flex-col items-start gap-2 p-4">
            <span className="font-semibold">A single topic</span>
            <TopicPicker
              topics={topics.data}
              onPick={(id) => go("topic", id)}
            />
          </CardContent>
        </Card>
      )}

      {decks.data && decks.data.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-2 p-4">
            <span className="font-semibold">Decks</span>
            <div className="flex flex-wrap gap-2">
              {decks.data.map((d) => (
                <Button
                  key={d.id}
                  variant="outline"
                  size="sm"
                  onClick={() => go("deck", d.id)}
                >
                  {d.name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {tags.data && tags.data.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-2 p-4">
            <span className="font-semibold">Tags</span>
            <div className="flex flex-wrap gap-2">
              {tags.data.map((t) => (
                <Button
                  key={t}
                  variant="secondary"
                  size="sm"
                  onClick={() => go("tag", t)}
                >
                  {t}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---- Searchable topic selector ------------------------------------------

function TopicPicker({
  topics,
  onPick,
}: {
  topics: Topic[];
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return topics;
    return topics.filter((t) => t.title.toLowerCase().includes(q));
  }, [topics, query]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Search className="size-4" /> Pick a topic…
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[70vh] flex-col gap-3">
        <DialogHeader>
          <DialogTitle>Study a single topic</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search topics…"
            className="pl-8"
          />
        </div>
        <div className="-mx-1 flex flex-col gap-1 overflow-y-auto px-1">
          {filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              No topics match.
            </p>
          ) : (
            filtered.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onPick(t.id);
                }}
                className="rounded-md px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              >
                {t.title}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---- Active session -----------------------------------------------------

const GRADES: { grade: Grade; label: string; cls: string }[] = [
  { grade: "again", label: "Again", cls: "bg-red-600 hover:bg-red-600/90 text-white" },
  { grade: "hard", label: "Hard", cls: "bg-amber-500 hover:bg-amber-500/90 text-white" },
  { grade: "good", label: "Good", cls: "bg-green-600 hover:bg-green-600/90 text-white" },
  { grade: "easy", label: "Easy", cls: "bg-blue-500 hover:bg-blue-500/90 text-white" },
];

function Session({ entry }: { entry: StudyEntryPoint }) {
  const navigate = useNavigate();
  const session = useSessionStore();

  const pool = useQuery({
    queryKey: ["studyPool", entry],
    queryFn: () => resolveStudyPool(entry),
  });

  useEffect(() => {
    if (!pool.data) return;
    const now = new Date();
    const queue = buildSessionQueue(
      pool.data.questions,
      pool.data.reviewStates,
      now,
    );
    session.start(queue, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool.data]);

  useEffect(() => () => useSessionStore.getState().reset(), []);

  if (pool.isLoading)
    return <p className="text-muted-foreground">Loading pool…</p>;
  if (!pool.data)
    return <p className="text-muted-foreground">Could not load.</p>;

  const counts = poolCounts(
    pool.data.questions,
    pool.data.reviewStates,
    new Date(),
  );
  const current = session.queue[session.index];
  const done = session.index >= session.queue.length;

  function startCram() {
    session.start(buildCramQueue(pool.data!.questions), true);
  }

  if (done) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            {session.graded > 0 ? (
              <>
                <h2 className="text-xl font-semibold">Session complete</h2>
                <p className="text-muted-foreground">
                  Reviewed {session.graded} questions.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-xl font-semibold">Nothing due</h2>
                <p className="text-muted-foreground">
                  No questions are due in this pool right now.
                </p>
              </>
            )}
            {counts.due + counts.fresh > 0 && (
              <Button variant="outline" onClick={startCram}>
                Cram the pool ({counts.due + counts.fresh} questions)
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => navigate({ to: "/study", search: {} })}
            >
              Back to study
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col gap-5">
      <div className="flex items-center gap-2">
        <Badge variant="secondary">
          {session.index + 1} / {session.queue.length}
        </Badge>
        {session.cram && <Badge>cram</Badge>}
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: "/study", search: {} })}
        >
          End
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2 p-6">
          <div className="text-sm text-muted-foreground">
            recall: <span className="font-semibold">{current.question.fieldLabel}</span>
          </div>
          <div className="text-2xl font-bold">{current.question.title}</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex min-h-[120px] items-center justify-center p-6 text-center">
          {session.revealed ? (
            <TypedFieldViewer
              type={current.question.type}
              value={current.question.answer}
            />
          ) : (
            <span className="text-muted-foreground">
              Recall the answer, then reveal.
            </span>
          )}
        </CardContent>
      </Card>

      {session.revealed ? (
        <div className="grid grid-cols-4 gap-2">
          {GRADES.map(({ grade, label, cls }) => (
            <Button
              key={grade}
              className={cn(cls)}
              onClick={() => session.grade(grade)}
            >
              {label}
            </Button>
          ))}
        </div>
      ) : (
        <Button onClick={() => session.reveal()}>Reveal</Button>
      )}
    </div>
  );
}
