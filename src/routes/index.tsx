import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { GraduationCap, Plus, Search, X } from "lucide-react";
import { useTopics, useDeleteTopic, useTags, useDecks } from "@/lib/hooks";
import { activeFieldIds } from "@/domain/questions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Deck, Topic } from "@/domain/types";

/** Sentinel for "no filter" Select values (Radix forbids empty-string items). */
const ALL = "__all__";

export const Route = createFileRoute("/")({
  component: LibraryPage,
});

function LibraryPage() {
  const { data: topics, isLoading } = useTopics();
  const { data: tags } = useTags();
  const { data: decks } = useDecks();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string>(ALL);
  const [deckId, setDeckId] = useState<string>(ALL);

  const filtered = useMemo(
    () => filterTopics(topics ?? [], { query, tag, deckId, decks: decks ?? [] }),
    [topics, query, tag, deckId, decks],
  );

  const hasFilters = query.trim() !== "" || tag !== ALL || deckId !== ALL;
  const clearFilters = () => {
    setQuery("");
    setTag(ALL);
    setDeckId(ALL);
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Library</h1>
        <div className="flex-1" />
        <Button onClick={() => navigate({ to: "/topic/new" })}>
          <Plus className="size-4" /> Add Topic
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search topics…"
            className="pl-8"
          />
        </div>

        <Select value={tag} onValueChange={setTag}>
          <SelectTrigger className="min-w-[140px]">
            <SelectValue placeholder="Tag" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All tags</SelectItem>
            {(tags ?? []).map((g) => (
              <SelectItem key={g} value={g}>
                {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={deckId} onValueChange={setDeckId}>
          <SelectTrigger className="min-w-[140px]">
            <SelectValue placeholder="Deck" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All decks</SelectItem>
            {(decks ?? []).map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="size-4" /> Clear
          </Button>
        )}
      </div>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      {topics && topics.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-muted-foreground">
            No topics yet. Add one to start building your library.
          </CardContent>
        </Card>
      )}

      {topics && topics.length > 0 && filtered.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-muted-foreground">
            No topics match your filters.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
        {filtered.map((t) => (
          <TopicCard key={t.id} topic={t} />
        ))}
      </div>
    </div>
  );
}

/**
 * Apply the active Library filters. Search matches the Topic Title and any
 * Field label (case-insensitive). Tag/deck filters match a Topic when any of
 * its Fields carries the tag / belongs to the deck. Filters compose with AND.
 */
function filterTopics(
  topics: Topic[],
  opts: { query: string; tag: string; deckId: string; decks: Deck[] },
): Topic[] {
  const q = opts.query.trim().toLowerCase();
  const deck = opts.decks.find((d) => d.id === opts.deckId);
  const deckFields = deck ? new Set(deck.fields) : null;

  return topics.filter((t) => {
    if (q) {
      const inTitle = t.title.toLowerCase().includes(q);
      const inFields = t.fields.some((f) =>
        f.label.toLowerCase().includes(q),
      );
      if (!inTitle && !inFields) return false;
    }
    if (opts.tag !== ALL && !t.fields.some((f) => f.tags.includes(opts.tag)))
      return false;
    if (deckFields && !t.fields.some((f) => deckFields.has(f.id))) return false;
    return true;
  });
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
          <Button asChild variant="default" size="sm" disabled={questionCount === 0}>
            <Link
              to="/study"
              search={{ entry: "topic", id: topic.id }}
            >
              <GraduationCap className="size-4" /> Study
            </Link>
          </Button>
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
