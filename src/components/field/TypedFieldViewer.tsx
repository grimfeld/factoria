import { useEffect, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { mediaUrl } from "@/lib/repos/media";
import type { FieldType } from "@/domain/types";

interface Props {
  type: FieldType;
  value: string; // non-empty: markdown text or media id
}

/** Read-only render of a Field value by Type (ADR-0007). */
export function TypedFieldViewer({ type, value }: Props) {
  if (type === "text") return <MarkdownView source={value} />;
  return <MediaView type={type} id={value} />;
}

function MarkdownView({ source }: { source: string }) {
  const html = DOMPurify.sanitize(marked.parse(source, { async: false }) as string);
  return (
    <div
      className="prose-block text-sm"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function MediaView({ type, id }: { type: FieldType; id: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    mediaUrl(id).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [id]);

  if (!url)
    return <span className="text-muted-foreground">Loading media…</span>;
  if (type === "image")
    return <img src={url} alt="" style={{ maxWidth: "100%", borderRadius: 6 }} />;
  return <audio src={url} controls />;
}
