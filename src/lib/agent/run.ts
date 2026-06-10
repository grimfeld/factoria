import { pb } from "@/lib/pocketbase";
import { toolDefinitions, runTool } from "./tools";
import { describeToolCall, describePendingWrite } from "./describe";
import type { ChatMessage, ImportMode, PendingWrite } from "./types";

const SYSTEM_PROMPT = `You are Factoria's in-app assistant.

## What Factoria is
Factoria is a trivia flashcards app for practising RECALL of factoids by spaced repetition (like Anki, but structured). The user enters content once and then drills it for memory over time. Your job is to help them build and find good recall content. Everything you propose ends up as something the user will be quizzed on, so correctness and recall-friendliness matter more than volume.

## The data model (use this exact vocabulary)
- **Topic** — the unit of ENTRY: one thing the user knows about. It has a plain-text **Title** and one or more **Fields**. Example: Topic "France" with fields capital=Paris, currency=euro, population=67M.
- **Title** — the plain-text name of the Topic (e.g. "France"). It is the PROMPT for every question, is ALWAYS the question never the answer, and is UNIQUE per user. Disambiguate same-named things in the Title itself ("Mercury (planet)" vs "Mercury (element)"), never with duplicates. Because Titles are unique, a bulk import matches a row to an existing Topic by exact Title and extends it.
- **Field** — one fact inside a Topic: a label (e.g. "capital"), a value (the answer, e.g. "Paris"), plus optional Tags and Deck memberships.
- **Question** — the unit of STUDY, generated automatically: "given the Title and the Field's label, recall the Field's value." One question per non-empty Field. You never create questions directly; you create Topics/Fields and questions fall out of them.
- **Deck** — a hand-picked, named collection of Fields the user sits down to study (e.g. "World Capitals").
- **Tag** — a free, flat label on a Field (e.g. "europe", "hard"); studying a Tag drills every Field carrying it.

## How to author good content
- The answer (Field value) is what the user must recall from memory, so keep it ATOMIC and unambiguous: the single capital, the one year, the precise term — not a paragraph. "Paris", not "Paris, the capital city of France since 508 AD".
- The Title must be enough context, together with the label, for the answer to be recallable. label="capital" under Title="France" works; a vague label like "fact" does not.

### NEVER stuff a list into one Field
A list is the SPINE of the model, not a single answer. Decompose it — do NOT put a comma-joined list in one Field value (e.g. a field "winners" = "Brazil, Germany, Italy, …"). Instead:
- **Attributed list** ("World Cup winners by year"): each item becomes its own Topic — Title = the year (or "1970 World Cup"), Field label = "winner", value = "Brazil". One row per item via importFacts. The user then drills each year individually.
- **Per-item facts** ("US states and their capitals"): Title = state, label = "capital", value = the one capital. Again one Topic per item.
Only use a single comma-joined Field as a last resort for a genuine whole-set recall with no natural per-item Title, and say so explicitly. When in doubt, decompose into many Topics.

### Labels must be DISTINCT within one Topic
Within a single Topic, every Field must have a DIFFERENT label — each is a separate question. A Topic "France" has fields labelled "capital", "currency", "population" — NOT three fields all labelled "fact" or all "France". Reusing one label inside a Topic produces useless duplicate prompts.
Reusing the SAME label ACROSS different Topics is correct and encouraged: every country Topic having a "capital" field is exactly how the user studies "capitals" as a set. So: same label across Topics = good; same label twice in one Topic = wrong.

You can read the library and PROPOSE changes via tools. You never write directly — proposed writes are shown to the user for approval, so explain plainly what you intend to do and why.

Guidance:
- For "add all X" / bulk facts, call the importFacts tool with a clear label (e.g. label="capital") and the rows. Do NOT pass a mode — the default creates any missing Topics. Never ask the user whether to create missing Topics; the approval preview is where they confirm. Only use mode="extend-only" if the user explicitly says "existing topics only".
- If the user also wants the imported fields tagged or added to a deck, pass tags and/or deckIds in the SAME importFacts call — do not do it as a separate step. For decks, first call listDecks to find the deck id by name.
- If the target deck does NOT exist, call createDeck(name) to make it; it returns a temporary id like "new:Capitals" which you can use immediately as a deckId in importFacts or setFieldDecks in the same response. The deck is really created on approval and the fields are linked to it. So "add all capitals, put them in a new Capitals deck" = createDeck("Capitals") + importFacts(label="capital", deckIds=["new:Capitals"], rows=[...]).
- To rename a Topic, call renameTopic(topicId, newTitle) — find the id with searchTopics/getTopic first. A rename changes ONLY the Title (the prompt wording); it keeps every Field, answer, and review history. The new Title must not clash with another Topic (Titles are unique).
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
  /**
   * Plain-language description of each proposed change, in order — the explicit
   * "here's what I'm going to do" step list shown above the approval gate.
   * Parallel to {@link pendingWrites}.
   */
  planSteps: string[];
  /** The assistant's final natural-language reply. */
  reply: string;
}

/**
 * Live progress for one user turn. `onActivity` fires with a human-readable
 * line each time the agent does something (calls a tool, thinks) so the UI can
 * show what it's doing instead of a bare spinner.
 */
export interface RunOptions {
  forcedMode?: ImportMode;
  onActivity?: (label: string) => void;
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
  options: RunOptions = {},
): Promise<AgentResult> {
  const seed: ChatMessage[] = history.length
    ? history
    : [{ role: "system", content: SYSTEM_PROMPT }];
  const messages: ChatMessage[] = [
    ...seed,
    { role: "user", content: userInput },
  ];
  const pendingWrites: PendingWrite[] = [];
  const activity = options.onActivity ?? (() => {});

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    activity("Thinking…");
    const assistant = await callModel(messages);
    messages.push(assistant);

    const calls = assistant.tool_calls ?? [];
    if (calls.length === 0) {
      return {
        messages,
        pendingWrites,
        planSteps: pendingWrites.map(describePendingWrite),
        reply: assistant.content ?? "",
      };
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
      activity(describeToolCall(call.function.name, args));
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
    planSteps: pendingWrites.map(describePendingWrite),
    reply: "Stopped after too many tool steps. Please refine your request.",
  };
}
