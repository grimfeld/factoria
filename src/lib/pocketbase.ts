import PocketBase from "pocketbase";

const url = import.meta.env.VITE_POCKETBASE_URL ?? "http://127.0.0.1:8090";

/** Shared PocketBase client. Auth is persisted in its authStore (localStorage). */
export const pb = new PocketBase(url);

/** The currently authenticated user id, or null. */
export function currentUserId(): string | null {
  return pb.authStore.record?.id ?? null;
}

/** Require an authenticated user id, throwing if signed out. */
export function requireUserId(): string {
  const id = currentUserId();
  if (!id) throw new Error("Not authenticated");
  return id;
}
