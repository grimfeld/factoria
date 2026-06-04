import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useDecks, useCreateDeck, useDeleteDeck } from "@/lib/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Deck } from "@/domain/types";

export const Route = createFileRoute("/decks")({
  component: DecksPage,
});

function DecksPage() {
  const decks = useDecks();
  const createDeck = useCreateDeck();
  const [name, setName] = useState("");

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Decks</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        A Deck is a hand-picked set of Questions. Add a Question to a Deck from
        the Deck picker on its Field, in the Topic editor.
      </p>

      <Card className="mb-4">
        <CardContent className="flex items-center gap-2 p-4">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New deck name"
            className="max-w-xs"
          />
          <Button
            disabled={!name.trim() || createDeck.isPending}
            onClick={() =>
              createDeck.mutate(name.trim(), { onSuccess: () => setName("") })
            }
          >
            Create
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {decks.data?.map((d) => <DeckRow key={d.id} deck={d} />)}
        {decks.data?.length === 0 && (
          <p className="text-muted-foreground">No decks yet.</p>
        )}
      </div>
    </div>
  );
}

function DeckRow({ deck }: { deck: Deck }) {
  const deleteDeck = useDeleteDeck();
  const navigate = useNavigate();

  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="font-semibold">{deck.name}</span>
        <Badge variant="secondary">{deck.fields.length} questions</Badge>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          disabled={deck.fields.length === 0}
          onClick={() =>
            navigate({ to: "/study", search: { entry: "deck", id: deck.id } })
          }
        >
          Study
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            confirm(`Delete deck "${deck.name}"?`) && deleteDeck.mutate(deck.id)
          }
        >
          Delete
        </Button>
      </CardContent>
    </Card>
  );
}
