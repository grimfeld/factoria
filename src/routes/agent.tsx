import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { toast } from "sonner";
import { MessageSquarePlus, History, RotateCcw, Trash2 } from "lucide-react";
import { runAgentTurn } from "@/lib/agent/run";
import { executePendingWrites } from "@/lib/agent/execute";
import { summarizePlan } from "@/domain/import";
import {
  createConversation,
  updateConversation,
} from "@/lib/repos/conversations";
import { qk, useConversations, useDeleteConversation } from "@/lib/hooks";
import { useViewport } from "@/hooks/useViewport";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type {
  ChatMessage,
  Conversation,
  ImportMode,
  PendingWrite,
} from "@/lib/agent/types";

export const Route = createFileRoute("/agent")({
  component: AgentPage,
});

function renderMarkdown(text: string): string {
  return DOMPurify.sanitize(marked.parse(text, { async: false }) as string);
}

interface Bubble {
  role: "user" | "assistant";
  text: string;
}

/** Rebuild the visible chat bubbles from a persisted message history. */
function bubblesFromMessages(messages: ChatMessage[]): Bubble[] {
  const out: Bubble[] = [];
  for (const m of messages) {
    if (m.role === "user" && typeof m.content === "string" && m.content) {
      out.push({ role: "user", text: m.content });
    } else if (
      m.role === "assistant" &&
      typeof m.content === "string" &&
      m.content.trim()
    ) {
      // tool-call-only assistant turns have empty content; skip them.
      out.push({ role: "assistant", text: m.content });
    }
  }
  return out;
}

