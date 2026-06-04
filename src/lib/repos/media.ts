import { pb, requireUserId } from "../pocketbase";

/**
 * Upload an image or audio file to the `media` collection and return its id +
 * URL. The id is stored in an `image`/`audio` Field's value (ADR-0007); the URL
 * is what the UI renders/plays.
 */
export async function uploadMedia(
  file: File,
): Promise<{ id: string; url: string }> {
  const owner = requireUserId();
  const form = new FormData();
  form.append("owner", owner);
  form.append("file", file);
  const row = await pb.collection("media").create(form);
  return { id: row.id, url: pb.files.getURL(row, row.file as string) };
}

/** Resolve a stored media id to a render/playback URL. */
export async function mediaUrl(id: string): Promise<string> {
  const row = await pb.collection("media").getOne(id);
  return pb.files.getURL(row, row.file as string);
}
