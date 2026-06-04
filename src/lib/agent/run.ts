import { pb } from "@/lib/pocketbase";
import { toolDefinitions, runTool } from "./tools";
import type { ChatMessage, PendingWrite } from "./types";

const SYSTEM_PROMPT = `You are Factoria's in-app assistant. Factoria is a trivia spaced-repetition app.
A Topic has a unique plain-text Title and typed Fields; each non-empty Field becomes one Question ("given the Title, recall this Field").

You can read the library and PROPOSE changes via tools. You never write directly — proposed writes are shown to the user for approval, so explain what you intend.

Guidance:
- For "add all X" / bulk facts, call the importFacts tool with a clear label (e.g. label="capital") and the rows. Do NOT pass a mode — the default creates any missing Topics. Never ask the user whether to create missing Topics; the approval preview is where they confirm. Only use mode="extend-only" if the user explicitly says "existing topics only".
- If the user also wants the imported fields tagged or added to a deck, pass tags and/or deckIds in the SAME importFacts call — do not do it as a separate step. For decks, first call listDecks to find the deck id by name.
- If the target deck does NOT exist, call createDeck(name) to make it; it returns a temporary id like "new:Capitals" which you can use immediately as a deckId in importFacts or setFieldDecks in the same response. The deck is really created on approval and the fields are linked to it. So "add all capitals, put them in a new Capitals deck" = createDeck("Capitals") + importFacts(label="capital", deckIds=["new:Capitals"], rows=[...]).
- You may call several tools to satisfy one request; their effects are collected into a single approval preview.
- After calling a write tool, briefly state what you proposed and let the user approve the preview — do not ask permission to call the tool first.
- Be accurate. This is a recall app: a wrong answer the user drills teaches them the wrong thing. If unsure of a fact, say so rather than guess.
- Keep answers concise.`;

const MAX_TURNS = 8;

export interface AgentResult {
  /** Full message history including the assistant's final reply. */
  messages: ChatMessage[];
  /** Writes proposed during this run, awaiting approval. */
  pendingWrites: PendingWrite[];
  /** The assistant's final natural-language reply. */
  reply: string;
}

interface OpenAIResponse {
  choices: { message: ChatMessage; finish_reason: string }[];
  error?: { message: string };
}

async function callModel(messages: ChatMessage[]): Promise<ChatMessage> {
  const res = await pb.send<OpenAIResponse>("/api/factoria/agent", {
    method: "POST",
    body: JSON.stringify({
      messages,
      tools: toolDefinitions,
      tool_choice: "auto",
    }),
  });
  if (res.error) throw new Error(res.error.message);
  return res.choices[0].message;
}

/**
 * Run one user turn through the agent loop (ADR-0010): call the model, execute
 * any read tool calls, queue any write tool calls for approval, feed results
 * back, and repeat until the model returns a plain reply (or the turn cap is
 * hit). Returns the new history and the accumulated pending writes.
 */
export async function runAgentTurn(
  history: ChatMessage[],
  userInput: string,
  options: { forcedMode?: "create-missing" | "extend-only" } = {},
): Promise<AgentResult> {
  const seed: ChatMessage[] = history.length
    ? history
    : [{ role: "system", content: SYSTEM_PROMPT }];
  const messages: ChatMessage[] = [
    ...seed,
    { role: "user", content: userInput },
  ];
  const pendingWrites: PendingWrite[] = [];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const assistant = await callModel(messages);
    messages.push(assistant);

    const calls = assistant.tool_calls ?? [];
    if (calls.length === 0) {
      return { messages, pendingWrites, reply: assistant.content ?? "" };
    }

    // Execute every tool call, append a tool result message for each.
    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        // leave args empty; tool will report an error
      }
      // The user's selected mode overrides whatever the model chose.
      if (call.function.name === "importFacts" && options.forcedMode) {
        args.mode = options.forcedMode;
      }
      let outcome;
      try {
        outcome = await runTool(call.function.name, args);
      } catch (err) {
        outcome = {
          result: { error: err instanceof Error ? err.message : String(err) },
        };
      }
      if (outcome.pendingWrite) pendingWrites.push(outcome.pendingWrite);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name: call.function.name,
        content: JSON.stringify(outcome.result),
      });
    }
  }

  return {
    messages,
    pendingWrites,
    reply: "Stopped after too many tool steps. Please refine your request.",
  };
}
