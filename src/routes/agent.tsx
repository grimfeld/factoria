import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { toast } from "sonner";
import { runAgentTurn } from "@/lib/agent/run";
import { executePendingWrites } from "@/lib/agent/execute";
import { summarizePlan } from "@/domain/import";
import { qk } from "@/lib/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ChatMessage, PendingWrite } from "@/lib/agent/types";

type ImportMode = "create-missing" | "extend-only";

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

function AgentPage() {
  const qc = useQueryClient();
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [pending, setPending] = useState<PendingWrite[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<ImportMode>("create-missing");

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBubbles((b) => [...b, { role: "user", text }]);
    setBusy(true);
    try {
      const res = await runAgentTurn(history, text, { forcedMode: mode });
      setHistory(res.messages);
      setBubbles((b) => [...b, { role: "assistant", text: res.reply }]);
      setPending(res.pendingWrites);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    setBusy(true);
    try {
      const r = await executePendingWrites(pending);
      setPending([]);
      qc.invalidateQueries({ queryKey: qk.topics });
      qc.invalidateQueries({ queryKey: qk.tags });
      qc.invalidateQueries({ queryKey: qk.decks });
      const parts = [
        `${r.created} created`,
        `${r.extended} extended`,
        `${r.skipped} skipped`,
      ];
      if (r.decksCreated > 0) parts.push(`${r.decksCreated} deck(s)`);
      if (r.errors.length > 0) {
        toast.warning(`Done with ${r.errors.length} error(s).`, {
          description: parts.join(", "),
        });
      } else {
        toast.success("Changes saved.", { description: parts.join(", ") });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Assistant</h1>
        <p className="text-sm text-muted-foreground">
          Ask it to find Topics or bulk-add facts (e.g. “add all world
          capitals”). Changes are previewed for your approval before anything is
          saved.
        </p>
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
        {busy && <div className="text-muted-foreground">…</div>}
      </div>

      {pending.length > 0 && (
        <PendingPreview
          pending={pending}
          busy={busy}
          onApprove={approve}
          onDiscard={() => setPending([])}
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
  busy,
  onApprove,
  onDiscard,
}: {
  pending: PendingWrite[];
  busy: boolean;
  onApprove: () => void;
  onDiscard: () => void;
}) {
  return (
    <Card className="border-primary">
      <CardContent className="flex flex-col gap-3 p-4">
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