function AgentPage() {
  const qc = useQueryClient();
  const { isMobile } = useViewport();

  const [convoId, setConvoId] = useState<string | null>(null);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [pending, setPending] = useState<PendingWrite[]>([]);
  const [planSteps, setPlanSteps] = useState<string[]>([]);
  const [activity, setActivity] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<ImportMode>("create-missing");
  const [historyOpen, setHistoryOpen] = useState(false);

  function resetToNewChat() {
    setConvoId(null);
    setHistory([]);
    setBubbles([]);
    setPending([]);
    setPlanSteps([]);
    setActivity(null);
    setInput("");
  }

  function reopen(c: Conversation) {
    setConvoId(c.id);
    setHistory(c.messages);
    setBubbles(bubblesFromMessages(c.messages));
    setMode(c.mode);
    setPending([]);
    setPlanSteps([]);
    setActivity(null);
    setHistoryOpen(false);
  }

  /** Persist the turn's result, creating the conversation on first save. */
  async function persist(messages: ChatMessage[], turnMode: ImportMode) {
    try {
      if (convoId) {
        await updateConversation(convoId, { messages, mode: turnMode });
      } else {
        const created = await createConversation({ messages, mode: turnMode });
        setConvoId(created.id);
      }
      qc.invalidateQueries({ queryKey: qk.conversations });
    } catch {
      // Persistence is best-effort; the in-memory conversation still works.
      toast.warning("Couldn't save this conversation to history.");
    }
  }

  async function runTurn(text: string) {
    setBubbles((b) => [...b, { role: "user", text }]);
    setBusy(true);
    setActivity("Thinking…");
    setPending([]);
    setPlanSteps([]);
    try {
      const res = await runAgentTurn(history, text, {
        forcedMode: mode,
        onActivity: setActivity,
      });
      setHistory(res.messages);
      setBubbles((b) => [...b, { role: "assistant", text: res.reply }]);
      setPending(res.pendingWrites);
      setPlanSteps(res.planSteps);
      await persist(res.messages, mode);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setActivity(null);
      setBusy(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    await runTurn(text);
  }

  /** Re-run a past conversation's opening request in a brand-new conversation. */
  async function restart(c: Conversation) {
    if (busy) return;
    const firstUser = c.messages.find(
      (m) => m.role === "user" && typeof m.content === "string" && m.content,
    );
    const text = (firstUser?.content ?? "").trim();
    if (!text) {
      toast.error("This conversation has no opening message to restart.");
      return;
    }
    resetToNewChat();
    setMode(c.mode);
    setHistoryOpen(false);
    await runTurn(text);
  }

  async function approve() {
    setBusy(true);
    try {
      const r = await executePendingWrites(pending);
      setPending([]);
      setPlanSteps([]);
      qc.invalidateQueries({ queryKey: qk.topics });
      qc.invalidateQueries({ queryKey: qk.tags });
      qc.invalidateQueries({ queryKey: qk.decks });
      const parts = [
        `${r.created} created`,
        `${r.extended} extended`,
        `${r.skipped} skipped`,
      ];
      if (r.decksCreated > 0) parts.push(`${r.decksCreated} deck(s)`);
      const summary = parts.join(", ");
      if (r.errors.length > 0) {
        // Real failures: the primary write did not land for these.
        toast.error(`Done with ${r.errors.length} error(s).`, {
          description: summary,
        });
      } else if (r.warnings.length > 0) {
        // Everything saved; only a follow-up (schedule/deck sync) lagged.
        toast.warning("Changes saved — review schedule will reconcile shortly.", {
          description: summary,
        });
      } else {
        toast.success("Changes saved.", { description: summary });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const sidebar = (
    <ConversationList
      activeId={convoId}
      busy={busy}
      onReopen={reopen}
      onRestart={restart}
    />
  );

  return (
    <div className="flex gap-6">
      {!isMobile && (
        <aside className="w-60 shrink-0">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground">
              History
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={resetToNewChat}
              disabled={busy}
              className="gap-1.5"
            >
              <MessageSquarePlus className="size-4" /> New
            </Button>
          </div>
          {sidebar}
        </aside>
      )}

      <div className="flex min-w-0 max-w-3xl flex-1 flex-col gap-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold">Assistant</h1>
            <p className="text-sm text-muted-foreground">
              Ask it to find Topics or bulk-add facts (e.g. “add all world
              capitals”). It tells you what it plans to do, and every change is
              previewed for your approval before anything is saved.
            </p>
          </div>
          {isMobile && (
            <div className="flex shrink-0 gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setHistoryOpen(true)}
                aria-label="Conversation history"
              >
                <History className="size-5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={resetToNewChat}
                disabled={busy}
                aria-label="New conversation"
              >
                <MessageSquarePlus className="size-5" />
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2.5">
          {bubbles.map((b, i) => (
            <Card
              key={i}
              className={cn(
                "max-w-[85%]",
                b.role === "user"
                  ? "self-end bg-primary text-primary-foreground"
                  : "self-start",
              )}
            >
              <CardContent className="p-3 text-sm">
                {b.role === "assistant" ? (
                  <div
                    className="prose-block"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(b.text) }}
                  />
                ) : (
                  b.text
                )}
              </CardContent>
            </Card>
          ))}
          {busy && (
            <div className="flex items-center gap-2 self-start text-sm text-muted-foreground">
              <span className="inline-block size-2 animate-pulse rounded-full bg-primary" />
              {activity ?? "Working…"}
            </div>
          )}
        </div>

        {planSteps.length > 0 && pending.length > 0 && (
          <PendingPreview
            pending={pending}
            planSteps={planSteps}
            busy={busy}
            onApprove={approve}
            onDiscard={() => {
              setPending([]);
              setPlanSteps([]);
            }}
          />
        )}

        <div className="flex flex-col gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Ask the assistant…"
            disabled={busy}
            className="w-full"
          />
          <Select
            value={mode}
            onValueChange={(v) => setMode(v as ImportMode)}
            disabled={busy}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="create-missing">Create missing</SelectItem>
              <SelectItem value="extend-only">Extend only</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={send}
            disabled={busy || !input.trim()}
            className="w-full"
          >
            Send
          </Button>
        </div>
      </div>

      {isMobile && (
        <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
          <SheetContent side="left">
            <SheetHeader>
              <SheetTitle>Conversation history</SheetTitle>
            </SheetHeader>
            {sidebar}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

function ConversationList({
  activeId,
  busy,
  onReopen,
  onRestart,
}: {
  activeId: string | null;
  busy: boolean;
  onReopen: (c: Conversation) => void;
  onRestart: (c: Conversation) => void;
}) {
  const { data: conversations, isLoading } = useConversations();
  const del = useDeleteConversation();

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (!conversations || conversations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No past conversations yet.
      </p>
    );
  }

  return (
    <div className="max-h-[70vh] w-full overflow-y-auto">
      <ul className="flex w-full min-w-0 flex-col gap-1 pr-2">
        {conversations.map((c) => (
          <li
            key={c.id}
            className={cn(
              "group w-full min-w-0 rounded-md border p-2 text-sm",
              c.id === activeId ? "border-primary bg-accent" : "border-border",
            )}
          >
            <button
              type="button"
              onClick={() => onReopen(c)}
              disabled={busy}
              className="block w-full truncate text-left font-medium disabled:opacity-50"
              title={c.title}
            >
              {c.title}
            </button>
            <div className="mt-1 flex items-center gap-1">
              <span className="flex-1 truncate text-xs text-muted-foreground">
                {new Date(c.updated).toLocaleDateString()}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={() => onRestart(c)}
                disabled={busy}
                aria-label="Restart in a new conversation"
                title="Restart in a new conversation"
              >
                <RotateCcw className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-muted-foreground hover:text-destructive"
                onClick={() => del.mutate(c.id)}
                disabled={busy || del.isPending}
                aria-label="Delete conversation"
                title="Delete conversation"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FactRows({ rows }: { rows: { title: string; value: string }[] }) {
  if (rows.length === 0) return null;
  return (
    <ScrollArea className="max-h-[220px] rounded-md border">
      <table className="w-full border-collapse text-sm">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-0">
              <td className="whitespace-nowrap px-2 py-1 font-semibold">
                {r.title}
              </td>
              <td className="px-2 py-1">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollArea>
  );
}

function PendingPreview({
  pending,
  planSteps,
  busy,
  onApprove,
  onDiscard,
}: {
  pending: PendingWrite[];
  planSteps: string[];
  busy: boolean;
  onApprove: () => void;
  onDiscard: () => void;
}) {
  return (
    <Card className="border-primary">
      <CardContent className="flex flex-col gap-3 p-4">
        <PlanSummary planSteps={planSteps} />
        <strong>Proposed changes — review before saving</strong>
        <p className="text-xs text-muted-foreground">
          Check the answers below — especially auto-generated facts — before
          approving.
        </p>
        <div className="flex flex-col gap-3">
          {pending.map((w, i) => (
            <WriteDetail key={i} write={w} />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onDiscard} disabled={busy}>
            Discard
          </Button>
          <div className="flex-1" />
          <Button onClick={onApprove} disabled={busy}>
            {busy ? "Saving…" : "Approve & save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** The explicit "here's my plan" block: one-line intent + ordered steps. */
function PlanSummary({ planSteps }: { planSteps: string[] }) {
  if (planSteps.length === 0) return null;
  const intent =
    planSteps.length === 1
      ? "Here's what I plan to do:"
      : `Here's my plan — ${planSteps.length} steps:`;
  return (
    <div className="rounded-md bg-muted/50 p-3">
      <p className="mb-2 text-sm font-medium">{intent}</p>
      <ol className="flex flex-col gap-1.5">
        {planSteps.map((step, i) => (
          <li key={i} className="flex gap-2 text-sm">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function WriteDetail({ write: w }: { write: PendingWrite }) {
  switch (w.kind) {
    case "createDeck":
      return <span>Create Deck “{w.name}”</span>;
    case "importFacts": {
      const created = w.plan.create.map((c) => ({
        title: c.title,
        value: c.field.value ?? "",
      }));
      const extended = w.plan.extend.map((x) => ({
        title: x.title,
        value: x.field.value ?? "",
      }));
      const sample = w.plan.create[0]?.field ?? w.plan.extend[0]?.field;
      const appliedTags = sample?.tags ?? [];
      const appliedDecks = sample?.decks ?? [];
      return (
        <div className="flex flex-col gap-1.5">
          <span>
            Import field “{w.label}” — {summarizePlan(w.plan)}
          </span>
          {(appliedTags.length > 0 || appliedDecks.length > 0) && (
            <span className="text-xs text-muted-foreground">
              Each field gets
              {appliedTags.length > 0
                ? ` tags [${appliedTags.join(", ")}]`
                : ""}
              {appliedTags.length > 0 && appliedDecks.length > 0 ? " and" : ""}
              {appliedDecks.length > 0 ? ` ${appliedDecks.length} deck(s)` : ""}.
            </span>
          )}
          {created.length > 0 && (
            <>
              <span className="text-xs text-muted-foreground">
                New Topics ({created.length}):
              </span>
              <FactRows rows={created} />
            </>
          )}
          {extended.length > 0 && (
            <>
              <span className="text-xs text-muted-foreground">
                Extending existing Topics ({extended.length}):
              </span>
              <FactRows rows={extended} />
            </>
          )}
          {w.plan.skip.length > 0 && (
            <span className="text-xs text-muted-foreground">
              Skipped {w.plan.skip.length}:{" "}
              {w.plan.skip
                .slice(0, 10)
                .map((s) => `${s.title} (${s.reason})`)
                .join(", ")}
              {w.plan.skip.length > 10 ? "…" : ""}
            </span>
          )}
        </div>
      );
    }
    case "createTopic":
      return (
        <div className="flex flex-col gap-1.5">
          <span>Create Topic “{w.title}”</span>
          <FactRows
            rows={w.fields.map((f) => ({
              title: f.label,
              value: f.value ?? "",
            }))}
          />
        </div>
      );
    case "renameTopic":
      return (
        <div className="flex flex-col gap-0.5">
          <span>
            Rename Topic “{w.fromTitle}” → “{w.toTitle}”
          </span>
          <span className="text-xs text-muted-foreground">
            Keeps all fields, answers, and review history.
          </span>
        </div>
      );
    case "addField":
      return (
        <span>
          Add field “{w.field.label}” = “{w.field.value ?? ""}” to “
          {w.topicTitle}”
        </span>
      );
    case "updateField":
      return <span>Update a field in Topic {w.topicId}</span>;
    case "setFieldTags":
      return (
        <span>
          Set tags on “{w.topicTitle} / {w.fieldLabel}” → [{w.tags.join(", ")}]
        </span>
      );
    case "setFieldDecks":
      return (
        <span>
          Set decks on “{w.topicTitle} / {w.fieldLabel}” ({w.deckIds.length}{" "}
          deck(s))
        </span>
      );
  }
}
