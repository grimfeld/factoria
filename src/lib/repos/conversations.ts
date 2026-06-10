import { pb, requireUserId } from "../pocketbase";
import { toConversation } from "../mappers";
import type { ChatMessage, Conversation, ImportMode } from "@/lib/agent/types";

/**
 * Persistence for Assistant conversations (ADR-0010 follow-up). The page saves
 * the full message history after every turn so past conversations can be listed,
 * reopened, and restarted.
 */

const TITLE_MAX = 80;

/** Derive a short list label from the first user message of a conversation. */
export function deriveTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find(
    (m) => m.role === "user" && typeof m.content === "string" && m.content.trim(),
  );
  const text = (firstUser?.content ?? "").trim();
  if (!text) return "New conversation";
  const oneLine = text.replace(/\s+/g, " ");
  return oneLine.length > TITLE_MAX
    ? oneLine.slice(0, TITLE_MAX - 1) + "…"
    : oneLine;
}

export async function listConversations(): Promise<Conversation[]> {
  const rows = await pb
    .collection("conversations")
    .getFullList({ sort: "-updated" });
  return rows.map(toConversation);
}

export async function getConversation(id: string): Promise<Conversation> {
  return toConversation(await pb.collection("conversations").getOne(id));
}

export async function createConversation(input: {
  messages: ChatMessage[];
  mode: ImportMode;
  title?: string;
}): Promise<Conversation> {
  const owner = requireUserId();
  return toConversation(
    await pb.collection("conversations").create({
      owner,
      title: input.title ?? deriveTitle(input.messages),
      messages: input.messages,
      mode: input.mode,
    }),
  );
}

export async function updateConversation(
  id: string,
  input: { messages: ChatMessage[]; mode: ImportMode },
): Promise<Conversation> {
  return toConversation(
    await pb.collection("conversations").update(id, {
      messages: input.messages,
      mode: input.mode,
    }),
  );
}

export async function deleteConversation(id: string): Promise<void> {
  await pb.collection("conversations").delete(id);
}
