import { useState } from "react";
import { X } from "lucide-react";
import { TypedFieldInput } from "@/components/field/TypedFieldInput";
import { useCreateTemplate, useTemplates, useDecks } from "@/lib/hooks";
import {
  blankFieldsFromTemplate,
  templateInputFromTopic,
} from "@/lib/repos/templates";
import { newFieldId } from "@/domain/ids";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Field, Topic } from "@/domain/types";

export interface EditorState {
  title: string;
  fields: Field[];
}

interface Props {
  initial: EditorState;
  saving: boolean;
  errorText?: string | null;
  onSave: (state: EditorState, resetFieldIds: string[]) => void;
  onCancel: () => void;
}

function blankField(): Field {
  return {
    id: newFieldId(),
    label: "fact",
    type: "text",
    value: null,
    tags: [],
    decks: [],
  };
}

function answerChangedIds(prev: Field[], next: Field[]): string[] {
  const prevById = new Map(prev.map((f) => [f.id, f]));
  const out: string[] = [];
  for (const f of next) {
    const p = prevById.get(f.id);
    if (!p) continue;
    const bothFilled =
      p.value !== null && p.value !== "" && f.value !== null && f.value !== "";
    if (bothFilled && (p.value !== f.value || p.type !== f.type)) out.push(f.id);
  }
  return out;
}

export function TopicEditor({
  initial,
  saving,
  errorText,
  onSave,
  onCancel,
}: Props) {
  const [title, setTitle] = useState(initial.title);
  const [fields, setFields] = useState<Field[]>(initial.fields);

  const templates = useTemplates();
  const decks = useDecks();
  const createTemplate = useCreateTemplate();

  function patchField(idx: number, patch: Partial<Field>) {
    setFields((fs) => fs.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  }
  function addField() {
    setFields((fs) => [...fs, blankField()]);
  }
  function removeField(idx: number) {
    setFields((fs) => fs.filter((_, i) => i !== idx));
  }

  function applyTemplate(id: string) {
    const t = templates.data?.find((x) => x.id === id);
    if (!t) return;
    const liveDeckIds = new Set((decks.data ?? []).map((d) => d.id));
    setFields(blankFieldsFromTemplate(t, liveDeckIds));
  }

  function saveAsTemplate() {
    const name = prompt("Template name?");
    if (!name) return;
    createTemplate.mutate(templateInputFromTopic({ fields } as Topic, name));
  }

  function handleSave() {
    const resetIds: string[] = [];
    for (const fid of answerChangedIds(initial.fields, fields)) {
      const f = fields.find((x) => x.id === fid)!;
      if (
        confirm(
          `You changed the answer of "${f.label}". Reset its review schedule?`,
        )
      ) {
        resetIds.push(fid);
      }
    }
    onSave({ title, fields }, resetIds);
  }

  const canSave =
    title.trim() !== "" && fields.every((f) => f.label.trim() !== "");

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-2 p-4">
          <Label>Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. France"
            className="h-11 text-lg font-semibold"
          />
          <p className="text-xs text-muted-foreground">
            The thing this Topic is about. Prompt for every Question; never an
            answer.
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        {templates.data && templates.data.length > 0 && (
          <Select onValueChange={(v) => v && applyTemplate(v)}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Apply template…" />
            </SelectTrigger>
            <SelectContent>
              {templates.data.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={saveAsTemplate}>
          Save shape as template
        </Button>
      </div>

      {fields.map((field, idx) => (
        <FieldRow
          key={field.id}
          field={field}
          decks={decks.data ?? []}
          onPatch={(patch) => patchField(idx, patch)}
          onRemove={() => removeField(idx)}
        />
      ))}

      <Button variant="outline" className="w-fit" onClick={addField}>
        + Add field
      </Button>

      {errorText && <p className="text-sm text-destructive">{errorText}</p>}

      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <div className="flex-1" />
        <Button disabled={!canSave || saving} onClick={handleSave}>
          {saving ? "Saving…" : "Save topic"}
        </Button>
      </div>
    </div>
  );
}

function FieldRow({
  field,
  decks,
  onPatch,
  onRemove,
}: {
  field: Field;
  decks: { id: string; name: string }[];
  onPatch: (patch: Partial<Field>) => void;
  onRemove: () => void;
}) {
  const [tagDraft, setTagDraft] = useState("");

  function addTag() {
    const t = tagDraft.trim().toLowerCase();
    if (t && !field.tags.includes(t)) onPatch({ tags: [...field.tags, t] });
    setTagDraft("");
  }
  function toggleDeck(deckId: string) {
    const next = field.decks.includes(deckId)
      ? field.decks.filter((d) => d !== deckId)
      : [...field.decks, deckId];
    onPatch({ decks: next });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <Input
            value={field.label}
            onChange={(e) => onPatch({ label: e.target.value })}
            placeholder="field label (e.g. capital)"
            className="flex-1"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            title="Remove field"
          >
            <X className="size-4" />
          </Button>
        </div>

        <TypedFieldInput
          type={field.type}
          value={field.value}
          onChange={({ type, value }) => onPatch({ type, value })}
        />

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-muted-foreground">
            Tags
          </span>
          {field.tags.map((t) => (
            <Badge key={t} variant="secondary" className="gap-1">
              {t}
              <button
                onClick={() =>
                  onPatch({ tags: field.tags.filter((x) => x !== t) })
                }
                className="hover:text-destructive"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          <Input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="add tag + Enter"
            className="h-7 w-36"
          />
        </div>

        {decks.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">
              Decks
            </span>
            {decks.map((d) => (
              <label
                key={d.id}
                className="flex cursor-pointer items-center gap-1.5 text-sm"
              >
                <Checkbox
                  checked={field.decks.includes(d.id)}
                  onCheckedChange={() => toggleDeck(d.id)}
                />
                {d.name}
              </label>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
