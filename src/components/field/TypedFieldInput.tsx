import { useState } from "react";
import { uploadMedia, mediaUrl } from "@/lib/repos/media";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { FieldType, FieldValue } from "@/domain/types";

interface Props {
  type: FieldType;
  value: FieldValue;
  onChange: (next: { type: FieldType; value: FieldValue }) => void;
}

const TYPES: { type: FieldType; label: string }[] = [
  { type: "text", label: "Text" },
  { type: "image", label: "Image" },
  { type: "audio", label: "Audio" },
];

/**
 * Single basic input for a Field's value, switched by its Type (ADR-0007).
 * Changing the Type clears the value (storage differs). text → Markdown
 * textarea; image/audio → file upload storing a media id.
 */
export function TypedFieldInput({ type, value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1">
        {TYPES.map((t) => (
          <Button
            key={t.type}
            type="button"
            size="sm"
            variant={t.type === type ? "default" : "outline"}
            onClick={() => {
              if (t.type !== type) onChange({ type: t.type, value: null });
            }}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {type === "text" && (
        <Textarea
          value={value ?? ""}
          onChange={(e) =>
            onChange({
              type,
              value: e.target.value === "" ? null : e.target.value,
            })
          }
          placeholder="the answer (Markdown supported)"
          rows={3}
        />
      )}

      {(type === "image" || type === "audio") && (
        <MediaInput type={type} value={value} onChange={onChange} />
      )}
    </div>
  );
}

function MediaInput({ type, value, onChange }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (value && url === null && !busy) {
    setBusy(true);
    mediaUrl(value)
      .then(setUrl)
      .finally(() => setBusy(false));
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const uploaded = await uploadMedia(file);
      setUrl(uploaded.url);
      onChange({ type, value: uploaded.id });
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button asChild variant="outline" size="sm" className="w-fit">
        <label className="cursor-pointer">
          {busy ? "Uploading…" : value ? "Replace file" : "Upload file"}
          <input
            type="file"
            accept={type === "image" ? "image/*" : "audio/*"}
            hidden
            onChange={onPick}
          />
        </label>
      </Button>
      {url && type === "image" && (
        <img src={url} alt="" className="max-w-[200px] rounded-md" />
      )}
      {url && type === "audio" && <audio src={url} controls />}
    </div>
  );
}
