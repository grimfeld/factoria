import { pb, requireUserId } from "../pocketbase";
import { toDeck } from "../mappers";
import type { Deck, Topic } from "@/domain/types";

export async function listDecks(): Promise<Deck[]> {
  const rows = await pb.collection("decks").getFullList({ sort: "name" });
  return rows.map(toDeck);
}

export async function getDeck(id: string): Promise<Deck> {
  return toDeck(await pb.collection("decks").getOne(id));
}

export async function createDeck(name: string): Promise<Deck> {
  const owner = requireUserId();
  return toDeck(
    await pb.collection("decks").create({ owner, name, fields: [] }),
  );
}

export async function renameDeck(id: string, name: string): Promise<Deck> {
  return toDeck(await pb.collection("decks").update(id, { name }));
}

/** Set a Deck's Field-id membership list (ADR-0008). */
export async function setDeckFields(
  id: string,
  fields: string[],
): Promise<Deck> {
  return toDeck(await pb.collection("decks").update(id, { fields }));
}

export async function deleteDeck(id: string): Promise<void> {
  await pb.collection("decks").delete(id);
}

/**
 * Reconcile Deck membership from a Topic's Fields. The authoritative authoring
 * intent is each Field's `decks[]` (edited in the Field form); this rebuilds
 * each Deck's `fields` list to match, for the Fields belonging to this Topic.
 * Fields of *other* Topics in each Deck are left untouched. One write per
 * changed Deck (ADR-0008).
 */
export async function syncFieldDeckMembership(topic: Topic): Promise<void> {
  const topicFieldIds = new Set(topic.fields.map((f) => f.id));
  // desired: deckId -> set of this Topic's field ids that want to be in it
  const desired = new Map<string, Set<string>>();
  for (const f of topic.fields) {
    for (const deckId of f.decks) {
      if (!desired.has(deckId)) desired.set(deckId, new Set());
      desired.get(deckId)!.add(f.id);
    }
  }

  const decks = await listDecks();
  await Promise.all(
    decks.map((d) => {
      const want = desired.get(d.id) ?? new Set<string>();
      // keep other topics' fields, replace this topic's slice with `want`
      const others = d.fields.filter((fid) => !topicFieldIds.has(fid));
      const next = [...others, ...want];
      const changed =
        next.length !== d.fields.length ||
        next.some((fid) => !d.fields.includes(fid));
      return changed ? setDeckFields(d.id, next) : Promise.resolve();
    }),
  );
}

/** Remove Field ids from every Deck that references them (delete cleanup). */
export async function removeFieldsFromAllDecks(
  fieldIds: string[],
): Promise<void> {
  if (fieldIds.length === 0) return;
  const drop = new Set(fieldIds);
  const decks = await listDecks();
  await Promise.all(
    decks
      .filter((d) => d.fields.some((f) => drop.has(f)))
      .map((d) =>
        setDeckFields(
          d.id,
          d.fields.filter((f) => !drop.has(f)),
        ),
      ),
  );
}
